import { Readable } from 'node:stream';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer } from 'ws';
import type { Env } from '../../worker/src/env.js';
import type { RoomRegistry } from './rooms/registry.js';

export function attachWebSocketServer(
  server: ReturnType<typeof createServer>,
  env: Env,
  registry: RoomRegistry
) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    void handleUpgrade(req, socket, head, wss, env, registry);
  });
}

async function handleUpgrade(
  req: IncomingMessage,
  socket: import('node:net').Socket,
  head: Buffer,
  wss: WebSocketServer,
  env: Env,
  registry: RoomRegistry
) {
  try {
    const host = req.headers.host ?? 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);

    const deviceMatch = url.pathname.match(/^\/ws\/device\/([^/]+)$/);
    if (deviceMatch) {
      const deviceId = deviceMatch[1]!;
      const token = url.searchParams.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const mapped = await env.KV.get(`device_token:${token}`);
      if (!mapped || mapped !== deviceId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        registry.getDeviceRoomHandler(deviceId).attachSocket(ws, deviceId);
      });
      return;
    }

    const sessionMatch = url.pathname.match(/^\/ws\/session\/([^/]+)$/);
    if (sessionMatch) {
      const sessionId = sessionMatch[1]!;
      const token = url.searchParams.get('token');
      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      const sessionToken = await env.KV.get(`session_ws:${sessionId}`);
      if (sessionToken !== token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        registry.getSessionRoom(sessionId).attachBrowserSocket(ws);
      });
      return;
    }

    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  } catch (err) {
    console.error('websocket upgrade failed', err);
    socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
    socket.destroy();
  }
}

export function nodeFetch(
  req: IncomingMessage,
  res: ServerResponse,
  fetchFn: (request: Request, env: Env) => Response | Promise<Response>,
  env: Env
) {
  const host = req.headers.host ?? 'localhost';
  const url = `http://${host}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const method = req.method ?? 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';

  const request = new Request(url, {
    method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
    duplex: hasBody ? 'half' : undefined,
  } as RequestInit);

  void fetchFn(request, env).then(async (response) => {
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'transfer-encoding') return;
      res.setHeader(key, value);
    });
    if (response.body) {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.end(buffer);
    } else {
      res.end();
    }
  });
}
