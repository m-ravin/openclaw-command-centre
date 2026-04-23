'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { get } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { SeverityBadge } from '@/components/ui/Badge';
import { absTime, cn } from '@/lib/utils';
import { Search, Filter, Download } from 'lucide-react';

interface LogEntry {
  id: string; level: string; source: string; message: string;
  data: string; session_id: string; agent_id: string; logged_at: string;
}

const LEVEL_BG: Record<string, string> = {
  debug: 'text-slate-400',
  info:  'text-slate-200',
  warn:  'text-accent-amber',
  error: 'text-accent-red',
  fatal: 'text-accent-rose font-semibold',
};

// Static level filter config — always shown regardless of DB data
const LEVELS = [
  { value: '',      label: 'All',   dot: 'bg-slate-500'      },
  { value: 'debug', label: 'Debug', dot: 'bg-slate-400'      },
  { value: 'info',  label: 'Info',  dot: 'bg-brand'          },
  { value: 'warn',  label: 'Warn',  dot: 'bg-accent-amber'   },
  { value: 'error', label: 'Error', dot: 'bg-accent-red'     },
];

export default function LogsPage() {
  const { workspace } = useAppStore();
  const [q, setQ]           = useState('');
  const [level, setLevel]   = useState('');
  const [source, setSource] = useState('');
  const [page, setPage]     = useState(0);
  const limit = 100;

  const query = new URLSearchParams({
    workspace, limit: String(limit), offset: String(page * limit),
    ...(q      ? { q }      : {}),
    ...(level  ? { level }  : {}),
    ...(source ? { source } : {}),
  }).toString();

  const { data } = useSWR(
    `/logs?${query}`,
    (u: string) => get<{ logs: LogEntry[]; total: number }>(u),
    { refreshInterval: 5000 }
  );
  const { data: sources } = useSWR(
    `/logs/sources?workspace=${workspace}`,
    (u: string) => get<{ source: string; n: number }[]>(u)
  );
  const { data: stats } = useSWR(
    `/logs/stats?workspace=${workspace}`,
    (u: string) => get<{ by_level: { level: string; n: number }[] }>(u),
    { refreshInterval: 30000 }
  );

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(data?.logs ?? [], null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `logs-${Date.now()}.json`; a.click();
  };

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Log Explorer</h1>
          <p className="text-sm text-slate-500">Full-text search across all structured logs</p>
        </div>
        <button onClick={exportLogs}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-3 border border-white/5
                     text-slate-400 hover:text-white text-sm transition-colors">
          <Download className="w-3.5 h-3.5" /> Export
        </button>
      </div>

      {/* ── Level filter bar — always visible ── */}
      <div className="bg-surface-2 border border-white/5 rounded-xl p-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 font-medium mr-1 shrink-0">Level:</span>
        {LEVELS.map(l => {
          // Count from stats (DB) if available; gateway logs don't have pre-counts
          const count = l.value
            ? (stats?.by_level?.find(s => s.level === l.value)?.n ?? null)
            : null;
          const active = level === l.value;
          return (
            <button
              key={l.value}
              onClick={() => { setLevel(l.value); setPage(0); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                active
                  ? 'bg-brand/15 text-brand border-brand/30 shadow-sm'
                  : 'border-white/5 text-slate-400 hover:text-white hover:border-white/15'
              )}>
              <span className={cn('w-2 h-2 rounded-full shrink-0', l.dot)} />
              {l.label}
              {count !== null && (
                <span className={cn('opacity-60 font-mono', active ? 'text-brand' : '')}>{count}</span>
              )}
            </button>
          );
        })}

        {/* Search box inline with level filter */}
        <div className="flex-1 min-w-[180px] relative ml-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <input
            value={q} onChange={e => { setQ(e.target.value); setPage(0); }}
            placeholder="Search messages…"
            className="w-full bg-surface-3 border border-white/5 rounded-lg pl-8 pr-3 py-1.5 text-xs
                       text-slate-300 focus:outline-none focus:border-brand/40 transition-colors"
          />
        </div>

        {/* Source dropdown */}
        <select value={source} onChange={e => setSource(e.target.value)}
          className="bg-surface-3 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-slate-300
                     focus:outline-none focus:border-brand/40 transition-colors">
          <option value="">All sources</option>
          {sources?.map(s => <option key={s.source} value={s.source}>{s.source} ({s.n})</option>)}
        </select>
      </div>

      {/* Log stream */}
      <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden font-mono text-xs">
        <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2 text-slate-500">
          <Filter className="w-3 h-3" />
          <span>{data?.total?.toLocaleString() ?? 0} entries</span>
        </div>
        <div className="overflow-auto max-h-[600px]">
          {data?.logs?.map(log => (
            <div key={log.id} className={cn(
              'flex items-start gap-3 px-4 py-1.5 border-b border-white/3 hover:bg-white/2 transition-colors',
              LEVEL_BG[log.level]
            )}>
              <span className="text-slate-600 shrink-0 w-32">{absTime(log.logged_at)}</span>
              <span className={cn('shrink-0 w-12 font-semibold uppercase text-[10px]', LEVEL_BG[log.level])}>
                {log.level}
              </span>
              <span className="shrink-0 w-20 text-slate-500 truncate">{log.source}</span>
              <span className="flex-1 break-all leading-relaxed">{log.message}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{(page * limit) + 1}–{Math.min((page + 1) * limit, data?.total ?? 0)} of {data?.total?.toLocaleString()} entries</span>
        <div className="flex gap-2">
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1 rounded bg-surface-3 disabled:opacity-40 hover:bg-surface-4 transition-colors">
            ← Prev
          </button>
          <button disabled={(page + 1) * limit >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1 rounded bg-surface-3 disabled:opacity-40 hover:bg-surface-4 transition-colors">
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
