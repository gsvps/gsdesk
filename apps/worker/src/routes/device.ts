import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { Env } from '../env';
import { createDb } from '../db';
import { devices } from '../db/schema';
import { deviceAccessProtected, otpActive } from '../lib/device-access';
import { generateNumericDeviceId } from '../lib/crypto';
import { writeAuditLog } from '../lib/audit';
import { ensureSystemController } from '../lib/system-user';
import { getClientIp, jsonFail, jsonOk } from '../lib/response';
import { CONTROLLER_USER_ID, controllerAuthMiddleware } from '../middleware/controller-auth';
import { createDeviceToken } from '../middleware/auth';

const device = new Hono<{ Bindings: Env }>();

async function allocateDeviceId(db: ReturnType<typeof createDb>): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const id = generateNumericDeviceId();
    const [existing] = await db.select({ id: devices.id }).from(devices).where(eq(devices.id, id)).limit(1);
    if (!existing) return id;
  }
  throw new Error('device_id_collision');
}

async function mapDeviceRow(env: Env, row: typeof devices.$inferSelect) {
  return {
    id: row.id,
    device_name: row.deviceName,
    hostname: row.hostname,
    os: row.os,
    online: row.online === 1,
    unattended_enabled: row.unattendedEnabled === 1,
    access_password_set: Boolean(row.accessPasswordHash),
    otp_active: await otpActive(env, row.id),
    access_protected: await deviceAccessProtected(env, row.id, row.accessPasswordHash),
    last_seen: row.lastSeen,
    created_at: row.createdAt,
  };
}

device.post('/register', async (c) => {
  const body = await c.req.json<{
    device_name?: string;
    hostname?: string;
    os?: string;
    public_key?: string;
  }>();

  const deviceName = body.device_name?.trim();
  const hostname = body.hostname?.trim();
  const os = body.os?.trim();
  const publicKey = body.public_key?.trim();

  if (!deviceName || !hostname || !os || !publicKey) {
    return jsonFail(c, 'BAD_REQUEST', '缺少设备信息');
  }

  try {
    await ensureSystemController(c.env.DB);

    const now = Date.now();
    const db = createDb(c.env.DB);
    const deviceId = await allocateDeviceId(db);

    await db.insert(devices).values({
      id: deviceId,
      userId: CONTROLLER_USER_ID,
      deviceName,
      hostname,
      os,
      publicKey,
      unattendedEnabled: 0,
      online: 0,
      lastSeen: null,
      createdAt: now,
      updatedAt: now,
    });

    const deviceToken = await createDeviceToken(c.env.KV, deviceId);

    await writeAuditLog(c.env.DB, {
      userId: CONTROLLER_USER_ID,
      deviceId,
      action: 'device.register',
      ip: getClientIp(c),
      metadata: { deviceName, hostname, os },
    });

    return jsonOk(c, { device_id: deviceId, device_token: deviceToken });
  } catch (err) {
    console.error('device register failed', err);
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('no such table')) {
      return jsonFail(
        c,
        'DB_NOT_READY',
        'D1 数据库未初始化，请在项目根目录运行: npm run db:migrate',
        503
      );
    }
    return jsonFail(c, 'INTERNAL_ERROR', '设备注册失败，请确认已执行 D1 迁移 (npm run db:migrate)', 500);
  }
});

device.get('/:id', controllerAuthMiddleware, async (c) => {
  const deviceId = c.req.param('id')?.trim();
  if (!deviceId) {
    return jsonFail(c, 'BAD_REQUEST', '缺少设备 ID');
  }

  const db = createDb(c.env.DB);
  const [row] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  if (!row) {
    return jsonFail(c, 'NOT_FOUND', '设备不存在', 404);
  }

  return jsonOk(c, await mapDeviceRow(c.env, row));
});

export default device;
