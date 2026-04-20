'use client';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label:     string;
  value:     string | number;
  sub?:      string;
  icon?:     LucideIcon;
  iconColor?: string;
  trend?:    number;       // positive = up, negative = down
  trendGood?: 'up' | 'down'; // which direction is "good" for colouring
  glow?:     boolean;
  className?: string;
}

export function StatCard({
  label, value, sub, icon: Icon, iconColor = 'text-brand',
  trend, trendGood = 'up', glow, className,
}: StatCardProps) {
  const trendUp = trend != null && trend > 0;
  const trendGoodColor = trendGood === 'up'
    ? (trendUp ? 'text-accent-green' : 'text-accent-red')
    : (trendUp ? 'text-accent-red'   : 'text-accent-green');

  return (
    <div className={cn(
      'relative rounded-xl bg-surface-2 border border-white/5 p-4 overflow-hidden',
      glow && 'shadow-[0_0_30px_rgba(99,102,241,0.08)]',
      className
    )}>
      {/* Subtle grid background */}
      <div className="absolute inset-0 bg-grid-pattern bg-[size:24px_24px] opacity-30 pointer-events-none" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold text-white leading-none truncate">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
          {trend != null && (
            <div className={cn('flex items-center gap-1 mt-1.5 text-xs font-medium', trendGoodColor)}>
              {trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              <span>{Math.abs(trend)}% vs last period</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className={cn('p-2.5 rounded-lg bg-surface-4 shrink-0', iconColor.replace('text-', 'text-') + '/10')}>
            <Icon className={cn('w-5 h-5', iconColor)} />
          </div>
        )}
      </div>
    </div>
  );
}
