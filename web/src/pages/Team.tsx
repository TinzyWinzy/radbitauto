import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebaseData';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCompanyDoc, useCustomers, useStaff, useUserNames } from '../lib/hooks';
import { initials } from '../lib/format';
import { Badge, Button, Card, Field, Input, Select } from '../components/ui';
import { EmptyState, ErrorState, PageHeader } from '../components/status';

export default function Team() {
  const { user, claims } = useAuth();
  const isStaff = claims.appRole === 'staff' || claims.appRole === 'admin';
  const isAdmin = claims.appRole === 'admin' && Boolean(claims.companyId);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { data: company } = useCompanyDoc(claims.companyId);
  const { data: staff, loading: loadStaff, error: staffError } = useStaff(claims.companyId);
  const { data: customers, loading: loadCustomers, error: customersError } = useCustomers(claims.companyId);
  const names = useUserNames(staff.map((s) => s.id));

  if (!isStaff) {
    return <div className="px-4">You don't have access to the team screen.</div>;
  }

  async function deactivate(userId: string, label: string) {
    if (!window.confirm(`Deactivate ${label}? Their active sessions will stop working.`)) return;
    setDeactivatingId(userId);
    setActionError(null);
    try {
      await api.deactivateAccount({ userId });
    } catch (error) {
      setActionError((error as Error)?.message ?? 'Deactivation failed');
    } finally {
      setDeactivatingId(null);
    }
  }

  return (
    <div className="pb-8">
      <PageHeader
        title={company?.name ?? 'Team'}
        subtitle={`${staff.length} staff · ${customers.length} customers`}
        right={
          <div className="flex gap-2">
            <button
              onClick={() => navigate('/app/new/customer')}
              className="rounded-xl border border-ink-700 bg-ink-900 px-3 py-2 text-xs font-semibold text-slate-200"
            >
              + Customer
            </button>
            <button
              onClick={() => navigate('/app/new/staff')}
              className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-[rgb(var(--accent-contrast-rgb,255_255_255))]"
            >
              + Staff
            </button>
          </div>
        }
      />

      {claims.appRole === 'admin' && claims.companyId ? (
        <BrandingSection companyId={claims.companyId} />
      ) : null}

      <h2 className="field-label mt-2">Staff</h2>
      {isAdmin ? <Button variant="ghost" className="mb-4" onClick={() => navigate('/app/import-data')}>Import customers or stock</Button> : null}
      {isAdmin ? <Button className="mb-4" onClick={() => navigate('/app/invitations')}>Invite staff or customers</Button> : null}
      {actionError ? <ErrorState message={actionError} /> : null}
      {staffError ? <ErrorState message={staffError} /> : null}
      {loadStaff ? <p className="py-4 text-sm text-slate-500">Loading…</p> : null}
      {!loadStaff && staff.length === 0 ? (
        <EmptyState title="No staff yet" hint="Add your first team member to get going." />
      ) : (
        <div className="mb-4 space-y-2">
          {staff.map((s) => (
            <Card key={s.id} className="!p-3">
              <div className="member-row flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-slate-300">
                  {initials(names[s.id]?.fullName ?? s.id)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{names[s.id]?.fullName ?? s.id}</p>
                  {names[s.id]?.email ? <p className="truncate text-xs text-slate-500">{names[s.id].email}</p> : null}
                </div>
                <Badge tone={s.role === 'admin' ? 'ok' : 'default'}>{s.role}</Badge>
                <Badge tone={s.isActive ? 'ok' : 'muted'}>{s.isActive ? 'active' : 'inactive'}</Badge>
                {isAdmin && s.isActive && s.id !== user?.uid ? (
                  <Button
                    variant="ghost"
                    onClick={() => deactivate(s.id, names[s.id]?.fullName ?? 'this staff member')}
                    loading={deactivatingId === s.id}
                    className="!w-auto shrink-0 px-2 py-1 text-xs"
                  >
                    Deactivate
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="field-label">Customers</h2>
      {customersError ? <ErrorState message={customersError} /> : null}
      {loadCustomers ? <p className="py-4 text-sm text-slate-500">Loading…</p> : null}
      {!loadCustomers && customers.length === 0 ? (
        <EmptyState title="No customers linked" hint="Link customers so they can track imports." />
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <Card key={c.id} className="!p-3">
              <div className="member-row flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-700 text-xs font-bold text-slate-300">
                  {initials(c.fullName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-100">{c.fullName}</p>
                  <p className="truncate text-xs text-slate-500">{c.phoneNumber}</p>
                </div>
                <Badge tone={c.isActive ? 'ok' : 'muted'}>{c.isActive ? 'active' : 'inactive'}</Badge>
                {c.isActive && !c.userId ? <Button variant="ghost" className="!w-auto text-xs" onClick={() => navigate('/app/new/customer', { state: c })}>Link access</Button> : null}
                {isAdmin && c.isActive && c.userId && c.userId !== user?.uid ? (
                  <Button
                    variant="ghost"
                    onClick={() => deactivate(c.userId as string, c.fullName)}
                    loading={deactivatingId === c.userId}
                    className="!w-auto shrink-0 px-2 py-1 text-xs"
                  >
                    Deactivate
                  </Button>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const COLOR_PRESETS = [
  { name: 'Emerald', value: '#10b981' },
  { name: 'Blue', value: '#2f7cf6' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Red', value: '#ef4444' },
];

function BrandingSection({ companyId }: { companyId: string }) {
  const { data: company } = useCompanyDoc(companyId);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#2f7cf6');
  const [whatsapp, setWhatsapp] = useState('');
  const [port, setPort] = useState('Durban');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!company) return;
    setName(company.name ?? '');
    setColor(company.primaryColor ?? '#2f7cf6');
    setWhatsapp(company.contactWhatsapp ?? '');
    setPort(company.defaultPort ?? 'Durban');
  }, [company?.name, company?.primaryColor, company?.contactWhatsapp, company?.defaultPort]);

  async function save() {
    if (!name.trim()) {
      setMsg('Agency name is required.');
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(color.trim())) {
      setMsg('Color must be a hex code like #10b981.');
      return;
    }
    if (!whatsapp.trim()) {
      setMsg('WhatsApp number is required.');
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await updateDoc(doc(db, 'companies', companyId), {
        name: name.trim(),
        primaryColor: color.trim(),
        contactWhatsapp: whatsapp.trim(),
        defaultPort: port,
      });
      setMsg('Branding saved — the whole portal re-themes on next load.');
    } catch (e) {
      setMsg((e as Error)?.message ?? 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4">
      <h2 className="section-title">Agency branding</h2>
      <div className="space-y-2">
        <Field label="Agency name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Eddy Customs" />
        </Field>
        <Field label="Brand color">
          <div className="brand-swatches mb-2 flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((p) => (
              <button
                key={p.value}
                title={p.name}
                aria-label={`Use ${p.name} brand colour`}
                aria-pressed={color.toLowerCase() === p.value}
                onClick={() => setColor(p.value)}
                className={`h-8 w-8 rounded-lg transition ${color.toLowerCase() === p.value ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : 'opacity-70 hover:opacity-100'}`}
                style={{ backgroundColor: p.value }}
              />
            ))}
            <span className="rounded-lg border border-ink-700 px-2 py-1.5 font-mono text-xs text-slate-300">
              {color}
            </span>
          </div>
          <Input value={color} onChange={(e) => setColor(e.target.value)} placeholder="#10b981" />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="WhatsApp line">
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+263…" inputMode="tel" />
          </Field>
          <Field label="Default port">
            <Select value={port} onChange={(e) => setPort(e.target.value)}>
              <option>Durban</option>
              <option>Beira</option>
              <option>Walvis Bay</option>
              <option>Dar es Salaam</option>
              <option>Maputo</option>
            </Select>
          </Field>
        </div>
        {msg ? <p className="text-xs text-slate-400">{msg}</p> : null}
        <Button variant="ghost" onClick={save} loading={busy}>
          Save branding
        </Button>
      </div>
    </Card>
  );
}

