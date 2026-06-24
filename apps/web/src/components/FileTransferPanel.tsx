import { useEffect, useRef, useState } from 'react';
import type { FileTransferUiState } from '../lib/file-transfer-ui';
import { progressFromLoaded, sendFileToAgent } from '../lib/session-files';
import { FileTransferProgressBar } from './FileTransferStatusBar';

interface FileTransferPanelProps {
  sessionId: string;
  transfer: FileTransferUiState | null;
  onTransferUpdate: (state: FileTransferUiState | null) => void;
  onSendControl: (payload: Record<string, unknown>) => boolean;
  onClose: () => void;
}

const REMOTE_REQUEST_TIMEOUT_MS = 120_000;

export default function FileTransferPanel({
  sessionId,
  transfer,
  onTransferUpdate,
  onSendControl,
  onClose,
}: FileTransferPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [remotePath, setRemotePath] = useState('C:\\Users\\Public\\');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (requestTimerRef.current) clearTimeout(requestTimerRef.current);
    };
  }, []);

  function clearRequestTimer() {
    if (requestTimerRef.current) {
      clearTimeout(requestTimerRef.current);
      requestTimerRef.current = null;
    }
  }

  async function uploadToRemote(file: File) {
    setBusy(true);
    onTransferUpdate({ message: `正在上传 ${file.name}…`, progress: 0 });
    try {
      await sendFileToAgent(
        sessionId,
        file,
        onSendControl,
        (loaded, total) => {
          onTransferUpdate({
            message: `正在上传 ${file.name}…`,
            progress: progressFromLoaded(loaded, total),
          });
        }
      );
      onTransferUpdate({ message: `已发送到远程：${file.name}`, progress: 100 });
    } catch (err) {
      onTransferUpdate({
        message: err instanceof Error ? err.message : '上传失败',
        progress: 100,
      });
    } finally {
      setBusy(false);
    }
  }

  function requestFromRemote() {
    const path = remotePath.trim();
    if (!path) {
      onTransferUpdate({ message: '请输入远程文件路径', progress: null });
      return;
    }
    clearRequestTimer();
    onTransferUpdate({ message: '正在请求远程文件…', progress: null });
    const sent = onSendControl({ type: 'file_from_agent', path });
    if (!sent) {
      onTransferUpdate({
        message: '连接未就绪，请确认远程桌面已连接后再试',
        progress: 100,
      });
      return;
    }
    requestTimerRef.current = setTimeout(() => {
      onTransferUpdate({
        message: '请求远程文件超时，请检查路径与 Agent 连接',
        progress: 100,
      });
    }, REMOTE_REQUEST_TIMEOUT_MS);
  }

  // 外部状态变化（收到 file_ready 等）时清除请求超时
  useEffect(() => {
    if (transfer?.message && !transfer.message.includes('正在请求远程文件')) {
      clearRequestTimer();
    }
  }, [transfer?.message]);

  return (
    <div
      className="absolute left-1/2 top-full z-50 mt-2 w-[min(92vw,22rem)] -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-900 p-3 text-xs text-slate-200 shadow-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-slate-100">文件传输 (R2 中转)</span>
        <button type="button" className="text-slate-400 hover:text-white" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="space-y-2">
        <div>
          <p className="mb-1 text-slate-400">发送到远程电脑</p>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadToRemote(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 hover:bg-slate-700 disabled:opacity-50"
            onClick={() => inputRef.current?.click()}
          >
            选择文件上传
          </button>
        </div>

        <div>
          <p className="mb-1 text-slate-400">从远程电脑下载</p>
          <input
            type="text"
            value={remotePath}
            onChange={(e) => setRemotePath(e.target.value)}
            placeholder="C:\Users\...\file.txt"
            className="mb-1 w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100"
          />
          <button
            type="button"
            disabled={busy}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 hover:bg-slate-700 disabled:opacity-50"
            onClick={requestFromRemote}
          >
            请求下载
          </button>
        </div>

        {transfer?.message && (
          <div className="rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1.5">
            <p className="text-slate-300">{transfer.message}</p>
            <FileTransferProgressBar progress={transfer.progress} compact />
          </div>
        )}
        <p className="text-slate-500">也可将文件拖放到远程画面上传</p>
      </div>
    </div>
  );
}
