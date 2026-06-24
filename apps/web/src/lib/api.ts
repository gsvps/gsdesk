import { getRuntimeConfig, resolveApiUrl } from './runtime-config';

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: { code: string; message: string };
}

type ApiResponse<T> = ApiSuccess<T> | ApiError;

const TOKEN_KEY = 'clouddesk_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(resolveApiUrl(path), {
      ...init,
      headers,
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new Error('请求超时，请检查 Worker 地址与网络连接');
    }
    const { apiBase } = getRuntimeConfig();
    const hint =
      apiBase ||
      (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8787');
    throw new Error(`无法连接服务器（${hint}），请确认 CloudDesk Worker 已启动`);
  }

  let body: ApiResponse<T>;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    throw new Error(`服务器响应异常（HTTP ${res.status}）`);
  }

  if (!body.success) {
    const code = body.error?.code ?? '';
    const message = body.error?.message ?? '请求失败';
    if (code === 'UNAUTHORIZED') {
      throw new Error(message.includes('无效') ? message : '控制器令牌无效，请到设置中重新保存');
    }
    throw new Error(message);
  }
  return body.data;
}

export interface UserInfo {
  id: string;
  email: string;
  name: string | null;
}

export interface DeviceInfo {
  id: string;
  device_name: string;
  hostname: string;
  os: string;
  online: boolean;
  access_password_set?: boolean;
  otp_active?: boolean;
  access_protected?: boolean;
  last_seen: number | null;
}

export interface SessionCreateResult {
  session_id: string;
  signal_url: string;
  signal_path?: string;
  ws_token: string;
  nonce: string;
  access_type?: 'permanent' | 'otp';
}

export interface SessionReconnectResult {
  session_id: string;
  status: string;
  deduped?: boolean;
}

const reconnectInflight = new Map<string, Promise<SessionReconnectResult>>();

/** 防止 React StrictMode 重复调用 reconnect 导致 Agent 弹三次窗、nonce 错乱 */
export function reconnectSession(sessionId: string): Promise<SessionReconnectResult> {
  let pending = reconnectInflight.get(sessionId);
  if (!pending) {
    pending = apiFetch<SessionReconnectResult>(`/api/session/${sessionId}/reconnect`, { method: 'POST' });
    reconnectInflight.set(sessionId, pending);
    void pending.finally(() => {
      reconnectInflight.delete(sessionId);
    });
  }
  return pending;
}

export function buildSessionSignalPath(sessionId: string, wsToken: string): string {
  return `/ws/session/${sessionId}?token=${encodeURIComponent(wsToken)}`;
}

export async function refreshSessionWsToken(sessionId: string): Promise<{ ws_token: string }> {
  return apiFetch(`/api/session/${sessionId}/ws-token`, { method: 'POST' });
}

/** 通知 Agent 并重刷 WebSocket 令牌，供断线重连用 */
export async function prepareSessionReconnect(sessionId: string): Promise<SessionCreateResult> {
  await reconnectSession(sessionId);
  const { ws_token } = await refreshSessionWsToken(sessionId);

  const raw = sessionStorage.getItem(`session:${sessionId}`);
  if (!raw) {
    throw new Error('会话信息不存在，请从设备列表重新发起连接');
  }

  const session = JSON.parse(raw) as SessionCreateResult;
  const signalPath = buildSessionSignalPath(sessionId, ws_token);
  const updated: SessionCreateResult = {
    ...session,
    ws_token,
    signal_path: signalPath,
  };
  sessionStorage.setItem(`session:${sessionId}`, JSON.stringify(updated));
  return updated;
}
