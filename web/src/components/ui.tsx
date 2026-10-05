import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { SpinnerSmall } from './status';

export function Button({
  children,
  loading,
  variant = 'primary',
  ...props
}: {
  children: ReactNode;
  loading?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls =
    variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost';
  return (
    <button {...props} className={`${cls} ${props.className ?? ''}`} disabled={Boolean(props.disabled || loading)}>
      {loading ? <SpinnerSmall /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`field ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`field ${props.className ?? ''}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`field ${props.className ?? ''}`} />;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function Badge({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'ok' | 'warn' | 'muted' | 'info' | 'violet' }) {
  const tones: Record<string, string> = {
    default: 'bg-accent/15 text-accent border-accent/30',
    info: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    violet: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    warn: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    muted: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

type StagePhase = 'sourcing' | 'export' | 'transit' | 'clearance' | 'final';

const PHASE_BY_STAGE: Record<string, StagePhase> = {
  enquiry: 'sourcing',
  quotation: 'sourcing',
  payment_confirmed: 'sourcing',
  vehicle_sourced: 'sourcing',
  purchase_completed: 'sourcing',
  export_processing: 'export',
  shipped: 'export',
  in_transit: 'transit',
  arrived: 'transit',
  customs_clearance: 'clearance',
  duties_charges: 'clearance',
  registration_compliance: 'final',
  ready_for_collection: 'final',
  delivered: 'final',
};

const PHASE_TONE: Record<StagePhase, 'muted' | 'info' | 'violet' | 'warn' | 'ok'> = {
  sourcing: 'muted',
  export: 'info',
  transit: 'violet',
  clearance: 'warn',
  final: 'ok',
};

const PHASE_DOT: Record<StagePhase, string> = {
  sourcing: 'bg-slate-400',
  export: 'bg-sky-400',
  transit: 'bg-violet-400',
  clearance: 'bg-amber-400',
  final: 'bg-emerald-400',
};

export function stagePhase(key: string): StagePhase {
  return PHASE_BY_STAGE[key] ?? 'sourcing';
}

/** Branded status language: every stage reads as part of a journey phase, not generic blue. */
export function StageBadge({ stageKey, label }: { stageKey: string; label: string }) {
  const phase = stagePhase(stageKey);
  return (
    <Badge tone={PHASE_TONE[phase]}>
      <span className={`h-1.5 w-1.5 rounded-full ${PHASE_DOT[phase]}`} aria-hidden />
      {label}
    </Badge>
  );
}

export function ProgressBar({ value, tone = 'journey', label = 'Import progress' }: { value: number; tone?: 'journey' | 'money'; label?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const fill = tone === 'money' ? 'bg-amber-500' : 'bg-accent';
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-ink-700/80"
      role="progressbar"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${fill} transition-[width]`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MoneyText({ cents, currency = 'USD' }: { cents: number; currency?: string }) {
  const val = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  return <span className="font-mono tabular-nums">{val}</span>;
}
