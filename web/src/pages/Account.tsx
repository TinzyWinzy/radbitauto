import { useEffect, useState } from 'react';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { useAuth } from '../lib/auth';
import { auth } from '../lib/firebase';
import { api } from '../lib/api';
import { useCompanyDoc, useCompanySettings, useNotifications, useStaff, useUserProfile } from '../lib/hooks';
import type { NotificationPrefs } from '../lib/types';
import { setAppBadge } from '../lib/share';
import { Button, Card } from '../components/ui';
import { PageHeader } from '../components/status';
import { Link } from 'react-router-dom';

const PREF_ROWS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'email', label: 'Email updates' },
  { key: 'whatsapp', label: 'WhatsApp updates' },
  { key: 'sms', label: 'SMS updates' },
  { key: 'marketing', label: 'Product and marketing messages' },
];

export default function Account() {
  const { user, claims } = useAuth();
  const isStaff = claims.appRole === 'staff' || claims.appRole === 'admin';
  const isAdmin = claims.appRole === 'admin';
  const { data: company } = useCompanyDoc(claims.companyId);
  const settings = useCompanySettings(claims.companyId);
  const { data: staff } = useStaff(claims.companyId);
  const notes = useNotifications(user?.uid);
  const profile = useUserProfile(user?.uid);
  const myStaff = staff.find((s) => s.id === user?.uid);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [baseMsg, setBaseMsg] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPrefs>({ email: true, whatsapp: true, sms: true, marketing: false });
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);
  const [dataMsg, setDataMsg] = useState<string | null>(null);

  useEffect(() => {
    const stored = profile?.notificationPrefs;
    if (!stored) return;
    setPrefs({
      email: stored.email !== false,
      whatsapp: stored.whatsapp !== false,
      sms: stored.sms !== false,
      marketing: stored.marketing === true,
    });
  }, [profile]);

  async function savePrefs() {
    setBusy(true);
    setPrefsMsg(null);
    try {
      const res = await api.updateNotificationPrefs(prefs);
      setPrefs(res.notificationPrefs);
      setPrefsMsg('Preferences saved');
    } catch (e) {
      setPrefsMsg((e as Error)?.message ?? 'Could not save preferences');
    } finally {
      setBusy(false);
    }
  }

  async function downloadMyData() {
    setBusy(true);
    setDataMsg(null);
    try {
      const payload = await api.exportMyData({});
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setDataMsg('Your data export has been downloaded.');
    } catch (e) {
      setDataMsg((e as Error)?.message ?? 'Could not export your data');
    } finally {
      setBusy(false);
    }
  }

  async function requestDeletion() {
    setBusy(true);
    setDataMsg(null);
    try {
      const res = await api.requestErasure({});
      setDataMsg(
        res.agencies > 0
          ? `Deletion request sent to ${res.agencies} ${res.agencies === 1 ? 'agency' : 'agencies'}. They will contact you about any records they must retain by law.`
          : 'Deletion request recorded. Support will contact you.',
      );
    } catch (e) {
      setDataMsg((e as Error)?.message ?? 'Could not submit your request');
    } finally {
      setBusy(false);
    }
  }

  async function ensure() {
    if (!claims.companyId) return;
    setBusy(true);
    try {
      const res = await api.ensureBaseline({ companyId: claims.companyId });
      setBaseMsg(`Baseline OK — ${res.stageDefinitions} stages`);
    } catch (e) {
      setBaseMsg((e as Error)?.message ?? 'Baseline failed');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setAppBadge(notes.length > 0 ? notes.length : 0);
  }, [notes.length]);

  async function resetPassword() {
    if (!user?.email) return;
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      setResetSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-8">
      <PageHeader title="Account" subtitle={company?.name} />
      {isStaff ? <Link to="/app/operations" className="btn-primary mb-4 inline-flex">Reports and invitations</Link> : null}
      <Card className="mb-3"><h2 className="section-title">Help and support</h2><p className="text-sm">For account access or an import question, contact your agency using the WhatsApp links on your case. An agency owner can restore customer access or issue a new invitation. Use password reset to recover your existing account; do not create a second agency account.</p></Card>
      <p className="mb-4 text-sm">Platform support: <a className="underline" href="mailto:brandontinoz@gmail.com">brandontinoz@gmail.com</a> · <Link className="underline" to="/help">Privacy and service information</Link></p>

      <Card className="mb-3 space-y-2">
        <Row label="Name" value={user?.displayName ?? '—'} />
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Role" value={isStaff ? (claims.appRole ?? 'staff') : 'customer'} />
        <Row label="Your account ID" value={user?.uid ?? '—'} mono small />
      </Card>

      {notes.length > 0 ? (
        <Card className="mb-3">
          <h2 className="field-label">Notifications ({notes.length})</h2>
          {notes.slice(0, 5).map((n) => (
            <p key={n.id} className="text-xs text-slate-300">🔔 {n.title} — {n.body}</p>
          ))}
        </Card>
      ) : null}

      <Card className="mb-3">
        <h2 className="field-label">Notification preferences</h2>
        <p className="mb-2 text-xs text-slate-400">Choose how we may contact you about your imports. Marketing messages are off unless you opt in.</p>
        {PREF_ROWS.map((row) => (
          <label key={row.key} className="flex items-center justify-between gap-3 py-1 text-sm">
            <span>{row.label}</span>
            <input
              type="checkbox"
              checked={prefs[row.key]}
              onChange={(e) => setPrefs({ ...prefs, [row.key]: e.target.checked })}
              className="h-4 w-4"
            />
          </label>
        ))}
        {prefsMsg ? <p role="status" className="text-xs text-slate-400">{prefsMsg}</p> : null}
        <Button variant="ghost" onClick={savePrefs} loading={busy}>Save preferences</Button>
      </Card>

      <Card className="mb-3">
        <h2 className="field-label">Your data</h2>
        <p className="mb-2 text-xs text-slate-400">Download a copy of your personal data, or ask the agencies that hold your records to delete them. Some records must be kept for tax, customs and financial rules.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={downloadMyData} loading={busy}>Download my data</Button>
          <Button variant="ghost" onClick={requestDeletion} loading={busy}>Request deletion</Button>
        </div>
        {dataMsg ? <p role="status" className="mt-2 text-xs text-slate-400">{dataMsg}</p> : null}
      </Card>

      <Card className="mb-3 space-y-2">
        <Row label="Currency" value={settings?.currency ?? 'USD'} />
        <Row label="Payment methods" value={settings?.paymentMethods?.join(', ') ?? '—'} />
        <Row label="Default port" value={company?.defaultPort ?? '—'} />
        <Row label="WhatsApp" value={company?.contactWhatsapp ?? '—'} />
      </Card>

      {myStaff ? (
        <Card className="mb-3">
          <h2 className="field-label">Agency role</h2>
          <p className="text-sm text-slate-300">
            {myStaff.role} at {company?.name ?? 'your agency'}
          </p>
        </Card>
      ) : null}

      <div className="space-y-3">
        {isAdmin ? (
          <>
            <Button variant="ghost" onClick={ensure} loading={busy}>
              Ensure stage + tax baseline
            </Button>
            {baseMsg ? <p className="text-xs text-slate-400">{baseMsg}</p> : null}
          </>
        ) : null}
        <Button variant="ghost" onClick={resetPassword} loading={busy}>
          {resetSent ? 'Reset link sent — check your inbox' : 'Reset password'}
        </Button>
        <Button variant="danger" onClick={() => signOut(auth)}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div className="account-detail-row flex items-center justify-between gap-3">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`min-w-0 text-right font-medium text-slate-100 ${mono ? 'font-mono' : ''} ${small ? 'text-[11px]' : 'text-sm'}`}>
        {value}
      </span>
    </div>
  );
}
