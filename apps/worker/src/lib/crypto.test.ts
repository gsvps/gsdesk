import { describe, expect, it } from 'vitest';
import { secureOtpCode, secureRandomInt, validateEd25519PublicKey } from './crypto';

describe('crypto', () => {
  it('secureOtpCode returns 6 digits', () => {
    const code = secureOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('secureRandomInt stays in range', () => {
    for (let i = 0; i < 50; i++) {
      const n = secureRandomInt(10_000_000, 99_999_999);
      expect(n).toBeGreaterThanOrEqual(10_000_000);
      expect(n).toBeLessThanOrEqual(99_999_999);
    }
  });

  it('rejects invalid Ed25519 public keys', async () => {
    await expect(validateEd25519PublicKey('not-valid')).resolves.toBe(false);
    await expect(validateEd25519PublicKey('')).resolves.toBe(false);
  });
});

describe('rate-limit', () => {
  it('blocks after limit', async () => {
    const { checkRateLimit } = await import('./rate-limit');
    const store = new Map<string, string>();
    const kv = {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
      async delete() {},
      async list() {
        return { keys: [], list_complete: true };
      },
    } as unknown as KVNamespace;

    const first = await checkRateLimit(kv, 'test', 2, 60);
    const second = await checkRateLimit(kv, 'test', 2, 60);
    const third = await checkRateLimit(kv, 'test', 2, 60);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
  });
});
