import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  clearControllerTokenBridge,
  hasControllerTokenBridge,
  loadControllerTokenFromBridge,
  saveControllerTokenToBridge,
} from './controller-token-bridge';
import { apiFetch, getStoredToken, setStoredToken } from './api';

interface AuthContextValue {
  token: string | null;
  tokenVerified: boolean;
  loading: boolean;
  setToken: (token: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isNetworkError(message: string): boolean {
  return (
    message.includes('无法连接服务器') ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('服务器响应异常')
  );
}

async function verifyStoredToken(): Promise<boolean> {
  try {
    await apiFetch<{ verified: boolean }>('/api/controller/verify');
    return true;
  } catch {
    return false;
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

      const ok = await verifyStoredToken();
      if (cancelled) return;

      if (ok) {
        setTokenVerified(true);
      } else {
        setTokenVerified(false);
      }
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

    try {
      const ok = await verifyStoredToken();
      if (!ok) {
        setTokenVerified(false);
        throw new Error('控制器令牌无效，请确认与 Worker 的 CONTROLLER_JWT_SECRET 一致');
      }
      setTokenVerified(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : '令牌验证失败';
      if (isNetworkError(message)) {
        setTokenVerified(false);
        throw new Error('令牌已保存，但暂时无法连接服务器验证，请检查 Agent 服务器地址');
      }
      await persistToken(null);
      setTokenState(null);
      setTokenVerified(false);
      throw err instanceof Error ? err : new Error(message);
    }
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
