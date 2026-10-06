import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button } from '../components/ui';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import EmailVerification from '../components/EmailVerification';

export default function Pending() {
  const { user, loading, claims, refreshClaims } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');

  async function checkStatus() {
    setChecking(true);
    setNote('');
    try {
      const next = await refreshClaims();
      if (next?.companyId) navigate('/app', { replace: true });
      else setNote('Still no agency access. Ask your agent to link this email, then check again.');
    } catch {
      setNote('Could not refresh your access. Check your connection and try again.');
    } finally {
      setChecking(false);
    }
  }

  if (loading) return null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-3 text-3xl">⏳</div>
        <h1 className="text-lg font-bold text-slate-50">Account pending</h1>
        {user && !user.emailVerified ? (
          <>
            <p className="mt-2 text-sm text-slate-400">
              Verify your email before your agency can link your account.
            </p>
            <EmailVerification returnPath="/pending" />
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            Your account has been created{user?.email ? ` for ${user.email}` : ''}, but hasn't been
            linked to an agency yet. Ask your import agent to link this email address.
          </p>
        )}
        <div className="mt-6">
          <Button variant="ghost" className="mb-3" onClick={checkStatus} loading={checking}>
            Check for access
          </Button>
          <Link to="/agency/setup" className="btn-primary mb-3">I run an agency — create my workspace</Link>
          {note && <p role="status" className="mt-3 text-sm text-slate-300">{note}</p>}
          {claims.companyId && (
            <p role="status" className="mt-3 text-sm text-slate-300">
              Access detected. <Link to="/app" className="underline">Open your workspace</Link>.
            </p>
          )}
          <Button variant="ghost" onClick={() => signOut(auth)}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
