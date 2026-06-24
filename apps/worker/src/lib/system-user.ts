import { createDb } from '../db';
import { users } from '../db/schema';
import { CONTROLLER_USER_ID } from '../middleware/controller-auth';

/** Ensures the built-in controller account exists (migration 0003 may not have run on deploy). */
export async function ensureSystemController(db: D1Database): Promise<void> {
  const drizzle = createDb(db);
  await drizzle
    .insert(users)
    .values({
      id: CONTROLLER_USER_ID,
      email: 'controller@local',
      name: 'Controller',
      passwordHash: 'disabled',
      createdAt: 0,
      updatedAt: 0,
    })
    .onConflictDoNothing();
}

export async function isDatabaseReady(db: D1Database): Promise<boolean> {
  try {
    await db.prepare('SELECT 1 FROM users LIMIT 1').first();
    return true;
  } catch {
    return false;
  }
}
