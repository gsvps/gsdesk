import { useEffect, useState } from 'react';
import type { DeviceInfo } from '../lib/api';
import Switch from './Switch';
import {
  defaultPasswordType,
  getRememberedPassword,
  type AccessPasswordType,
} from '../lib/device-password';

interface ConnectPasswordModalProps {
  device: DeviceInfo;
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (password: string, type: AccessPasswordType, remember: boolean) => void;
}

export default function ConnectPasswordModal({
  device,
  open,
  busy,
  error,
  onClose,
  onSubmit,
}: ConnectPasswordModalProps) {
  const [passwordType, setPasswordType] = useState<AccessPasswordType>(() => defaultPasswordType(device));
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (!open) return;
    const type = defaultPasswordType(device);
    setPasswordType(type);
    const saved = type === 'permanent' ? getRememberedPassword(device.id) : null;
    setPassword(saved ?? '');
    setRemember(Boolean(saved));
  }, [open, device]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-white">连接到 {device.device_name}</h3>
        <p className="mt-1 text-sm text-slate-400">请输入该设备的访问密码以继续远程连接</p>

        <div className="mt-4 flex rounded-lg bg-slate-950 p-1">
          <button
            type="button"
            disabled={!device.access_password_set}
            className={`flex-1 rounded-md px-3 py-2 text-sm transition ${
              passwordType === 'permanent'
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 disabled:opacity-40'
            }`}
            onClick={() => setPasswordType('permanent')}
          >
            永久密码
          </button>
          <button
            type="button"
            disabled={!device.otp_active}
            className={`flex-1 rounded-md px-3 py-2 text-sm transition ${
              passwordType === 'otp'
                ? 'bg-sky-600 text-white'
                : 'text-slate-300 hover:bg-slate-800 disabled:opacity-40'
            }`}
            onClick={() => setPasswordType('otp')}
          >
            一次性密码
          </button>
        </div>

        {!device.access_password_set && passwordType === 'permanent' && (
          <p className="mt-2 text-xs text-amber-400">该设备尚未设置自定义密码，请在本机区域配置</p>
        )}
        {device.access_password_set && !device.otp_active && passwordType === 'otp' && (
          <p className="mt-2 text-xs text-amber-400">当前没有有效的一次性密码，请在被控端本机界面查看</p>
        )}

        <label className="mt-4 block text-sm text-slate-300">
          {passwordType === 'otp' ? '一次性密码（6 位）' : '永久密码'}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-sky-500"
            placeholder={passwordType === 'otp' ? '输入 Agent 显示的一次性密码' : '输入永久密码'}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password.trim()) {
                onSubmit(password.trim(), passwordType, remember);
              }
            }}
          />
        </label>

        {passwordType === 'permanent' && (
          <div className="mt-3">
            <Switch checked={remember} onChange={setRemember} label="记住密码（仅保存在本浏览器）" />
          </div>
        )}

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
            onClick={() => onSubmit(password.trim(), passwordType, remember)}
          >
            {busy ? '连接中...' : '连接'}
          </button>
        </div>
      </div>
    </div>
  );
}
