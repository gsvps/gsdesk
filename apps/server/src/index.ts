import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createCoreApp } from '../../worker/src/app.js';
import type { Env } from '../../worker/src/env.js';
import { latestClientVersion } from '../../worker/src/lib/client-release.js';
import { jsonOk } from '../../worker/src/lib/response.js';
import { createD1Database } from './adapters/d1-sqlite.js';
import { MemoryKv } from './adapters/kv-memory.js';
import { LocalR2Bucket, createLocalAssets } from './adapters/r2-local.js';
import { applyMigrations, openDatabase } from './migrate.js';
import { attachWebSocketServer, nodeFetch } from './http.js';
import { RoomRegistry } from './rooms/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = process.env.CLOUDDESK_DATA ?? path.resolve(__dirname, '../../../data');
const WEB_ROOT =
  process.env.CLOUDDESK_WEB_ROOT ?? path.resolve(__dirname, '../../web/dist');

function createRuntime() {
  const sqlite = openDatabase(path.join(DATA_DIR, 'clouddesk.db'));
  applyMigrations(sqlite);

  const registry = new RoomRegistry();
  const kv = new MemoryKv();

  const base: Omit<Env, 'DEVICE_ROOM' | 'SESSION_ROOM'> = {
    DB: createD1Database(sqlite),
    KV: kv,
    R2: new LocalR2Bucket(path.join(DATA_DIR, 'files')),
    ASSETS: createLocalAssets(WEB_ROOT),
    BACKEND_KIND: 'self_hosted',
    APP_NAME: process.env.APP_NAME ?? 'CloudDesk',
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
    SKIP_SIGNATURE_VERIFY: process.env.SKIP_SIGNATURE_VERIFY ?? 'true',
    CONTROLLER_JWT_SECRET:
      process.env.CONTROLLER_JWT_SECRET ?? 'clouddesk-dev-controller-secret-change-me',
    CLIENT_LATEST_VERSION: process.env.CLIENT_LATEST_VERSION ?? '0.1.0',
    CLIENT_DOWNLOAD_URL: process.env.CLIENT_DOWNLOAD_URL,
    CLIENT_RELEASE_NOTES: process.env.CLIENT_RELEASE_NOTES,
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

const { env, registry } = createRuntime();
const app = createCoreApp();

app.get('/api/health', (c) =>
  jsonOk(c, {
    status: 'ok',
    backend: 'self_hosted',
    app: c.env.APP_NAME || 'CloudDesk',
    version: latestClientVersion(c.env),
  })
);

app.get('/ws/device/:deviceId', (c) => c.text('WebSocket upgrade required', 426));
app.get('/ws/session/:sessionId', (c) => c.text('WebSocket upgrade required', 426));

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  let assetPath = url.pathname;
  if (assetPath === '/') assetPath = '/index.html';
  if (!assetPath.includes('.')) assetPath = '/index.html';

  const asset = await c.env.ASSETS.fetch(new URL(assetPath, url.origin));
  if (asset.status === 404 && assetPath !== '/index.html') {
    return c.env.ASSETS.fetch(new URL('/index.html', url.origin));
  }
  return asset;
});

const server = createServer((req, res) => {
  if (req.url?.startsWith('/ws/')) {
    return;
  }
  nodeFetch(req, res, (request) => app.fetch(request, env), env);
});

attachWebSocketServer(server, env, registry);

server.listen(PORT, () => {
  console.log(`CloudDesk self-hosted server listening on http://0.0.0.0:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  console.log(`Web root: ${WEB_ROOT}`);
  console.log('Backend kind: self_hosted');
});
