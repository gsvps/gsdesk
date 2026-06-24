import { Hono } from 'hono';
import type { Env } from './env';
import auth from './routes/auth';
import device from './routes/device';
import session from './routes/session';
import user from './routes/user';
import agentFiles from './routes/agent-files';
import agentDevice from './routes/agent-device';
import clientUpdate from './routes/client-update';
import { controllerAuthMiddleware } from './middleware/controller-auth';
import { latestClientVersion } from './lib/client-release';
import { ensureDatabaseReady, getLastBootstrapError } from './lib/db-bootstrap';
import { createSessionWsToken } from './lib/session-ws';
import { jsonFail, jsonOk } from './lib/response';

/** Shared HTTP API routes for Cloudflare Worker and VPS self-host server. */
export function createCoreApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use('*', async (c, next) => {
    const origin = c.req.header('Origin') ?? '';
    const allowed =
      origin.startsWith('http://127.0.0.1:') ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('https://127.0.0.1:') ||
      origin.startsWith('https://localhost:') ||
      (c.env.ALLOWED_ORIGIN && origin === c.env.ALLOWED_ORIGIN);

    if (allowed && origin) {
      c.header('Access-Control-Allow-Origin', origin);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }
    await next();
  });

  app.get('/api/health', async (c) => {
    const dbReady = await ensureDatabaseReady(c.env.DB);
    const bootstrapError = getLastBootstrapError();
    const secret = c.env.CONTROLLER_JWT_SECRET?.trim() ?? '';
    const weakSecret =
      !secret || secret === 'clouddesk-dev-controller-secret-change-me' || secret.length < 24;
    return jsonOk(c, {
      status: 'ok',
      backend: c.env.BACKEND_KIND ?? 'cloudflare',
      app: c.env.APP_NAME || 'CloudDesk',
      version: latestClientVersion(c.env),
      db_ready: dbReady,
      db_error: dbReady ? undefined : bootstrapError,
      security_warning: weakSecret ? '请设置强随机 CONTROLLER_JWT_SECRET（≥24 字符）' : undefined,
    });
  });

  app.route('/api/auth', auth);
  app.get('/api/controller/verify', controllerAuthMiddleware, (c) => jsonOk(c, { verified: true }));
  app.route('/api/user', user);
  app.route('/api/device', device);
  app.route('/api/session', session);
  app.route('/api/agent/files', agentFiles);
  app.route('/api/agent/device', agentDevice);
  app.route('/api/client', clientUpdate);

  app.post('/api/session/:id/ws-token', controllerAuthMiddleware, async (c) => {
    const sessionId = c.req.param('id');
    if (!sessionId) {
      return jsonFail(c, 'BAD_REQUEST', '缺少 session id');
    }
    const token = await createSessionWsToken(c.env.KV, sessionId, 'controller');
    return jsonOk(c, { ws_token: token });
  });

  app.onError((err, c) => {
    console.error(err);
    return jsonFail(c, 'INTERNAL_ERROR', '服务器内部错误', 500);
  });

  return app;
}
