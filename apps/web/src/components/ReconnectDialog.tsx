interface ReconnectDialogProps {
  secondsLeft: number;
  busy: boolean;
  error?: string;
  onReconnectNow: () => void;
  onCancel: () => void;
}

export default function ReconnectDialog({
  secondsLeft,
  busy,
  error,
  onReconnectNow,
  onCancel,
}: ReconnectDialogProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reconnect-dialog-title"
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
      >
        <h2 id="reconnect-dialog-title" className="text-lg font-semibold text-white">
          连接已断开
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          检测到网络不稳定，远程连接已中断。将在{' '}
          <span className="font-mono text-sky-300">{secondsLeft}</span> 秒后自动尝试重连。
        </p>
        {error && (
          <p className="mt-3 rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            取消
          </button>
          <button type="button" className="btn-primary" onClick={onReconnectNow} disabled={busy}>
            {busy ? '正在重连…' : secondsLeft > 0 ? `立即重连 (${secondsLeft}s)` : '立即重连'}
          </button>
        </div>
      </div>
    </div>
  );
}
