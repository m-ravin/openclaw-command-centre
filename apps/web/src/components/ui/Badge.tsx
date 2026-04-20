import { cn, statusColor, severityColor } from '@/lib/utils';

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full',
      'border bg-current/10',
      statusColor(status),
    )}>
      <span className={cn('w-1.5 h-1.5 rounded-full bg-current')} />
      {status}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={cn(
      'inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border',
      severityColor(severity)
    )}>
      {severity}
    </span>
  );
}

export function ProviderBadge({ provider }: { provider: string }) {
  const colors: Record<string, string> = {
    anthropic:  'bg-orange-950/40 text-orange-300 border-orange-500/20',
    openai:     'bg-emerald-950/40 text-emerald-300 border-emerald-500/20',
    ollama:     'bg-blue-950/40 text-blue-300 border-blue-500/20',
    gemini:     'bg-yellow-950/40 text-yellow-300 border-yellow-500/20',
    openrouter: 'bg-purple-950/40 text-purple-300 border-purple-500/20',
  };
  return (
    <span className={cn(
      'inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded border',
      colors[provider] ?? 'bg-surface-4 text-slate-400 border-white/5'
    )}>
      {provider}
    </span>
  );
}
