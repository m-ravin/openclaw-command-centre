'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { get, patch } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { StatusBadge, ProviderBadge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { formatCost, formatTokens, relativeTime, cn } from '@/lib/utils';
import {
  Activity, PlayCircle, Square, Trash2, Zap,
  ArrowUp, ArrowDown, MessageSquare, DollarSign, LayoutGrid, List,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Session {
  id: string; name: string; model: string; provider: string;
  status: string; input_tokens: number; output_tokens: number;
  total_cost: number; message_count: number; error_count: number;
  started_at: string; last_active: string;
}

// Mini inline token bar
function TokenBar({ input, output }: { input: number; output: number }) {
  const total = input + output || 1;
  const inPct  = Math.round((input  / total) * 100);
  const outPct = Math.round((output / total) * 100);
  return (
    <div className="flex flex-col gap-0.5 w-full">
      <div className="flex items-center gap-1.5 text-[10px]">
        <ArrowUp   className="w-2.5 h-2.5 text-brand shrink-0"        />
        <div className="flex-1 h-1.5 bg-surface-4 rounded-full overflow-hidden">
          <div className="h-full bg-brand/70 rounded-full" style={{ width: `${inPct}%` }} />
        </div>
        <span className="text-slate-400 w-10 text-right font-mono">{formatTokens(input)}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[10px]">
        <ArrowDown className="w-2.5 h-2.5 text-accent-cyan shrink-0"  />
        <div className="flex-1 h-1.5 bg-surface-4 rounded-full overflow-hidden">
          <div className="h-full bg-accent-cyan/70 rounded-full" style={{ width: `${outPct}%` }} />
        </div>
        <span className="text-slate-400 w-10 text-right font-mono">{formatTokens(output)}</span>
      </div>
    </div>
  );
}

// Card view for a single session
function SessionCard({ s, onAction, blur }: {
  s: Session;
  onAction: (id: string, action: string) => void;
  blur: string;
}) {
  const total = s.input_tokens + s.output_tokens;
  return (
    <div className="bg-surface-2 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-white text-sm leading-tight">{s.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{relativeTime(s.last_active)}</p>
        </div>
        <StatusBadge status={s.status} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <ProviderBadge provider={s.provider} />
        <span className="text-xs font-mono text-slate-500 truncate">{s.model}</span>
      </div>

      {/* Token breakdown — the star of the show */}
      <div className="bg-surface-3 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold flex items-center gap-1">
            <Zap className="w-3 h-3 text-accent-cyan" /> Token Usage
          </span>
          <span className={cn('text-xs font-mono font-bold text-accent-cyan', blur)}>
            {formatTokens(total)}
          </span>
        </div>
        <TokenBar input={s.input_tokens} output={s.output_tokens} />
        <div className="flex justify-between text-[10px] text-slate-600 mt-1">
          <span>▲ In: {formatTokens(s.input_tokens)}</span>
          <span>▼ Out: {formatTokens(s.output_tokens)}</span>
        </div>
      </div>

      {/* Cost + messages row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1 text-slate-400">
          <MessageSquare className="w-3 h-3" />
          <span>{s.message_count} msgs</span>
          {s.error_count > 0 && (
            <span className="text-accent-red ml-1">{s.error_count} err</span>
          )}
        </div>
        <span className={cn('font-mono font-bold text-accent-amber', blur)}>
          {formatCost(s.total_cost)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-1.5 pt-1 border-t border-white/5">
        {s.status === 'idle' && (
          <button onClick={() => onAction(s.id, 'active')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent-green/10 text-accent-green hover:bg-accent-green/20 transition-colors">
            <PlayCircle className="w-3 h-3" /> Resume
          </button>
        )}
        {s.status === 'active' && (
          <button onClick={() => onAction(s.id, 'paused')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 transition-colors">
            <Square className="w-3 h-3" /> Pause
          </button>
        )}
        {s.status !== 'terminated' && (
          <button onClick={() => onAction(s.id, 'terminated')}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent-red/10 text-accent-red hover:bg-accent-red/20 transition-colors ml-auto">
            <Trash2 className="w-3 h-3" /> Terminate
          </button>
        )}
      </div>
    </div>
  );
}

export default function SessionsPage() {
  const { workspace, privacyBlurNums } = useAppStore();
  const blur = privacyBlurNums ? 'blur-sm select-none' : '';
  const [statusFilter, setStatusFilter] = useState('');
  const [view, setView] = useState<'cards' | 'table'>('cards');

  const { data, mutate, isLoading } = useSWR(
    `/sessions?workspace=${workspace}&limit=100${statusFilter ? `&status=${statusFilter}` : ''}`,
    (u: string) => get<{ sessions: Session[]; total: number }>(u),
    { refreshInterval: 10000 }
  );
  const { data: summary } = useSWR(
    `/sessions/stats/summary?workspace=${workspace}`,
    (u: string) => get<{
      counts: { status: string; n: number }[];
      total_cost: number; total_tokens: number; total_messages: number;
    }>(u),
    { refreshInterval: 10000 }
  );

  const counts  = summary?.counts ?? [];
  const active  = counts.find(c => c.status === 'active')?.n ?? 0;
  const idle    = counts.find(c => c.status === 'idle')?.n   ?? 0;
  const errors  = counts.find(c => c.status === 'error')?.n  ?? 0;

  const setStatus = async (id: string, status: string) => {
    await patch(`/sessions/${id}/status`, { status });
    toast.success(`Session ${status}`);
    mutate();
  };

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Sessions</h1>
          <p className="text-sm text-slate-500">Monitor token usage and control all OpenClaw chat sessions</p>
        </div>
        {/* View toggle */}
        <div className="flex items-center bg-surface-2 border border-white/5 rounded-lg p-1 gap-0.5">
          <button onClick={() => setView('cards')}
            className={cn('p-1.5 rounded transition-colors', view === 'cards' ? 'bg-brand/20 text-brand' : 'text-slate-500 hover:text-white')}>
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setView('table')}
            className={cn('p-1.5 rounded transition-colors', view === 'table' ? 'bg-brand/20 text-brand' : 'text-slate-500 hover:text-white')}>
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI row — includes aggregate token totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        <StatCard label="Active"    value={active}   icon={Activity}       iconColor="text-accent-green" />
        <StatCard label="Idle"      value={idle}      icon={Activity}       iconColor="text-yellow-400"  />
        <StatCard label="Errors"    value={errors}    icon={Activity}       iconColor="text-accent-red"  />
        <StatCard label="Total"     value={data?.total ?? 0} icon={Activity} iconColor="text-brand"     />
        <StatCard
          label="Total Tokens"
          value={<span className={blur}>{formatTokens(summary?.total_tokens ?? 0)}</span>}
          icon={Zap}
          iconColor="text-accent-cyan"
        />
        <StatCard
          label="Total Cost"
          value={<span className={blur}>{formatCost(summary?.total_cost ?? 0)}</span>}
          icon={DollarSign}
          iconColor="text-accent-amber"
        />
      </div>

      {/* Token legend */}
      <div className="flex items-center gap-4 text-xs text-slate-500 px-1">
        <span className="flex items-center gap-1.5"><ArrowUp className="w-3 h-3 text-brand" /> Input tokens (prompt)</span>
        <span className="flex items-center gap-1.5"><ArrowDown className="w-3 h-3 text-accent-cyan" /> Output tokens (response)</span>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 flex-wrap">
        {['', 'active', 'idle', 'error', 'terminated'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
              statusFilter === s
                ? 'bg-brand/15 text-brand border-brand/30'
                : 'text-slate-400 border-white/5 hover:border-white/10 hover:text-white'
            )}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* ── Card view ── */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {isLoading && (
            <div className="col-span-3 text-center py-8 text-slate-500">Loading…</div>
          )}
          {data?.sessions?.map(s => (
            <SessionCard key={s.id} s={s} onAction={setStatus} blur={blur} />
          ))}
        </div>
      )}

      {/* ── Table view ── */}
      {view === 'table' && (
        <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Provider / Model</th>
                  <th className="px-4 py-3 text-right">↑ Input Tok</th>
                  <th className="px-4 py-3 text-right">↓ Output Tok</th>
                  <th className="px-4 py-3 text-right">Total Tok</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3 text-right">Msgs</th>
                  <th className="px-4 py-3 text-left">Last Active</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {isLoading && (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                )}
                {data?.sessions?.map(s => (
                  <tr key={s.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-200">{s.name}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <ProviderBadge provider={s.provider} />
                        <span className="text-slate-400 font-mono text-xs truncate max-w-[100px]">{s.model}</span>
                      </div>
                    </td>
                    {/* Input tokens with up arrow */}
                    <td className={cn('px-4 py-3 text-right font-mono text-xs', blur)}>
                      <span className="flex items-center justify-end gap-1 text-brand">
                        <ArrowUp className="w-2.5 h-2.5" />{formatTokens(s.input_tokens)}
                      </span>
                    </td>
                    {/* Output tokens with down arrow */}
                    <td className={cn('px-4 py-3 text-right font-mono text-xs', blur)}>
                      <span className="flex items-center justify-end gap-1 text-accent-cyan">
                        <ArrowDown className="w-2.5 h-2.5" />{formatTokens(s.output_tokens)}
                      </span>
                    </td>
                    {/* Total bold */}
                    <td className={cn('px-4 py-3 text-right font-mono text-xs font-bold text-white', blur)}>
                      {formatTokens(s.input_tokens + s.output_tokens)}
                    </td>
                    <td className={cn('px-4 py-3 text-right font-mono text-xs text-accent-amber', blur)}>
                      {formatCost(s.total_cost)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{s.message_count}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{relativeTime(s.last_active)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {s.status === 'idle' && (
                          <button onClick={() => setStatus(s.id, 'active')}
                            className="p-1.5 rounded hover:bg-accent-green/10 text-slate-500 hover:text-accent-green transition-colors">
                            <PlayCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {s.status === 'active' && (
                          <button onClick={() => setStatus(s.id, 'paused')}
                            className="p-1.5 rounded hover:bg-yellow-400/10 text-slate-500 hover:text-yellow-400 transition-colors">
                            <Square className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {s.status !== 'terminated' && (
                          <button onClick={() => setStatus(s.id, 'terminated')}
                            className="p-1.5 rounded hover:bg-accent-red/10 text-slate-500 hover:text-accent-red transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
