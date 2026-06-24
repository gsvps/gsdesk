import type { Env } from '../env';
import { createDb } from '../db';
import { devices } from '../db/schema';
import { verifyEd25519Signature } from './crypto';
import { eq } from 'drizzle-orm';

export async function verifyConnectionAccept(
  env: Env,
  deviceId: string,
  sessionId: string,
  nonce: string | undefined,
  signature: string | undefined
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!nonce) {
    return { ok: false, reason: 'missing_nonce_or_signature' };
  }

  if (env.SKIP_SIGNATURE_VERIFY === 'true') {
    await env.KV.delete(`session_nonce:${sessionId}`);
    return { ok: true };
  }

  if (!signature) {
    return { ok: false, reason: 'missing_nonce_or_signature' };
  }

  const storedNonce = await env.KV.get(`session_nonce:${sessionId}`);
  if (!storedNonce) {
    return { ok: false, reason: 'nonce_expired' };
  }
  if (storedNonce !== nonce) {
    return { ok: false, reason: 'nonce_mismatch' };
  }

  const db = createDb(env.DB);
  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!device) {
    return { ok: false, reason: 'device_not_found' };
  }

  const valid = await verifyEd25519Signature(device.publicKey, nonce, signature);
  if (!valid) {
    return { ok: false, reason: 'invalid_signature' };
  }

  await env.KV.delete(`session_nonce:${sessionId}`);
  return { ok: true };
}
