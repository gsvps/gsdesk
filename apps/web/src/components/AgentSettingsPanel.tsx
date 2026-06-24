import { useEffect, useState } from 'react';

import Switch from './Switch';

import {
  browseAgentDownloadDir,
  clearAgentPermanentPassword,
  hasAgentBridge,
  loadAgentState,
  saveAgentSettings,
  type AgentSavePayload,
  type AgentUIState,
} from '../lib/agent-bridge';
import { checkForUpdate, getClientVersion, openExternalURL, type UpdateCheckResult } from '../lib/update-bridge';



const QUALITY_OPTIONS = [

  { value: 'low', label: '流畅' },

  { value: 'medium', label: '标准' },

  { value: 'high', label: '高清' },

  { value: 'ultra', label: '超清' },

];



export default function AgentSettingsPanel() {

  const bridge = hasAgentBridge();

  const [state, setState] = useState<AgentUIState | null>(null);

  const [status, setStatus] = useState('');

  const [statusKind, setStatusKind] = useState<'success' | 'error' | ''>('');

  const [busy, setBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [permanentPassword, setPermanentPassword] = useState('');
  const [clientVersion, setClientVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);



  useEffect(() => {
    if (!bridge) return;
    loadAgentState()
      .then(setState)
      .catch((err) => {
        setStatus(String(err));
        setStatusKind('error');
      });
    void getClientVersion().then(setClientVersion);
  }, [bridge]);



  function showStatus(text: string, kind: 'success' | 'error' | '' = '') {

    setStatus(text);

    setStatusKind(kind);

  }



  if (!bridge) {

    return null;

  }



  if (!state) {

    return <p className="text-slate-400">加载设置...</p>;

  }



  async function handleCheckUpdate() {
    setCheckingUpdate(true);
    setUpdateInfo(null);
    try {
      const result = await checkForUpdate();
      setUpdateInfo(result);
      if (!result.ok) {
        showStatus(result.error || '检查更新失败', 'error');
        return;
      }
      showStatus(result.message || '检查完成', result.update_available ? 'success' : 'success');
    } catch (err) {
      showStatus(String(err), 'error');
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function handleSave() {

    if (!state) return;

    setBusy(true);

    const payload: AgentSavePayload = {

      server_url: state.server_url,

      device_name: state.device_name,

      default_quality: state.default_quality,

      clipboard_enabled: state.clipboard_enabled,

      download_dir: state.download_dir,

      auto_accept: state.auto_accept,

      launch_at_startup: state.launch_at_startup,

      start_minimized: state.start_minimized,

      permanent_password: '',

      clear_permanent_password: false,

      agent_enabled: state.agent_enabled,

      otp_idle_refresh_minutes: state.otp_idle_refresh_minutes,

      close_to_tray: state.close_to_tray ?? true,

    };

    try {

      const result = await saveAgentSettings(payload);

      if (!result.ok) {

        showStatus(result.error || '保存失败', 'error');

        return;

      }

      if (result.state) setState(result.state);

      showStatus(result.message || '设置已保存。', 'success');

    } catch (err) {

      showStatus(String(err), 'error');

    } finally {

      setBusy(false);

    }

  }

  async function handleSavePermanentPassword() {
    if (!state) return;
    if (!permanentPassword.trim()) {
      showStatus('请输入至少 4 位自定义密码', 'error');
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await saveAgentSettings({
        server_url: state.server_url,
        device_name: state.device_name,
        default_quality: state.default_quality,
        clipboard_enabled: state.clipboard_enabled,
        download_dir: state.download_dir,
        auto_accept: state.auto_accept,
        launch_at_startup: state.launch_at_startup,
        start_minimized: state.start_minimized,
        permanent_password: permanentPassword,
        clear_permanent_password: false,
        agent_enabled: state.agent_enabled,
        otp_idle_refresh_minutes: state.otp_idle_refresh_minutes,
        close_to_tray: state.close_to_tray ?? true,
      });
      if (!result.ok) {
        showStatus(result.error || '保存失败', 'error');
        return;
      }
      setPermanentPassword('');
      if (result.state) setState(result.state);
      showStatus('自定义密码已保存。', 'success');
    } catch (err) {
      showStatus(String(err), 'error');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleClearPermanentPassword() {
    setPasswordBusy(true);
    try {
      const result = await clearAgentPermanentPassword();
      if (!result.ok) {
        showStatus(result.error || '清除失败', 'error');
        return;
      }
      showStatus('已清除自定义密码。', 'success');
    } catch (err) {
      showStatus(String(err), 'error');
    } finally {
      setPasswordBusy(false);
    }
  }

  return (

    <div className="space-y-4">

      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
        <h4 className="font-medium text-slate-200">Agent 服务器（API + 信令）</h4>
        <p className="mt-1 text-sm text-slate-400">
          与设置页「后端 / 加速节点」一致：Cloudflare Worker 或 VPS 自托管（<code className="text-sky-300">apps/server</code>
          ）。修改后需重启 Agent。
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-slate-400 md:col-span-2">
            服务器地址
            <input
              value={state.server_url}
              onChange={(e) => setState({ ...state, server_url: e.target.value })}
              placeholder="https://your-worker.example.com 或 VPS 地址"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
            />
          </label>
          <label className="block text-sm text-slate-400">
            设备名称
            <input
              value={state.device_name}
              onChange={(e) => setState({ ...state, device_name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
        </div>
      </section>



      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">

        <h4 className="font-medium text-slate-200">远程桌面</h4>

        <div className="mt-3 grid gap-3 md:grid-cols-2">

          <label className="block text-sm text-slate-400">

            默认画质

            <select

              value={state.default_quality}

              onChange={(e) => setState({ ...state, default_quality: e.target.value })}

              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"

            >

              {QUALITY_OPTIONS.map((opt) => (

                <option key={opt.value} value={opt.value}>

                  {opt.label}

                </option>

              ))}

            </select>

          </label>

          <div className="flex items-end pb-1">

            <Switch

              checked={state.clipboard_enabled}

              onChange={(v) => setState({ ...state, clipboard_enabled: v })}

              label="启用双向剪贴板"

            />

          </div>

        </div>

      </section>



      <section id="permanent-password" className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 scroll-mt-6">

        <h4 className="font-medium text-slate-200">访问密码</h4>

        <label className="mt-3 block text-sm text-slate-400">
          自定义密码（至少 4 位）
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              type="password"
              value={permanentPassword}
              onChange={(e) => setPermanentPassword(e.target.value)}
              placeholder="设置后远程连接可使用"
              className="min-w-[12rem] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
            <button
              type="button"
              disabled={passwordBusy}
              className="rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void handleClearPermanentPassword()}
            >
              清除
            </button>
            <button
              type="button"
              disabled={passwordBusy || !permanentPassword.trim()}
              className="btn-primary"
              onClick={() => void handleSavePermanentPassword()}
            >
              保存
            </button>
          </div>
        </label>
        <p className="mt-2 text-xs text-slate-500">自定义密码长期有效；一次性密码见主页本机面板。</p>

        <label className="mt-4 block text-sm text-slate-400">

          无连接时自动更新一次性密码（分钟）

          <input

            type="number"

            min={1}

            max={120}

            value={state.otp_idle_refresh_minutes}

            onChange={(e) =>

              setState({

                ...state,

                otp_idle_refresh_minutes: Math.min(120, Math.max(1, Number(e.target.value) || 5)),

              })

            }

            className="mt-1 w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"

          />

        </label>

        <p className="mt-2 text-xs text-slate-500">本机无远程连接超过该时间后，一次性密码将自动重新生成。</p>

      </section>



      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">

        <h4 className="font-medium text-slate-200">系统</h4>

        <div className="mt-3 space-y-3">

          <Switch checked={state.auto_accept} onChange={(v) => setState({ ...state, auto_accept: v })} label="自动接受连接（跳过确认弹窗）" />

          <Switch checked={state.launch_at_startup} onChange={(v) => setState({ ...state, launch_at_startup: v })} label="开机自启" />

          <Switch checked={state.start_minimized} onChange={(v) => setState({ ...state, start_minimized: v })} label="启动时最小化到托盘" />

          <Switch checked={state.close_to_tray ?? true} onChange={(v) => setState({ ...state, close_to_tray: v })} label="关闭窗口时退到托盘（不退出程序）" />

        </div>

        <label className="mt-4 block text-sm text-slate-400">

          文件下载目录

          <div className="mt-1 flex gap-2">

            <input

              value={state.download_dir}

              onChange={(e) => setState({ ...state, download_dir: e.target.value })}

              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"

            />

            <button

              type="button"

              className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800"

              onClick={() =>

                browseAgentDownloadDir(state.download_dir)

                  .then((path) => setState({ ...state, download_dir: path }))

                  .catch((e) => showStatus(String(e), 'error'))

              }

            >

              浏览

            </button>

          </div>

        </label>

        {state.config_path && <p className="mt-3 text-xs text-slate-500">配置文件: {state.config_path}</p>}

        {state.install_path && <p className="text-xs text-slate-500">安装目录: {state.install_path}</p>}
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="font-medium text-slate-200">软件更新</h4>
            <p className="mt-1 text-sm text-slate-400">当前版本 {clientVersion || '—'}</p>
          </div>
          <button
            type="button"
            disabled={checkingUpdate}
            className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
            onClick={() => void handleCheckUpdate()}
          >
            {checkingUpdate ? '检查中...' : '检查更新'}
          </button>
        </div>
        {updateInfo?.ok && updateInfo.update_available && (
          <div className="mt-4 rounded-lg border border-sky-900/60 bg-sky-950/30 px-4 py-3">
            <p className="text-sm text-sky-200">
              发现新版本 {updateInfo.latest_version}
              {updateInfo.release_notes ? `：${updateInfo.release_notes}` : ''}
            </p>
            {updateInfo.download_url && (
              <button
                type="button"
                className="mt-3 rounded-lg bg-sky-600 px-3 py-1.5 text-sm hover:bg-sky-500"
                onClick={() => void openExternalURL(updateInfo.download_url!)}
              >
                下载更新
              </button>
            )}
          </div>
        )}
        {updateInfo?.ok && !updateInfo.update_available && (
          <p className="mt-3 text-sm text-emerald-300">当前已是最新版本。</p>
        )}
      </section>



      {status && (

        <p className={`rounded-lg px-3 py-2 text-sm ${statusKind === 'error' ? 'bg-red-950/50 text-red-300' : statusKind === 'success' ? 'bg-emerald-950/40 text-emerald-300' : 'text-slate-400'}`}>

          {status}

        </p>

      )}



      <div className="flex justify-end">

        <button type="button" disabled={busy} className="btn-primary px-5" onClick={() => void handleSave()}>

          {busy ? '保存中...' : '保存设置'}

        </button>

      </div>

    </div>

  );

}

