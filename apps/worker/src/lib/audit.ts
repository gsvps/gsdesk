import { createDb } from '../db';
import { auditLogs } from '../db/schema';
import { generateId } from './crypto';

export async function writeAuditLog(
  db: D1Database,
  params: {
    userId?: string | null;
    deviceId?: string | null;
    action: string;
    ip?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const drizzle = createDb(db);
  await drizzle.insert(auditLogs).values({
    id: generateId('audit'),
    userId: params.userId ?? null,
    deviceId: params.deviceId ?? null,
    action: params.action,
    ip: params.ip ?? null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    createdAt: Date.now(),
  });
}
