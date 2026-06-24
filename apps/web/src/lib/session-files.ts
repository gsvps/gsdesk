import { getStoredToken } from './api';
import { resolveApiUrl } from './runtime-config';

export interface UploadedSessionFile {
  file_id: string;
  filename: string;
  size?: number;
}

export async function uploadSessionFile(sessionId: string, file: File): Promise<UploadedSessionFile> {
  const token = getStoredToken();
  const form = new FormData();
  form.append('file', file);
  const headers: HeadersInit = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(resolveApiUrl(`/api/session/${sessionId}/files/upload`), {
    method: 'POST',
    headers,
    body: form,
  });
  const body = (await res.json()) as {
    success: boolean;
    data?: UploadedSessionFile;
    error?: { message: string };
  };
  if (!body.success || !body.data) {
    throw new Error(body.error?.message ?? `上传失败（HTTP ${res.status}）`);
  }
  return body.data;
}

export async function sendFileToAgent(
  sessionId: string,
  file: File,
  onSendControl: (payload: Record<string, unknown>) => void
): Promise<UploadedSessionFile> {
  const uploaded = await uploadSessionFile(sessionId, file);
  onSendControl({
    type: 'file_to_agent',
    file_id: uploaded.file_id,
    filename: uploaded.filename,
  });
  return uploaded;
}

export async function downloadSessionFile(sessionId: string, fileId: string, filename: string) {
  const token = getStoredToken();
  const url = resolveApiUrl(`/api/session/${sessionId}/files/${fileId}`);
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }

  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
