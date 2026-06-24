import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './crypto';
import { generateDeviceOTP, verifyDeviceAccess, verifyDeviceAccessAuto } from './device-access';
import type { Env } from '../env';

function mockKv() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string, options?: { expirationTtl?: number }) {
        store.set(key, value);
        void options;
      },
      async delete(key: string) {
        store.delete(key);
      },
      async list() {
        return { keys: [], list_complete: true };
      },
    } as unknown as KVNamespace,
  };
}

describe('device-access', () => {
  it('generates and verifies OTP once', async () => {
    const { kv } = mockKv();
    const env = { KV: kv } as Env;
    const { code } = await generateDeviceOTP(env, '12345678');
    expect(code).toMatch(/^\d{6}$/);

    const ok = await verifyDeviceAccess(env, '12345678', code, 'otp', null);
    expect(ok.ok).toBe(true);

    const again = await verifyDeviceAccess(env, '12345678', code, 'otp', null);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe('otp_unavailable');
  });

  it('verifies permanent password hash', async () => {
    const { kv } = mockKv();
    const env = { KV: kv } as Env;
    const hash = await hashPassword('secret-pass');
    const ok = await verifyDeviceAccess(env, '12345678', 'secret-pass', 'permanent', hash);
    expect(ok.ok).toBe(true);
    const bad = await verifyDeviceAccess(env, '12345678', 'wrong', 'permanent', hash);
    expect(bad.ok).toBe(false);
  });
});

describe('verifyDeviceAccessAuto', () => {
  it('prefers OTP for 6-digit input', async () => {
    const { kv } = mockKv();
    const env = { KV: kv } as Env;
    const { code } = await generateDeviceOTP(env, '12345678');
    const hash = await hashPassword('secret-pass');
    const ok = await verifyDeviceAccessAuto(env, '12345678', code, hash);
    expect(ok.ok).toBe(true);
    expect(ok.matchedType).toBe('otp');
  });

  it('falls back to permanent password', async () => {
    const { kv } = mockKv();
    const env = { KV: kv } as Env;
    const hash = await hashPassword('secret-pass');
    const ok = await verifyDeviceAccessAuto(env, '12345678', 'secret-pass', hash);
    expect(ok.ok).toBe(true);
    expect(ok.matchedType).toBe('permanent');
  });
});
