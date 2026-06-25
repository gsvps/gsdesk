import type { SignalMessage } from '@gsdesk/protocol';
import { eq } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import type { Env } from '../../../worker/src/env.js';
import { createDb } from '../../../worker/src/db/index.js';
import { sessions } from '../../../worker/src/db/schema.js';
import type { RoomRegistry } from './registry.js';

export class SessionRoomHandler {
  private browserSocket: WebSocket | null = null;
  private deviceId: string | null = null;
  private pendingMessages: SignalMessage[] = [];

  constructor(
    private sessionId: string,
    private env: Env,
    private registry: RoomRegistry
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/from-device') && request.method === 'POST') {
      const message = (await request.json()) as SignalMessage;
      this.deliverToBrowser(message);
      return Response.json({ ok: true });
    }

    if (url.pathname.endsWith('/close') && request.method === 'POST') {
      this.browserSocket?.close(1000, 'session closed');
      return Response.json({ ok: true });
    }

    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const token = url.searchParams.get('token');
    if (!token) {
      return new Response('Missing session token', { status: 401 });
    }

    const valid = await this.validateBrowserToken(token);
    if (!valid) {
      return new Response('Invalid session token', { status: 401 });
    }

    return new Response('Use Node WebSocket upgrade handler', { status: 426 });
  }

  async deliverFromDevice(message: SignalMessage): Promise<Response> {
    this.deliverToBrowser(message);
    return Response.json({ ok: true });
  }

  attachBrowserSocket(ws: WebSocket) {
    this.browserSocket = ws;

    for (const message of this.pendingMessages) {
      ws.send(JSON.stringify(message));
    }
    this.pendingMessages = [];

    ws.on('message', (data) => {
      void this.handleBrowserMessage(data);
    });

    ws.on('close', () => {
      if (this.browserSocket === ws) {
        this.browserSocket = null;
      }
    });
  }

  private deliverToBrowser(message: SignalMessage) {
    if (this.browserSocket && this.browserSocket.readyState === 1) {
      this.browserSocket.send(JSON.stringify(message));
      return;
    }
    this.pendingMessages.push(message);
    if (this.pendingMessages.length > 50) {
      this.pendingMessages.shift();
    }
  }

  private async validateBrowserToken(token: string): Promise<boolean> {
    const sessionToken = await this.env.KV.get(`session_ws:${this.sessionId}`);
    return sessionToken === token;
  }

  private async handleBrowserMessage(data: WebSocket.RawData) {
    const text = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString('utf8');
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
      this.registry.relayToDevice(this.deviceId, message);
    }
  }
}
