import { useEffect, useState } from 'react';
import {
  applyBackendToRuntime,
  BACKEND_MODE_LABEL,
  defaultBackendConfig,
  loadBackendConfig,
  saveBackendConfig,
  suggestedApiBase,
  testBackendConnection,
  type BackendConfig,
  type BackendMode,
} from '../lib/backend-config';
import { hasAgentBridge, loadAgentState, syncAgentServerUrl } from '../lib/agent-bridge';
import { isDesktopClient, setRuntimeApiBase } from '../lib/runtime-config';

export default function BackendSettings() {
  const [config, setConfig] = useState<BackendConfig>(() => loadBackendConfig());
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | ''>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loaded = loadBackendConfig();
    if (isDesktopClient() && hasAgentBridge()) {
      void loadAgentState()
        .then((agent) => {
          const apiBase = agent.server_url?.replace(/\/$/, '') || loaded.apiBase;
          const mode: BackendMode = apiBase.includes('127.0.0.1') || apiBase.includes('localhost') ? 'local' : 'cloudflare';
          setConfig({ mode: loaded.apiBase ? loaded.mode : mode, apiBase: apiBase || loaded.apiBase });
          setRuntimeApiBase(apiBase || loaded.apiBase);
        })
        .catch(() => {
          setRuntimeApiBase(applyBackendToRuntime(loaded));
        });
      return;
    }
    setRuntimeApiBase(applyBackendToRuntime(loaded));
  }, []);

  function updateMode(mode: BackendMode) {
    setConfig((prev) => ({
      mode,
      apiBase: suggestedApiBase(mode, prev.apiBase),
    }));
  }

  const apiBaseFilled = Boolean(config.apiBase.trim()) || config.mode === 'local';

  async function handleSave() {
    if (!apiBaseFilled) {
      setStatusKind('error');
      setStatus('请先填写 API 地址');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const next = {
        ...config,
        apiBase: config.apiBase.trim() || suggestedApiBase(config.mode),
      };
      const test = await testBackendConnection(next.apiBase);
      if (!test.ok) {
        setStatusKind('error');
        setStatus(test.message);
        return;
      }
      saveBackendConfig(next);
      setConfig(next);
      if (isDesktopClient() && hasAgentBridge()) {
        const apiBase = next.apiBase.trim() || suggestedApiBase(next.mode);
        const sync = await syncAgentServerUrl(apiBase);
        if (!sync.ok) {
          setStatusKind('error');
          setStatus(sync.error || '同步 Agent 服务器地址失败');
          return;
        }
        setRuntimeApiBase(apiBase);
        setStatusKind('success');
        setStatus(`${test.message}。设置已保存，本机 Agent 正在后台连接，请稍后在主页点刷新。`);
        return;
      }
      setRuntimeApiBase(applyBackendToRuntime(next));
      setStatusKind('success');
      setStatus(`${test.message}。控制端 API 已切换。`);
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setStatus('');
    try {
      const base = config.apiBase.trim() || suggestedApiBase(config.mode);
      const test = await testBackendConnection(base);
      setStatusKind(test.ok ? 'success' : 'error');
      setStatus(test.message);
    } finally {
      setBusy(false);
    }
  }

  function handleReset() {
    const next = defaultBackendConfig();
    setConfig(next);
    saveBackendConfig(next);
    setRuntimeApiBase('');
    setStatusKind('success');
    setStatus('已恢复默认（本地开发 / 页面同源）。');
  }

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <h4 className="font-medium text-slate-200">后端 / 加速节点</h4>
      <p className="mt-1 text-sm text-slate-400">
        与 Agent 的「服务器地址」指向同一套 API + 信令服务。WebRTC 画面仍为 P2P 直连，不经 VPS 中转。
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(Object.keys(BACKEND_MODE_LABEL) as BackendMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`rounded-lg border px-3 py-2 text-sm ${
              config.mode === mode
                ? 'border-sky-500 bg-sky-950/50 text-sky-200'
                : 'border-slate-600 text-slate-300 hover:bg-slate-800'
            }`}
            onClick={() => updateMode(mode)}
          >
            {BACKEND_MODE_LABEL[mode]}
          </button>
        ))}
      </div>

      <label className="mt-4 block text-sm text-slate-400">
        API 地址
        <input
          value={config.apiBase}
          onChange={(e) => setConfig((prev) => ({ ...prev, apiBase: e.target.value }))}
          placeholder={suggestedApiBase(config.mode) || 'https://your-node.example.com'}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
        />
      </label>

      <p className="mt-2 text-xs text-slate-500">
        {config.mode === 'cloudflare' && '填写 Cloudflare Worker 部署地址，例如 https://clouddesk.example.com'}
        {config.mode === 'self_hosted' && '填写 VPS 自托管地址，需运行 apps/server（见 docs/self-host.md）'}
        {config.mode === 'local' && '默认 http://127.0.0.1:8787；Vite 开发时可留空走代理'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={apiBaseFilled ? 'btn-primary' : 'rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-400 cursor-not-allowed'}
          disabled={busy || !apiBaseFilled}
          onClick={() => void handleSave()}
        >
          {busy ? '保存中…' : '保存并应用'}
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
          disabled={busy}
          onClick={() => void handleTest()}
        >
          测试连接
        </button>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"
          onClick={handleReset}
        >
          恢复默认
        </button>
      </div>

      {status && (
        <p className={`mt-3 text-sm ${statusKind === 'error' ? 'text-red-400' : 'text-emerald-300'}`}>{status}</p>
      )}
    </section>
  );
}
