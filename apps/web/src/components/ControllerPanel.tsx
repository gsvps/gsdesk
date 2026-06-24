import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { CONFIG_UPDATED_EVENT } from '../lib/browser-prefs';
import {
  setRememberedPassword,
  shouldShowPasswordModal,
  type AccessPasswordType,
} from '../lib/device-password';

interface ListedDevice extends LocalDevice {
  remote?: DeviceInfo;
}

export default function ControllerPanel({ compact = false }: { compact?: boolean }) {
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

  async function refreshRemoteStatus(list = loadLocalDevices(), background = false) {
    if (!tokenVerified) {
      setDevices(list.map((item) => ({ ...item, remote: undefined })));
      return;
    }

    if (list.length === 0) {
      setDevices([]);
      return;
    }

    if (!background) {
      setDevices((prev) => {
        const remoteById = new Map(prev.map((item) => [item.id, item.remote]));
        return list.map((item) => ({ ...item, remote: remoteById.get(item.id) }));
      });
    }

    const showBlockingLoader = !background && !devices.some((item) => item.remote !== undefined);
    if (showBlockingLoader) setLoading(true);
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
      if (showBlockingLoader) setLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    const list = loadLocalDevices();
    setDevices(list);
    void refreshRemoteStatus(list, true);
    if (!tokenVerified) return;
    const timer = setInterval(() => void refreshRemoteStatus(undefined, true), 10000);
    return () => clearInterval(timer);
  }, [tokenVerified, authLoading]);

  useEffect(() => {
    const onConfigUpdated = () => {
      if (authLoading) return;
      void refreshRemoteStatus(loadLocalDevices(), true);
    };
    window.addEventListener(CONFIG_UPDATED_EVENT, onConfigUpdated);
    return () => window.removeEventListener(CONFIG_UPDATED_EVENT, onConfigUpdated);
  }, [authLoading, tokenVerified]);

  async function fetchRemoteDevice(id: string): Promise<{ remote: DeviceInfo | null; error?: string }> {
    if (!tokenVerified) {
      return { remote: null, error: '请先在左侧配置并通过验证的控制器令牌' };
    }
    try {
      const remote = await apiFetch<DeviceInfo>(`/api/device/${formatDeviceId(id)}`);
      return { remote };
    } catch (err) {
      const message = err instanceof Error ? err.message : '查询设备失败';
      if (message.includes('不存在')) {
        return { remote: null, error: '设备不存在，请确认 8 位 ID 正确（非旧 dev_ 格式）' };
      }
      if (message.includes('无效') || message.includes('UNAUTHORIZED') || message.includes('请先配置')) {
        return { remote: null, error: '控制器令牌无效，请重新保存' };
      }
      return { remote: null, error: message };
    }
  }

  async function startSession(
    deviceId: string,
    remote?: DeviceInfo,
    pwd?: string,
    passwordType?: AccessPasswordType
  ) {
    if (!tokenVerified) {
      setError('请先在左侧配置并通过验证的控制器令牌');
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
      setError('请先在左侧配置并通过验证的控制器令牌');
      return;
    }

    setError('');
    const { remote, error: lookupError } = await fetchRemoteDevice(id);
    if (!remote) {
      setError(lookupError ?? '设备不存在或令牌无效');
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
    <div className={`flex h-full flex-col overflow-hidden ${compact ? 'rounded-xl border border-slate-700 bg-slate-900/60 p-3' : 'space-y-4'}`}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className={`font-medium text-white ${compact ? 'text-sm' : 'text-lg'}`}>远程控制</h3>
          {!compact && <p className="text-sm text-slate-400">输入 8 位 ID 直接连接，成功后自动保存到列表</p>}
        </div>
        {!authLoading && !canConnect && (
          <span className="rounded-lg border border-amber-700/60 bg-amber-950/30 px-2 py-1 text-xs text-amber-200">
            请先配置令牌
          </span>
        )}
      </div>

      <form className={`flex shrink-0 flex-wrap items-end gap-2 ${compact ? 'mt-2' : ''}`} onSubmit={handleQuickConnect}>
        <label className={`min-w-0 flex-1 text-slate-400 ${compact ? 'text-xs' : 'min-w-[10rem] text-sm'}`}>
          设备 ID
          <input
            className={`mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 font-mono tracking-widest ${compact ? 'px-2 py-1 text-sm' : 'px-3 py-2 text-sm'}`}
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
          className={`btn-primary ${compact ? 'px-3 py-1.5 text-sm' : 'px-5'}`}
        >
          {connecting && !devices.some((d) => d.id === formatDeviceId(connectId)) ? '连接中...' : '连接'}
        </button>
      </form>

      {error && <p className="shrink-0 text-xs text-red-400">{error}</p>}

      <section className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden">
        <h4 className={`shrink-0 font-medium text-slate-200 ${compact ? 'mb-1 text-sm' : 'mb-3'}`}>最近连接</h4>
        <div className="min-h-0 flex-1 overflow-y-auto">
        {devices.length === 0 ? (
          <p className="text-xs text-slate-400">暂无记录</p>
        ) : authLoading || (loading && devices.every((item) => !item.remote)) ? (
          <p className="text-xs text-slate-400">加载中...</p>
        ) : (
          <div className={`${compact ? 'space-y-1' : 'space-y-2'}`}>
            {devices.map((device) => {
              const remote = device.remote;
              const online = canConnect && Boolean(remote?.online);
              const isEditing = editingId === device.id;
              return (
                <div key={device.id} className={`rounded-lg border border-slate-700 bg-slate-950/50 ${compact ? 'px-2 py-1.5' : 'rounded-xl bg-slate-900/60 px-4 py-3'}`}>
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
        </div>
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
