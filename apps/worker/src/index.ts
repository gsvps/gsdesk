import { createCoreApp } from './app';
import { normalizeWebAppPath, serveWebApp, webAppRedirect } from './lib/web-app';

const app = createCoreApp();

app.get('/ws/device/:deviceId', async (c) => {
  const deviceId = c.req.param('deviceId');
  const id = c.env.DEVICE_ROOM.idFromName(deviceId);
  const stub = c.env.DEVICE_ROOM.get(id);
  return stub.fetch(c.req.raw);
});

app.get('/ws/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId');
  const id = c.env.SESSION_ROOM.idFromName(sessionId);
  const stub = c.env.SESSION_ROOM.get(id);
  return stub.fetch(c.req.raw);
});

app.all('*', async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const prefix = normalizeWebAppPath(c.env.WEB_APP_PATH);
  const method = c.req.method;

  if ((method === 'GET' || method === 'HEAD') && (pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    if (pathname === prefix) {
      return webAppRedirect(c, prefix);
    }
    if (!c.env.ASSETS) {
      return c.text('Web control UI not deployed. Run npm run build:web:app before deploy.', 503);
    }
    return serveWebApp(c, c.env.ASSETS, prefix);
  }

  return c.text('success');
});

export { createCoreApp } from './app';
export { DeviceRoom } from './durable-objects/device-room';
export { SessionRoom } from './durable-objects/session-room';
export default app;
