export type BackendMode = 'local' | 'cloudflare' | 'self_hosted';

export interface BackendConfig {
  mode: BackendMode;
  /** API 根地址，不含末尾斜杠。留空时浏览器模式走同源/Vite 代理。 */
  apiBase: string;
}

const STORAGE_KEY = 'clouddesk_backend';

export const BACKEND_MODE_LABEL: Record<BackendMode, string> = {
  local: '本地开发',
  cloudflare: 'Cloudflare Worker',
  self_hosted: 'VPS 自托管加速',
};

export function defaultBackendConfig(): BackendConfig {
  return { mode: 'local', apiBase: '' };
}

export function loadBackendConfig(): BackendConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultBackendConfig();
    const parsed = JSON.parse(raw) as BackendConfig;
    return {
      mode: parsed.mode ?? 'local',
      apiBase: (parsed.apiBase ?? '').replace(/\/$/, ''),
    };
  } catch {
    return defaultBackendConfig();
  }
}

export function saveBackendConfig(config: BackendConfig) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...config, apiBase: config.apiBase.replace(/\/$/, '') })
  );
}

export function suggestedApiBase(mode: BackendMode, current?: string): string {
  if (current?.trim()) return current.replace(/\/$/, '');
  if (mode === 'local') return 'http://127.0.0.1:8787';
  return '';
}

export function applyBackendToRuntime(config: BackendConfig): string {
  const base = config.apiBase.trim() || suggestedApiBase(config.mode);
  return base.replace(/\/$/, '');
}

export async function testBackendConnection(apiBase: string): Promise<{ ok: boolean; message: string; backend?: string }> {
  const base = apiBase.replace(/\/$/, '');
  if (!base) {
    return { ok: true, message: '将使用当前页面同源或开发代理' };
  }
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(12000) });
    const body = (await res.json()) as {
      success?: boolean;
      data?: { status?: string; backend?: string; app?: string; db_ready?: boolean; db_error?: string };
      error?: { message?: string };
    };
    if (!res.ok || body.success === false) {
      return { ok: false, message: body.error?.message ?? `HTTP ${res.status}` };
    }
    const kind = body.data?.backend ?? 'unknown';
    const app = body.data?.app ?? 'CloudDesk';
    const dbReady = body.data?.db_ready;
    if (dbReady === false) {
      const detail = body.data?.db_error?.trim();
      return {
        ok: false,
        message: detail
          ? `Worker 已连通，但 D1 初始化失败：${detail}。请确认 Worker 已绑定正确的 D1 数据库后重新部署，或在项目根目录运行 npm run db:migrate`
          : 'Worker 已连通，但 D1 数据库未初始化。请重新部署最新 Worker（会自动建表），或在项目根目录运行 npm run db:migrate',
        backend: kind,
      };
    }
    return { ok: true, message: `已连接 ${app}（${kind}）`, backend: kind };
  } catch {
    return { ok: false, message: `无法连接 ${base}` };
  }
}
