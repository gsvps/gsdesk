import type { SignalMessage } from '@gsdesk/protocol';
import { eq } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import type { Env } from '../../../worker/src/env.js';
import { createDb } from '../../../worker/src/db/index.js';
import { sessions } from '../../../worker/src/db/schema.js';
import { writeAuditLog } from '../../../worker/src/lib/audit.js';
import { verifyConnectionAccept } from '../../../worker/src/lib/session-security.js';
import type { RoomRegistry } from './registry.js';

export class DeviceRoomHandler {
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private deviceId: string,
    private env: Env,
    private registry: RoomRegistry
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/notify') && request.method === 'POST') {
      const message = (await request.json()) as SignalMessage;
      if (this.socket && this.socket.readyState === 1) {
        this.socket.send(JSON.stringify(message));
        return Response.json({ ok: true });
      }
      return Response.json({ ok: false, reason: 'agent_offline' }, { status: 409 });
    }

    if (url.pathname.endsWith('/relay') && request.method === 'POST') {
      const message = (await request.json()) as SignalMessage;
      if (!message.session_id) {
        return new Response('missing session_id', { status: 400 });
      }
      return this.registry.getSessionRoom(message.session_id).deliverFromDevice(message);
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('Missing device token', { status: 401 });
    }

    const deviceId = await this.env.KV.get(`device_token:${token}`);
    if (!deviceId || deviceId !== this.deviceId) {
      return new Response('Invalid device token', { status: 401 });
    }

    return new Response('Use Node WebSocket upgrade handler', { status: 426 });
  }

  attachSocket(ws: WebSocket, deviceId: string) {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    const previous = this.socket;
    this.socket = ws;
    void this.setOnline(deviceId, true);

    if (previous && previous !== ws) {
      previous.close(1000, 'replaced by new agent connection');
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.socket !== ws || ws.readyState !== 1) {
        if (this.socket === ws) {
          this.cleanup(deviceId);
        }
      }
    }, 30000);

    ws.on('message', (data) => {
      void this.handleMessage(deviceId, data);
    });

    ws.on('close', () => {
      if (this.socket === ws) {
        this.cleanup(deviceId);
      }
    });

    ws.on('error', () => {
      if (this.socket === ws) {
        this.cleanup(deviceId);
      }
    });
  }

  private async handleMessage(deviceId: string, data: WebSocket.RawData) {
    const text = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf8');
    let message: SignalMessage;
    try {
      message = JSON.parse(text) as SignalMessage;
    } catch {
      return;
    }

    if (message.type === 'heartbeat') {
      await this.setOnline(deviceId, true);
      this.socket?.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
      return;
    }

    if (message.type === 'connection_accept' || message.type === 'connection_reject') {
      if (!message.session_id) return;

      if (message.type === 'connection_accept') {
        const result = await verifyConnectionAccept(
          this.env,
          deviceId,
          message.session_id,
          message.nonce,
          message.signature
        );
        if (!result.ok) {
          this.socket?.send(
            JSON.stringify({
              type: 'error',
              session_id: message.session_id,
              message: result.reason,
            })
          );
          await writeAuditLog(this.env.DB, {
            deviceId,
            action: 'session.accept_rejected',
            metadata: { sessionId: message.session_id, reason: result.reason },
          });
          await this.registry.getSessionRoom(message.session_id).deliverFromDevice({
            type: 'error',
            session_id: message.session_id,
            message: `连接确认失败: ${result.reason}`,
          });
          return;
        }
        await writeAuditLog(this.env.DB, {
          deviceId,
          action: 'session.accepted',
          metadata: { sessionId: message.session_id },
        });
      }

      const db = createDb(this.env.DB);
      await db
        .update(sessions)
        .set({
          status: message.type === 'connection_accept' ? 'active' : 'rejected',
          endedAt: message.type === 'connection_reject' ? Date.now() : null,
        })
        .where(eq(sessions.id, message.session_id));
    }

    if (
      message.type === 'webrtc_answer' ||
      message.type === 'ice_candidate' ||
      message.type === 'connection_accept' ||
      message.type === 'connection_reject' ||
      message.type === 'error'
    ) {
      if (!message.session_id) return;
      await this.registry.getSessionRoom(message.session_id).deliverFromDevice(message);
    }
  }

  private async setOnline(deviceId: string, online: boolean) {
    const db = createDb(this.env.DB);
    const { devices } = await import('../../../worker/src/db/schema.js');
    await db
      .update(devices)
      .set({
        online: online ? 1 : 0,
        lastSeen: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(devices.id, deviceId));
  }

  private cleanup(deviceId: string) {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.socket = null;
    void this.setOnline(deviceId, false);
  }

  closeBrowserSocket() {
    this.socket?.close(1000, 'session closed');
  }

  relayMessage(message: SignalMessage) {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(message));
    }
  }
}
