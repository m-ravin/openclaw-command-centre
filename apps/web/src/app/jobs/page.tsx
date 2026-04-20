'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { get, post, patch } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { formatCost, formatTokens, relativeTime, cn } from '@/lib/utils';
import { Clock, Play, ToggleLeft, ToggleRight, Plus, Zap, Bot, LayoutGrid, List } from 'lucide-react';
import { ProviderBadge } from '@/components/ui/Badge';
import toast from 'react-hot-toast';

interface JobRun {
  input_tokens: number;
  output_tokens: number;
  cost: number;
  model: string;
  status: string;
}

interface KanbanJob {
  id: string; name: string; type: string; schedule: string; description: string;
  enabled: number; last_status: string; last_run_at: string; last_duration_ms: number;
  run_count: number; error_count: number; total_tokens: number; last_model: string;
  agent_id: string; agent_name: string | null; agent_model: string | null;
  last_run: JobRun | null;
}

interface Job {
  id: string; name: string; type: string; schedule: string;
  enabled: number; last_status: string; last_run_at: string;
  run_count: number; error_count: number; last_duration_ms: number;
  total_tokens: number; last_model: string;
}

const STATUS_COLORS: Record<string, string> = {
  success: 'text-accent-green bg-accent-green/10 border-accent-green/20',
  error:   'text-accent-red   bg-accent-red/10   border-accent-red/20',
  running: 'text-accent-cyan  bg-accent-cyan/10  border-accent-cyan/20',
  pending: 'text-accent-amber bg-accent-amber/10 border-accent-amber/20',
};

const COLUMN_META = {
  running:  { title: 'Running',   color: 'border-accent-cyan/40',  dot: 'bg-accent-cyan  shadow-[0_0_6px_#22d3ee]' },
  pending:  { title: 'Scheduled', color: 'border-accent-amber/40', dot: 'bg-accent-amber' },
  finished: { title: 'Finished',  color: 'border-white/10',        dot: 'bg-slate-500' },
};

function JobCard({ job, onRun, onToggle, blur }: {
  job: KanbanJob; onRun: () => void; onToggle: () => void; blur: string;
}) {
  const tokens = job.last_run
    ? job.last_run.input_tokens + job.last_run.output_tokens
    : 0;
  const model  = job.last_run?.model ?? job.last_model ?? job.agent_model;
  const cost   = job.last_run?.cost ?? 0;

  return (
    <div className={cn(
      'bg-surface-3 border rounded-xl p-3.5 space-y-3 hover:border-white/10 transition-colors',
      job.last_status === 'error' ? 'border-accent-red/20' : 'border-white/5'
    )}>
      {/* Title row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white leading-tight">{job.name}</p>
          {job.schedule && (
            <p className="text-[10px] font-mono text-slate-500 mt-0.5">{job.schedule}</p>
          )}
        </div>
        {job.last_status && (
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-semibold shrink-0', STATUS_COLORS[job.last_status] ?? 'text-slate-400 border-white/5')}>
            {job.last_status}
          </span>
        )}
      </div>

      {/* Agent badge */}
      {job.agent_name && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Bot className="w-3 h-3 text-brand" />
          <span>{job.agent_name}</span>
        </div>
      )}

      {/* Model */}
      {model && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-500">Model:</span>
          <span className="text-[10px] font-mono text-brand bg-brand/10 px-1.5 py-0.5 rounded">{model}</span>
        </div>
      )}

      {/* Token stats */}
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="bg-surface-4 rounded-lg py-1.5">
          <p className="text-[10px] text-slate-500">Tokens</p>
          <p className={cn('text-xs font-bold text-accent-cyan', blur)}>{formatTokens(tokens || job.total_tokens)}</p>
        </div>
        <div className="bg-surface-4 rounded-lg py-1.5">
          <p className="text-[10px] text-slate-500">Runs</p>
          <p className="text-xs font-bold text-white">{job.run_count}</p>
        </div>
        <div className="bg-surface-4 rounded-lg py-1.5">
          <p className="text-[10px] text-slate-500">Cost</p>
          <p className={cn('text-xs font-bold text-accent-amber', blur)}>{formatCost(cost)}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className="text-[10px] text-slate-600">{relativeTime(job.last_run_at)}</span>
        <div className="flex items-center gap-1">
          <button onClick={onRun}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-brand/10 text-brand hover:bg-brand/20 transition-colors">
            <Play className="w-2.5 h-2.5" /> Run
          </button>
          <button onClick={onToggle}
            className="p-1 rounded hover:bg-white/5 transition-colors">
            {job.enabled
              ? <ToggleRight className="w-4 h-4 text-accent-green" />
              : <ToggleLeft  className="w-4 h-4 text-slate-500"   />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const { workspace, privacyBlurNums } = useAppStore();
  const blur = privacyBlurNums ? 'blur-sm select-none' : '';
  const [view, setView]     = useState<'kanban' | 'list'>('kanban');
  const [showAdd, setShowAdd] = useState(false);
  const [newJob, setNewJob]  = useState({ name: '', schedule: '0 * * * *', command: '', description: '' });

  const { data: kanban, mutate: mutateKanban } = useSWR(
    `/jobs/kanban?workspace=${workspace}`,
    (u: string) => get<{ running: KanbanJob[]; pending: KanbanJob[]; finished: KanbanJob[] }>(u),
    { refreshInterval: 10000 }
  );
  const { data: jobs, mutate: mutateList } = useSWR(
    view === 'list' ? `/jobs?workspace=${workspace}` : null,
    (u: string) => get<Job[]>(u),
    { refreshInterval: 15000 }
  );

  const refresh = () => { mutateKanban(); mutateList(); };

  const runNow = async (id: string) => {
    await post(`/jobs/${id}/run`);
    toast.success('Job triggered');
    setTimeout(refresh, 1500);
  };
  const toggle = async (id: string) => {
    await patch(`/jobs/${id}/toggle`);
    refresh();
  };
  const addJob = async () => {
    if (!newJob.name) { toast.error('Name required'); return; }
    await post('/jobs', { ...newJob, workspace_id: workspace });
    toast.success('Job created');
    setShowAdd(false);
    setNewJob({ name: '', schedule: '0 * * * *', command: '', description: '' });
    refresh();
  };

  const columns: Array<{ key: keyof typeof kanban; items: KanbanJob[] }> = kanban
    ? ([
        { key: 'running',  items: kanban.running  },
        { key: 'pending',  items: kanban.pending  },
        { key: 'finished', items: kanban.finished },
      ] as Array<{ key: keyof typeof kanban; items: KanbanJob[] }>)
    : [];

  // Aggregate totals
  const allJobs = [...(kanban?.running ?? []), ...(kanban?.pending ?? []), ...(kanban?.finished ?? [])];
  const totalTokens = allJobs.reduce((s, j) => s + (j.total_tokens ?? 0), 0);
  const totalRuns   = allJobs.reduce((s, j) => s + (j.run_count   ?? 0), 0);
  const totalErrors = allJobs.reduce((s, j) => s + (j.error_count ?? 0), 0);

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Scheduled Jobs</h1>
          <p className="text-sm text-slate-500">Cron jobs, automation flows, and their token budgets</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-surface-2 border border-white/5 rounded-lg p-1 gap-0.5">
            <button onClick={() => setView('kanban')}
              className={cn('p-1.5 rounded transition-colors', view === 'kanban' ? 'bg-brand/20 text-brand' : 'text-slate-500 hover:text-white')}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView('list')}
              className={cn('p-1.5 rounded transition-colors', view === 'list' ? 'bg-brand/20 text-brand' : 'text-slate-500 hover:text-white')}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand/15 border border-brand/30 text-brand text-sm hover:bg-brand/25 transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Job
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
        {[
          { label: 'Running',  value: kanban?.running.length  ?? 0, color: 'text-accent-cyan'  },
          { label: 'Scheduled',value: kanban?.pending.length  ?? 0, color: 'text-accent-amber' },
          { label: 'Finished', value: kanban?.finished.length ?? 0, color: 'text-slate-400'    },
          { label: 'Total Tokens', value: <span className={blur}>{formatTokens(totalTokens)}</span>, color: 'text-brand' },
          { label: 'Error Runs',   value: totalErrors, color: totalErrors > 0 ? 'text-accent-red' : 'text-white' },
        ].map(s => (
          <div key={s.label} className="bg-surface-2 border border-white/5 rounded-xl px-4 py-3">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">{s.label}</p>
            <p className={cn('text-xl font-bold mt-0.5', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Add job form */}
      {showAdd && (
        <div className="bg-surface-2 border border-white/10 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Create Job</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { val: newJob.name,        key: 'name',        ph: 'Job name *' },
              { val: newJob.schedule,    key: 'schedule',    ph: 'Cron (e.g. 0 * * * *)' },
              { val: newJob.command,     key: 'command',     ph: 'Shell command (optional)' },
              { val: newJob.description, key: 'description', ph: 'Description' },
            ].map(f => (
              <input key={f.key} value={f.val}
                onChange={e => setNewJob(j => ({ ...j, [f.key]: e.target.value }))}
                placeholder={f.ph}
                className="bg-surface-3 border border-white/5 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-brand/40 font-mono" />
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button onClick={addJob} className="px-4 py-2 text-sm bg-brand/20 text-brand border border-brand/30 rounded-lg hover:bg-brand/30 transition-colors">Create</button>
          </div>
        </div>
      )}

      {/* ── Kanban board ── */}
      {view === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columns.map(({ key, items }) => {
            const meta = COLUMN_META[key as keyof typeof COLUMN_META];
            return (
              <div key={key} className={cn('bg-surface-2 border rounded-xl overflow-hidden', meta.color)}>
                {/* Column header */}
                <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
                  <span className={cn('w-2 h-2 rounded-full', meta.dot)} />
                  <span className="text-sm font-semibold text-white">{meta.title}</span>
                  <span className="ml-auto text-xs text-slate-500 bg-surface-3 px-2 py-0.5 rounded-full">
                    {items.length}
                  </span>
                </div>
                {/* Cards */}
                <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
                  {items.length === 0 && (
                    <p className="text-xs text-slate-600 text-center py-6">No jobs</p>
                  )}
                  {items.map(job => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onRun={() => runNow(job.id)}
                      onToggle={() => toggle(job.id)}
                      blur={blur}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── List view ── */}
      {view === 'list' && (
        <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-xs text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Schedule</th>
                <th className="px-4 py-3 text-left">Model</th>
                <th className="px-4 py-3 text-right">Tokens</th>
                <th className="px-4 py-3 text-right">Runs</th>
                <th className="px-4 py-3 text-left">Last Status</th>
                <th className="px-4 py-3 text-left">Last Run</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {jobs?.map(job => (
                <tr key={job.id} className={cn('hover:bg-white/2 transition-colors', !job.enabled && 'opacity-50')}>
                  <td className="px-4 py-3 font-medium text-white">{job.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{job.schedule}</td>
                  <td className="px-4 py-3">
                    {job.last_model
                      ? <span className="text-xs font-mono text-brand bg-brand/10 px-1.5 py-0.5 rounded">{job.last_model}</span>
                      : <span className="text-slate-600">—</span>}
                  </td>
                  <td className={cn('px-4 py-3 text-right text-accent-cyan text-xs font-mono', blur)}>
                    <span className="flex items-center justify-end gap-1">
                      <Zap className="w-3 h-3" />{formatTokens(job.total_tokens ?? 0)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">{job.run_count}</td>
                  <td className="px-4 py-3">
                    {job.last_status && (
                      <span className={cn('text-xs px-2 py-0.5 rounded border font-medium', STATUS_COLORS[job.last_status] ?? 'text-slate-400 border-white/5')}>
                        {job.last_status}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{relativeTime(job.last_run_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => runNow(job.id)} className="p-1.5 rounded hover:bg-brand/10 text-slate-500 hover:text-brand transition-colors">
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggle(job.id)} className="p-1 rounded hover:bg-white/5">
                        {job.enabled
                          ? <ToggleRight className="w-4 h-4 text-accent-green" />
                          : <ToggleLeft  className="w-4 h-4 text-slate-500" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
