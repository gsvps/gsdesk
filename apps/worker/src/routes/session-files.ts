import { and, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { Hono } from 'hono';
import type { Env } from '../env';
import { createDb } from '../db';
import { sessions } from '../db/schema';
import { getFileMeta, newFileId, r2Key, saveFileMeta } from '../lib/file-transfer';
import { getClientIp, jsonFail, jsonOk } from '../lib/response';
import { writeAuditLog } from '../lib/audit';
import type { AuthVariables } from '../middleware/auth';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const sessionFiles = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

async function assertActiveSession(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  sessionId: string
) {
  const user = c.get('user');
  const db = createDb(c.env.DB);
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.userId)))
    .limit(1);

  if (!row) {
    return { error: jsonFail(c, 'NOT_FOUND', '会话不存在', 404) };
  }
  if (row.status === 'closed') {
    return { error: jsonFail(c, 'SESSION_CLOSED', '会话已结束', 410) };
  }
  return { row };
}

sessionFiles.post('/upload', async (c) => {
  const sessionId = c.req.param('id');
  if (!sessionId) {
    return jsonFail(c, 'BAD_REQUEST', '缺少 session id');
  }

  const check = await assertActiveSession(c, sessionId);
  if (check.error) return check.error;
  const row = check.row!;

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
  const filename = file.name || 'upload.bin';
  const key = r2Key(sessionId, fileId, filename);
  const body = await file.arrayBuffer();

  await c.env.R2.put(key, body, {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });

  await saveFileMeta(c.env, {
    fileId,
    sessionId,
    deviceId: row.deviceId,
    filename,
    size: file.size,
    contentType: file.type || 'application/octet-stream',
    direction: 'to_agent',
    createdAt: Date.now(),
  });

  await writeAuditLog(c.env.DB, {
    userId: row.userId,
    deviceId: row.deviceId,
    action: 'file.upload',
    ip: getClientIp(c),
    metadata: { sessionId, fileId, filename, size: file.size },
  });

  return jsonOk(c, {
    file_id: fileId,
    filename,
    size: file.size,
    direction: 'to_agent',
  });
});

sessionFiles.get('/:fileId', async (c) => {
  const sessionId = c.req.param('id');
  const fileId = c.req.param('fileId');
  if (!sessionId || !fileId) {
    return jsonFail(c, 'BAD_REQUEST', '缺少参数');
  }

  const check = await assertActiveSession(c, sessionId);
  if (check.error) return check.error;

  const meta = await getFileMeta(c.env, fileId);
  if (!meta || meta.sessionId !== sessionId) {
    return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  }

  const obj = await c.env.R2.get(r2Key(sessionId, fileId, meta.filename));
  if (!obj) {
    return jsonFail(c, 'NOT_FOUND', '文件不存在', 404);
  }

  const headers = new Headers();
  headers.set('Content-Type', meta.contentType);
  headers.set('Content-Length', String(meta.size));
  headers.set(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(meta.filename)}`
  );

  return new Response(obj.body, { headers });
});

export default sessionFiles;
