import type { SignalMessage } from '@clouddesk/protocol';
import type { Env } from '../env';
import { createDb } from '../db';
import { sessions } from '../db/schema';
import { eq } from 'drizzle-orm';

export class SessionRoom implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private browserSocket: WebSocket | null = null;
  private sessionId: string;
  private deviceId: string | null = null;
  private pendingMessages: SignalMessage[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.sessionId = state.id.name ?? state.id.toString();
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/from-device' && request.method === 'POST') {
      const message = (await request.json()) as SignalMessage;
      this.deliverToBrowser(message);
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/close' && request.method === 'POST') {
      this.browserSocket?.close(1000, 'session closed');
      return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const role = url.searchParams.get('role') ?? 'browser';
    const token = url.searchParams.get('token');

    if (role === 'browser') {
      if (!token) {
        return new Response('Missing session token', { status: 401 });
      }
      this.sessionId = this.extractSessionId(request);
      const valid = await this.validateBrowserToken(token, request);
      if (!valid) {
        return new Response('Invalid session token', { status: 401 });
      }
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.acceptBrowserSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  private extractSessionId(request: Request): string {
    const url = new URL(request.url);
    const match = url.pathname.match(/\/ws\/session\/([^/]+)/);
    return match?.[1] ?? this.sessionId;
  }

  private async validateBrowserToken(token: string, request: Request): Promise<boolean> {
    const sessionId = this.extractSessionId(request);
    const sessionToken = await this.env.KV.get(`session_ws:${sessionId}`);
    return sessionToken === token;
  }

  private acceptBrowserSocket(ws: WebSocket) {
    ws.accept();
    this.browserSocket = ws;

    for (const message of this.pendingMessages) {
      ws.send(JSON.stringify(message));
    }
    this.pendingMessages = [];

    ws.addEventListener('message', (event) => {
      void this.handleBrowserMessage(event.data);
    });

    ws.addEventListener('close', () => {
      if (this.browserSocket === ws) {
        this.browserSocket = null;
      }
    });
  }

  private deliverToBrowser(message: SignalMessage) {
    if (this.browserSocket && this.browserSocket.readyState === WebSocket.OPEN) {
      this.browserSocket.send(JSON.stringify(message));
      return;
    }
    this.pendingMessages.push(message);
    if (this.pendingMessages.length > 50) {
      this.pendingMessages.shift();
    }
  }

  private async handleBrowserMessage(data: string | ArrayBuffer) {
    const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
    let message: SignalMessage;
    try {
      message = JSON.parse(text) as SignalMessage;
    } catch {
      return;
    }

    message.session_id = this.sessionId;

    const db = createDb(this.env.DB);
    if (!this.deviceId) {
      const [row] = await db.select().from(sessions).where(eq(sessions.id, this.sessionId)).limit(1);
      this.deviceId = row?.deviceId ?? null;
    }

    if (!this.deviceId) return;

    if (message.type === 'webrtc_offer' || message.type === 'ice_candidate') {
      const deviceRoomId = this.env.DEVICE_ROOM.idFromName(this.deviceId);
      const deviceRoom = this.env.DEVICE_ROOM.get(deviceRoomId);
      await deviceRoom.fetch('https://internal/notify', {
        method: 'POST',
        body: JSON.stringify(message),
      });
    }
  }

  private async closeSession(status: string) {
    const db = createDb(this.env.DB);
    await db
      .update(sessions)
      .set({ status, endedAt: Date.now() })
      .where(eq(sessions.id, this.sessionId));
  }
}
