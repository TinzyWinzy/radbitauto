import type { ReactNode } from 'react';
import { useOnline } from '../lib/hooks';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label={label}>
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-ink-700 border-t-accent" />
    </div>
  );
}

export function SpinnerSmall({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" role="status" aria-label={label} />
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="card border-red-900 bg-red-950/40 text-center text-sm text-red-300" role="alert">
      {message}
    </div>
  );
}

export function EmptyState({ title, hint, icon = '🧰', action }: { title: string; hint?: string; icon?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-1 border-dashed py-10 text-center">
      <span className="text-3xl" aria-hidden>{icon}</span>
      <p className="font-medium text-slate-200">{title}</p>
      {hint ? <p className="max-w-[26ch] text-sm text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-3 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="relative z-10 bg-amber-500/95 px-4 py-1.5 text-center text-xs font-semibold text-amber-950" role="status" aria-live="polite">
      You are offline. Cached information may be shown; new enquiries will wait for a connection.
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  right,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="page-header mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-50">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm leading-relaxed text-slate-400">{subtitle}</p> : null}
      </div>
      {right ? <div className="page-header-actions shrink-0 pt-0.5">{right}</div> : null}
    </div>
  );
}
