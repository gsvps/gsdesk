import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { users } from '../db/schema';
import { generateId, hashPassword, verifyPassword } from '../lib/crypto';
import { writeAuditLog } from '../lib/audit';
import { getClientIp, jsonFail, jsonOk } from '../lib/response';
import {
  authMiddleware,
  clearSessionCookie,
  createSession,
  deleteSession,
  sessionCookie,
  type AuthVariables,
} from '../middleware/auth';

const auth = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

auth.get('/setup-status', async (c) => {
  const db = createDb(c.env.DB);
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  return jsonOk(c, { needsSetup: existing.length === 0 });
});

auth.post('/setup', async (c) => {
  const db = createDb(c.env.DB);
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) {
    return jsonFail(c, 'FORBIDDEN', '系统已初始化', 403);
  }

  const body = await c.req.json<{ email?: string; password?: string; name?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  const name = body.name?.trim() || null;

  if (!email || !email.includes('@')) {
    return jsonFail(c, 'BAD_REQUEST', '请输入有效邮箱');
  }
  if (!password || password.length < 6) {
    return jsonFail(c, 'BAD_REQUEST', '密码至少 6 位');
  }

  const now = Date.now();
  const userId = generateId('usr');
  await db.insert(users).values({
    id: userId,
    email,
    name,
    avatar: null,
    passwordHash: await hashPassword(password),
    createdAt: now,
    updatedAt: now,
  });

  const token = await createSession(c.env.KV, { userId, email, name });
  c.header('Set-Cookie', sessionCookie(token));

  await writeAuditLog(c.env.DB, {
    userId,
    action: 'user.setup',
    ip: getClientIp(c),
  });

  return jsonOk(c, { user: { id: userId, email, name }, token });
});

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return jsonFail(c, 'BAD_REQUEST', '请输入邮箱和密码');
  }

  const db = createDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return jsonFail(c, 'UNAUTHORIZED', '邮箱或密码错误', 401);
  }

  const token = await createSession(c.env.KV, {
    userId: user.id,
    email: user.email,
    name: user.name,
  });
  c.header('Set-Cookie', sessionCookie(token));

  await writeAuditLog(c.env.DB, {
    userId: user.id,
    action: 'user.login',
    ip: getClientIp(c),
  });

  return jsonOk(c, {
    user: { id: user.id, email: user.email, name: user.name },
    token,
  });
});

auth.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookie = c.req.header('Cookie');
  const cookieToken = cookie?.match(/(?:^|;\s*)token=([^;]+)/)?.[1];
  const sessionToken = token || (cookieToken ? decodeURIComponent(cookieToken) : null);

  if (sessionToken) {
    const user = await getSessionUser(c.env.KV, sessionToken);
    if (user) {
      await writeAuditLog(c.env.DB, {
        userId: user.userId,
        action: 'user.logout',
        ip: getClientIp(c),
      });
    }
    await deleteSession(c.env.KV, sessionToken);
  }

  c.header('Set-Cookie', clearSessionCookie());
  return jsonOk(c, { loggedOut: true });
});

async function getSessionUser(kv: KVNamespace, token: string) {
  const raw = await kv.get(`session:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { userId: string };
  } catch {
    return null;
  }
}

export default auth;

export { authMiddleware };
