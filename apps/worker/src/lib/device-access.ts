import type { Env } from '../env';
import { hashPassword, secureOtpCode, verifyPassword } from './crypto';
import { checkRateLimit, rateLimitResponse } from './rate-limit';

const OTP_PREFIX = 'device_otp:';
const OTP_TTL = 60 * 5;
const OTP_FAIL_PREFIX = 'otp_fail:';
const OTP_FAIL_LIMIT = 10;
const OTP_FAIL_WINDOW = 60 * 5;

export type AccessPasswordType = 'permanent' | 'otp';

export async function otpActive(env: Env, deviceId: string): Promise<boolean> {
  const raw = await env.KV.get(`${OTP_PREFIX}${deviceId}`);
  return Boolean(raw);
}

export async function generateDeviceOTP(env: Env, deviceId: string): Promise<{ code: string; expires_in: number }> {
  const code = secureOtpCode();
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
): Promise<{ ok: boolean; reason?: string; rateLimited?: boolean; retryAfterSec?: number }> {
  const trimmed = password.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty' };
  }

  const failKey = `${OTP_FAIL_PREFIX}${deviceId}:${type}`;
  const limited = await checkRateLimit(env.KV, failKey, OTP_FAIL_LIMIT, OTP_FAIL_WINDOW);
  if (!limited.allowed) {
    return {
      ok: false,
      reason: 'rate_limited',
      rateLimited: true,
      retryAfterSec: limited.retryAfterSec,
    };
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
      await env.KV.delete(`rate:${failKey}`);
      return { ok: true };
    }
    return { ok: false, reason: 'invalid' };
  }

  if (!accessPasswordHash) {
    return { ok: false, reason: 'permanent_unavailable' };
  }
  const ok = await verifyPassword(trimmed, accessPasswordHash);
  if (ok) {
    await env.KV.delete(`rate:${failKey}`);
  }
  return ok ? { ok: true } : { ok: false, reason: 'invalid' };
}

/** 自动识别 OTP（6 位数字）或永久密码。 */
export async function verifyDeviceAccessAuto(
  env: Env,
  deviceId: string,
  password: string,
  accessPasswordHash: string | null
): Promise<{
  ok: boolean;
  matchedType?: AccessPasswordType;
  reason?: string;
  rateLimited?: boolean;
  retryAfterSec?: number;
}> {
  const trimmed = password.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty' };
  }

  const hasPermanent = Boolean(accessPasswordHash);
  const hasOtp = await otpActive(env, deviceId);
  const looksLikeOtp = /^\d{6}$/.test(trimmed);

  if (looksLikeOtp && hasOtp) {
    const otp = await verifyDeviceAccess(env, deviceId, trimmed, 'otp', accessPasswordHash);
    if (otp.ok) return { ...otp, matchedType: 'otp' };
    if (otp.rateLimited) return otp;
  }

  if (hasPermanent) {
    const permanent = await verifyDeviceAccess(env, deviceId, trimmed, 'permanent', accessPasswordHash);
    if (permanent.ok) return { ...permanent, matchedType: 'permanent' };
    if (permanent.rateLimited) return permanent;
    if (looksLikeOtp && hasOtp) {
      return { ok: false, reason: 'invalid' };
    }
    return permanent;
  }

  if (hasOtp) {
    if (!looksLikeOtp) {
      return { ok: false, reason: 'otp_format' };
    }
    return { ok: false, reason: 'invalid' };
  }

  return { ok: false, reason: 'permanent_unavailable' };
}

export async function deviceAccessProtected(
  env: Env,
  deviceId: string,
  accessPasswordHash: string | null
): Promise<boolean> {
  if (accessPasswordHash) return true;
  return otpActive(env, deviceId);
}

export { rateLimitResponse };
