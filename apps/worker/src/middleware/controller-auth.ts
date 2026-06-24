import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { jsonFail } from '../lib/response';
import type { SessionUser } from './auth';

export const CONTROLLER_USER_ID = 'controller';

export type ControllerAuthVariables = {
  user: SessionUser;
};

function extractToken(c: Context): string | null {
  const auth = c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  const cookie = c.req.header('Cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (match) return decodeURIComponent(match[1]).trim();
  }
  return null;
}

function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyHS256JWT(token: string, secret: string): Promise<boolean> {
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [headerPart, payloadPart, signaturePart] = parts;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const data = encoder.encode(`${headerPart}.${payloadPart}`);
  const signature = base64UrlToBytes(signaturePart);
  const valid = await crypto.subtle.verify('HMAC', key, signature, data);
  if (!valid) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadPart))) as { exp?: number };
    if (payload.exp && Date.now() / 1000 > payload.exp) return false;
  } catch {
    return false;
  }

  return true;
}

export async function verifyControllerToken(token: string, secret: string): Promise<boolean> {
  if (!secret) return false;
  if (token === secret) return true;
  return verifyHS256JWT(token, secret);
}

export async function controllerAuthMiddleware(
  c: Context<{ Bindings: Env; Variables: ControllerAuthVariables }>,
  next: Next
) {
  const secret = c.env.CONTROLLER_JWT_SECRET?.trim();
  if (!secret) {
    return jsonFail(c, 'UNAUTHORIZED', 'Worker 未配置 CONTROLLER_JWT_SECRET', 401);
  }

  const token = extractToken(c);
  if (!token) {
    return jsonFail(c, 'UNAUTHORIZED', '请先配置控制器 JWT 令牌', 401);
  }

  const ok = await verifyControllerToken(token, secret);
  if (!ok) {
    return jsonFail(c, 'UNAUTHORIZED', '控制器令牌无效', 401);
  }

  c.set('user', {
    userId: CONTROLLER_USER_ID,
    email: 'controller@local',
    name: 'Controller',
  });
  await next();
}
