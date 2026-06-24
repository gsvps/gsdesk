import type { Env } from '../env';
import { generateId } from './crypto';

const FILE_META_PREFIX = 'file_meta:';
const FILE_META_TTL = 60 * 60 * 24;

export interface FileMeta {
  fileId: string;
  sessionId: string;
  deviceId: string;
  filename: string;
  size: number;
  contentType: string;
  direction: 'to_agent' | 'to_browser';
  createdAt: number;
}

export function r2Key(sessionId: string, fileId: string, filename: string): string {
  const safe = filename.replace(/[^\w.\-()+\u4e00-\u9fff]/g, '_').slice(0, 120);
  return `transfer/${sessionId}/${fileId}/${safe}`;
}

export async function saveFileMeta(env: Env, meta: FileMeta): Promise<void> {
  await env.KV.put(`${FILE_META_PREFIX}${meta.fileId}`, JSON.stringify(meta), {
    expirationTtl: FILE_META_TTL,
  });
}

export async function getFileMeta(env: Env, fileId: string): Promise<FileMeta | null> {
  const raw = await env.KV.get(`${FILE_META_PREFIX}${fileId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FileMeta;
  } catch {
    return null;
  }
}

export function newFileId(): string {
  return generateId('file');
}

export interface UploadedFile {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export function parseUploadedFile(value: unknown): UploadedFile | null {
  if (!value || typeof value !== 'object' || !('arrayBuffer' in value)) {
    return null;
  }
  const file = value as UploadedFile;
  if (typeof file.size !== 'number' || typeof file.arrayBuffer !== 'function') {
    return null;
  }
  return file;
}
