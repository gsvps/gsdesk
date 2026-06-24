import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';

export default function ControllerTokenSettings() {
  const { token, tokenVerified, setToken } = useAuth();
  const [value, setValue] = useState(token ?? '');
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | ''>('');
  const [busy, setBusy] = useState(false);
  const [postInstall, setPostInstall] = useState(false);

  useEffect(() => {
    setValue(token ?? '');
  }, [token]);

  useEffect(() => {
    if (sessionStorage.getItem('clouddesk:post-install') === '1') {
      setPostInstall(true);
      sessionStorage.removeItem('clouddesk:post-install');
    }
  }, []);

  async function handleSave() {
    const next = value.trim();
    if (!next) {
      setStatusKind('error');
      setStatus('请输入控制器 JWT 令牌');
      return;
    }
    setBusy(true);
    try {
      await setToken(next);
      setStatusKind('success');
      setStatus('令牌已保存并验证通过。');
    } catch (err) {
      setStatusKind('error');
      setStatus(err instanceof Error ? err.message : '令牌验证失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    const text = value.trim();
    if (!text) {
      setStatusKind('error');
      setStatus('没有可复制的令牌');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatusKind('success');
      setStatus('令牌已复制到剪贴板。');
    } catch {
      setStatusKind('error');
      setStatus('复制失败，请手动选择复制');
    }
  }

  const tokenFilled = Boolean(value.trim());

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-5">
      <h4 className="font-medium text-slate-200">控制器令牌</h4>
      <p className="mt-1 text-sm text-slate-400">
        直接粘贴 wrangler.toml <code className="text-sky-300">[vars]</code> 里的{' '}
        <code className="text-sky-300">CONTROLLER_JWT_SECRET</code> 明文即可（无需自己生成 JWT）。须先在「后端/加速节点」保存
        Worker 地址。
      </p>
      {postInstall && !tokenVerified && (
        <p className="mt-2 rounded-lg border border-sky-800/60 bg-sky-950/40 px-3 py-2 text-sm text-sky-200">
          安装完成。请在此填写控制器令牌并保存，验证通过后才能查询远程设备在线状态。
        </p>
      )}
      {tokenVerified ? (
        <p className="mt-2 text-xs text-emerald-400">令牌已验证，可查询远程设备在线状态</p>
      ) : (
        <p className="mt-2 text-xs text-amber-300">未配置或未通过验证时，远程设备一律显示离线</p>
      )}
      <label className="mt-3 block text-sm text-slate-400">
        JWT 令牌
        <div className="mt-1 flex gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="密文显示，输入后保存"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
          />
          <button type="button" className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" onClick={() => void handleCopy()}>
            复制
          </button>
          <button
            type="button"
            disabled={busy || !tokenFilled}
            className={
              tokenFilled
                ? 'shrink-0 btn-primary'
                : 'shrink-0 rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold text-slate-400 cursor-not-allowed'
            }
            onClick={() => void handleSave()}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </label>
      {status && (
        <p className={`mt-3 text-sm ${statusKind === 'error' ? 'text-red-400' : statusKind === 'success' ? 'text-emerald-300' : 'text-slate-400'}`}>
          {status}
        </p>
      )}
    </section>
  );
}
