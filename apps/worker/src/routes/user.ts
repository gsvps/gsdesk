import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { users } from '../db/schema';
import { jsonFail, jsonOk } from '../lib/response';
import { authMiddleware, type AuthVariables } from '../middleware/auth';

const user = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

user.use('/*', authMiddleware);

user.get('/me', async (c) => {
  const sessionUser = c.get('user');
  const db = createDb(c.env.DB);
  const [row] = await db.select().from(users).where(eq(users.id, sessionUser.userId)).limit(1);

  if (!row) {
    return jsonFail(c, 'NOT_FOUND', '用户不存在', 404);
  }

  return jsonOk(c, {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar: row.avatar,
  });
});

export default user;
