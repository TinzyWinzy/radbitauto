import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Card, Field, Input, Select } from '../components/ui';
import { PageHeader } from '../components/status';

export default function NewStaff() {
  const { claims } = useAuth();
  const navigate = useNavigate();
  const canCreateAdmin = claims.appRole === 'admin' && Boolean(claims.companyId);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.createStaff({
        email: email.trim(),
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim() || undefined,
        role,
      });
      setResult({ email: email.trim(), tempPassword: res.tempPassword });
    } catch (err) {
      setError((err as Error)?.message ?? 'Failed to create staff member');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="pb-8">
        <PageHeader title="Staff account created" />
        <Card className="mb-4 border-emerald-900 bg-emerald-950/30">
          <p className="mb-2 text-sm text-slate-300">Share these credentials with the new agent:</p>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Email</span>
              <span className="font-medium text-slate-100">{result.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Temporary password</span>
              <span className="font-mono font-medium text-slate-100">{result.tempPassword}</span>
            </div>
          </div>
        </Card>
        <Button variant="ghost" onClick={() => navigate('/app/team')}>
          Back to team
        </Button>
      </div>
    );
  }

  return (
    <div className="pb-8">
      <PageHeader title="Add a team member" subtitle="They'll get a temporary password to sign in." />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="agent@agency.com"
          />
        </Field>
        <Field label="Full name">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="e.g. Chipo Dube" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <Input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+263..." />
          </Field>
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value as 'staff' | 'admin')}>
              <option value="staff">Staff</option>
              {canCreateAdmin ? <option value="admin">Admin</option> : null}
            </Select>
          </Field>
        </div>
        {error ? <p className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</p> : null}
        <Button type="submit" loading={busy}>
          Create staff account
        </Button>
      </form>
    </div>
  );
}