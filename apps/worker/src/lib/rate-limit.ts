import type { KVNamespace } from '@cloudflare/workers-types';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
}

/** 固定窗口计数限流（基于 KV）。 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  const bucketKey = `rate:${key}`;
  const now = Date.now();
  const raw = await kv.get(bucketKey);
  let count = 0;
  let windowStart = now;

  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { count: number; windowStart: number };
      if (now - parsed.windowStart < windowSec * 1000) {
        count = parsed.count;
        windowStart = parsed.windowStart;
      }
    } catch {
      /* treat as fresh window */
    }
  }

  if (count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowSec * 1000 - now) / 1000));
    return { allowed: false, retryAfterSec };
  }

  await kv.put(bucketKey, JSON.stringify({ count: count + 1, windowStart }), {
    expirationTtl: windowSec,
  });
  return { allowed: true };
}

export function rateLimitResponse(retryAfterSec: number) {
  return {
    code: 'RATE_LIMITED' as const,
    message: `请求过于频繁，请 ${retryAfterSec} 秒后重试`,
    status: 429 as const,
  };
}
