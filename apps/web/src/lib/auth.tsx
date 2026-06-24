import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from './api';

interface AuthContextValue {
  token: string | null;
  tokenVerified: boolean;
  loading: boolean;
  setToken: (token: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function verifyStoredToken(): Promise<boolean> {
  try {
    await apiFetch<{ verified: boolean }>('/api/controller/verify');
    return true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getStoredToken());
  const [tokenVerified, setTokenVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = getStoredToken()?.trim();
      if (!stored) {
        if (!cancelled) {
          setTokenState(null);
          setTokenVerified(false);
          setLoading(false);
        }
        return;
      }

      const ok = await verifyStoredToken();
      if (cancelled) return;

      if (ok) {
        setTokenState(stored);
        setTokenVerified(true);
      } else {
        setStoredToken(null);
        setTokenState(null);
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
      setStoredToken(null);
      setTokenState(null);
      setTokenVerified(false);
      return;
    }

    setStoredToken(trimmed);
    setTokenState(trimmed);

    const ok = await verifyStoredToken();
    if (!ok) {
      setStoredToken(null);
      setTokenState(null);
      setTokenVerified(false);
      throw new Error('控制器令牌无效');
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
