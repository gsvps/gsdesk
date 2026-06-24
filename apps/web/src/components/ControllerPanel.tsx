import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ConnectPasswordModal from '../components/ConnectPasswordModal';
import { useAuth } from '../lib/auth';
import { apiFetch, type DeviceInfo, type SessionCreateResult } from '../lib/api';
import {
  addLocalDevice,
  formatDeviceId,
  isValidDeviceId,
  loadLocalDevices,
  removeLocalDevice,
  renameLocalDevice,
  type LocalDevice,
} from '../lib/local-devices';
import {
  setRememberedPassword,
  shouldShowPasswordModal,
  type AccessPasswordType,
} from '../lib/device-password';

interface ListedDevice extends LocalDevice {
  remote?: DeviceInfo;
}

export default function ControllerPanel() {
  const { tokenVerified, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<ListedDevice[]>(() => loadLocalDevices());
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [passwordDevice, setPasswordDevice] = useState<DeviceInfo | null>(null);
  const [passwordError, setPasswordError] = useState('');
  const [connectId, setConnectId] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  async function refreshRemoteStatus(list = loadLocalDevices()) {
    if (!tokenVerified) {
      setDevices(list.map((item) => ({ ...item, remote: undefined })));
      return;
    }

    if (list.length === 0) {
      setDevices([]);
      return;
    }

    setLoading(true);
    try {
      const remoteRows = await Promise.all(
        list.map(async (item) => {
          try {
            const remote = await apiFetch<DeviceInfo>(`/api/device/${item.id}`);
            return { ...item, remote };
          } catch {
            return { ...item, remote: undefined };
          }
        })
      );
      setDevices(remoteRows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    void refreshRemoteStatus();
    if (!tokenVerified) return;
    const timer = setInterval(() => void refreshRemoteStatus(), 5000);
    return () => clearInterval(timer);
  }, [tokenVerified, authLoading]);

  async function fetchRemoteDevice(id: string): Promise<DeviceInfo | null> {
    if (!tokenVerified) return null;
    try {
      return await apiFetch<DeviceInfo>(`/api/device/${formatDeviceId(id)}`);
    } catch {
      return null;
    }
  }

  async function startSession(
    deviceId: string,
    remote?: DeviceInfo,
    pwd?: string,
    passwordType?: AccessPasswordType
  ) {
    if (!tokenVerified) {
      setError('请先在设置中配置并通过验证的控制器令牌');
      return;
    }
    setConnecting(deviceId);
    setError('');
    try {
      const session = await apiFetch<SessionCreateResult>('/api/session/create', {
        method: 'POST',
        body: JSON.stringify({ device_id: deviceId, password: pwd, password_type: passwordType }),
      });
      const displayName = remote?.device_name?.trim() || deviceId;
      const next = addLocalDevice(deviceId, displayName);
      setDevices(next);
      sessionStorage.setItem(`session:${session.session_id}`, JSON.stringify(session));
      sessionStorage.setItem(`session:${session.session_id}:fresh`, '1');
      setPasswordDevice(null);
      setPasswordError('');
      setConnectId('');
      navigate(`/remote/${session.session_id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '连接失败';
      if (passwordDevice) setPasswordError(message);
      else setError(message);
      throw err;
    } finally {
      setConnecting(null);
    }
  }

  async function connectToId(rawId: string) {
    const id = formatDeviceId(rawId);
    if (!isValidDeviceId(id)) {
      setError('设备 ID 必须是 8 位数字');
      return;
    }
    if (!tokenVerified) {
      setError('请先在设置中配置并通过验证的控制器令牌');
      return;
    }

    setError('');
    const remote = await fetchRemoteDevice(id);
    if (!remote) {
      setError('设备不存在或令牌无效');
      return;
    }
    if (!remote.online) {
      setError('设备当前离线');
      return;
    }
    if (shouldShowPasswordModal(remote)) {
      setPasswordError('');
      setPasswordDevice(remote);
      return;
    }
    await startSession(id, remote);
  }

  async function handleQuickConnect(e: FormEvent) {
    e.preventDefault();
    await connectToId(connectId);
  }

  function handleRename(id: string) {
    const next = renameLocalDevice(id, editingName);
    setDevices(next);
    setEditingId(null);
    setEditingName('');
    void refreshRemoteStatus(next);
  }

  function handleRemove(id: string) {
    const next = removeLocalDevice(id);
    setDevices(next);
    void refreshRemoteStatus(next);
  }

  const canConnect = tokenVerified;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium text-white">远程控制</h3>
          <p className="text-sm text-slate-400">输入 8 位 ID 直接连接，成功后自动保存到列表</p>
        </div>
        {!authLoading && !canConnect && (
          <Link
            to="/settings"
            className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-3 py-1.5 text-sm text-amber-200 hover:bg-amber-950/50"
          >
            请先在设置中配置令牌
          </Link>
        )}
      </div>

      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={handleQuickConnect}>
          <label className="min-w-[10rem] flex-1 text-sm text-slate-400">
            设备 ID
            <input
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm tracking-widest"
              placeholder="8 位数字"
              inputMode="numeric"
              maxLength={8}
              value={connectId}
              onChange={(e) => setConnectId(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
          </label>
          <button
            type="submit"
            disabled={authLoading || !canConnect || connecting !== null || connectId.length !== 8}
            className="btn-primary px-5"
          >
            {connecting && !devices.some((d) => d.id === formatDeviceId(connectId)) ? '连接中...' : '连接'}
          </button>
        </form>
      </section>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <section>
        <h4 className="mb-3 font-medium text-slate-200">最近连接</h4>
        {devices.length === 0 ? (
          <p className="text-slate-400">暂无记录，连接成功后会自动出现在这里</p>
        ) : authLoading || (loading && devices.every((item) => !item.remote)) ? (
          <p className="text-slate-400">加载中...</p>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => {
              const remote = device.remote;
              const online = canConnect && Boolean(remote?.online);
              const isEditing = editingId === device.id;
              return (
                <div key={device.id} className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <input
                          className="w-full max-w-xs rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                        />
                      ) : (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-white">{device.display_name}</span>
                            <span className="font-mono text-xs text-slate-400">{formatDeviceId(device.id)}</span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs ${online ? 'bg-emerald-900 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}
                            >
                              {online ? '在线' : '离线'}
                            </span>
                            {online && remote?.access_protected && (
                              <span className="rounded-full bg-amber-900/60 px-2 py-0.5 text-xs text-amber-200">需密码</span>
                            )}
                          </div>
                          {remote && canConnect && (
                            <p className="mt-1 text-xs text-slate-500">
                              {remote.device_name} · {remote.hostname} · {remote.os}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {isEditing ? (
                        <>
                          <button type="button" className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm" onClick={() => handleRename(device.id)}>
                            保存
                          </button>
                          <button type="button" className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm" onClick={() => setEditingId(null)}>
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
                            onClick={() => {
                              setEditingId(device.id);
                              setEditingName(device.display_name);
                            }}
                          >
                            重命名
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm hover:bg-slate-800"
                            onClick={() => handleRemove(device.id)}
                          >
                            删除
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm hover:bg-sky-500 disabled:opacity-50"
                            disabled={!online || connecting === device.id}
                            onClick={() => {
                              if (!remote || !canConnect) return;
                              if (shouldShowPasswordModal(remote)) {
                                setPasswordError('');
                                setPasswordDevice(remote);
                                return;
                              }
                              void startSession(device.id, remote);
                            }}
                          >
                            {connecting === device.id ? '连接中...' : '连接'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {passwordDevice && (
        <ConnectPasswordModal
          device={passwordDevice}
          open
          busy={connecting === passwordDevice.id}
          error={passwordError}
          onClose={() => {
            if (connecting) return;
            setPasswordDevice(null);
            setPasswordError('');
          }}
          onSubmit={async (pwd, type, remember) => {
            if (!passwordDevice) return;
            setPasswordError('');
            try {
              await startSession(passwordDevice.id, passwordDevice, pwd, type);
              if (type === 'permanent' && remember) setRememberedPassword(passwordDevice.id, pwd);
              else if (type === 'permanent') setRememberedPassword(passwordDevice.id, null);
            } catch {
              /* modal shows error */
            }
          }}
        />
      )}
    </div>
  );
}
