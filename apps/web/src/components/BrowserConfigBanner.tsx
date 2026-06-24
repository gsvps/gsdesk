import { useEffect, useState } from 'react';
import { hasAgentBridge, loadAgentState } from '../lib/agent-bridge';
import {
  BROWSER_STORAGE_KEYS,
  clearBrowserLocalCache,
  CONFIG_UPDATED_EVENT,
  getBrowserStorageOrigin,
  loadPreferredApiBase,
  loadPreferredToken,
  useBrowserLocalPrefs,
} from '../lib/browser-prefs';
import { isAgentLocalServer } from '../lib/bridge-http';

function readBannerState() {
  return {
    apiBase: loadPreferredApiBase(),
    hasToken: Boolean(loadPreferredToken()),
  };
}

export default function BrowserConfigBanner() {
  const [agentConfigPath, setAgentConfigPath] = useState('');
  const [prefs, setPrefs] = useState(readBannerState);

  useEffect(() => {
    if (!hasAgentBridge()) return;
    void loadAgentState()
      .then((state) => setAgentConfigPath(state.config_path || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const refresh = () => setPrefs(readBannerState());
    window.addEventListener(CONFIG_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(CONFIG_UPDATED_EVENT, refresh);
  }, []);

  if (!isAgentLocalServer() || !useBrowserLocalPrefs()) return null;

  const origin = getBrowserStorageOrigin();

  function handleClearCache() {
    if (!window.confirm('将清除 localStorage 中的 API 地址、控制器令牌、设备列表等配置，并刷新页面。确定继续？')) {
      return;
    }
    clearBrowserLocalCache();
    window.location.reload();
  }

  return (
    <div className="border-b border-slate-800 bg-slate-950/95 px-3 py-1 text-[11px] leading-tight text-slate-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span>
          localStorage：
          <code className="ml-1 text-sky-300">{origin}</code>
        </span>
        <span>
          键：
          <code className="ml-1 text-sky-300">{BROWSER_STORAGE_KEYS.backend}</code>、
          <code className="text-sky-300">{BROWSER_STORAGE_KEYS.token}</code>
        </span>
        <span>
          API：
          <code className={`ml-1 ${prefs.apiBase ? 'text-emerald-300' : 'text-amber-300'}`}>
            {prefs.apiBase || '未配置'}
          </code>
        </span>
        <span className={prefs.hasToken ? 'text-emerald-300' : 'text-amber-300'}>
          令牌：{prefs.hasToken ? '已保存' : '未配置'}
        </span>
        {agentConfigPath && (
          <span className="max-w-[14rem] truncate" title={agentConfigPath}>
            Agent：<code className="text-slate-300">{agentConfigPath}</code>
          </span>
        )}
        <button
          type="button"
          className="rounded border border-red-900/60 px-2 py-0.5 text-red-300 hover:bg-red-950/40"
          onClick={handleClearCache}
        >
          清理缓存
        </button>
      </div>
    </div>
  );
}
