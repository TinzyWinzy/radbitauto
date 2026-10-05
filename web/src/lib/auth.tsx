import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getIdTokenResult } from 'firebase/auth';
import { auth } from './firebase';

export interface Claims {
  appRole?: string;
  companyId?: string;
  customerId?: string;
  platformAdmin?: boolean;
}

interface AuthState {
  user: User | null;
  claims: Claims;
  loading: boolean;
  refreshClaims: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  claims: {},
  loading: true,
  refreshClaims: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [claims, setClaims] = useState<Claims>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let generation = 0;
    const unsub = onAuthStateChanged(auth, (u) => {
      const currentGeneration = ++generation;
      setClaims({});
      setLoading(true);
      setUser(u);
      if (!u) {
        setClaims({});
        setLoading(false);
        return;
      }
      getIdTokenResult(u, true)
        .then((r) => {
          if (generation !== currentGeneration) return;
          setClaims({
            appRole: typeof r.claims.app_role === 'string' ? r.claims.app_role : undefined,
            companyId: typeof r.claims.company_id === 'string' ? r.claims.company_id : undefined,
            customerId: typeof r.claims.customer_id === 'string' ? r.claims.customer_id : undefined,
            platformAdmin: r.claims.platform_admin === true,
          });
        })
        .catch(() => {})
        .finally(() => { if (generation === currentGeneration) setLoading(false); });
    });
    return () => { generation++; unsub(); };
  }, []);

  const refreshClaims = useMemo(
    () => async () => {
      const u = auth.currentUser;
      if (!u) return;
      const r = await getIdTokenResult(u, true);
      setClaims({
        appRole: typeof r.claims.app_role === 'string' ? r.claims.app_role : undefined,
        companyId: typeof r.claims.company_id === 'string' ? r.claims.company_id : undefined,
        customerId: typeof r.claims.customer_id === 'string' ? r.claims.customer_id : undefined,
        platformAdmin: r.claims.platform_admin === true,
      });
    },
    [],
  );

  return (
    <AuthCtx.Provider value={{ user, claims, loading, refreshClaims }}>{children}</AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
