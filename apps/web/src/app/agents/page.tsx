'use client';
import useSWR from 'swr';
import { get, patch } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { StatusBadge, ProviderBadge } from '@/components/ui/Badge';
import { formatCost, formatBytes, relativeTime, cn } from '@/lib/utils';
import {
  Bot, PlayCircle, Square, Zap, AlertTriangle,
  FolderOpen, FileText, File, Database, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Agent {
  id: string; name: string; type: string; model: string; provider: string;
  status: string; invocation_count: number; error_count: number;
  total_cost: number; avg_latency_ms: number; created_at: string;
}

interface OcFile {
  name: string; path: string; size_bytes: number; size_human: string;
  type: string; last_modified: string; label: string;
}
interface FileScanResult {
  files: OcFile[]; total_files: number; total_bytes: number; total_human: string;
  scanned_paths: string[];
}

const FILE_ICON: Record<string, typeof File> = {
  memory:   Bot,
  markdown: FileText,
  config:   Database,
  database: Database,
  log:      FileText,
  file:     File,
};

const FILE_COLOR: Record<string, string> = {
  memory:   'text-brand',
  markdown: 'text-accent-cyan',
  config:   'text-accent-amber',
  database: 'text-accent-purple',
  log:      'text-slate-400',
  file:     'text-slate-400',
};

export default function AgentsPage() {
  const { workspace, privacyBlurNums } = useAppStore();
  const blur = privacyBlurNums ? 'blur-sm select-none' : '';

  const { data: agents, mutate } = useSWR(
    `/agents?workspace=${workspace}`,
    (u: string) => get<Agent[]>(u),
    { refreshInterval: 10000 }
  );

  const { data: fileScan, mutate: refreshFiles, isLoading: filesLoading } = useSWR(
    `/files/openclaw`,
    (u: string) => get<FileScanResult>(u),
    { refreshInterval: 60000 }
  );

  const setStatus = async (id: string, status: string) => {
    await patch(`/agents/${id}/status`, { status });
    toast.success(`Agent ${status}`);
    mutate();
  };

  const running = agents?.filter(a => a.status === 'running').length ?? 0;
  const errors  = agents?.filter(a => a.status === 'error').length  ?? 0;

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Agent Orchestrator</h1>
          <p className="text-sm text-slate-500">Control all AI agents and inspect OpenClaw files on disk</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5 text-accent-green">
            <span className="w-2 h-2 rounded-full bg-accent-green shadow-[0_0_6px_#10b981]" />
            {running} running
          </span>
          {errors > 0 && (
            <span className="flex items-center gap-1.5 text-accent-red">
              <AlertTriangle className="w-3.5 h-3.5" />{errors} errors
            </span>
          )}
        </div>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents?.map(a => (
          <div key={a.id} className="bg-surface-2 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-brand/15 border border-brand/20 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-brand" />
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{a.name}</p>
                  <p className="text-xs text-slate-500 font-mono">{a.type}</p>
                </div>
              </div>
              <StatusBadge status={a.status} />
            </div>

            <div className="flex items-center gap-2 mb-3">
              <ProviderBadge provider={a.provider} />
              <span className="text-xs text-slate-500 font-mono truncate">{a.model}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div className="bg-surface-3 rounded-lg p-2">
                <p className="text-xs text-slate-500">Calls</p>
                <p className="text-sm font-bold text-white">{a.invocation_count.toLocaleString()}</p>
              </div>
              <div className="bg-surface-3 rounded-lg p-2">
                <p className="text-xs text-slate-500">Errors</p>
                <p className={`text-sm font-bold ${a.error_count > 0 ? 'text-accent-red' : 'text-white'}`}>{a.error_count}</p>
              </div>
              <div className="bg-surface-3 rounded-lg p-2">
                <p className="text-xs text-slate-500">Latency</p>
                <p className="text-sm font-bold text-white">{a.avg_latency_ms}ms</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className={cn('text-xs font-mono text-accent-amber', blur)}>{formatCost(a.total_cost)}</span>
              <div className="flex gap-1">
                {a.status !== 'running' ? (
                  <button onClick={() => setStatus(a.id, 'running')}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-accent-green/10 text-accent-green hover:bg-accent-green/20 transition-colors">
                    <PlayCircle className="w-3 h-3" /> Start
                  </button>
                ) : (
                  <button onClick={() => setStatus(a.id, 'stopped')}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-slate-700/50 text-slate-400 hover:bg-slate-700 transition-colors">
                    <Square className="w-3 h-3" /> Stop
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── OpenClaw Files on Disk ── */}
      <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-white">OpenClaw Files on Disk</h2>
            {fileScan && (
              <span className="text-xs text-slate-500">
                {fileScan.total_files} files · {fileScan.total_human} total
              </span>
            )}
          </div>
          <button
            onClick={() => refreshFiles()}
            className="p-1.5 rounded hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
            title="Refresh file list"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', filesLoading && 'animate-spin')} />
          </button>
        </div>

        {/* Scanned paths */}
        {fileScan?.scanned_paths && (
          <div className="px-4 py-2 border-b border-white/5 flex flex-wrap gap-2">
            {fileScan.scanned_paths.map(p => (
              <span key={p} className="text-[10px] font-mono text-slate-500 bg-surface-3 px-2 py-0.5 rounded">
                {p}
              </span>
            ))}
          </div>
        )}

        {fileScan?.files.length === 0 && (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No OpenClaw files found in standard paths.</p>
            <p className="text-xs text-slate-600 mt-1">Expected at ~/.claude/</p>
          </div>
        )}

        {(fileScan?.files.length ?? 0) > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-white/5">
                <th className="px-4 py-2 text-left">File</th>
                <th className="px-4 py-2 text-left">Location</th>
                <th className="px-4 py-2 text-left">Category</th>
                <th className="px-4 py-2 text-right">Size</th>
                <th className="px-4 py-2 text-left">Modified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {fileScan?.files.map((f, i) => {
                const Icon  = FILE_ICON[f.type]  ?? File;
                const color = FILE_COLOR[f.type] ?? 'text-slate-400';
                return (
                  <tr key={i} className="hover:bg-white/2 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className={cn('w-3.5 h-3.5 shrink-0', color)} />
                        <span className="font-mono text-xs text-slate-200">{f.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500 max-w-[220px] truncate">{f.path}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', color, 'bg-current/10')}>{f.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {/* Size bar + number */}
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-surface-4 rounded-full h-1 overflow-hidden">
                          <div
                            className="h-1 rounded-full bg-brand/60"
                            style={{
                              width: `${Math.min(100, (f.size_bytes / Math.max(...(fileScan?.files.map(x => x.size_bytes) ?? [1]))) * 100)}%`
                            }}
                          />
                        </div>
                        <span className="text-xs font-mono text-slate-300 w-16 text-right">{f.size_human}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{relativeTime(f.last_modified)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
