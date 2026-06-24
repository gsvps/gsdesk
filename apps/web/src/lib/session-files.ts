import { getStoredToken } from './api';
import { fileTransferPercent } from './file-transfer-ui';
import { resolveApiUrl } from './runtime-config';

export interface UploadedSessionFile {
  file_id: string;
  filename: string;
  size?: number;
}

export type FileTransferProgressCallback = (loaded: number, total: number | null) => void;

export async function uploadSessionFile(
  sessionId: string,
  file: File,
  onProgress?: FileTransferProgressCallback
): Promise<UploadedSessionFile> {
  const token = getStoredToken();
  const url = resolveApiUrl(`/api/session/${sessionId}/files/upload`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (event) => {
      onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size || null);
    };

    xhr.onload = () => {
      let body: {
        success: boolean;
        data?: UploadedSessionFile;
        error?: { message: string };
      };
      try {
        body = JSON.parse(xhr.responseText) as typeof body;
      } catch {
        reject(new Error(`上传失败（HTTP ${xhr.status}）`));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !body.success || !body.data) {
        reject(new Error(body.error?.message ?? `上传失败（HTTP ${xhr.status}）`));
        return;
      }
      onProgress?.(file.size || body.data.size || 0, file.size || body.data.size || null);
      resolve(body.data);
    };

    xhr.onerror = () => reject(new Error('上传失败，请检查网络连接'));
    xhr.onabort = () => reject(new Error('上传已取消'));

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

export async function sendFileToAgent(
  sessionId: string,
  file: File,
  onSendControl: (payload: Record<string, unknown>) => boolean,
  onProgress?: FileTransferProgressCallback
): Promise<UploadedSessionFile> {
  const uploaded = await uploadSessionFile(sessionId, file, onProgress);
  const sent = onSendControl({
    type: 'file_to_agent',
    file_id: uploaded.file_id,
    filename: uploaded.filename,
  });
  if (!sent) {
    throw new Error('连接未就绪，无法通知远程端接收文件');
  }
  return uploaded;
}

export async function downloadSessionFile(
  sessionId: string,
  fileId: string,
  filename: string,
  onProgress?: FileTransferProgressCallback
) {
  const token = getStoredToken();
  const url = resolveApiUrl(`/api/session/${sessionId}/files/${fileId}`);
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }

  const totalHeader = res.headers.get('Content-Length');
  const total = totalHeader ? Number(totalHeader) : null;
  const reader = res.body?.getReader();
  if (!reader) {
    const blob = await res.blob();
    onProgress?.(blob.size, blob.size);
    triggerBrowserDownload(blob, filename);
    return;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.(0, total);

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      onProgress?.(loaded, total);
    }
  }

  const blob = new Blob(chunks as BlobPart[]);
  onProgress?.(loaded, loaded);
  triggerBrowserDownload(blob, filename);
}

function triggerBrowserDownload(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function progressFromLoaded(loaded: number, total: number | null | undefined): number | null {
  return fileTransferPercent(loaded, total);
}
