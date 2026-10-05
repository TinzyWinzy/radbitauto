import { useCallback, useEffect, useRef, useState } from 'react';
import { reload, signOut } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../lib/auth';
import { requestVerification, verificationError, verificationSentAt } from '../lib/emailVerification';
import { Button } from './ui';

export default function EmailVerification({ returnPath, onVerified }: { returnPath: string; onVerified?: () => void }) {
  const { user, refreshClaims } = useAuth();
  const navigate = useNavigate();
  const [sending, setSending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [remaining, setRemaining] = useState(0);
  const checkingRef = useRef(false);
  const verifiedCallback = useRef(onVerified);
  verifiedCallback.current = onVerified;

  const send = useCallback(async () => {
    if (!user || user.emailVerified) return;
    setSending(true); setError('');
    try {
      await requestVerification(user, returnPath);
      setMessage(`Verification email requested for ${user.email}. Check your inbox and spam folder.`);
      setRemaining(Math.max(0, Math.ceil((verificationSentAt(user.uid) + 60_000 - Date.now()) / 1000)));
    } catch (err) { setError(verificationError(err)); }
    finally { setSending(false); }
  }, [user, returnPath]);

  const check = useCallback(async (explicit: boolean) => {
    if (!user || checkingRef.current) return;
    checkingRef.current = true;
    if (explicit) { setChecking(true); setError(''); }
    try {
      await reload(user);
      if (user.emailVerified) { await refreshClaims(); verifiedCallback.current?.(); setMessage('Email verified. You can continue.'); }
      else if (explicit) setMessage('Your email is not verified yet. Open the verification link in your inbox or spam folder, then check again.');
    } catch (err) { if (explicit) setError(verificationError(err)); }
    finally { checkingRef.current = false; setChecking(false); }
  }, [user, refreshClaims]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!user) return;
      try {
        await reload(user);
        if (!active) return;
        if (user.emailVerified) { await refreshClaims(); if (active) verifiedCallback.current?.(); }
        else await send();
      } catch (err) { if (active) setError(verificationError(err)); }
    })();
    return () => { active = false; };
  }, [user, send, refreshClaims]);
  useEffect(() => {
    if (!remaining) return;
    const timer = window.setInterval(() => setRemaining(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [remaining > 0]);
  useEffect(() => {
    let checkedAt = 0;
    const onReturn = () => {
      if (document.visibilityState !== 'visible' || Date.now() - checkedAt < 3000) return;
      checkedAt = Date.now(); void check(false);
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => { window.removeEventListener('focus', onReturn); document.removeEventListener('visibilitychange', onReturn); };
  }, [check]);

  return <section className="card mt-6" aria-label="Verify your email">
    <h2 className="font-semibold text-slate-100">Verify your email first</h2>
    <p className="mt-2 break-all text-sm text-slate-400">Confirm {user?.email} to continue.</p>
    <p className="mt-3 text-sm text-slate-400">Open the verification link in your email. Return here afterwards; we’ll check again when you come back.</p>
    <div className="mt-4 flex flex-col gap-2">
      <Button onClick={send} loading={sending} disabled={remaining > 0 || checking}>Send verification email{remaining > 0 ? ` again in ${remaining}s` : ''}</Button>
      <Button variant="ghost" onClick={() => check(true)} loading={checking} disabled={sending}>I have verified my email</Button>
    </div>
    {message && <p role="status" className="mt-4 text-sm text-slate-300">{message}</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    <p className="mt-4 text-xs leading-relaxed text-slate-400">Nothing arrived? Check Spam/Junk and search for “Verify your email”. Allow a few minutes before resending. Email delivery may be delayed even after the request succeeds.</p>
    <div className="mt-4 flex flex-wrap gap-4 text-sm"><Button variant="ghost" disabled={sending || checking} onClick={async () => { try { await signOut(auth); navigate(`/login?${returnPath.startsWith('/invite/') ? `next=${encodeURIComponent(returnPath)}` : 'intent=agency'}`); } catch { setError('Could not sign out. Check your connection and try again.'); } }}>Use Google or another account</Button><Link to="/help" className="underline">Get support</Link></div>
  </section>;
}
