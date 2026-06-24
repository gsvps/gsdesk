const SESSION_WS_PREFIX = 'session_ws:';
const SESSION_WS_META_PREFIX = 'session_ws_meta:';
const SESSION_WS_TTL = 60 * 30;

export async function createSessionWsToken(
  kv: KVNamespace,
  sessionId: string,
  userId: string
): Promise<string> {
  const token = crypto.randomUUID();
  await kv.put(`${SESSION_WS_PREFIX}${sessionId}`, token, { expirationTtl: SESSION_WS_TTL });
  await kv.put(`${SESSION_WS_META_PREFIX}${sessionId}`, userId, { expirationTtl: SESSION_WS_TTL });
  return token;
}

export async function getSessionWsToken(kv: KVNamespace, sessionId: string): Promise<string | null> {
  return kv.get(`${SESSION_WS_PREFIX}${sessionId}`);
}

export async function getSessionWsUserId(kv: KVNamespace, sessionId: string): Promise<string | null> {
  return kv.get(`${SESSION_WS_META_PREFIX}${sessionId}`);
}
