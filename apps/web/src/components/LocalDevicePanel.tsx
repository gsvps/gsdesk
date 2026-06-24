import { useCallback, useEffect, useRef, useState } from 'react';
import Switch from './Switch';
import {
  copyViaBridge,
  generateAgentOTP,
  getAgentOTPStatus,
  refreshAgentOTP,
  hasAgentBridge,
  loadAgentState,
  reconnectAgent,
  refreshAgentStatus,
  saveAgentSettings,
  type AgentSavePayload,
  type AgentUIState,
} from '../lib/agent-bridge';
import { CONFIG_UPDATED_EVENT } from '../lib/browser-prefs';
import { formatDeviceId } from '../lib/local-devices';

export default function LocalDevicePanel({ compact = false }: { compact?: boolean }) {
  const bridge = hasAgentBridge();
  const [state, setState] = useState<AgentUIState | null>(null);
  const [online, setOnline] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | ''>('');
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('正在生成一次性密码…');
  const savingToggle = useRef(false);

  const showStatus = useCallback((text: string, kind: 'success' | 'error' | '' = '') => {
    setStatus(text);
    setStatusKind(kind);
  }, []);

  const refreshOTP = useCallback(async (forceGenerate = false) => {
    try {
      const result = await getAgentOTPStatus();
      if (result.code) {
        setOtpCode(result.code);
        const idle = result.otp_idle_refresh_minutes ?? 5;
        const expires = result.expires_in ?? 0;
        if (result.active_sessions && result.active_sessions > 0) {
          setOtpHint('远程连接进行中，连接结束后将按空闲时间自动更新。');
        } else if (expires > 0) {
          setOtpHint(`无远程连接 ${idle} 分钟后自动更新 · 当前密码约 ${Math.ceil(expires / 60)} 分钟内有效`);
        } else {
          setOtpHint(`无远程连接 ${idle} 分钟后自动更新`);
        }
        return;
      }
      if (result.error) {
        setOtpHint(result.error);
        return;
      }
      if (forceGenerate) {
        const gen = await refreshAgentOTP();
        if (gen.code) {
          setOtpCode(gen.code);
          setOtpHint('一次性密码已刷新。');
          return;
        }
        if (gen.error) {
          setOtpHint(gen.error);
        }
        return;
      }
      if (online) {
        const gen = await generateAgentOTP();
        if (gen.code) {
          setOtpCode(gen.code);
          setOtpHint('一次性密码已生成。');
          return;
        }
        if (gen.message?.includes('正在生成')) {
          setOtpHint('正在生成一次性密码…');
          return;
        }
        if (gen.error) {
          setOtpHint(gen.error);
        }
      }
    } catch (err) {
      setOtpHint(err instanceof Error ? err.message : '获取一次性密码失败');
    }
  }, [online]);

  useEffect(() => {
    if (!bridge) return;
    loadAgentState()
      .then((data) => {
        setState(data);
        setOnline(data.online);
        setConnecting(Boolean(data.agent_enabled && !data.online && !data.last_error));
        void refreshOTP(false);
      })
      .catch((err) => showStatus(String(err), 'error'));
  }, [bridge, refreshOTP, showStatus]);

  useEffect(() => {
    if (!bridge) return;
    const otpTimer = setInterval(() => void refreshOTP(false), 30000);
    const onlineTimer = setInterval(() => {
      void refreshAgentStatus().then((data) => {
        const nextOnline = Boolean(data.online);
        setOnline(nextOnline);
        if (data.state) {
          setState(data.state);
          if (nextOnline) {
            setConnecting(false);
          } else if (data.state.agent_enabled && !data.state.last_error) {
            setConnecting(true);
          } else {
            setConnecting(false);
          }
        }
      });
    }, 10000);
    return () => {
      clearInterval(otpTimer);
      clearInterval(onlineTimer);
    };
  }, [bridge, refreshOTP]);

  useEffect(() => {
    if (!bridge || !otpHint.includes('正在生成')) return;
    const timer = setInterval(() => void refreshOTP(false), 2000);
    return () => clearInterval(timer);
  }, [bridge, otpHint, refreshOTP]);

  useEffect(() => {
    if (!bridge) return;
    const onConfigUpdated = () => {
      setConnecting(true);
      void loadAgentState()
        .then((data) => {
          setState(data);
          setOnline(data.online);
          setConnecting(Boolean(data.agent_enabled && !data.online && !data.last_error));
        })
        .catch(() => {});
      void refreshAgentStatus().then((data) => {
        const nextOnline = Boolean(data.online);
        setOnline(nextOnline);
        if (data.state) setState(data.state);
        setConnecting(Boolean(data.state?.agent_enabled && !nextOnline && !data.state?.last_error));
      });
      void refreshOTP(true);
    };
    window.addEventListener(CONFIG_UPDATED_EVENT, onConfigUpdated);
    return () => window.removeEventListener(CONFIG_UPDATED_EVENT, onConfigUpdated);
  }, [bridge, refreshOTP]);

  if (!bridge) return null;
  if (!state) return <p className="text-slate-400">加载本机信息...</p>;

  async function persistSettings(next: AgentUIState, message?: string) {
    const payload: AgentSavePayload = {
      server_url: next.server_url,
      device_name: next.device_name,
      default_quality: next.default_quality,
      clipboard_enabled: next.clipboard_enabled,
      download_dir: next.download_dir,
      auto_accept: next.auto_accept,
      launch_at_startup: next.launch_at_startup,
      start_minimized: next.start_minimized,
      permanent_password: '',
      clear_permanent_password: false,
      agent_enabled: next.agent_enabled,
      otp_idle_refresh_minutes: next.otp_idle_refresh_minutes,
      close_to_tray: false,
    };
    const result = await saveAgentSettings(payload);
    if (!result.ok) throw new Error(result.error || '保存失败');
    if (result.state) setState(result.state);
    if (message) showStatus(message, 'success');
  }

  async function handleAgentToggle(enabled: boolean) {
    if (savingToggle.current) return;
    savingToggle.current = true;
    const next = { ...state!, agent_enabled: enabled };
    setState(next);
    try {
      await persistSettings(next, enabled ? '已启用本机被控' : '已关闭本机被控');
      if (enabled) setConnecting(true);
      const refreshed = await refreshAgentStatus();
      setOnline(Boolean(refreshed.online));
      if (refreshed.state) setState(refreshed.state);
      setConnecting(Boolean(enabled && !refreshed.online && !refreshed.state?.last_error));
      void refreshOTP();
    } catch (err) {
      setState(state);
      showStatus(String(err), 'error');
    } finally {
      savingToggle.current = false;
    }
  }

  async function handleRefreshOTP() {
    setOtpHint('正在刷新一次性密码…');
    try {
      const gen = await refreshAgentOTP();
      if (gen.code) {
        setOtpCode(gen.code);
        showStatus('一次性密码已刷新。', 'success');
        void refreshOTP(false);
        return;
      }
      const msg = gen.error || '刷新失败';
      setOtpHint(msg);
      showStatus(msg, 'error');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '刷新一次性密码失败';
      setOtpHint(msg);
      showStatus(msg, 'error');
    }
  }

  async function handleRefresh() {
    setConnecting(true);
    try {
      const data = await reconnectAgent();
      setOnline(Boolean(data.online));
      if (data.state) setState(data.state);
      const next = Boolean(data.state?.online);
      setConnecting(Boolean(!next && data.state?.agent_enabled && !data.state?.last_error));
      if (next) {
        showStatus('本机已连接服务器。', 'success');
        void refreshOTP(true);
      } else if (data.state?.last_error) {
        showStatus(`本机未连接：${data.state.last_error}`, 'error');
      } else {
        showStatus('正在连接服务器…', '');
      }
    } catch (err) {
      setConnecting(false);
      showStatus(String(err), 'error');
    }
  }

  function connectionLabel(s: AgentUIState) {
    if (!s.agent_enabled) return { text: '被控已关闭', cls: 'bg-slate-700 text-slate-400' };
    if (online) return { text: '● 服务已连接', cls: 'bg-emerald-900/60 text-emerald-300' };
    if (connecting || (!s.last_error && !s.device_id)) {
      return { text: '◐ 连接中…', cls: 'bg-sky-900/50 text-sky-300' };
    }
    return { text: '○ 未连接服务器', cls: 'bg-red-900/40 text-red-300' };
  }

  const conn = connectionLabel(state);

  return (
    <section className={`rounded-xl border border-slate-700 bg-slate-900/60 ${compact ? 'p-3' : 'p-5'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={`font-medium text-white ${compact ? 'text-sm' : 'text-lg'}`}>本机</h3>
          {!compact && (
            <p className="mt-1 text-sm text-slate-400">
              本机 Agent 通过 WebSocket 连上 Worker 后可被远程连接（与控制器令牌无关）。当前服务器：
              <span className="ml-1 font-mono text-sky-300">{state.server_url || '未配置'}</span>
            </p>
          )}
          {!state.device_id && state.agent_enabled && state.last_error && (
            <p className="mt-1 text-xs text-red-300">连接失败：{state.last_error}</p>
          )}
          {!state.device_id && state.agent_enabled && !state.last_error && (
            <p className="mt-1 text-xs text-amber-300">设备尚未注册，正在尝试连接服务器…</p>
          )}
        </div>
        <Switch checked={state.agent_enabled} onChange={(v) => void handleAgentToggle(v)} label="允许被控" />
      </div>

      <div className={`flex flex-wrap items-center gap-2 ${compact ? 'mt-2' : 'mt-4'}`}>
        <input
          readOnly
          value={formatDeviceId(state.device_id)}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
        />
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${conn.cls}`}>{conn.text}</span>
        <button
          type="button"
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"
          onClick={() =>
            copyViaBridge(state.device_id)
              .then(() => showStatus('设备 ID 已复制。', 'success'))
              .catch((e) => showStatus(String(e), 'error'))
          }
        >
          复制 ID
        </button>
        <button type="button" className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" onClick={() => void handleRefresh()}>
          刷新
        </button>
      </div>

      <div className={compact ? 'mt-2' : 'mt-5'}>
        <label className="block text-xs text-slate-400">一次性密码</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={otpCode}
            placeholder="— — — — — —"
            className={`min-w-[6rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 font-mono tracking-widest text-sky-300 ${compact ? 'py-1 text-sm' : 'px-3 py-2 text-lg'}`}
          />
          {otpCode && (
            <button
              type="button"
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"
              onClick={() =>
                copyViaBridge(otpCode)
                  .then(() => showStatus('一次性密码已复制。', 'success'))
                  .catch((e) => showStatus(String(e), 'error'))
              }
            >
              复制
            </button>
          )}
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"
            onClick={() => void handleRefreshOTP()}
          >
            刷新
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-2 py-1 text-xs hover:bg-slate-800"
            onClick={() => document.getElementById('permanent-password')?.querySelector('input')?.focus()}
          >
            自定义密码
          </button>
        </div>
        {!compact && <p className="mt-2 text-xs text-slate-500">{otpHint}</p>}
      </div>

      {status && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${statusKind === 'error' ? 'bg-red-950/50 text-red-300' : statusKind === 'success' ? 'bg-emerald-950/40 text-emerald-300' : 'text-slate-400'}`}
        >
          {status}
        </p>
      )}
    </section>
  );
}
