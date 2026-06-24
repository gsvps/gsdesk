export interface UpdateCheckResult {
  ok: boolean;
  error?: string;
  current_version?: string;
  latest_version?: string;
  update_available?: boolean;
  download_url?: string;
  release_notes?: string;
  message?: string;
}

export interface ClientVersionResult {
  ok?: boolean;
  version?: string;
}

declare global {
  interface Window {
    getClientVersionGo?: () => Promise<string> | string;
    checkUpdateGo?: () => Promise<string> | string;
    openExternalGo?: (url: string) => Promise<string> | string;
  }
}

function parseJSON<T>(raw: string | undefined): T {
  return JSON.parse(typeof raw === 'string' ? raw : String(raw)) as T;
}

export async function getClientVersion(): Promise<string> {
  if (typeof window.getClientVersionGo !== 'function') return '0.0.0';
  const data = parseJSON<ClientVersionResult>(await window.getClientVersionGo());
  return data.version || '0.0.0';
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  if (typeof window.checkUpdateGo !== 'function') {
    return { ok: false, error: '检查更新仅在桌面客户端可用' };
  }
  return parseJSON<UpdateCheckResult>(await window.checkUpdateGo());
}

export async function openExternalURL(url: string): Promise<void> {
  if (typeof window.openExternalGo !== 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  const data = parseJSON<{ ok?: boolean; error?: string }>(await window.openExternalGo(url));
  if (!data.ok) throw new Error(data.error || '无法打开链接');
}
