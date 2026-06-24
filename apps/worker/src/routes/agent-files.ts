import { and, eq } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { createDb } from '../db';
import { sessions } from '../db/schema';
import { getFileMeta, newFileId, r2Key, saveFileMeta } from '../lib/file-transfer';
import { jsonFail, jsonOk } from '../lib/response';
import { deviceAuthMiddleware, type DeviceAuthVariables } from '../middleware/device-auth';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const agentFiles = new Hono<{ Bindings: Env; Variables: DeviceAuthVariables }>();

agentFiles.use('/*', deviceAuthMiddleware);

async function assertSessionForDevice(
  c: Context<{ Bindings: Env; Variables: DeviceAuthVariables }>,
  sessionId: string,
  deviceId: string
) {
  const db = createDb(c.env.DB);
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.deviceId, deviceId)))
    .limit(1);

  if (!row) {
    return { error: jsonFail(c, 'NOT_FOUND', '会话不存在', 404) };
  }
  if (row.status === 'closed') {
    return { error: jsonFail(c, 'SESSION_CLOSED', '会话已结束', 410) };
  }
  return { row };
}

agentFiles.get('/:fileId', async (c) => {
  const fileId = c.req.param('fileId');
  const sessionId = c.req.query('session_id')?.trim();
  const deviceId = c.get('deviceId');

  if (!fileId || !sessionId) {
    return jsonFail(c, 'BAD_REQUEST', '缺少 fileId 或 session_id');
  }

  const check = await assertSessionForDevice(c, sessionId, deviceId);
  if (check.error) return check.error;

  const meta = await getFileMeta(c.env, fileId);
  if (!meta || meta.sessionId !== sessionId || meta.deviceId !== deviceId) {
    return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  }
  if (meta.direction !== 'to_agent') {
    return jsonFail(c, 'FORBIDDEN', '文件方向不允许 Agent 下载', 403);
  }

  const obj = await c.env.R2.get(r2Key(sessionId, fileId, meta.filename));
  if (!obj) {
    return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', meta.contentType);
  headers.set('Content-Length', String(meta.size));
  headers.set('Content-Disposition', `attachment; filename="${meta.filename}"`);

  return new Response(obj.body, { headers });
});

agentFiles.post('/upload', async (c) => {
  const deviceId = c.get('deviceId');
  const sessionId = c.req.query('session_id')?.trim();
  if (!sessionId) {
    return jsonFail(c, 'BAD_REQUEST', '缺少 session_id');
  }

  const check = await assertSessionForDevice(c, sessionId, deviceId);
  if (check.error) return check.error;

  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return jsonFail(c, 'BAD_REQUEST', '缺少 file 字段');
  }
  if (file.size <= 0) {
    return jsonFail(c, 'BAD_REQUEST', '文件为空');
  }
  if (file.size > MAX_FILE_SIZE) {
    return jsonFail(c, 'BAD_REQUEST', '文件过大（最大 100MB）');
  }

  const fileId = newFileId();
  const filename = file.name || 'remote.bin';
  const key = r2Key(sessionId, fileId, filename);
  const body = await file.arrayBuffer();

  await c.env.R2.put(key, body, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });

  await saveFileMeta(c.env, {
    fileId,
    sessionId,
    deviceId,
    filename,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    direction: 'to_browser',
    createdAt: Date.now(),
  });

  return jsonOk(c, {
    file_id: fileId,
    filename,
    size: file.size,
    direction: 'to_browser',
  });
});

export default agentFiles;
