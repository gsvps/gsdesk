import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Switch from './Switch';
import {
  copyViaBridge,
  generateAgentOTP,
  getAgentOTPStatus,
  hasAgentBridge,
  loadAgentState,
  reconnectAgent,
  refreshAgentStatus,
  saveAgentSettings,
  type AgentSavePayload,
  type AgentUIState,
} from '../lib/agent-bridge';
import { formatDeviceId } from '../lib/local-devices';

export default function LocalDevicePanel() {
  const bridge = hasAgentBridge();
  const [state, setState] = useState<AgentUIState | null>(null);
  const [online, setOnline] = useState(false);
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
      if (forceGenerate || online) {
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
        void refreshOTP(false);
      })
      .catch((err) => showStatus(String(err), 'error'));
  }, [bridge, refreshOTP, showStatus]);

  useEffect(() => {
    if (!bridge) return;
    const otpTimer = setInterval(() => void refreshOTP(false), 30000);
    const onlineTimer = setInterval(() => {
      void refreshAgentStatus().then((data) => {
        setOnline(Boolean(data.online));
        if (data.state) setState(data.state);
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
      close_to_tray: next.close_to_tray ?? true,
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
      const refreshed = await refreshAgentStatus();
      setOnline(Boolean(refreshed.online));
      if (refreshed.state) setState(refreshed.state);
      void refreshOTP();
    } catch (err) {
      setState(state);
      showStatus(String(err), 'error');
    } finally {
      savingToggle.current = false;
    }
  }

  async function handleRefresh() {
    try {
      const data = await reconnectAgent();
      setOnline(Boolean(data.online));
      if (data.state) setState(data.state);
      const next = Boolean(data.state?.online);
      if (next) {
        showStatus('本机已连接服务器。', 'success');
        void refreshOTP(true);
      } else if (data.state?.last_error) {
        showStatus(`本机未连接：${data.state.last_error}`, 'error');
      } else {
        showStatus('本机未连接服务器，正在后台重试…', '');
      }
    } catch (err) {
      showStatus(String(err), 'error');
    }
  }

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium text-white">本机</h3>
          <p className="mt-1 text-sm text-slate-400">
            本机 Agent 通过 WebSocket 连上 Worker 后可被远程连接（与控制器令牌无关）。当前服务器：
            <span className="ml-1 font-mono text-sky-300">{state.server_url || '未配置'}</span>
          </p>
          {!state.device_id && state.agent_enabled && state.last_error && (
            <p className="mt-1 text-xs text-red-300">连接失败：{state.last_error}</p>
          )}
          {!state.device_id && state.agent_enabled && !state.last_error && (
            <p className="mt-1 text-xs text-amber-300">设备尚未注册，正在尝试连接服务器…</p>
          )}
        </div>
        <Switch checked={state.agent_enabled} onChange={(v) => void handleAgentToggle(v)} label="允许被控" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={formatDeviceId(state.device_id)}
          className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
        />
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${online ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}
        >
          {online ? '● 服务已连接' : state.agent_enabled ? '○ 未连接服务器' : '被控已关闭'}
        </span>
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

      <div className="mt-5">
        <label className="block text-sm text-slate-400">一次性密码</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={otpCode}
            placeholder="— — — — — —"
            className="min-w-[8rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-lg tracking-widest text-sky-300"
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
          <Link
            to="/settings#permanent-password"
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            自定义密码
          </Link>
        </div>
        <p className="mt-2 text-xs text-slate-500">{otpHint}</p>
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
