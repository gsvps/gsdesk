import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env } from '../env';
import { createDb } from '../db';
import { devices } from '../db/schema';
import { generateDeviceOTP, otpActive } from '../lib/device-access';
import { hashPassword } from '../lib/crypto';
import { jsonFail, jsonOk } from '../lib/response';
import { deviceAuthMiddleware, type DeviceAuthVariables } from '../middleware/device-auth';

const agentDevice = new Hono<{ Bindings: Env; Variables: DeviceAuthVariables }>();

agentDevice.use('/*', deviceAuthMiddleware);

agentDevice.post('/access-password', async (c) => {
  const deviceId = c.get('deviceId');
  const body = await c.req.json<{ password?: string; clear?: boolean }>();
  const db = createDb(c.env.DB);

  if (body.clear) {
    await db
      .update(devices)
      .set({ accessPasswordHash: null, updatedAt: Date.now() })
      .where(eq(devices.id, deviceId));
    return jsonOk(c, { cleared: true });
  }

  const password = body.password?.trim();
  if (!password || password.length < 4) {
    return jsonFail(c, 'BAD_REQUEST', '永久密码至少 4 位');
  }

  const hash = await hashPassword(password);
  await db
    .update(devices)
    .set({ accessPasswordHash: hash, updatedAt: Date.now() })
    .where(eq(devices.id, deviceId));

  return jsonOk(c, { updated: true });
});

agentDevice.post('/otp/generate', async (c) => {
  const deviceId = c.get('deviceId');
  const result = await generateDeviceOTP(c.env, deviceId);
  return jsonOk(c, result);
});

agentDevice.get('/access-status', async (c) => {
  const deviceId = c.get('deviceId');
  const db = createDb(c.env.DB);
  const [row] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  const otp = await otpActive(c.env, deviceId);
  return jsonOk(c, {
    permanent_password_set: Boolean(row?.accessPasswordHash),
    otp_active: otp,
  });
});

export default agentDevice;
