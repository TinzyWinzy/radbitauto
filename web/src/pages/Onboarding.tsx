import Brand from '../components/Brand';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { Button, Field, Input, Select } from '../components/ui';
import { PlatformSwitcher } from '../components/platform';
import CommercialControls from '../components/CommercialControls';
import { PAYMENT_METHODS } from '../lib/types';

export default function Onboarding() {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [casePrefix, setCasePrefix] = useState('');
  const [contactWhatsapp, setContactWhatsapp] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminFullName, setAdminFullName] = useState('');
  const [adminPhoneNumber, setAdminPhoneNumber] = useState('');
  const [defaultPort, setDefaultPort] = useState('Durban');
  const [currency, setCurrency] = useState('USD');
  const [paymentMethods, setPaymentMethods] = useState<string[]>(['EcoCash', 'InnBucks', 'Bank']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; tempPassword: string | null; alreadyExisting?: boolean } | null>(null);

  function toggleMethod(m: string) {
    setPaymentMethods((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.bootstrapCompany({
        slug: slug.trim(),
        name: name.trim(),
        casePrefix: casePrefix.trim().toUpperCase(),
        contactWhatsapp: contactWhatsapp.trim(),
        adminEmail: adminEmail.trim(),
        adminFullName: adminFullName.trim(),
        adminPhoneNumber: adminPhoneNumber.trim() || undefined,
        defaultPort: defaultPort as 'Durban',
        currency,
        paymentMethods,
      });
      setResult({ email: adminEmail.trim(), tempPassword: res.tempPassword ?? null });
    } catch (err) {
      setError((err as Error)?.message ?? 'Bootstrap failed');
    } finally {
      setBusy(false);
    }
  }

  async function continueAsAdmin() {
    if (!result?.tempPassword) return;
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, result.email, result.tempPassword);
    } catch {
      setError('Could not sign in as the new admin automatically. Sign in manually with the temporary password shown.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="agency-setup-page py-12">
        <div className="mx-auto w-full max-w-md space-y-4">
          <div className="card border-emerald-900 bg-emerald-950/30 text-center">
            <p className="interface-eyebrow mb-2">Workspace created</p>
            <h1 className="text-lg font-bold text-slate-50">Agency created</h1>
            <p className="mt-1 text-sm text-slate-300">
              Sign in as the new administrator with the temporary password below, then change it
              from the account screen.
            </p>
          </div>
          <div className="card space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Email</span>
              <span className="font-medium text-slate-100">{result.email}</span>
            </div>
            {result.tempPassword ? (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Temporary password</span>
                <span className="font-mono font-medium text-slate-100">{result.tempPassword}</span>
              </div>
            ) : (
              <p className="text-sm text-amber-300">That email is already linked to a company — sign in with your existing password.</p>
            )}
          </div>
          {result.tempPassword ? (
            <Button onClick={continueAsAdmin} loading={busy}>
              Continue as {result.email}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => signOut(auth)}>
            Sign out instead
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="agency-setup-page"><header className="agency-setup-header"><Link to="/" className="product-wordmark"><Brand/></Link><Button variant="ghost" onClick={()=>signOut(auth)}>Sign out</Button></header><div className="agency-setup-grid"><section>
        <p className="interface-eyebrow mt-8">Platform administration</p><h1 className="mt-2 mb-3 font-display font-bold">Agency administration</h1>
        <p className="mb-5 text-sm text-slate-400">
          Create and manage agency workspaces. Business owners can also register directly from the public sign-up page.
        </p>
<h2 className="setup-section-heading">Create an agency workspace</h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Agency name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Tendai Autotrade"
                required
              />
            </Field>
            <Field label="Public showroom address">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.trim().toLowerCase())}
                placeholder="tendai-autotrade"
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Case prefix">
              <Input
                value={casePrefix}
                onChange={(e) => setCasePrefix(e.target.value.trim().toUpperCase())}
                placeholder="TA"
                required
                maxLength={5}
              />
            </Field>
            <Field label="Default port">
              <Select value={defaultPort} onChange={(e) => setDefaultPort(e.target.value)}>
                <option>Durban</option>
                <option>Beira</option>
                <option>Walvis Bay</option>
              </Select>
            </Field>
          </div>
          <Field label="WhatsApp number" hint="In international format, e.g. +263771234567">
            <Input
              value={contactWhatsapp}
              onChange={(e) => setContactWhatsapp(e.target.value)}
              placeholder="+263..."
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="USD">USD</option>
              </Select>
            </Field>
            <Field label="Payment methods">
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => toggleMethod(m)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      paymentMethods.includes(m)
                        ? 'border-accent bg-accent/15 text-accent'
                        : 'border-ink-700 bg-ink-900 text-slate-400'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="pt-2">
            <h2 className="field-label">Business owner account</h2>
            <div className="space-y-4">
              <Field label="Admin email">
                <Input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="admin@agency.com"
                  required
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Admin full name">
                  <Input
                    value={adminFullName}
                    onChange={(e) => setAdminFullName(e.target.value)}
                    placeholder="e.g. Tendai Moyo"
                    required
                  />
                </Field>
                <Field label="Admin phone">
                  <Input
                    value={adminPhoneNumber}
                    onChange={(e) => setAdminPhoneNumber(e.target.value)}
                    placeholder="+263..."
                  />
                </Field>
              </div>
            </div>
          </div>
          {error ? (
            <p className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}
          <Button type="submit" loading={busy}>
            Create agency
          </Button>
        </form>
      </section><aside className="setup-preview"><h2 className="mb-4 font-semibold">Existing agencies</h2><PlatformSwitcher/><h2 className="my-5 font-semibold">Subscription and access</h2><CommercialControls/></aside></div></main>
  );
}
