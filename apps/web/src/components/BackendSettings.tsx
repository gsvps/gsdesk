import { useCallback, useEffect, useRef, useState } from 'react';
import Switch from './Switch';
import {
  applyBackendToRuntime,
  BACKEND_MODE_LABEL,
  loadBackendConfig,
  saveBackendConfig,
  suggestedApiBase,
  testBackendConnection,
  type BackendConfig,
  type BackendMode,
} from '../lib/backend-config';
import {
  agentStateToSavePayload,
  browseAgentDownloadDir,
  hasAgentBridge,
  loadAgentState,
  saveAgentSettings,
  syncAgentServerUrl,
  type AgentUIState,
} from '../lib/agent-bridge';
import { useAuth } from '../lib/auth';
import { loadPreferredApiBase, notifyConfigUpdated, savePreferredApiBase } from '../lib/browser-prefs';
import { isAgentLocalServer } from '../lib/bridge-http';
import { QUALITY_OPTIONS, type QualityPreset } from '../lib/remote-settings';
import { fetchWebAppEntry, joinWebAppUrl } from '../lib/web-app-entry';
import { isDesktopClient, isHostedWebApp, setRuntimeApiBase } from '../lib/runtime-config';
import { useDebouncedEffect } from '../lib/use-debounce';

function normalizeDefaultQuality(value: string | undefined): QualityPreset {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'ultra') return value;
  return 'high';
}

export default function BackendSettings({ compact = false }: { compact?: boolean }) {
  const { token, tokenVerified, setToken } = useAuth();
  const bridge = hasAgentBridge();
  const [config, setConfig] = useState<BackendConfig>(() => loadBackendConfig());
  const [tokenValue, setTokenValue] = useState(token ?? '');
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | ''>('');
  const [tokenStatus, setTokenStatus] = useState('');
  const [tokenStatusKind, setTokenStatusKind] = useState<'success' | 'error' | ''>('');
  const [apiBusy, setApiBusy] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);

  const [agentState, setAgentState] = useState<AgentUIState | null>(null);
  const [agentStatus, setAgentStatus] = useState('');
  const [agentStatusKind, setAgentStatusKind] = useState<'success' | 'error' | ''>('');
  const [agentBusy, setAgentBusy] = useState(false);
  const agentLoaded = useRef(false);
  const [webAppEntry, setWebAppEntry] = useState('/app/');

  useEffect(() => {
    const loaded = loadBackendConfig();
    setConfig(loaded);
    setRuntimeApiBase(applyBackendToRuntime(loaded));

    if (isAgentLocalServer() && bridge) {
      const apiBase = applyBackendToRuntime(loaded);
      if (apiBase) {
        void syncAgentServerUrl(apiBase).catch(() => {});
      }
    }
  }, [bridge]);

  useEffect(() => {
    if (!bridge) return;
    loadAgentState()
      .then((state) => {
        const browserBase = loadPreferredApiBase();
        const merged = browserBase ? { ...state, server_url: browserBase } : state;
        setAgentState({ ...merged, default_quality: normalizeDefaultQuality(merged.default_quality) });
        agentLoaded.current = true;
      })
      .catch((err) => {
        setAgentStatus(String(err));
        setAgentStatusKind('error');
      });
  }, [bridge]);

  useEffect(() => {
    setTokenValue(token ?? '');
  }, [token]);

  useEffect(() => {
    if (isHostedWebApp()) return;
    const base = config.apiBase.trim();
    if (!base) {
      setWebAppEntry('/app/');
      return;
    }
    void fetchWebAppEntry(base).then(setWebAppEntry);
  }, [config.apiBase]);

  function updateMode(mode: BackendMode) {
    setConfig((prev) => ({
      mode,
      apiBase: suggestedApiBase(mode, prev.apiBase),
    }));
  }

  const apiBaseFilled = Boolean(config.apiBase.trim()) || config.mode === 'local';

  const persistApi = useCallback(async () => {
    if (!apiBaseFilled) return;
    const next = {
      ...config,
      apiBase: config.apiBase.trim() || suggestedApiBase(config.mode),
    };
    setApiBusy(true);
    setStatus('');
    try {
      const test = await testBackendConnection(next.apiBase);
      if (!test.ok) {
        setStatusKind('error');
        setStatus(test.message);
        return;
      }
      saveBackendConfig(next);
      savePreferredApiBase(next.apiBase, next.mode);
      setConfig(next);
      const apiBase = next.apiBase.trim() || suggestedApiBase(next.mode);
      setRuntimeApiBase(apiBase);
      if (isDesktopClient() && bridge) {
        const sync = await syncAgentServerUrl(apiBase);
        if (!sync.ok) {
          setStatusKind('error');
          setStatus(sync.error || '同步 Agent 失败');
          return;
        }
      }
      setStatusKind('success');
      setStatus(`${test.message} · 已自动保存`);
      notifyConfigUpdated();
    } finally {
      setApiBusy(false);
    }
  }, [apiBaseFilled, bridge, config]);

  const persistToken = useCallback(
    async (next: string) => {
      const trimmed = next.trim();
      if (!trimmed || trimmed === (token ?? '')) return;
      setTokenBusy(true);
      try {
        await setToken(trimmed);
        setTokenStatusKind('success');
        setTokenStatus('令牌已自动保存并验证');
        notifyConfigUpdated();
      } catch (err) {
        setTokenStatusKind('error');
        setTokenStatus(err instanceof Error ? err.message : '令牌验证失败');
      } finally {
        setTokenBusy(false);
      }
    },
    [setToken, token]
  );

  const persistAgentFields = useCallback(async () => {
    if (!agentState || !agentLoaded.current) return;
    setAgentBusy(true);
    try {
      const fresh = await loadAgentState();
      const result = await saveAgentSettings(
        agentStateToSavePayload(fresh, {
          server_url: loadPreferredApiBase() || fresh.server_url,
          device_name: agentState.device_name,
          default_quality: agentState.default_quality,
          otp_idle_refresh_minutes: agentState.otp_idle_refresh_minutes,
          auto_accept: agentState.auto_accept,
          clipboard_enabled: agentState.clipboard_enabled,
          download_dir: agentState.download_dir,
          launch_at_startup: agentState.launch_at_startup,
          start_minimized: agentState.start_minimized,
          close_to_tray: agentState.close_to_tray,
        })
      );
      if (!result.ok) {
        setAgentStatusKind('error');
        setAgentStatus(result.error || '保存失败');
        return;
      }
      if (result.state) setAgentState(result.state);
      setAgentStatusKind('success');
      setAgentStatus('已自动保存');
    } catch (err) {
      setAgentStatusKind('error');
      setAgentStatus(err instanceof Error ? err.message : '保存失败');
    } finally {
      setAgentBusy(false);
    }
  }, [agentState]);

  useDebouncedEffect(() => void persistApi(), [config.apiBase, config.mode], 800, apiBaseFilled, true);

  useDebouncedEffect(
    () => void persistToken(tokenValue),
    [tokenValue],
    800,
    Boolean(tokenValue.trim()) && tokenValue.trim() !== (token ?? ''),
    true
  );

  useDebouncedEffect(
    () => void persistAgentFields(),
    [
      agentState?.device_name,
      agentState?.default_quality,
      agentState?.otp_idle_refresh_minutes,
      agentState?.auto_accept,
      agentState?.launch_at_startup,
      agentState?.clipboard_enabled,
      agentState?.download_dir,
    ],
    800,
    Boolean(agentState) && agentLoaded.current,
    true
  );

  async function handleCopyToken() {
    const text = tokenValue.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setTokenStatusKind('success');
      setTokenStatus('已复制');
    } catch {
      setTokenStatusKind('error');
      setTokenStatus('复制失败');
    }
  }

  return (
    <section
      className={`rounded-xl border border-slate-700 bg-slate-900/60 ${compact ? 'flex h-full flex-col overflow-y-auto p-3' : 'p-5'}`}
    >
      <h4 className={`font-medium text-slate-200 ${compact ? 'text-sm' : ''}`}>设置</h4>
      {isHostedWebApp() ? (
        <p className="mt-1 text-xs text-emerald-300">手机/浏览器安全控制入口 · 已使用当前站点 API</p>
      ) : (
        <>
          {!compact && <p className="mt-1 text-sm text-slate-400">填写后自动保存。WebRTC 画面仍为 P2P 直连。</p>}
          {config.apiBase.trim() && (
            <p className={`text-xs text-slate-400 ${compact ? 'mt-1' : 'mt-2'}`}>
              手机浏览器控制：
              <a
                className="ml-1 text-sky-300 hover:underline"
                href={joinWebAppUrl(config.apiBase, webAppEntry)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {joinWebAppUrl(config.apiBase, webAppEntry)}
              </a>
            </p>
          )}
        </>
      )}

      {!isHostedWebApp() && (
        <>
      <div className={`flex flex-wrap gap-2 ${compact ? 'mt-2' : 'mt-3'}`}>
        {(Object.keys(BACKEND_MODE_LABEL) as BackendMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`rounded-lg border px-2 py-1 text-xs ${
              config.mode === mode
                ? 'border-sky-500 bg-sky-950/50 text-sky-200'
                : 'border-slate-600 text-slate-300 hover:bg-slate-800'
            }`}
            onClick={() => updateMode(mode)}
          >
            {BACKEND_MODE_LABEL[mode]}
          </button>
        ))}
        {apiBusy && <span className="self-center text-xs text-slate-500">API 保存中…</span>}
      </div>

      <label className={`block text-sm text-slate-400 ${compact ? 'mt-2' : 'mt-3'}`}>
        API 地址
        <input
          value={config.apiBase}
          onChange={(e) => setConfig((prev) => ({ ...prev, apiBase: e.target.value }))}
          onBlur={() => void persistApi()}
          placeholder={suggestedApiBase(config.mode) || 'https://your-worker.workers.dev'}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
        />
      </label>
      {status && (
        <p className={`mt-1 text-xs ${statusKind === 'error' ? 'text-red-400' : 'text-emerald-300'}`}>{status}</p>
      )}
        </>
      )}

      <label className={`block text-sm text-slate-400 ${compact ? 'mt-2' : 'mt-3'}`}>
        <span className="flex items-center justify-between gap-2">
          <span>控制器令牌</span>
          <span className={`text-xs ${tokenVerified ? 'text-emerald-400' : 'text-amber-300'}`}>
            {tokenVerified ? '已验证' : '未验证'}
            {tokenBusy ? ' · 保存中…' : ''}
          </span>
        </span>
        <div className="mt-1 flex gap-1">
          <input
            type={showToken ? 'text' : 'password'}
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
            onBlur={() => void persistToken(tokenValue)}
            placeholder="CONTROLLER_JWT_SECRET"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
          />
          <button
            type="button"
            title={showToken ? '隐藏' : '显示'}
            className="shrink-0 rounded-lg border border-slate-600 px-2.5 py-2 text-sm hover:bg-slate-800"
            onClick={() => setShowToken((v) => !v)}
          >
            {showToken ? '隐藏' : '显示'}
          </button>
          <button
            type="button"
            className="shrink-0 rounded-lg border border-slate-600 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => void handleCopyToken()}
          >
            复制
          </button>
        </div>
      </label>
      {tokenStatus && (
        <p className={`mt-1 text-xs ${tokenStatusKind === 'error' ? 'text-red-400' : 'text-emerald-300'}`}>
          {tokenStatus}
        </p>
      )}

      {bridge && agentState && (
        <div className={`${compact ? 'mt-3 space-y-2' : 'mt-4 space-y-3'}`}>
          <label className={`block text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
            设备名称
            <input
              value={agentState.device_name}
              onChange={(e) => setAgentState({ ...agentState, device_name: e.target.value })}
              className={`mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 text-white ${compact ? 'px-2 py-1 text-sm' : 'px-3 py-2'}`}
            />
          </label>

          <label className={`block text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
            默认画质
            <select
              value={agentState.default_quality}
              onChange={(e) => setAgentState({ ...agentState, default_quality: e.target.value })}
              className={`mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 text-white ${compact ? 'px-2 py-1 text-sm' : 'px-3 py-2'}`}
            >
              {QUALITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className={`block text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
            OTP 空闲刷新（分钟）
            <input
              type="number"
              min={1}
              max={120}
              value={agentState.otp_idle_refresh_minutes}
              onChange={(e) =>
                setAgentState({
                  ...agentState,
                  otp_idle_refresh_minutes: Math.min(120, Math.max(1, Number(e.target.value) || 5)),
                })
              }
              className={`mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 text-white ${compact ? 'px-2 py-1 text-sm' : 'max-w-xs px-3 py-2'}`}
            />
          </label>

          <div className={`border-t border-slate-800 ${compact ? 'space-y-2 pt-2' : 'space-y-3 pt-3'}`}>
            <Switch
              checked={agentState.auto_accept}
              onChange={(v) => setAgentState({ ...agentState, auto_accept: v })}
              label="自动接受远程连接"
            />
            <Switch
              checked={agentState.launch_at_startup}
              onChange={(v) => setAgentState({ ...agentState, launch_at_startup: v })}
              label="开机自启动"
            />
            <Switch
              checked={agentState.clipboard_enabled}
              onChange={(v) => setAgentState({ ...agentState, clipboard_enabled: v })}
              label="启用双向剪贴板"
            />
          </div>

          <label className={`block text-slate-400 ${compact ? 'text-xs' : 'text-sm'}`}>
            下载目录
            <div className="mt-1 flex gap-1">
              <input
                value={agentState.download_dir}
                onChange={(e) => setAgentState({ ...agentState, download_dir: e.target.value })}
                className={`min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 text-white ${compact ? 'px-2 py-1 text-sm' : 'px-3 py-2'}`}
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
                onClick={() =>
                  browseAgentDownloadDir(agentState.download_dir)
                    .then((path) => setAgentState({ ...agentState, download_dir: path }))
                    .catch((err) => {
                      setAgentStatusKind('error');
                      setAgentStatus(String(err));
                    })
                }
              >
                浏览
              </button>
            </div>
          </label>

          {(agentStatus || agentBusy) && (
            <p className={`text-xs ${agentStatusKind === 'error' ? 'text-red-400' : 'text-emerald-300'}`}>
              {agentBusy ? '保存中…' : agentStatus}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
