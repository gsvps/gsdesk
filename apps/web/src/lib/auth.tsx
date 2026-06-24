import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadAgentState, hasAgentBridge } from './agent-bridge';
import { applyBackendToRuntime, loadBackendConfig } from './backend-config';
import {
  clearControllerTokenBridge,
  hasControllerTokenBridge,
  loadControllerTokenFromBridge,
  saveControllerTokenToBridge,
} from './controller-token-bridge';
import { getStoredToken, setStoredToken } from './api';
import { getRuntimeConfig } from './runtime-config';

interface AuthContextValue {
  token: string | null;
  tokenVerified: boolean;
  loading: boolean;
  setToken: (token: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface VerifyResult {
  ok: boolean;
  error?: string;
  /** 网络/配置问题：保留已保存的令牌 */
  recoverable?: boolean;
}

async function resolveControllerVerifyBase(): Promise<string> {
  if (hasAgentBridge()) {
    try {
      const state = await loadAgentState();
      const agentBase = state.server_url?.replace(/\/$/, '') ?? '';
      if (agentBase) return agentBase;
    } catch {
      /* fall through */
    }
  }

  const runtimeBase = getRuntimeConfig().apiBase.replace(/\/$/, '');
  if (runtimeBase) return runtimeBase;

  return applyBackendToRuntime(loadBackendConfig());
}

async function verifyControllerToken(token: string): Promise<VerifyResult> {
  const bearer = token.trim();
  if (!bearer) return { ok: false, error: '令牌为空' };

  const base = await resolveControllerVerifyBase();
  if (!base) {
    return {
      ok: false,
      recoverable: true,
      error: '请先在「后端/加速节点」填写 Worker 地址并保存，再验证控制器令牌',
    };
  }

  try {
    const res = await fetch(`${base}/api/controller/verify`, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    let body: { success?: boolean; error?: { message?: string } };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      return {
        ok: false,
        recoverable: true,
        error: `服务器响应异常（HTTP ${res.status}，${base}）`,
      };
    }

    if (!body.success) {
      const msg = body.error?.message ?? '验证失败';
      if (res.status === 401 || msg.includes('无效') || msg.includes('未配置')) {
        return {
          ok: false,
          recoverable: false,
          error:
            `控制器令牌与线上 Worker 不一致（验证地址：${base}）。` +
            '请填写 wrangler.toml [vars] 中 CONTROLLER_JWT_SECRET 的明文（不是 JWT 字符串）；' +
            '若在 Cloudflare 控制台单独改过密钥，须与控制台一致，且修改后需重新 deploy。',
        };
      }
      return { ok: false, recoverable: res.status >= 500, error: msg };
    }

    return { ok: true };
  } catch {
    return {
      ok: false,
      recoverable: true,
      error: `无法连接 ${base}。请确认 Worker 已部署，且「后端/加速节点」中的 API 地址与 Agent 服务器地址一致`,
    };
  }
}

async function loadInitialToken(): Promise<string | null> {
  if (hasControllerTokenBridge()) {
    const fromBridge = await loadControllerTokenFromBridge();
    if (fromBridge) {
      setStoredToken(fromBridge);
      return fromBridge;
    }
  }
  return getStoredToken()?.trim() || null;
}

async function persistToken(token: string | null): Promise<void> {
  const trimmed = token?.trim() ?? '';
  if (hasControllerTokenBridge()) {
    if (trimmed) {
      await saveControllerTokenToBridge(trimmed);
    } else {
      await clearControllerTokenBridge();
    }
  }
  setStoredToken(trimmed || null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getStoredToken());
  const [tokenVerified, setTokenVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      let stored: string | null = null;
      try {
        stored = await loadInitialToken();
      } catch {
        stored = getStoredToken()?.trim() || null;
      }

      if (!stored) {
        if (!cancelled) {
          setTokenState(null);
          setTokenVerified(false);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setTokenState(stored);
      }

      const result = await verifyControllerToken(stored);
      if (cancelled) return;

      setTokenVerified(result.ok);
      setLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const setToken = useCallback(async (next: string | null) => {
    const trimmed = next?.trim() ?? '';
    if (!trimmed) {
      await persistToken(null);
      setTokenState(null);
      setTokenVerified(false);
      return;
    }

    await persistToken(trimmed);
    setTokenState(trimmed);

    const result = await verifyControllerToken(trimmed);
    if (!result.ok) {
      setTokenVerified(false);
      if (result.recoverable) {
        throw new Error(result.error ?? '令牌已保存，但暂时无法连接服务器验证');
      }
      await persistToken(null);
      setTokenState(null);
      throw new Error(result.error ?? '控制器令牌无效');
    }
    setTokenVerified(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      tokenVerified,
      loading,
      setToken,
    }),
    [token, tokenVerified, loading, setToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
