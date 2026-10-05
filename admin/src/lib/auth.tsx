import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, hasSession, setSignedOutHandler, signOut as apiSignOut } from './api';
import { can, isRole, type Action, type Role } from './roles';

export interface Me { user_id: string; label: string; role: Role }
interface AuthState {
  me: Me | null;
  /** true while a stored session is being checked on first load */
  loading: boolean;
  /** Call after a successful sign-in to load the role. Throws if the account is not staff. */
  load: () => Promise<Me>;
  signOut: () => Promise<void>;
  can: (a: Action) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(hasSession());

  const load = useCallback(async () => {
    const r = await api<{ user_id: string; label: string; role: string }>('/admin/api/me');
    if (!isRole(r.role)) throw new Error('not_staff');
    const m = { user_id: r.user_id, label: r.label, role: r.role };
    setMe(m);
    return m;
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    setMe(null);
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => setMe(null));
    if (!hasSession()) return () => setSignedOutHandler(null);
    let alive = true;
    void (async () => {
      try {
        await load();
      } catch {
        /* show the sign-in page */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; setSignedOutHandler(null); };
  }, [load]);

  const value = useMemo<AuthState>(() => ({ me, loading, load, signOut, can: (a) => can(me?.role, a) }), [me, loading, load, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** Renders children only when the signed-in role may do `action`; otherwise `fallback` (default: nothing). */
export function Can({ action, role, fallback = null, children }: { action: Action; role?: Role | null; fallback?: ReactNode; children: ReactNode }) {
  const auth = useContext(Ctx);
  const r = role !== undefined ? role : auth?.me?.role;
  return <>{can(r, action) ? children : fallback}</>;
}
