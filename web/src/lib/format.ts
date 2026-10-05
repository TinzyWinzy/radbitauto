import type { Timestamp } from 'firebase/firestore';

export function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function usd(cents: number): string {
  return money(cents, 'USD');
}

export function usdToCents(value: number): number {
  return Math.round(value * 100);
}

export function dateTime(t: Timestamp | Date | undefined): string {
  if (!t) return '—';
  const d = 'toDate' in t ? t.toDate() : t;
  return new Intl.DateTimeFormat('en-ZW', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function dateOnly(t: Timestamp | Date | undefined): string {
  if (!t) return '—';
  const d = 'toDate' in t ? t.toDate() : t;
  return new Intl.DateTimeFormat('en-ZW', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string): string {
  return value.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}