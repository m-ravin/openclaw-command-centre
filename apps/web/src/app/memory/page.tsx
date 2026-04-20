'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { get, put, post } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { formatBytes, relativeTime } from '@/lib/utils';
import { Brain, Search, Archive, AlertTriangle, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface MemFile {
  id: string; name: string; type: string; file_path: string;
  content: string; size_bytes: number; is_duplicate: number;
  archived: number; last_modified: string;
}

const TYPE_COLORS: Record<string, string> = {
  user: 'text-brand bg-brand/10 border-brand/20',
  feedback: 'text-accent-cyan bg-accent-cyan/10 border-accent-cyan/20',
  project: 'text-accent-green bg-accent-green/10 border-accent-green/20',
  reference: 'text-accent-amber bg-accent-amber/10 border-accent-amber/20',
  custom: 'text-slate-400 bg-slate-700/30 border-white/10',
};

export default function MemoryPage() {
  const { workspace } = useAppStore();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<MemFile | null>(null);
  const [editContent, setEditContent] = useState('');

  const { data: files, mutate } = useSWR(
    `/memory?workspace=${workspace}${q ? `&q=${q}` : ''}`,
    (u: string) => get<MemFile[]>(u),
    { refreshInterval: 30000 }
  );
  const { data: stats, mutate: refreshStats } = useSWR(
    `/memory/stats/summary?workspace=${workspace}`,
    (u: string) => get<{ total: number; duplicates: number; archived: number; total_bytes: number; by_type: { type: string; n: number }[] }>(u)
  );

  const openEdit = (f: MemFile) => { setEditing(f); setEditContent(f.content ?? ''); };
  const saveEdit = async () => {
    if (!editing) return;
    await put(`/memory/${editing.id}`, { content: editContent });
    toast.success('Memory saved');
    setEditing(null);
    mutate();
  };
  const archive = async (id: string) => {
    await post(`/memory/${id}/archive`);
    toast.success('Archived');
    mutate(); refreshStats();
  };
  const syncMemory = async () => {
    const r = await post<{ synced: number }>('/memory/sync', { workspace_id: workspace });
    toast.success(`Synced ${r.synced} files`);
    mutate(); refreshStats();
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Memory Browser</h1>
          <p className="text-sm text-slate-500">View, edit, and manage Claude memory files</p>
        </div>
        <button onClick={syncMemory}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand/15 border border-brand/30 text-brand text-sm hover:bg-brand/25 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Sync Files
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Files',  value: stats?.total ?? 0 },
          { label: 'Duplicates',   value: stats?.duplicates ?? 0 },
          { label: 'Archived',     value: stats?.archived ?? 0 },
          { label: 'Storage',      value: formatBytes(stats?.total_bytes ?? 0) },
        ].map(s => (
          <div key={s.label} className="bg-surface-2 border border-white/5 rounded-xl p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{s.label}</p>
            <p className="text-2xl font-bold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Type breakdown */}
      <div className="flex gap-2 flex-wrap">
        {stats?.by_type?.map(t => (
          <span key={t.type} className={`px-3 py-1 rounded-full text-xs font-medium border ${TYPE_COLORS[t.type] ?? TYPE_COLORS.custom}`}>
            {t.type} · {t.n}
          </span>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Search memory files…"
          className="w-full bg-surface-2 border border-white/5 rounded-lg pl-9 pr-3 py-2 text-sm
                     text-slate-300 focus:outline-none focus:border-brand/40 transition-colors"
        />
      </div>

      {/* File list */}
      <div className="space-y-2">
        {files?.map(f => (
          <div key={f.id}
            className={`bg-surface-2 border rounded-xl p-4 hover:border-white/10 transition-colors
                        ${f.is_duplicate ? 'border-accent-amber/30' : 'border-white/5'}`}>
            <div className="flex items-start gap-3">
              <Brain className="w-4 h-4 text-brand mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-white text-sm">{f.name}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${TYPE_COLORS[f.type] ?? TYPE_COLORS.custom}`}>
                    {f.type}
                  </span>
                  {f.is_duplicate === 1 && (
                    <span className="flex items-center gap-1 text-[10px] text-accent-amber">
                      <AlertTriangle className="w-3 h-3" /> duplicate
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono truncate">{f.file_path}</p>
                {f.content && (
                  <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{f.content}</p>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600 shrink-0">
                <span>{formatBytes(f.size_bytes)}</span>
                <span>{relativeTime(f.last_modified)}</span>
                <button onClick={() => openEdit(f)}
                  className="px-2 py-1 rounded text-brand border border-brand/20 hover:bg-brand/10 transition-colors">
                  Edit
                </button>
                <button onClick={() => archive(f.id)}
                  className="p-1 rounded hover:bg-white/5 text-slate-500 hover:text-white transition-colors">
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-2 border border-white/10 rounded-2xl w-full max-w-2xl">
            <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="font-semibold text-white">{editing.name}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-white">✕</button>
            </div>
            <div className="p-5">
              <textarea
                value={editContent} onChange={e => setEditContent(e.target.value)}
                className="w-full h-64 bg-surface-3 border border-white/5 rounded-lg p-3
                           text-sm font-mono text-slate-200 resize-y focus:outline-none focus:border-brand/40"
              />
              <div className="flex gap-3 mt-3 justify-end">
                <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">
                  Cancel
                </button>
                <button onClick={saveEdit}
                  className="px-4 py-2 text-sm bg-brand/20 text-brand border border-brand/30 rounded-lg hover:bg-brand/30 transition-colors">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
