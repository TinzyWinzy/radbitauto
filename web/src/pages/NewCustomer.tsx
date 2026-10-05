import { useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { Button, Card, Field, Input } from '../components/ui';
import { PageHeader } from '../components/status';

export default function NewCustomer() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const customer = state as { id: string; fullName: string; phoneNumber: string } | null;
  const [requestKey] = useState(() => crypto.randomUUID());
  const [fullName, setFullName] = useState(customer?.fullName ?? '');
  const [phoneNumber, setPhoneNumber] = useState(customer?.phoneNumber ?? '');
  const [whatsappRef, setWhatsappRef] = useState('');
  const [emailOrUid, setEmailOrUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const identifier = emailOrUid.trim();
      const input = {
        customerId: customer?.id,
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        whatsappRef: whatsappRef.trim() || undefined,
        ...(identifier.includes('@') ? { email: identifier } : { userId: identifier }),
      };
      const res = customer ? await api.linkCustomer(input) : await api.createCustomerRecord({ fullName: fullName.trim(), phoneNumber: phoneNumber.trim(), idempotencyKey: requestKey });
      setResult(res.customerId);
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to link customer');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="pb-8">
        <PageHeader title={customer ? 'Customer linked' : 'Customer created'} />
        <Card className="mb-4 border-emerald-900 bg-emerald-950/30">
          <p className="text-sm text-slate-300">
            <span className="font-medium text-slate-50">{fullName}</span> {customer ? 'can sign in and see their imports.' : 'is ready for a case. Link their portal account from Team when they register.'}
          </p>
        </Card>
        <Button onClick={() => navigate('/app/new/case', { state: { customerId: result } })}>Open an import case</Button>
        <Button variant="ghost" onClick={() => navigate('/app/team')}>
          Back to team
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <PageHeader
        title={customer ? 'Link a customer' : 'Add a customer'}
        subtitle={customer ? 'Use the email they registered with. Existing case history stays with this record.' : 'Create their record now. A portal account is not required.'}
      />
      <form onSubmit={onSubmit} className="space-y-4">
        {customer ? <Field label="Customer email address" hint="Same email they used to create their account">
          <Input
            type="email"
            value={emailOrUid}
            onChange={(e) => setEmailOrUid(e.target.value)}
            placeholder="customer@example.com"
            required
          />
        </Field> : null}
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="e.g. Blessing Chiwa" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone number">
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required placeholder="+263..." />
          </Field>
          {customer ? <Field label="WhatsApp reference" hint="Optional">
            <Input value={whatsappRef} onChange={(e) => setWhatsappRef(e.target.value)} placeholder="e.g. WA-id" />
          </Field> : null}
        </div>
        {error ? <p className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <Button type="submit" loading={busy}>
          {customer ? 'Link customer' : 'Create customer'}
        </Button>
      </form>
    </div>
  );
}
