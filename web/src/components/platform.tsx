import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, Field, Input, Select } from './ui';

interface CompanyOpt {
  id: string;
  name: string;
  casePrefix?: string;
}

function useAllCompanies(enabled: boolean): CompanyOpt[] {
  const [items, setItems] = useState<CompanyOpt[]>([]);
  useEffect(() => {
    if (!enabled) return;
    const unsub = onSnapshot(
      collection(db, 'companies'),
      (snap) => {
        setItems(
          snap.docs.map((d) => {
            const data = d.data() as { name?: string; casePrefix?: string };
            return { id: d.id, name: data.name ?? d.id, casePrefix: data.casePrefix };
          }),
        );
      },
      () => setItems([]),
    );
    return () => unsub();
  }, [enabled]);
  return items;
}

/** Platform-admin-only tenant/role switcher. Server-enforced via assumeTenantRole. */
export function PlatformSwitcher() {
  const { user, claims, refreshClaims } = useAuth();
  const isPlatform = claims.appRole === 'platform_admin' && claims.platformAdmin === true;
  const companies = useAllCompanies(isPlatform);
  const [companyId, setCompanyId] = useState('');
  const [role, setRole] = useState<'staff' | 'admin' | 'customer'>('admin');
  const [customerId, setCustomerId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPlatform) return null;

  async function assume() {
    if (!companyId) {
      setError('Pick a company first.');
      return;
    }
    if (role === 'customer' && !customerId.trim()) {
      setError('Customer view needs a customer ID.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.assumeTenantRole({
        companyId,
        role,
        customerId: role === 'customer' ? customerId.trim() : undefined,
      });
      await refreshClaims();
      window.location.assign('/app');
    } catch (e) {
      setError((e as Error)?.message ?? 'Assume failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-amber-500/40">
      <h2 className="field-label">Platform — view tenant as</h2>
      <p className="mb-3 text-xs text-slate-500">
        Signed in as {user?.email}. Every assume/leave is audit-logged. Use this for manual
        role testing instead of separate logins.
      </p>
      <div className="space-y-3">
        <Field label="Company">
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Select…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.casePrefix ? `(${c.casePrefix})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="admin">admin</option>
            <option value="staff">staff</option>
            <option value="customer">customer</option>
          </Select>
        </Field>
        {role === 'customer' ? (
          <Field label="Customer ID" hint="Copy from Team → Customers (customer doc ID)">
            <Input
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              placeholder="customer doc id"
            />
          </Field>
        ) : null}
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
        <Button onClick={assume} loading={busy}>
          View as {role}
        </Button>
      </div>
    </Card>
  );
}

/** Shown to assumed platform testers inside a tenant so they can return. */
export function ReturnToPlatform() {
  const { claims, refreshClaims } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!claims.companyId || !claims.platformAdmin) return null;
  return (
    <div>
      <Button
        variant="ghost"
        loading={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await api.leaveTenant({});
            await refreshClaims();
            window.location.assign('/onboarding');
          } catch (e) {
            setError((e as Error)?.message ?? 'Return failed');
          } finally {
            setBusy(false);
          }
        }}
      >
        Return to platform view
      </Button>
      {error ? <p className="mt-1 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
