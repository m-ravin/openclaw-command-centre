import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${(usd * 100).toFixed(3)}¢`;
  if (usd < 1)    return `$${usd.toFixed(4)}`;
  if (usd < 100)  return `$${usd.toFixed(2)}`;
  return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try { return formatDistanceToNow(new Date(dateStr), { addSuffix: true }); }
  catch { return '—'; }
}

export function absTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try { return format(new Date(dateStr), 'MMM d, HH:mm'); }
  catch { return '—'; }
}

export function statusColor(status: string): string {
  return {
    active:     'text-accent-green',
    running:    'text-accent-green',
    success:    'text-accent-green',
    idle:       'text-yellow-400',
    pending:    'text-yellow-400',
    warning:    'text-accent-amber',
    stopped:    'text-slate-400',
    terminated: 'text-slate-500',
    error:      'text-accent-red',
    fatal:      'text-accent-rose',
    critical:   'text-accent-rose',
    invalid:    'text-accent-red',
    valid:      'text-accent-green',
    unknown:    'text-slate-400',
    stale:      'text-accent-amber',
    healthy:    'text-accent-green',
    syncing:    'text-accent-cyan',
  }[status] ?? 'text-slate-400';
}

export function statusDot(status: string): string {
  return {
    active:     'bg-accent-green shadow-[0_0_6px_#10b981]',
    running:    'bg-accent-green shadow-[0_0_6px_#10b981]',
    idle:       'bg-yellow-400',
    error:      'bg-accent-red shadow-[0_0_6px_#ef4444]',
    stopped:    'bg-slate-500',
    terminated: 'bg-slate-600',
    pending:    'bg-yellow-400 animate-pulse',
  }[status] ?? 'bg-slate-500';
}

export function severityColor(severity: string): string {
  return {
    info:        'text-brand-light border-brand/30 bg-brand/10',
    warning:     'text-accent-amber border-accent-amber/30 bg-accent-amber/10',
    error:       'text-accent-red border-accent-red/30 bg-accent-red/10',
    critical:    'text-accent-rose border-accent-rose/40 bg-accent-rose/15',
    opportunity: 'text-accent-cyan border-accent-cyan/30 bg-accent-cyan/10',
  }[severity] ?? 'text-slate-400 border-slate-700 bg-surface-3';
}
