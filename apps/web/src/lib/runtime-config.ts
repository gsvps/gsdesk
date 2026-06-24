import { applyBackendToRuntime, loadBackendConfig } from './backend-config';
import { loadPreferredApiBase, useBrowserLocalPrefs } from './browser-prefs';

export type ClientMode = 'browser' | 'desktop';

export interface RuntimeConfig {
  mode: ClientMode;
  apiBase: string;
  deviceId?: string;
}

declare global {
  interface Window {
    getRuntimeConfig?: () => Promise<string> | string;
  }
}

let config: RuntimeConfig = {
  mode: import.meta.env.VITE_EMBED === '1' ? 'desktop' : 'browser',
  apiBase: import.meta.env.VITE_API_BASE ?? '',
};

let initPromise: Promise<void> | null = null;

export function getRuntimeConfig(): RuntimeConfig {
  return config;
}

export function isDesktopClient(): boolean {
  return config.mode === 'desktop';
}

export function webAppBasename(): string {
  const base = import.meta.env.BASE_URL;
  if (base && base !== '/') {
    return base.replace(/\/+$/, '');
  }
  return '/';
}

export function isHostedWebApp(): boolean {
  const base = webAppBasename();
  if (base === '/') return false;
  const { pathname } = window.location;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export async function initRuntimeConfig(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (typeof window.getRuntimeConfig === 'function') {
      const raw = await window.getRuntimeConfig();
      const parsed = JSON.parse(typeof raw === 'string' ? raw : String(raw)) as RuntimeConfig;
      const browserBase = useBrowserLocalPrefs()
        ? loadPreferredApiBase()
        : applyBackendToRuntime(loadBackendConfig());
      config = {
        mode: parsed.mode ?? 'desktop',
        apiBase: browserBase || (parsed.apiBase ?? '').replace(/\/$/, ''),
        deviceId: parsed.deviceId,
      };
      return;
    }

    if (isHostedWebApp()) {
      config = { mode: 'browser', apiBase: '' };
      return;
    }

    if (typeof window !== 'undefined' && window.location.hostname === '127.0.0.1' && window.location.port === '19527') {
      config = { mode: 'desktop', apiBase: '' };
      return;
    }

    config = {
      ...config,
      apiBase: applyBackendToRuntime(loadBackendConfig()),
    };
  })();
  return initPromise;
}

export function setRuntimeApiBase(apiBase: string) {
  config = { ...config, apiBase: apiBase.replace(/\/$/, '') };
}

export function resolveApiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const base = config.apiBase.replace(/\/$/, '');
  if (!base) return path;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
