import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiGet, apiPost, isNetworkError, setCsrf } from '@/lib/api';

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  phone: string | null;
}

interface MeResponse {
  user: AuthUser;
  csrf: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (identity: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'vp.mandi.user';

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

function storeUser(user: AuthUser | null): void {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredUser());
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => {
    setUser(null);
    setCsrf(null);
    storeUser(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<MeResponse>('/auth/me');
      setUser(data.user);
      setCsrf(data.csrf);
      storeUser(data.user);
    } catch (error) {
      // Keep the cached session while offline; only sign out on a real 401.
      if (isNetworkError(error)) {
        const cached = loadStoredUser();
        if (cached) setUser(cached);
        else clear();
      } else {
        clear();
      }
    } finally {
      setLoading(false);
    }
  }, [clear]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    window.addEventListener('sb:unauthorized', clear);
    return () => window.removeEventListener('sb:unauthorized', clear);
  }, [clear]);

  const login = useCallback(async (identity: string, password: string) => {
    const data = await apiPost<MeResponse>('/auth/login', { identity, password });
    setUser(data.user);
    setCsrf(data.csrf);
    storeUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiPost('/auth/logout');
    } finally {
      clear();
    }
  }, [clear]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
