import { sendEmailVerification, type User } from 'firebase/auth';

const pending = new Map<string, Promise<void>>();
const sent = new Map<string, number>();
const COOLDOWN = 60_000;
export function verificationSentAt(uid: string): number {
  try { return Math.max(sent.get(uid) ?? 0, Number(sessionStorage.getItem(`verification-sent:${uid}`)) || 0); }
  catch { return sent.get(uid) ?? 0; }
}
export function requestVerification(user: User, returnPath: string): Promise<void> {
  const existing = pending.get(user.uid);
  if (existing) return existing;
  if (Date.now() - verificationSentAt(user.uid) < COOLDOWN) return Promise.resolve();
  const path = /^\/invite\/[a-f0-9]{64}$/.test(returnPath) ? returnPath : '/agency/setup';
  const task = sendEmailVerification(user, { url: `${window.location.origin}${path}`, handleCodeInApp: false })
    .then(() => {
      const now = Date.now(); sent.set(user.uid, now);
      try { sessionStorage.setItem(`verification-sent:${user.uid}`, String(now)); } catch { /* In-memory cooldown still applies. */ }
    }).finally(() => pending.delete(user.uid));
  pending.set(user.uid, task);
  return task;
}
export function verificationError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'auth/too-many-requests') return 'Email requests are temporarily limited. Wait a few minutes before trying again. You can also sign in with Google using this same email address.';
  if (code === 'auth/network-request-failed') return 'The email request could not reach the service. Check your connection and try again.';
  if (code === 'auth/quota-exceeded') return 'Verification email delivery has reached its service limit. Contact support or sign in with Google using this same email address.';
  if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') return 'The verification return address needs to be configured. Contact support; your account has already been created.';
  if (code === 'auth/user-token-expired' || code === 'auth/invalid-user-token') return 'Your sign-in has expired. Sign in again to request a verification email.';
  return 'We could not request a verification email. Try again or contact support. Your account has already been created.';
}
