import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createCoreApp } from '../../worker/src/app.js';
import type { Env } from '../../worker/src/env.js';
import { createD1Database } from './adapters/d1-sqlite.js';
import { SqliteKv } from './adapters/kv-sqlite.js';
import { LocalR2Bucket } from './adapters/r2-local.js';
import { applyMigrations, openDatabase } from './migrate.js';
import { attachWebSocketServer, nodeFetch } from './http.js';
import { RoomRegistry } from './rooms/registry.js';
import { tryServeWebApp, normalizeWebAppPath, webAppEntryPath } from './web-app-static.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.CLOUDDESK_DATA ?? path.resolve(__dirname, '../../../data');

function createRuntime() {
  const sqlite = openDatabase(path.join(DATA_DIR, 'clouddesk.db'));
  applyMigrations(sqlite);

  const registry = new RoomRegistry();
  const kv = new SqliteKv(sqlite);

  const base: Omit<Env, 'DEVICE_ROOM' | 'SESSION_ROOM'> = {
    DB: createD1Database(sqlite),
    KV: kv,
    R2: new LocalR2Bucket(path.join(DATA_DIR, 'files')),
    BACKEND_KIND: 'self_hosted',
    APP_NAME: process.env.APP_NAME ?? 'CloudDesk',
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
    SKIP_SIGNATURE_VERIFY: process.env.SKIP_SIGNATURE_VERIFY ?? 'true',
    CONTROLLER_JWT_SECRET:
      process.env.CONTROLLER_JWT_SECRET ?? 'clouddesk-dev-controller-secret-change-me',
    CLIENT_LATEST_VERSION: process.env.CLIENT_LATEST_VERSION ?? '0.1.0',
    CLIENT_DOWNLOAD_URL: process.env.CLIENT_DOWNLOAD_URL,
    CLIENT_RELEASE_NOTES: process.env.CLIENT_RELEASE_NOTES,
    WEB_APP_PATH: process.env.WEB_APP_PATH ?? '/app',
  };

  const env = {
    ...base,
    DEVICE_ROOM: null as unknown as DurableObjectNamespace,
    SESSION_ROOM: null as unknown as DurableObjectNamespace,
  } as Env;

  registry.setEnv(env);
  env.DEVICE_ROOM = registry.createDeviceNamespace();
  env.SESSION_ROOM = registry.createSessionNamespace();

  return { env, registry };
}

const WEB_DIST = path.resolve(__dirname, '../../web/dist');

const { env, registry } = createRuntime();
const app = createCoreApp();

app.get('/ws/device/:deviceId', (c) => c.text('WebSocket upgrade required', 426));
app.get('/ws/session/:sessionId', (c) => c.text('WebSocket upgrade required', 426));
app.all('*', (c) => c.text('success'));

const server = createServer((req, res) => {
  if (req.url?.startsWith('/ws/')) {
    return;
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const webAppPrefix = normalizeWebAppPath(env.WEB_APP_PATH);
  if (url.pathname === webAppPrefix) {
    res.writeHead(302, { Location: `${webAppPrefix}/` });
    res.end();
    return;
  }
  const staticResponse = tryServeWebApp(url.pathname, WEB_DIST, env.WEB_APP_PATH);
  if (staticResponse) {
    res.statusCode = staticResponse.status;
    staticResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    void staticResponse.arrayBuffer().then((buf) => {
      res.end(Buffer.from(buf));
    });
    return;
  }

  nodeFetch(req, res, (request) => app.fetch(request, env), env);
});

attachWebSocketServer(server, env, registry);

server.listen(PORT, () => {
  console.log(`CloudDesk self-hosted server listening on http://0.0.0.0:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Mobile/web control entry: http://0.0.0.0:${PORT}${webAppEntryPath(env.WEB_APP_PATH)}`);
});
