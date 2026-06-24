import type { FileTransferUiState } from '../lib/file-transfer-ui';

interface FileTransferStatusBarProps {
  state: FileTransferUiState;
  onDismiss: () => void;
}

export function FileTransferProgressBar({
  progress,
  compact = false,
}: {
  progress: number | null;
  compact?: boolean;
}) {
  const height = compact ? 'h-1' : 'h-1.5';
  if (progress === null) {
    return (
      <div className={`relative mt-1 overflow-hidden rounded-full bg-slate-800 ${height}`}>
        <div
          className={`absolute inset-y-0 w-2/5 rounded-full bg-sky-500/80 ${height}`}
          style={{ animation: 'file-transfer-indeterminate 1.4s ease-in-out infinite' }}
        />
      </div>
    );
  }
  return (
    <div className={`mt-1 overflow-hidden rounded-full bg-slate-800 ${height}`}>
      <div
        className={`${height} rounded-full bg-sky-500 transition-[width] duration-150`}
        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
      />
    </div>
  );
}

export default function FileTransferStatusBar({ state, onDismiss }: FileTransferStatusBarProps) {
  const done = state.progress === 100;
  const failed = state.message.includes('失败') || state.message.includes('错误');

  return (
    <div
      className={`shrink-0 border-b px-3 py-1.5 ${
        failed
          ? 'border-red-900/50 bg-red-950/30'
          : done
            ? 'border-emerald-900/40 bg-emerald-950/20'
            : 'border-slate-800 bg-slate-950'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[10px] sm:text-xs ${
              failed ? 'text-red-300' : done ? 'text-emerald-300' : 'text-slate-300'
            }`}
          >
            {state.message}
          </p>
          <FileTransferProgressBar progress={state.progress} />
        </div>
        <button
          type="button"
          className="shrink-0 rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-200"
          onClick={onDismiss}
          title="关闭"
          aria-label="关闭文件传输状态"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
