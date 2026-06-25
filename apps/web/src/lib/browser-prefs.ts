/**
 * 浏览器本地 UI（127.0.0.1:19527）的控制端配置：API 地址与控制器令牌以 localStorage 为准。
 * Agent 仍需要 config.json 中的 server_url 做信令连接，保存 API 地址时会后台同步。
 */
import { hasAgentBridge, loadAgentState } from './agent-bridge';
import { getStoredToken, setStoredToken } from './api';
import {
  loadBackendConfig,
  saveBackendConfig,
  type BackendMode,
} from './backend-config';
import { isAgentLocalServer } from './bridge-http';
import { loadControllerTokenFromBridge } from './controller-token-bridge';
import { resolveRuntimeApiBase, setRuntimeApiBase } from './runtime-config';

export const BROWSER_STORAGE_KEYS = {
  backend: 'gsdesk_backend',
  token: 'gsdesk_token',
} as const;

export function getBrowserStorageOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

export function useBrowserLocalPrefs(): boolean {
  return isAgentLocalServer();
}

export function loadPreferredApiBase(): string {
  return resolveRuntimeApiBase();
}

export function savePreferredApiBase(apiBase: string, mode?: BackendMode) {
  const prev = loadBackendConfig();
  saveBackendConfig({
    mode: mode ?? prev.mode,
    apiBase: apiBase.replace(/\/$/, ''),
  });
}

export function loadPreferredToken(): string | null {
  return getStoredToken()?.trim() || null;
}

export function savePreferredToken(token: string | null) {
  setStoredToken(token?.trim() || null);
}

export const CONFIG_UPDATED_EVENT = 'gsdesk:config-updated';

export function notifyConfigUpdated() {
  window.dispatchEvent(new Event(CONFIG_UPDATED_EVENT));
}

/** 清除本页相关的 localStorage（API、令牌、设备列表、记住的密码等）。 */
export function clearBrowserLocalCache(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('gsdesk') || key.startsWith('gsdesk_'))) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    localStorage.removeItem(key);
  }
}

/** 首次切到浏览器 UI 时，把 Agent config.json 里已有配置迁入 localStorage。 */
export async function migrateBrowserPrefsFromAgent(): Promise<void> {
  if (!useBrowserLocalPrefs() || !hasAgentBridge()) return;

  const backend = loadBackendConfig();
  let apiBase = backend.apiBase.trim();

  if (!apiBase) {
    try {
      const state = await loadAgentState();
      const fromAgent = state.server_url?.replace(/\/$/, '') ?? '';
      if (fromAgent) apiBase = fromAgent;
    } catch {
      /* ignore */
    }
  }

  if (apiBase && apiBase !== backend.apiBase) {
    const mode: BackendMode =
      apiBase.includes('127.0.0.1') || apiBase.includes('localhost') ? 'local' : 'cloudflare';
    saveBackendConfig({ mode: backend.mode === 'local' && !backend.apiBase ? mode : backend.mode, apiBase });
  }

  if (!loadPreferredToken()) {
    try {
      const fromBridge = await loadControllerTokenFromBridge();
      if (fromBridge?.trim()) savePreferredToken(fromBridge);
    } catch {
      /* ignore */
    }
  }

  setRuntimeApiBase(loadPreferredApiBase());
}
