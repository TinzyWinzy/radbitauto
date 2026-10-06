import Brand from '../components/Brand';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  GoogleAuthProvider,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { Button, Field, Input } from '../components/ui';
import { Link, useSearchParams } from 'react-router-dom';
import Seo from '../components/Seo';

export default function Login() {
  const [params] = useSearchParams();
  const invited = params.get('next')?.startsWith('/invite/') === true;
  const customerIntent = !invited && params.get('intent') === 'customer';
  const [mode, setMode] = useState<'signin' | 'signup'>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  async function resetPassword() {
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setBusy(true); setError(null); setNotice('');
    try { await sendPasswordResetEmail(auth, email.trim()); setNotice('If an account uses this email, you will receive a password reset link.'); }
    catch (error) { setError(friendlyAuthError(error)); }
    finally { setBusy(false); }
  }

  // Completes a Google redirect sign-in (fallback path) when returning to /login.
  useEffect(() => {
    getRedirectResult(auth)
      .catch((err) => setError(friendlyAuthError(err)));
  }, []);

  function friendlyAuthError(err: unknown): string {
    const msg = (err as { code?: string; message?: string })?.code ?? (err as Error)?.message ?? '';
    if (msg.includes('account-exists-with-different-credential'))
      return 'This email already uses password sign-in. Sign in with email/password first, then link Google from your account screen.';
    if (msg.includes('popup-closed-by-user')) return 'Google sign-in was closed before completing.';
    if (msg.includes('popup-blocked')) return 'Pop-up blocked. Allow pop-ups for this site and try again.';
    if (msg.includes('unauthorized-domain') || msg.includes('operation-not-allowed')) return 'Google sign-in is unavailable. Use your email and password, or contact support for help.';
    if (msg.includes('invalid-credential') || msg.includes('wrong-password'))
      return 'Wrong email or password.';
    if (msg.includes('user-not-found')) return 'No account found for this email. Try creating one.';
    if (msg.includes('invalid-email')) return 'That email address looks invalid.';
    if (msg.includes('email-already-in-use')) return 'An account already exists for this email.';
    if (msg.includes('weak-password')) return 'Password must be at least 6 characters.';
    return (err as Error)?.message ?? 'Something went wrong';
  }

  async function signInGoogle() {
    setError(null);
    setGoogleBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      // Pop-up blockers / COOP-restricted browsers: fall back to full-page redirect.
      if (code.includes('popup-blocked') || code.includes('popup-closed-by-user')) {
        try {
          const provider = new GoogleAuthProvider();
          provider.setCustomParameters({ prompt: 'select_account' });
          await signInWithRedirect(auth, provider);
          return;
        } catch (redirectErr) {
          setError(friendlyAuthError(redirectErr));
        }
      } else {
        setError(friendlyAuthError(err));
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: fullName.trim() });
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <Seo title="Sign in — Radbit Auto" description="Sign in to Radbit Auto to manage imports, stock, sales and buyer updates, or to follow your purchase as a customer." path="/login" />
      <header className="marketing-header"><Link to="/" className="product-wordmark"><Brand /></Link><Link to="/help" className="public-signin">Support</Link></header>
      <main className="auth-panel">
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-[rgb(var(--accent-contrast-rgb,255_255_255))] shadow-lift" aria-hidden>
              <span className="absolute h-[3px] w-6 rounded-full bg-current opacity-80" />
              <span className="absolute left-[9px] h-2 w-2 rounded-full border-2 border-current bg-transparent" />
              <span className="absolute right-[9px] h-2.5 w-2.5 rounded-full bg-current" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                {mode === 'signup' ? invited ? 'Your invitation' : customerIntent ? 'Customer account' : 'Agency registration · step 1 of 3' : 'Welcome back'}
              </p>
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">
                {mode === 'signup' ? invited ? 'Create your account' : customerIntent ? 'Create your customer account' : 'Create your owner account' : 'Sign in to your workspace'}
              </h1>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-slate-400">
            {mode === 'signup' ? invited ? 'Use the email your invitation was issued to. Your existing case history stays with your agency.' : customerIntent ? 'Your dealer links this email to your record. Vehicle history, payments and documents then appear in your account.' : 'Start with your details. Set up your agency after verifying your email.' : 'Your account opens the agency or customer workspace you belong to.'}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-ink-900 p-1">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                mode === m ? 'bg-ink-700 text-slate-50' : 'text-slate-400'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          {mode === 'signup' ? (
            <Field label="Full name">
              <Input
                aria-label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Tendai Moyo"
                required
                autoComplete="name"
              />
            </Field>
          ) : null}
          <Field label="Email">
            <Input
              type="email"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              aria-label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </Field>

          {error ? (
            <p role="alert" className="rounded-xl border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <Button type="submit" loading={busy}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Button>
        </form>
        {mode === 'signin' ? <Button variant="ghost" onClick={resetPassword} disabled={busy || googleBusy}>Forgot password?</Button> : null}
        {notice ? <p role="status" className="mt-3 text-sm text-slate-300">{notice}</p> : null}

        <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wide text-slate-500">
          <span className="h-px flex-1 bg-ink-800" />
          or
          <span className="h-px flex-1 bg-ink-800" />
        </div>

        <Button variant="ghost" onClick={signInGoogle} loading={googleBusy}>
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z" />
            <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5l-.1.1-3.6 2.8v.1C3.5 21.4 7.4 24 12 24z" />
            <path fill="#FBBC05" d="M5.2 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-.1-.1-3.6-2.8-.1.1C.5 8.5 0 10.2 0 12s.5 3.5 1.4 5.1l3.8-2.7z" />
            <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.4 0 3.5 2.6 1.4 6.8l3.8 2.9c1-2.9 3.7-5 6.8-5z" />
          </svg>
          Sign in with Google
        </Button>

        <ul className="mt-6 space-y-1.5 text-xs text-slate-500">
          <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden />Your agency's data stays isolated</li>
          <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden />View your case when you have a connection</li>
          <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden />USD quotations and confirmed payment records</li>
        </ul>

        <p className="mt-4 text-sm text-slate-300">{invited ? 'After sign-in, you will return to your invitation.' : 'Invited staff and customers should open their private invitation link.'}</p>
        {mode === 'signup' ? <p className="mt-4 text-sm text-slate-300">Read our <Link to="/help" className="underline">service and privacy information</Link> before creating an account.</p> : null}
      </main>
      <footer className="marketing-footer"><Link to="/">Back to home</Link><Link to="/help">Support &amp; privacy</Link></footer>
    </div>
  );
}
