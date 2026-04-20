'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { get, post, del } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { SeverityBadge } from '@/components/ui/Badge';
import { relativeTime } from '@/lib/utils';
import { ShieldCheck, Key, AlertTriangle, CheckCircle, XCircle, RefreshCw, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ApiKey {
  id: string; name: string; provider: string; key_preview: string;
  status: string; last_checked: string; last_used: string;
}
interface Alert {
  id: string; title: string; severity: string; message: string; created_at: string; resolved: number;
}
interface Audit {
  score: number; invalid_keys: number; recent_errors: number; critical_alerts: number;
  recommendations: string[];
}

export default function SecurityPage() {
  const { workspace } = useAppStore();
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKey, setNewKey] = useState({ name: '', provider: 'anthropic', key_value: '' });

  const { data: keys, mutate: refreshKeys } = useSWR(
    `/security/keys?workspace=${workspace}`,
    (u: string) => get<ApiKey[]>(u),
    { refreshInterval: 60000 }
  );
  const { data: audit, mutate: refreshAudit } = useSWR(
    `/security/audit?workspace=${workspace}`,
    (u: string) => get<Audit>(u),
    { refreshInterval: 30000 }
  );
  const { data: alerts, mutate: refreshAlerts } = useSWR(
    `/alerts?workspace=${workspace}&resolved=false&limit=20`,
    (u: string) => get<Alert[]>(u),
    { refreshInterval: 15000 }
  );

  const validateKey = async (id: string) => {
    toast.loading('Validating…', { id: 'val' });
    const r = await post<{ status: string }>(`/security/keys/${id}/validate`);
    toast.dismiss('val');
    toast.success(`Status: ${r.status}`);
    refreshKeys(); refreshAudit();
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Delete this API key record?')) return;
    await del(`/security/keys/${id}`);
    toast.success('Key removed');
    refreshKeys(); refreshAudit();
  };

  const addKey = async () => {
    if (!newKey.name || !newKey.provider) { toast.error('Name and provider required'); return; }
    await post('/security/keys', { ...newKey, workspace_id: workspace });
    toast.success('Key added');
    setShowAddKey(false);
    setNewKey({ name: '', provider: 'anthropic', key_value: '' });
    refreshKeys(); refreshAudit();
  };

  const resolveAlert = async (id: string) => {
    await post(`/alerts/${id}/resolve`);
    toast.success('Alert resolved');
    refreshAlerts();
  };

  const scoreColor = audit
    ? audit.score >= 80 ? 'text-accent-green' : audit.score >= 50 ? 'text-accent-amber' : 'text-accent-red'
    : 'text-slate-400';

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-xl font-bold text-white">Security Command Centre</h1>
        <p className="text-sm text-slate-500">API key audit, alert management, and security posture</p>
      </div>

      {/* Security score */}
      <div className="bg-surface-2 border border-white/5 rounded-xl p-6">
        <div className="flex items-center gap-6">
          <div className="text-center">
            <div className={`text-5xl font-black ${scoreColor}`}>{audit?.score ?? '—'}</div>
            <div className="text-xs text-slate-500 mt-1">Security Score</div>
          </div>
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-4 mb-4">
              {[
                { label: 'Invalid Keys',    value: audit?.invalid_keys   ?? 0, bad: true },
                { label: 'Recent Errors',   value: audit?.recent_errors  ?? 0, bad: true },
                { label: 'Critical Alerts', value: audit?.critical_alerts ?? 0, bad: true },
              ].map(m => (
                <div key={m.label} className="bg-surface-3 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500">{m.label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${m.value > 0 && m.bad ? 'text-accent-red' : 'text-white'}`}>{m.value}</p>
                </div>
              ))}
            </div>
            {audit?.recommendations && audit.recommendations.length > 0 && (
              <div className="space-y-1">
                {audit.recommendations.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-accent-amber">
                    <AlertTriangle className="w-3 h-3 shrink-0" /> {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API Keys */}
      <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-semibold text-white">API Keys ({keys?.length ?? 0})</h2>
          </div>
          <button onClick={() => setShowAddKey(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25 transition-colors">
            <Plus className="w-3 h-3" /> Add Key
          </button>
        </div>

        {showAddKey && (
          <div className="px-4 py-3 border-b border-white/5 bg-surface-3">
            <div className="flex gap-3 flex-wrap">
              <input value={newKey.name} onChange={e => setNewKey(k => ({ ...k, name: e.target.value }))}
                placeholder="Key name" className="bg-surface-4 border border-white/5 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-brand/40" />
              <select value={newKey.provider} onChange={e => setNewKey(k => ({ ...k, provider: e.target.value }))}
                className="bg-surface-4 border border-white/5 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none">
                {['anthropic', 'openai', 'gemini', 'openrouter', 'ollama'].map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input value={newKey.key_value} onChange={e => setNewKey(k => ({ ...k, key_value: e.target.value }))}
                type="password" placeholder="Key value (optional)" className="flex-1 bg-surface-4 border border-white/5 rounded-lg px-3 py-1.5 text-sm text-slate-300 focus:outline-none focus:border-brand/40" />
              <button onClick={addKey} className="px-4 py-1.5 rounded-lg text-sm bg-brand/20 text-brand border border-brand/30 hover:bg-brand/30 transition-colors">
                Save
              </button>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-white/5">
              <th className="px-4 py-2 text-left">Name</th>
              <th className="px-4 py-2 text-left">Provider</th>
              <th className="px-4 py-2 text-left">Preview</th>
              <th className="px-4 py-2 text-left">Status</th>
              <th className="px-4 py-2 text-left">Last Checked</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {keys?.map(k => (
              <tr key={k.id} className="hover:bg-white/2">
                <td className="px-4 py-3 font-medium text-slate-200">{k.name}</td>
                <td className="px-4 py-3 capitalize text-slate-400">{k.provider}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{k.key_preview ?? '—'}</td>
                <td className="px-4 py-3">
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${
                    k.status === 'valid'   ? 'text-accent-green' :
                    k.status === 'invalid' ? 'text-accent-red'   : 'text-slate-400'}`}>
                    {k.status === 'valid' ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                    {k.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{relativeTime(k.last_checked)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => validateKey(k.id)} title="Validate"
                      className="p-1.5 rounded hover:bg-brand/10 text-slate-500 hover:text-brand transition-colors">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteKey(k.id)} title="Delete"
                      className="p-1.5 rounded hover:bg-accent-red/10 text-slate-500 hover:text-accent-red transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Active Alerts */}
      <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-accent-red" />
          <h2 className="text-sm font-semibold text-white">Active Alerts</h2>
        </div>
        <div className="divide-y divide-white/5">
          {!alerts?.length && (
            <div className="px-4 py-6 text-center">
              <CheckCircle className="w-8 h-8 text-accent-green mx-auto mb-2" />
              <p className="text-sm text-slate-500">No active alerts</p>
            </div>
          )}
          {alerts?.map(a => (
            <div key={a.id} className="px-4 py-3 flex items-center gap-3">
              <SeverityBadge severity={a.severity} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-200">{a.title}</p>
                <p className="text-xs text-slate-500 truncate">{a.message}</p>
              </div>
              <span className="text-xs text-slate-600">{relativeTime(a.created_at)}</span>
              <button onClick={() => resolveAlert(a.id)}
                className="px-2 py-1 text-xs rounded bg-accent-green/10 text-accent-green border border-accent-green/20 hover:bg-accent-green/20 transition-colors shrink-0">
                Resolve
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
