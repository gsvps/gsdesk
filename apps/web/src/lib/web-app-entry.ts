/** 从后端 /api/health 读取配置的浏览器控制端入口路径。 */
export async function fetchWebAppEntry(apiBase: string): Promise<string> {
  const base = apiBase.replace(/\/$/, '');
  if (!base) return '/app/';

  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(8000) });
    const body = (await res.json()) as {
      success?: boolean;
      data?: { web_app_entry?: string };
    };
    if (body.success && body.data?.web_app_entry) {
      return body.data.web_app_entry;
    }
  } catch {
    /* 使用默认值 */
  }
  return '/app/';
}

export function joinWebAppUrl(apiBase: string, entryPath: string): string {
  const base = apiBase.replace(/\/$/, '');
  const entry = entryPath.startsWith('/') ? entryPath : `/${entryPath}`;
  return `${base}${entry}`;
}
