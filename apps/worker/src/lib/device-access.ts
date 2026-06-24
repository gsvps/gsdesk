import type { Env } from '../env';
import { hashPassword, verifyPassword } from './crypto';

const OTP_PREFIX = 'device_otp:';
const OTP_TTL = 60 * 5;

export type AccessPasswordType = 'permanent' | 'otp';

export async function otpActive(env: Env, deviceId: string): Promise<boolean> {
  const raw = await env.KV.get(`${OTP_PREFIX}${deviceId}`);
  return Boolean(raw);
}

export async function generateDeviceOTP(env: Env, deviceId: string): Promise<{ code: string; expires_in: number }> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await hashPassword(code);
  await env.KV.put(`${OTP_PREFIX}${deviceId}`, JSON.stringify({ hash, createdAt: Date.now() }), {
    expirationTtl: OTP_TTL,
  });
  return { code, expires_in: OTP_TTL };
}

export async function verifyDeviceAccess(
  env: Env,
  deviceId: string,
  password: string,
  type: AccessPasswordType,
  accessPasswordHash: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const trimmed = password.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty' };
  }

  if (type === 'otp') {
    const raw = await env.KV.get(`${OTP_PREFIX}${deviceId}`);
    if (!raw) {
      return { ok: false, reason: 'otp_unavailable' };
    }
    let hash: string;
    try {
      hash = (JSON.parse(raw) as { hash: string }).hash;
    } catch {
      return { ok: false, reason: 'otp_unavailable' };
    }
    const ok = await verifyPassword(trimmed, hash);
    if (ok) {
      await env.KV.delete(`${OTP_PREFIX}${deviceId}`);
    }
    return ok ? { ok: true } : { ok: false, reason: 'invalid' };
  }

  if (!accessPasswordHash) {
    return { ok: false, reason: 'permanent_unavailable' };
  }
  const ok = await verifyPassword(trimmed, accessPasswordHash);
  return ok ? { ok: true } : { ok: false, reason: 'invalid' };
}

export async function deviceAccessProtected(
  env: Env,
  deviceId: string,
  accessPasswordHash: string | null
): Promise<boolean> {
  if (accessPasswordHash) return true;
  return otpActive(env, deviceId);
}
