'use client';
import useSWR from 'swr';
import { get, post } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { StatCard } from '@/components/ui/StatCard';
import { SystemGauge } from '@/components/dashboard/SystemGauge';
import { InsightCard } from '@/components/dashboard/InsightCard';
import { StatusBadge, SeverityBadge } from '@/components/ui/Badge';
import { formatCost, formatTokens, relativeTime } from '@/lib/utils';
import {
  Activity, Bot, DollarSign, AlertTriangle,
  Clock, Cpu, Zap, TrendingUp, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import { useState } from 'react';
import toast from 'react-hot-toast';

export default function DashboardPage() {
  const { workspace, privacyBlurNums } = useAppStore();
  const blur = privacyBlurNums ? 'blur-sm select-none' : '';

  const { data: sessionSummary } = useSWR(
    `/sessions/stats/summary?workspace=${workspace}`,
    (u: string) => get<{ counts: { status: string; n: number }[]; total_cost: number; total_tokens: number }>(u),
    { refreshInterval: 10000 }
  );
  const { data: costs } = useSWR(
    `/costs/summary?workspace=${workspace}&days=30`,
    (u: string) => get<{
      total_cost: number; today_cost: number; budget_usd: number;
      by_provider: { provider: string; cost: number }[];
      daily: { date: string; cost: number; tokens: number }[];
    }>(u),
    { refreshInterval: 60000 }
  );
  const { data: system } = useSWR(
    `/system/metrics`,
    (u: string) => get<{ cpu_pct: number; mem_pct: number; disk_pct: number; mem_used_mb: number; mem_total_mb: number }>(u),
    { refreshInterval: 10000 }
  );
  const { data: alerts, mutate: refreshAlerts } = useSWR(
    `/alerts?workspace=${workspace}&resolved=false&limit=5`,
    (u: string) => get<{ id: string; title: string; severity: string; message: string; created_at: string }[]>(u),
    { refreshInterval: 15000 }
  );
  const { data: insights, mutate: refreshInsights } = useSWR(
    `/insights?workspace=${workspace}`,
    (u: string) => get<{ id: string; title: string; body: string; severity: string; category: string }[]>(u),
    { refreshInterval: 60000 }
  );
  const { data: savings } = useSWR(
    `/costs/savings?workspace=${workspace}`,
    (u: string) => get<{ human_cost_usd: number; ai_cost_usd: number; roi_multiplier: number; human_minutes_saved: number }>(u)
  );
  const { data: recentSessions } = useSWR(
    `/sessions?workspace=${workspace}&limit=6`,
    (u: string) => get<{ sessions: { id: string; name: string; status: string; model: string; last_active: string; total_cost: number }[] }>(u),
    { refreshInterval: 15000 }
  );
  const { data: sysHistory } = useSWR(
    `/system/metrics/history?minutes=60`,
    (u: string) => get<{ cpu_pct: number; mem_pct: number; recorded_at: string }[]>(u),
    { refreshInterval: 30000 }
  );

  const activeSessions = sessionSummary?.counts?.find(c => c.status === 'active')?.n ?? 0;
  const errorSessions  = sessionSummary?.counts?.find(c => c.status === 'error')?.n  ?? 0;
  const budgetPct = costs ? Math.round((costs.today_cost / costs.budget_usd) * 100 * 30) : 0;

  const [generatingInsights, setGeneratingInsights] = useState(false);
  const generateInsights = async () => {
    setGeneratingInsights(true);
    try {
      const r = await post<{ count: number }>(`/insights/generate`, { workspace_id: workspace });
      toast.success(`Generated ${r.count} new insights`);
      refreshInsights();
    } catch {
      toast.error('Failed to generate insights');
    } finally {
      setGeneratingInsights(false);
    }
  };

  // Chart data
  const chartData = sysHistory?.slice(-30).map(d => ({
    time: new Date(d.recorded_at).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }),
    cpu: d.cpu_pct,
    mem: d.mem_pct,
  })) ?? [];

  const costChartData = costs?.daily?.slice(-14).map(d => ({
    date: d.date.slice(5),
    cost: parseFloat(d.cost?.toFixed(4) ?? '0'),
  })) ?? [];

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Mission Control</h1>
          <p className="text-sm text-slate-500 mt-0.5">Real-time overview of all AI agent operations</p>
        </div>
        <button
          onClick={generateInsights}
          disabled={generatingInsights}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand/15 border border-brand/30
                     text-brand text-sm hover:bg-brand/25 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${generatingInsights ? 'animate-spin' : ''}`} />
          Refresh Insights
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        <StatCard
          label="Active Agents"
          value={activeSessions}
          icon={Activity}
          iconColor="text-accent-green"
          glow
        />
        <StatCard
          label="Spend Today"
          value={<span className={blur}>{formatCost(costs?.today_cost ?? 0)}</span>}
          sub={`Budget ${budgetPct}% used`}
          icon={DollarSign}
          iconColor="text-accent-amber"
        />
        <StatCard
          label="CPU Load"
          value={`${system?.cpu_pct?.toFixed(1) ?? '—'}%`}
          icon={Cpu}
          iconColor={system?.cpu_pct && system.cpu_pct > 80 ? 'text-accent-red' : 'text-brand'}
        />
        <StatCard
          label="Open Alerts"
          value={alerts?.length ?? 0}
          icon={AlertTriangle}
          iconColor={errorSessions > 0 ? 'text-accent-red' : 'text-accent-amber'}
        />
        <StatCard
          label="Monthly Tokens"
          value={<span className={blur}>{formatTokens(sessionSummary?.total_tokens ?? 0)}</span>}
          icon={Zap}
          iconColor="text-accent-cyan"
        />
        <StatCard
          label="ROI"
          value={<span className={blur}>{savings?.roi_multiplier ?? '—'}×</span>}
          sub="AI vs human cost"
          icon={TrendingUp}
          iconColor="text-accent-green"
        />
      </div>

      {/* Middle row: system gauges + AI insights */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* System health */}
        <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-white">System Health</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <SystemGauge label="CPU"  value={system?.cpu_pct ?? 0}  sub={`${system?.cpu_pct?.toFixed(1) ?? 0}%`} />
            <SystemGauge label="RAM"  value={system?.mem_pct ?? 0}  sub={`${Math.round((system?.mem_used_mb ?? 0) / 1024)}/${Math.round((system?.mem_total_mb ?? 0) / 1024)} GB`} />
            <SystemGauge label="Disk" value={system?.disk_pct ?? 0} color="#6366f1" />
          </div>
        </div>

        {/* System chart */}
        <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-white mb-3">CPU / RAM (60 min)</h2>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22d3ee" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 100]} width={28} />
              <Tooltip contentStyle={{ background: '#1f2433', border: '1px solid rgba(255,255,255,0.08)' }} />
              <Area type="monotone" dataKey="cpu" stroke="#6366f1" fill="url(#cpuGrad)" dot={false} name="CPU %" />
              <Area type="monotone" dataKey="mem" stroke="#22d3ee" fill="url(#memGrad)" dot={false} name="RAM %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* AI Insights */}
        <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-brand" />
              <h2 className="text-sm font-semibold text-white">AI Insights</h2>
            </div>
            <span className="text-xs text-slate-500">{insights?.length ?? 0} active</span>
          </div>
          <div className="space-y-2 max-h-[160px] overflow-y-auto">
            {insights?.length ? insights.slice(0, 4).map(ins => (
              <InsightCard key={ins.id} insight={ins} onDismiss={() => refreshInsights()} />
            )) : (
              <p className="text-xs text-slate-600 py-4 text-center">No insights — click Refresh Insights</p>
            )}
          </div>
        </div>
      </div>

      {/* Cost chart + recent sessions */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Daily cost */}
        <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Daily Cost (14 days)</h2>
            <span className={`text-sm font-bold text-accent-amber ${blur}`}>
              {formatCost(costs?.total_cost ?? 0)} total
            </span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={costChartData} barSize={16}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={40} tickFormatter={v => `$${v}`} />
              <Tooltip formatter={(v: number) => [`$${v.toFixed(4)}`, 'Cost']} contentStyle={{ background: '#1f2433', border: '1px solid rgba(255,255,255,0.08)' }} />
              <Bar dataKey="cost" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent sessions */}
        <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-white">Recent Sessions</h2>
            <a href="/sessions" className="text-xs text-brand hover:underline">View all →</a>
          </div>
          <div className="space-y-2">
            {recentSessions?.sessions?.map(s => (
              <div key={s.id} className="flex items-center gap-3 py-1.5 border-b border-white/5 last:border-0">
                <StatusBadge status={s.status} />
                <span className="flex-1 text-sm text-slate-200 truncate">{s.name}</span>
                <span className="text-xs text-slate-500 font-mono">{s.model?.split('-').slice(-1)[0]}</span>
                <span className={`text-xs font-medium text-accent-amber ${blur}`}>{formatCost(s.total_cost)}</span>
                <span className="text-xs text-slate-600">{relativeTime(s.last_active)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts strip */}
      {(alerts?.length ?? 0) > 0 && (
        <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-accent-red" />
            <h2 className="text-sm font-semibold text-white">Active Alerts</h2>
            <a href="/security" className="ml-auto text-xs text-brand hover:underline">Manage →</a>
          </div>
          <div className="space-y-2">
            {alerts?.slice(0, 4).map(a => (
              <div key={a.id} className="flex items-center gap-3 text-sm">
                <SeverityBadge severity={a.severity} />
                <span className="font-medium text-slate-200">{a.title}</span>
                <span className="text-slate-500 text-xs flex-1 truncate">{a.message}</span>
                <span className="text-xs text-slate-600 shrink-0">{relativeTime(a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
