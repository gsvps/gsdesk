import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import type { Env } from '../env';
import { createDb } from '../db';
import { devices, sessions } from '../db/schema';
import { writeAuditLog } from '../lib/audit';
import { deviceAccessProtected, verifyDeviceAccess, type AccessPasswordType } from '../lib/device-access';
import { generateId } from '../lib/crypto';
import { getClientIp, jsonFail, jsonOk } from '../lib/response';
import { createSessionWsToken } from '../lib/session-ws';
import { CONTROLLER_USER_ID, controllerAuthMiddleware } from '../middleware/controller-auth';
import sessionFiles from './session-files';

const session = new Hono<{ Bindings: Env }>();

session.use('/*', controllerAuthMiddleware);

async function notifyAgentConnectionRequest(env: Env, sessionId: string, deviceId: string) {
  const nonce = crypto.randomUUID();
  await env.KV.put(`session_nonce:${sessionId}`, nonce, { expirationTtl: 300 });

  const deviceRoomId = env.DEVICE_ROOM.idFromName(deviceId);
  const deviceRoom = env.DEVICE_ROOM.get(deviceRoomId);
  const resp = await deviceRoom.fetch('https://internal/notify', {
    method: 'POST',
    body: JSON.stringify({
      type: 'connection_request',
      session_id: sessionId,
      device_id: deviceId,
      nonce,
    }),
  });
  const body = (await resp.json()) as { ok?: boolean; reason?: string };
  if (!resp.ok || !body.ok) {
    throw new Error(body.reason ?? 'agent_offline');
  }

  return nonce;
}

session.post('/create', async (c) => {
  const body = await c.req.json<{
    device_id?: string;
    password?: string;
    password_type?: AccessPasswordType;
  }>();
  const deviceId = body.device_id?.trim();
  const passwordType: AccessPasswordType = body.password_type === 'otp' ? 'otp' : 'permanent';

  if (!deviceId) {
    return jsonFail(c, 'BAD_REQUEST', '缺少 device_id');
  }

  const db = createDb(c.env.DB);
  const [device] = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);

  if (!device) {
    return jsonFail(c, 'NOT_FOUND', '设备不存在', 404);
  }
  if (device.online !== 1) {
    return jsonFail(c, 'DEVICE_OFFLINE', '设备当前离线', 409);
  }

  const protectedAccess = await deviceAccessProtected(c.env, deviceId, device.accessPasswordHash);
  if (protectedAccess) {
    if (!body.password?.trim()) {
      return jsonFail(c, 'ACCESS_PASSWORD_REQUIRED', '该设备需要输入访问密码', 401);
    }
    const check = await verifyDeviceAccess(
      c.env,
      deviceId,
      body.password,
      passwordType,
      device.accessPasswordHash
    );
    if (!check.ok) {
      if (check.reason === 'otp_unavailable') {
        return jsonFail(c, 'OTP_UNAVAILABLE', '当前没有有效的一次性密码', 401);
      }
      if (check.reason === 'permanent_unavailable') {
        return jsonFail(c, 'PERMANENT_PASSWORD_UNAVAILABLE', '该设备未设置永久密码', 401);
      }
      return jsonFail(c, 'ACCESS_PASSWORD_INVALID', '密码错误', 401);
    }
  }

  const sessionId = generateId('sess');
  const now = Date.now();
  const url = new URL(c.req.url);

  await db.insert(sessions).values({
    id: sessionId,
    userId: CONTROLLER_USER_ID,
    deviceId,
    status: 'pending',
    startedAt: now,
    endedAt: null,
    ip: getClientIp(c),
    userAgent: c.req.header('User-Agent') ?? null,
  });

  let nonce: string;
  try {
    nonce = await notifyAgentConnectionRequest(c.env, sessionId, deviceId);
  } catch (err) {
    await db
      .update(sessions)
      .set({ status: 'closed', endedAt: Date.now() })
      .where(eq(sessions.id, sessionId));
    const reason = err instanceof Error ? err.message : 'agent_offline';
    if (reason === 'agent_offline') {
      return jsonFail(c, 'AGENT_OFFLINE', 'Agent 未在线，请确认 Agent 已启动', 409);
    }
    return jsonFail(c, 'AGENT_NOTIFY_FAILED', '无法通知 Agent，请稍后重试', 502);
  }

  await writeAuditLog(c.env.DB, {
    userId: CONTROLLER_USER_ID,
    deviceId,
    action: 'session.create',
    ip: getClientIp(c),
    metadata: { sessionId },
  });

  const wsToken = await createSessionWsToken(c.env.KV, sessionId, CONTROLLER_USER_ID);
  const signalPath = `/ws/session/${sessionId}?token=${encodeURIComponent(wsToken)}`;
  const signalUrl = `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}${signalPath}`;

  return jsonOk(c, {
    session_id: sessionId,
    signal_url: signalUrl,
    signal_path: signalPath,
    ws_token: wsToken,
    nonce,
  });
});

session.post('/:id/reconnect', async (c) => {
  const sessionId = c.req.param('id');
  const db = createDb(c.env.DB);
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, CONTROLLER_USER_ID)))
    .limit(1);

  if (!row) {
    return jsonFail(c, 'NOT_FOUND', '会话不存在', 404);
  }
  if (row.status === 'closed') {
    return jsonFail(c, 'SESSION_CLOSED', '会话已结束，请从设备列表重新发起连接', 410);
  }

  if (row.status === 'pending' && Date.now() - row.startedAt < 60_000) {
    return jsonOk(c, { session_id: sessionId, status: 'pending', deduped: true });
  }

  const debounceKey = `session_reconnect_lock:${sessionId}`;
  const lastReconnect = await c.env.KV.get(debounceKey);
  if (lastReconnect && Date.now() - Number(lastReconnect) < 10_000) {
    return jsonOk(c, { session_id: sessionId, status: 'pending', deduped: true });
  }
  await c.env.KV.put(debounceKey, String(Date.now()), { expirationTtl: 60 });

  const [device] = await db.select().from(devices).where(eq(devices.id, row.deviceId)).limit(1);
  if (!device) {
    return jsonFail(c, 'NOT_FOUND', '设备不存在', 404);
  }
  if (device.online !== 1) {
    return jsonFail(c, 'DEVICE_OFFLINE', '设备当前离线', 409);
  }

  await db
    .update(sessions)
    .set({ status: 'pending', endedAt: null })
    .where(eq(sessions.id, sessionId));

  await notifyAgentConnectionRequest(c.env, sessionId, row.deviceId);

  await writeAuditLog(c.env.DB, {
    userId: CONTROLLER_USER_ID,
    deviceId: row.deviceId,
    action: 'session.reconnect',
    ip: getClientIp(c),
    metadata: { sessionId },
  });

  return jsonOk(c, { session_id: sessionId, status: 'pending' });
});

session.post('/:id/close', async (c) => {
  const sessionId = c.req.param('id');
  const db = createDb(c.env.DB);
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, CONTROLLER_USER_ID)))
    .limit(1);

  if (!row) {
    return jsonFail(c, 'NOT_FOUND', '会话不存在', 404);
  }

  await db
    .update(sessions)
    .set({ status: 'closed', endedAt: Date.now() })
    .where(eq(sessions.id, sessionId));

  const sessionRoomId = c.env.SESSION_ROOM.idFromName(sessionId);
  const sessionRoom = c.env.SESSION_ROOM.get(sessionRoomId);
  await sessionRoom.fetch('https://internal/close', { method: 'POST' });

  await writeAuditLog(c.env.DB, {
    userId: CONTROLLER_USER_ID,
    deviceId: row.deviceId,
    action: 'session.close',
    ip: getClientIp(c),
    metadata: { sessionId },
  });

  return jsonOk(c, { closed: true });
});

session.get('/', async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, CONTROLLER_USER_ID))
    .orderBy(desc(sessions.startedAt))
    .limit(50);

  return jsonOk(
    c,
    rows.map((row) => ({
      id: row.id,
      device_id: row.deviceId,
      status: row.status,
      started_at: row.startedAt,
      ended_at: row.endedAt,
    }))
  );
});

session.route('/:id/files', sessionFiles);

export default session;
