import type { SignalMessage } from '@clouddesk/protocol';
import type { Env } from '../env';
import { createDb } from '../db';
import { devices, sessions } from '../db/schema';
import { writeAuditLog } from '../lib/audit';
import { eq } from 'drizzle-orm';
import { verifyConnectionAccept } from '../lib/session-security';

interface DeviceRoomState {
  deviceId: string;
  sessionId: string | null;
}

export class DeviceRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private socket: WebSocket | null = null;
  private deviceId: string;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.deviceId = state.id.name ?? state.id.toString();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/notify' && request.method === 'POST') {
      const message = (await request.json()) as SignalMessage;
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(message));
        return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false, reason: 'agent_offline' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/relay' && request.method === 'POST') {
      const message = (await request.json()) as SignalMessage;
      if (!message.session_id) {
        return new Response('missing session_id', { status: 400 });
      }
      const sessionRoomId = this.env.SESSION_ROOM.idFromName(message.session_id);
      const sessionRoom = this.env.SESSION_ROOM.get(sessionRoomId);
      return sessionRoom.fetch('https://internal/from-device', {
        method: 'POST',
        body: JSON.stringify(message),
      });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
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

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.acceptSocket(server, deviceId);

    return new Response(null, { status: 101, webSocket: client });
  }

  private acceptSocket(ws: WebSocket, deviceId: string) {
    ws.accept();

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
      if (this.socket !== ws || ws.readyState !== WebSocket.OPEN) {
        if (this.socket === ws) {
          this.cleanup(deviceId);
        }
      }
    }, 30000);

    ws.addEventListener('message', (event) => {
      void this.handleMessage(deviceId, event.data);
    });

    ws.addEventListener('close', () => {
      if (this.socket === ws) {
        this.cleanup(deviceId);
      }
    });

    ws.addEventListener('error', () => {
      if (this.socket === ws) {
        this.cleanup(deviceId);
      }
    });
  }

  private async handleMessage(deviceId: string, data: string | ArrayBuffer) {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
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
          const sessionRoomId = this.env.SESSION_ROOM.idFromName(message.session_id);
          const sessionRoom = this.env.SESSION_ROOM.get(sessionRoomId);
          await sessionRoom.fetch('https://internal/from-device', {
            method: 'POST',
            body: JSON.stringify({
              type: 'error',
              session_id: message.session_id,
              message: `连接确认失败: ${result.reason}`,
            }),
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
      const sessionRoomId = this.env.SESSION_ROOM.idFromName(message.session_id);
      const sessionRoom = this.env.SESSION_ROOM.get(sessionRoomId);
      await sessionRoom.fetch('https://internal/from-device', {
        method: 'POST',
        body: JSON.stringify(message),
      });
    }
  }

  private async setOnline(deviceId: string, online: boolean) {
    const db = createDb(this.env.DB);
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
}

export type { DeviceRoomState };
