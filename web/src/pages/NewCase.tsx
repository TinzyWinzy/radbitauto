import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useCustomers, useVehicles } from '../lib/hooks';
import { Button, Card, Field, TextArea, Select } from '../components/ui';
import { PageHeader, EmptyState } from '../components/status';

export default function NewCase() {
  const { state } = useLocation();
  const preselectVehicleId = (state as { vehicleId?: string } | null | undefined)?.vehicleId;
  const { claims } = useAuth();
  const navigate = useNavigate();
  const { data: customers, loading: loadCustomers } = useCustomers(claims.companyId);
  const { data: vehicles, loading: loadVehicles } = useVehicles(claims.companyId);

  const [customerId, setCustomerId] = useState((state as { customerId?: string } | null)?.customerId ?? '');
  const [vehicleId, setVehicleId] = useState(preselectVehicleId ?? '');
  const [statusNote, setStatusNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerId) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.createCase({
        customerId,
        vehicleId: vehicleId || undefined,
        statusNote: statusNote.trim() || undefined,
        supplierLeadId:(state as {supplierLeadId?:string}|null)?.supplierLeadId,
      });
      setResult(res.caseNum);
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to create case');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="pb-8">
        <PageHeader title="Import case created" />
        <Card className="mb-4 border-emerald-900 bg-emerald-950/30 text-center">
          <p className="text-sm text-slate-300">
            Case <span className="font-semibold text-slate-50">{result}</span> is now live.
          </p>
        </Card>
        <Button onClick={() => navigate('/app')}>View all cases</Button>
      </div>
    );
  }

  if (loadCustomers || loadVehicles) {
    return <div className="px-4 py-10 text-center text-sm text-slate-500">Loading…</div>;
  }

  if (customers.length === 0) {
    return (
      <div className="pb-8">
        <PageHeader title="New import case" />
        <EmptyState
          title={customers.length === 0 ? 'No linked customers' : 'No vehicles registered'}
          hint={
            customers.length === 0
              ? 'Link a customer first from the Team tab.'
              : 'Register a vehicle first, then come back.'
          }
        />
        <div className="mt-4 space-y-3">
          {customers.length === 0 ? (
            <Button variant="ghost" onClick={() => navigate('/app/new/customer')}>
              Add a customer
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => navigate('/app/new/vehicle')}>
            Register a vehicle
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <PageHeader title="New import case" />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Customer">
          <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} — {c.phoneNumber}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vehicle" hint="Open an enquiry now and attach the purchased vehicle later.">
          <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">
              Not sourced yet
            </option>
            {vehicles.filter(v=>!v.allocation).map((v) => (
              <option key={v.id} value={v.id}>
                {v.year} {v.make} {v.model} · {v.vinChassisUpper}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status note" hint="Optional comment shown in the timeline">
          <TextArea rows={2} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="e.g. Arrived at Durban port" />
        </Field>
        {error ? <p className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <Button type="submit" loading={busy}>
          Create import
        </Button>
      </form>
    </div>
  );
}
