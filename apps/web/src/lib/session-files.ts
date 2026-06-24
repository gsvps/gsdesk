import { getStoredToken } from './api';

export interface UploadedSessionFile {
  file_id: string;
  filename: string;
  size?: number;
}

export async function uploadSessionFile(sessionId: string, file: File): Promise<UploadedSessionFile> {
  const token = getStoredToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/session/${sessionId}/files/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const body = (await res.json()) as {
    success: boolean;
    data?: UploadedSessionFile;
    error?: { message: string };
  };
  if (!body.success || !body.data) {
    throw new Error(body.error?.message ?? '上传失败');
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

export function downloadSessionFile(sessionId: string, fileId: string, filename: string) {
  const token = getStoredToken();
  const url = `/api/session/${sessionId}/files/${fileId}`;
  const a = document.createElement('a');
  a.download = filename;
  if (token) {
    void fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('下载失败');
        return res.blob();
      })
      .then((blob) => {
        a.href = URL.createObjectURL(blob);
        a.click();
        URL.revokeObjectURL(a.href);
      });
    return;
  }
  a.href = url;
  a.click();
}
