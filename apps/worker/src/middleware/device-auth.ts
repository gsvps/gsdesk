import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { jsonFail } from '../lib/response';
import { getDeviceIdFromToken } from './auth';

export type DeviceAuthVariables = {
  deviceId: string;
};

function extractToken(c: Context): string | null {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return null;
}

export async function deviceAuthMiddleware(
  c: Context<{ Bindings: Env; Variables: DeviceAuthVariables }>,
  next: Next
) {
  const token = extractToken(c);
  if (!token) {
    return jsonFail(c, 'UNAUTHORIZED', '缺少设备 Token', 401);
  }

  const deviceId = await getDeviceIdFromToken(c.env.KV, token);
  if (!deviceId) {
    return jsonFail(c, 'UNAUTHORIZED', '设备 Token 无效', 401);
  }

  c.set('deviceId', deviceId);
  await next();
}
