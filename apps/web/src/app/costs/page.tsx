'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { get } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { StatCard } from '@/components/ui/StatCard';
import { ProviderBadge } from '@/components/ui/Badge';
import { formatCost, formatTokens } from '@/lib/utils';
import { DollarSign, TrendingUp, Zap, Clock } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#f97316', openai: '#10b981', ollama: '#3b82f6',
  gemini: '#eab308', openrouter: '#a855f7',
};

const DAY_OPTIONS = [
  { label: '24 h',  value: 1  },
  { label: '3 d',   value: 3  },
  { label: '1 wk',  value: 7  },
  { label: '30 d',  value: 30 },
  { label: '90 d',  value: 90 },
];

export default function CostsPage() {
  const { workspace, privacyBlurNums } = useAppStore();
  const blur = privacyBlurNums ? 'blur-sm select-none' : '';
  const [days, setDays] = useState(30);

  const { data: costs } = useSWR(
    `/costs/summary?workspace=${workspace}&days=${days}`,
    (u: string) => get<{
      total_cost: number; today_cost: number; budget_usd: number; total_tokens: number;
      by_provider: { provider: string; cost: number; tokens: number }[];
      by_model:    { model: string; provider: string; cost: number; requests: number }[];
      daily:       { date: string; cost: number; tokens: number }[];
    }>(u),
    { refreshInterval: 60000 }
  );
  const { data: savings } = useSWR(
    `/costs/savings?workspace=${workspace}`,
    (u: string) => get<{ human_cost_usd: number; ai_cost_usd: number; roi_multiplier: number; human_minutes_saved: number }>(u)
  );

  const dailyData = costs?.daily?.map(d => ({
    date: d.date.slice(5),
    cost: parseFloat((d.cost ?? 0).toFixed(4)),
    tokens: d.tokens,
  })) ?? [];

  const pieData = costs?.by_provider?.map(p => ({
    name: p.provider,
    value: parseFloat((p.cost ?? 0).toFixed(6)),
  })) ?? [];

  const budgetPct = costs ? Math.round((costs.total_cost / costs.budget_usd) * 100) : 0;

  // Compute period label for subtitles
  const periodLabel = DAY_OPTIONS.find(d => d.value === days)?.label ?? `${days}d`;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header + day selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Cost Analytics</h1>
          <p className="text-sm text-slate-500">Token spend, ROI, and budget — last {periodLabel}</p>
        </div>

        {/* Day range pills */}
        <div className="flex items-center gap-1 bg-surface-2 border border-white/5 rounded-xl p-1">
          {DAY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                days === opt.value
                  ? 'bg-brand text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label={`Total (${periodLabel})`} value={<span className={blur}>{formatCost(costs?.total_cost ?? 0)}</span>} icon={DollarSign} iconColor="text-accent-amber" glow />
        <StatCard label="Today"        value={<span className={blur}>{formatCost(costs?.today_cost ?? 0)}</span>} icon={Clock} iconColor="text-brand" />
        <StatCard label="Total Tokens" value={<span className={blur}>{formatTokens(costs?.total_tokens ?? 0)}</span>} icon={Zap} iconColor="text-accent-cyan" />
        <StatCard label="ROI"          value={<span className={blur}>{savings?.roi_multiplier ?? '—'}×</span>} sub="vs human work" icon={TrendingUp} iconColor="text-accent-green" />
      </div>

      {/* Budget bar */}
      <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-white">Monthly Budget</span>
          <span className={`text-sm font-bold ${blur} ${budgetPct > 90 ? 'text-accent-red' : budgetPct > 70 ? 'text-accent-amber' : 'text-accent-green'}`}>
            {formatCost(costs?.total_cost ?? 0)} / {formatCost(costs?.budget_usd ?? 50)}
          </span>
        </div>
        <div className="w-full bg-surface-4 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full transition-all duration-500 ${budgetPct > 90 ? 'bg-accent-red' : budgetPct > 70 ? 'bg-accent-amber' : 'bg-accent-green'}`}
            style={{ width: `${Math.min(budgetPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-1.5">{budgetPct}% of monthly budget — based on last {periodLabel}</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Daily area chart */}
        <div className="xl:col-span-2 bg-surface-2 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Spend over time</h2>
            <span className="text-xs text-slate-500">{periodLabel} view</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={dailyData}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => `$${v}`} width={48} />
              <Tooltip
                formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']}
                contentStyle={{ background: '#1f2433', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Area type="monotone" dataKey="cost" stroke="#f59e0b" fill="url(#costGrad)" dot={false} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Provider pie */}
        <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-white mb-3">By Provider</h2>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                {pieData.map((e, i) => (
                  <Cell key={i} fill={PROVIDER_COLORS[e.name] ?? '#6366f1'} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [`$${v.toFixed(6)}`, 'Cost']} contentStyle={{ background: '#1f2433', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-2">
            {costs?.by_provider?.map(p => (
              <div key={p.provider} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: PROVIDER_COLORS[p.provider] ?? '#6366f1' }} />
                  <ProviderBadge provider={p.provider} />
                </div>
                <div className="flex flex-col items-end">
                  <span className={`font-mono text-slate-300 ${blur}`}>{formatCost(p.cost)}</span>
                  <span className={`text-[10px] text-slate-500 ${blur}`}>{formatTokens(p.tokens)} tok</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Token bar chart */}
      <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-white mb-3">Daily Token Volume</h2>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={dailyData} barSize={days <= 3 ? 24 : days <= 7 ? 16 : 10}>
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={v => formatTokens(v)} width={48} />
            <Tooltip formatter={(v: number) => [formatTokens(v), 'Tokens']} contentStyle={{ background: '#1f2433', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }} />
            <Bar dataKey="tokens" fill="#22d3ee" radius={[3, 3, 0, 0]} opacity={0.8} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Model breakdown table */}
      <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Cost by Model</h2>
          <span className="text-xs text-slate-500">{periodLabel}</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2 text-left">Model</th>
              <th className="px-4 py-2 text-left">Provider</th>
              <th className="px-4 py-2 text-right">Requests</th>
              <th className="px-4 py-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {costs?.by_model?.map(m => (
              <tr key={m.model} className="hover:bg-white/2">
                <td className="px-4 py-2 font-mono text-xs text-slate-200">{m.model}</td>
                <td className="px-4 py-2"><ProviderBadge provider={m.provider} /></td>
                <td className="px-4 py-2 text-right text-slate-400">{m.requests?.toLocaleString()}</td>
                <td className={`px-4 py-2 text-right font-mono text-accent-amber ${blur}`}>{formatCost(m.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Savings */}
      {savings && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Human Time Saved"   value={`${Math.floor((savings.human_minutes_saved ?? 0) / 60)}h ${(savings.human_minutes_saved ?? 0) % 60}m`} icon={Clock}      iconColor="text-accent-green" />
          <StatCard label="Human Cost Avoided" value={<span className={blur}>{formatCost(savings.human_cost_usd)}</span>} icon={DollarSign} iconColor="text-accent-green" />
          <StatCard label="Net AI Spend"        value={<span className={blur}>{formatCost(savings.ai_cost_usd)}</span>}   icon={DollarSign} iconColor="text-accent-amber" />
        </div>
      )}
    </div>
  );
}
