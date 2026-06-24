import { useEffect, useState } from 'react';
import type { DeviceInfo } from '../lib/api';
import { getRememberedPassword } from '../lib/device-password';

interface ConnectPasswordModalProps {
  device: DeviceInfo;
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (password: string) => void;
}

export default function ConnectPasswordModal({
  device,
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: ConnectPasswordModalProps) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!open) return;
    setPassword(getRememberedPassword(device.id) ?? '');
  }, [open, device]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">连接到 {device.device_name}</h3>
        <p className="mt-1 text-sm text-slate-400">输入 6 位一次性密码或永久密码，服务端自动识别</p>

        {!device.access_password_set && !device.otp_active && (
          <p className="mt-2 text-xs text-amber-400">该设备尚未启用访问保护，请确认设备状态</p>
        )}

        <label className="mt-4 block text-sm text-slate-300">
          访问密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-sky-500"
            placeholder="6 位一次性密码或永久密码"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password.trim()) {
                onSubmit(password.trim());
              }
            }}
          />
        </label>

        <p className="mt-2 text-xs text-slate-500">永久密码会自动保存在本浏览器；一次性密码不会保存</p>

        {error && (
          <p className="mt-3 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button
            type="button"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
            disabled={busy || !password.trim()}
            onClick={() => onSubmit(password.trim())}
          >
            {busy ? '连接中...' : '连接'}
          </button>
        </div>
      </div>
    </div>
  );
}
