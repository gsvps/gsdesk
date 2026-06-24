import { useRef, useState } from 'react';
import { sendFileToAgent } from '../lib/session-files';

interface FileTransferPanelProps {
  sessionId: string;
  status: string;
  onStatusChange: (status: string) => void;
  onSendControl: (payload: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function FileTransferPanel({
  sessionId,
  status,
  onStatusChange,
  onSendControl,
  onClose,
}: FileTransferPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [remotePath, setRemotePath] = useState('C:\\Users\\Public\\');
  const [busy, setBusy] = useState(false);

  async function uploadToRemote(file: File) {
    setBusy(true);
    onStatusChange(`正在上传 ${file.name}...`);
    try {
      const result = await sendFileToAgent(sessionId, file, onSendControl);
      onStatusChange(`已发送到远程：${result.filename}`);
    } catch (err) {
      onStatusChange(err instanceof Error ? err.message : '上传失败');
    } finally {
      setBusy(false);
    }
  }

  function requestFromRemote() {
    const path = remotePath.trim();
    if (!path) {
      onStatusChange('请输入远程文件路径');
      return;
    }
    onStatusChange('正在请求远程文件...');
    onSendControl({ type: 'file_from_agent', path });
  }

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

        {status && <p className="text-slate-400">{status}</p>}
        <p className="text-slate-500">也可将文件拖放到远程画面上传</p>
      </div>
    </div>
  );
}
