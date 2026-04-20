'use client';
import useSWR from 'swr';
import { get, post } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { relativeTime } from '@/lib/utils';
import { Database, RefreshCw, AlertTriangle, CheckCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

interface KbSource {
  id: string; name: string; type: string; path: string;
  status: string; doc_count: number; chunk_count: number;
  embedding_count: number; failed_count: number; size_mb: number;
  last_synced: string; error_msg: string;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  healthy: <CheckCircle className="w-4 h-4 text-accent-green" />,
  error:   <AlertTriangle className="w-4 h-4 text-accent-red" />,
  syncing: <Loader className="w-4 h-4 text-accent-cyan animate-spin" />,
  stale:   <AlertTriangle className="w-4 h-4 text-accent-amber" />,
};

export default function KnowledgePage() {
  const { workspace } = useAppStore();

  const { data: sources, mutate } = useSWR(
    `/kb?workspace=${workspace}`,
    (u: string) => get<KbSource[]>(u),
    { refreshInterval: 30000 }
  );

  const sync = async (id: string) => {
    toast.loading('Syncing…', { id: 'sync' });
    try {
      await post(`/kb/${id}/sync`);
      toast.success('Sync triggered', { id: 'sync' });
      mutate();
    } catch {
      toast.error('Sync failed', { id: 'sync' });
    }
  };

  return (
    <div className="space-y-6 max-w-[1100px]">
      <div>
        <h1 className="text-xl font-bold text-white">Knowledge Base Health</h1>
        <p className="text-sm text-slate-500">Vector DB sources, sync status, and embedding health</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sources?.map(src => (
          <div key={src.id} className={`bg-surface-2 border rounded-xl p-4 ${src.status === 'error' ? 'border-accent-red/30' : src.status === 'stale' ? 'border-accent-amber/30' : 'border-white/5'}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-surface-3 flex items-center justify-center">
                  <Database className="w-4 h-4 text-brand" />
                </div>
                <div>
                  <p className="font-medium text-white text-sm">{src.name}</p>
                  <p className="text-[10px] text-slate-500 uppercase">{src.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {STATUS_ICON[src.status]}
                <span className="text-xs text-slate-400 capitalize">{src.status}</span>
              </div>
            </div>

            {src.path && <p className="text-xs font-mono text-slate-500 mb-3 truncate">{src.path}</p>}

            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              {[
                { label: 'Docs',       value: src.doc_count },
                { label: 'Chunks',     value: src.chunk_count },
                { label: 'Failed',     value: src.failed_count, bad: true },
              ].map(m => (
                <div key={m.label} className="bg-surface-3 rounded-lg py-2">
                  <p className="text-xs text-slate-500">{m.label}</p>
                  <p className={`text-sm font-bold ${m.bad && m.value > 0 ? 'text-accent-red' : 'text-white'}`}>{m.value}</p>
                </div>
              ))}
            </div>

            {src.error_msg && (
              <p className="text-xs text-accent-red mb-2 bg-accent-red/10 rounded p-2">{src.error_msg}</p>
            )}

            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Last sync: {relativeTime(src.last_synced)}</span>
              <button onClick={() => sync(src.id)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-brand/10 text-brand hover:bg-brand/20 transition-colors">
                <RefreshCw className="w-3 h-3" /> Sync
              </button>
            </div>
          </div>
        ))}
        {!sources?.length && (
          <div className="col-span-2 text-center py-12 text-slate-500">
            <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>No knowledge base sources configured</p>
          </div>
        )}
      </div>
    </div>
  );
}
