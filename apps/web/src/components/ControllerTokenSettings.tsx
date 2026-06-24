import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { notifyConfigUpdated } from '../lib/browser-prefs';
import { useDebouncedEffect } from '../lib/use-debounce';

export default function ControllerTokenSettings({ compact = false }: { compact?: boolean }) {
  const { token, tokenVerified, setToken } = useAuth();
  const [value, setValue] = useState(token ?? '');
  const [status, setStatus] = useState('');
  const [statusKind, setStatusKind] = useState<'success' | 'error' | ''>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(token ?? '');
  }, [token]);

  async function persistToken(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === (token ?? '')) return;
    setBusy(true);
    try {
      await setToken(trimmed);
      setStatusKind('success');
      setStatus('令牌已自动保存并验证');
      notifyConfigUpdated();
    } catch (err) {
      setStatusKind('error');
      setStatus(err instanceof Error ? err.message : '令牌验证失败');
    } finally {
      setBusy(false);
    }
  }

  useDebouncedEffect(
    () => void persistToken(value),
    [value],
    800,
    Boolean(value.trim()) && value.trim() !== (token ?? ''),
    true
  );

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
      setStatus('已复制');
    } catch {
      setStatusKind('error');
      setStatus('复制失败');
    }
  }

  return (
    <section className={`rounded-xl border border-slate-700 bg-slate-900/60 ${compact ? 'p-3' : 'p-5'}`}>
      <h4 className={`font-medium text-slate-200 ${compact ? 'text-sm' : ''}`}>控制器令牌</h4>
      {tokenVerified ? (
        <p className={`text-emerald-400 ${compact ? 'mt-1 text-xs' : 'mt-2 text-xs'}`}>
          已验证{busy ? ' · 保存中…' : ''}
        </p>
      ) : (
        <p className={`text-amber-300 ${compact ? 'mt-1 text-xs' : 'mt-2 text-xs'}`}>
          粘贴 CONTROLLER_JWT_SECRET 后自动保存
        </p>
      )}
      <label className={`block text-sm text-slate-400 ${compact ? 'mt-2' : 'mt-3'}`}>
        <div className="flex gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void persistToken(value)}
            placeholder="wrangler.toml 中的 CONTROLLER_JWT_SECRET"
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-white"
          />
          <button
            type="button"
            className="shrink-0 rounded-lg border border-slate-600 px-2 py-2 text-xs hover:bg-slate-800"
            onClick={() => void handleCopy()}
          >
            复制
          </button>
        </div>
      </label>
      {status && (
        <p className={`mt-2 text-xs ${statusKind === 'error' ? 'text-red-400' : 'text-emerald-300'}`}>{status}</p>
      )}
    </section>
  );
}
