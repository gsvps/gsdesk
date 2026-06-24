import { createCoreApp } from './app';

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

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  let path = url.pathname;
  if (path === '/') path = '/index.html';
  if (!path.includes('.')) path = '/index.html';

  const asset = await c.env.ASSETS.fetch(new URL(path, url.origin));
  if (asset.status === 404 && path !== '/index.html') {
    return c.env.ASSETS.fetch(new URL('/index.html', url.origin));
  }
  return asset;
});

export { createCoreApp } from './app';
export { DeviceRoom } from './durable-objects/device-room';
export { SessionRoom } from './durable-objects/session-room';
export default app;
