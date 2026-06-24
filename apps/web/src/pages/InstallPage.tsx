import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Switch from '../components/Switch';
import { browseInstallDir, getInstallProgress, getInstallState, runInstall, waitForInstallRelaunch, type InstallState } from '../lib/install-bridge';
import { isDesktopClient } from '../lib/runtime-config';

export default function InstallPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<InstallState | null>(null);
  const [installDir, setInstallDir] = useState('D:\\CloudDesk');
  const [createDesktopShortcut, setCreateDesktopShortcut] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState('');
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!isDesktopClient()) {
      navigate('/', { replace: true });
      return;
    }
    getInstallState()
      .then((data) => {
        setState(data);
        setInstallDir(data.default_dir || 'D:\\CloudDesk');
        if (!data.needs_setup) navigate('/', { replace: true });
      })
      .catch((err) => setError(String(err)));
  }, [navigate]);

  async function onBrowse() {
    try {
      const path = await browseInstallDir(installDir);
      if (path) setInstallDir(path);
    } catch (err) {
      setError(String(err));
    }
  }

  async function onInstall(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    setStep('准备安装…');
    setPercent(2);

    const pollTimer = window.setInterval(() => {
      void getInstallProgress().then((progress) => {
        setStep(progress.step || '安装中…');
        setPercent(progress.percent || 0);
      });
    }, 150);

    try {
      const result = await runInstall(installDir, createDesktopShortcut);
      if (!result.ok) {
        setError(result.error || '安装失败');
        return;
      }
      setMessage(result.message || '安装完成');
      setPercent(100);
      if (result.relaunch) {
        setMessage('安装完成，正在进入主页…');
        const ready = await waitForInstallRelaunch();
        if (ready) {
          navigate('/', { replace: true });
        } else {
          setMessage('安装完成。若未自动进入主页，请运行安装目录中的 CloudDesk.exe。');
        }
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(String(err));
    } finally {
      window.clearInterval(pollTimer);
      setBusy(false);
    }
  }

  if (!state) {
    return <div className="flex min-h-screen items-center justify-center text-slate-400">准备安装...</div>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-8">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900/90 p-8 shadow-2xl">
        <h1 className="text-2xl font-semibold text-white">安装 CloudDesk</h1>
        <p className="mt-2 text-sm text-slate-400">
          将客户端安装到指定目录。安装过程会自动复制程序并创建数据目录；管理界面使用系统浏览器打开，无需 WebView2。
        </p>

        <form className="mt-6 space-y-4" onSubmit={onInstall}>
          <label className="block text-sm text-slate-300">
            安装路径
            <div className="mt-2 flex gap-2">
              <input
                value={installDir}
                onChange={(e) => setInstallDir(e.target.value)}
                disabled={busy}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 font-mono text-sm text-white disabled:opacity-60"
              />
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
                onClick={() => void onBrowse()}
              >
                浏览
              </button>
            </div>
          </label>

          <Switch checked={createDesktopShortcut} onChange={setCreateDesktopShortcut} label="创建桌面快捷方式" disabled={busy} />

          <ul className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
            <li>默认推荐：D:\CloudDesk</li>
            <li>安装后配置与日志保存在安装目录下的 data / logs</li>
            <li>可同时作为控制端与被控端使用</li>
          </ul>

          {busy && (
            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>{step || '安装中…'}</span>
                <span className="font-mono text-slate-400">{percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(percent, 2)}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {message && !busy && <p className="text-sm text-emerald-300">{message}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full btn-primary py-2.5"
          >
            {busy ? '安装中…' : '安装'}
          </button>
        </form>
      </div>
    </div>
  );
}
