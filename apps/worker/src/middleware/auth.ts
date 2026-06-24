import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { jsonFail } from '../lib/response';

const SESSION_PREFIX = 'session:';
const SESSION_TTL = 60 * 60 * 24 * 7;

const PAIRING_PREFIX = 'pairing:';
const PAIRING_TTL = 60 * 10;

const DEVICE_TOKEN_PREFIX = 'device_token:';

export interface SessionUser {
  userId: string;
  email: string;
  name: string | null;
}

export type AuthVariables = {
  user: SessionUser;
};

export async function createSession(kv: KVNamespace, user: SessionUser): Promise<string> {
  const token = crypto.randomUUID();
  await kv.put(`${SESSION_PREFIX}${token}`, JSON.stringify(user), { expirationTtl: SESSION_TTL });
  return token;
}

export async function getSession(kv: KVNamespace, token: string): Promise<SessionUser | null> {
  const raw = await kv.get(`${SESSION_PREFIX}${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(`${SESSION_PREFIX}${token}`);
}

export async function createPairingToken(kv: KVNamespace, userId: string): Promise<string> {
  const token = generatePairingCode();
  await kv.put(`${PAIRING_PREFIX}${token}`, userId, { expirationTtl: PAIRING_TTL });
  return token;
}

export async function consumePairingToken(kv: KVNamespace, token: string): Promise<string | null> {
  const key = `${PAIRING_PREFIX}${token}`;
  const userId = await kv.get(key);
  if (!userId) return null;
  await kv.delete(key);
  return userId;
}

export async function createDeviceToken(kv: KVNamespace, deviceId: string): Promise<string> {
  const token = crypto.randomUUID();
  await kv.put(`${DEVICE_TOKEN_PREFIX}${token}`, deviceId, { expirationTtl: 60 * 60 * 24 * 365 });
  return token;
}

export async function getDeviceIdFromToken(kv: KVNamespace, token: string): Promise<string | null> {
  return kv.get(`${DEVICE_TOKEN_PREFIX}${token}`);
}

function extractToken(c: Context): string | null {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export async function authMiddleware(c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) {
  const token = extractToken(c);
  if (!token) {
    return jsonFail(c, 'UNAUTHORIZED', '请先登录', 401);
  }

  const user = await getSession(c.env.KV, token);
  if (!user) {
    return jsonFail(c, 'UNAUTHORIZED', '登录已过期，请重新登录', 401);
  }

  c.set('user', user);
  await next();
}

export function sessionCookie(token: string): string {
  return `token=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}`;
}

export function clearSessionCookie(): string {
  return 'token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}
