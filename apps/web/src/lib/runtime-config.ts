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
    __CLOUDDESK_WEB_BASENAME__?: string;
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

function normalizeBasename(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed || trimmed === '.' || trimmed === './') return null;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function detectBasenameFromBaseTag(): string | null {
  if (typeof document === 'undefined') return null;
  const href = document.querySelector('base[href]')?.getAttribute('href');
  if (!href) return null;
  try {
    return normalizeBasename(new URL(href, window.location.origin).pathname);
  } catch {
    return null;
  }
}

function detectBasenameFromScriptTag(): string | null {
  if (typeof document === 'undefined') return null;
  const src = document.querySelector('script[type="module"][src]')?.getAttribute('src') ?? '';
  const match = src.match(/^(\/[^/]+)\/assets\//);
  return normalizeBasename(match?.[1]);
}

/** 从当前 URL 推断托管路径（deploy 时未按 /app base 构建时的兜底） */
function detectHostedPathFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const pathname = window.location.pathname;
  const candidates = [
    window.__CLOUDDESK_WEB_BASENAME__,
    detectBasenameFromBaseTag(),
    detectBasenameFromScriptTag(),
    '/app',
  ];
  for (const raw of candidates) {
    const prefix = normalizeBasename(raw);
    if (!prefix) continue;
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }
  return null;
}

export function webAppBasename(): string {
  const injected = normalizeBasename(
    typeof window !== 'undefined' ? window.__CLOUDDESK_WEB_BASENAME__ : undefined
  );
  if (injected) return injected;

  const fromBaseTag = detectBasenameFromBaseTag();
  if (fromBaseTag) return fromBaseTag;

  const fromScript = detectBasenameFromScriptTag();
  if (fromScript) return fromScript;

  const raw = import.meta.env.BASE_URL ?? '/';
  if (!raw || raw === '/' || raw === './' || raw === '.') {
    const detected = detectHostedPathFromLocation();
    if (detected) return detected;
    return '/';
  }
  return normalizeBasename(raw) ?? '/';
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
