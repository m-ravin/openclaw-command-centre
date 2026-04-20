'use client';
import { X, TrendingUp, AlertTriangle, Zap, Info } from 'lucide-react';
import { cn, severityColor } from '@/lib/utils';
import { post } from '@/lib/api';

interface Insight {
  id: string;
  title: string;
  body: string;
  severity: string;
  category: string;
  action_label?: string;
}

const ICONS: Record<string, typeof Info> = {
  cost:         TrendingUp,
  performance:  Zap,
  security:     AlertTriangle,
  optimization: Zap,
  usage:        Info,
};

export function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  const Icon = ICONS[insight.category] ?? Info;
  const dismiss = async () => {
    await post(`/insights/${insight.id}/dismiss`).catch(() => {});
    onDismiss();
  };

  return (
    <div className={cn(
      'relative rounded-xl border p-4 text-sm',
      severityColor(insight.severity)
    )}>
      <div className="flex items-start gap-3">
        <Icon className="w-4 h-4 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold mb-0.5">{insight.title}</p>
          <p className="opacity-80 text-xs leading-relaxed">{insight.body}</p>
        </div>
        <button onClick={dismiss} className="shrink-0 opacity-50 hover:opacity-100 transition-opacity">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
