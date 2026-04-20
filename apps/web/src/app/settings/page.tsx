'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { get, put } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { Settings, Eye, EyeOff, Bell, Database } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { workspace, privacyBlurNums, privacyBlurNames, demoMode, toggleBlurNums, toggleBlurNames, toggleDemoMode } = useAppStore();

  const { data: settings, mutate } = useSWR(
    '/settings',
    (u: string) => get<Record<string, string>>(u)
  );

  const save = async (key: string, value: string) => {
    await put(`/settings/${key}`, { value });
    toast.success('Saved');
    mutate();
  };

  const SettingRow = ({ label, desc, settingKey, type = 'text' }: { label: string; desc: string; settingKey: string; type?: string }) => {
    const [val, setVal] = useState(settings?.[settingKey] ?? '');
    return (
      <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          <p className="text-xs text-slate-500">{desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type={type} value={val}
            onChange={e => setVal(e.target.value)}
            className="w-32 bg-surface-3 border border-white/5 rounded-lg px-3 py-1.5 text-sm text-slate-300 text-right focus:outline-none focus:border-brand/40"
          />
          <button onClick={() => save(settingKey, val)}
            className="px-3 py-1.5 text-xs rounded-lg bg-brand/15 text-brand border border-brand/30 hover:bg-brand/25 transition-colors">
            Save
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-[800px]">
      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-500">Configure your Command Centre</p>
      </div>

      {/* Privacy */}
      <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-white">Privacy Controls</h2>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Blur Names',    desc: 'Blur operator identifiers in UI',  toggle: toggleBlurNames, state: privacyBlurNames },
            { label: 'Blur Numbers',  desc: 'Blur cost/token numbers (screenshot-safe)', toggle: toggleBlurNums,  state: privacyBlurNums },
            { label: 'Demo Mode',     desc: 'Replace real data with demo values', toggle: toggleDemoMode,  state: demoMode },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm font-medium text-white">{s.label}</p>
                <p className="text-xs text-slate-500">{s.desc}</p>
              </div>
              <button onClick={s.toggle}
                className={`w-11 h-6 rounded-full transition-colors relative ${s.state ? 'bg-brand' : 'bg-surface-4'}`}>
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${s.state ? 'left-6' : 'left-1'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts & Budget */}
      <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-white">Alerts & Budget</h2>
        </div>
        {settings && (
          <div>
            <SettingRow label="Monthly Budget (USD)" desc="Alert when spend approaches this limit" settingKey="alert_budget_usd" type="number" />
            <SettingRow label="CPU Alert Threshold (%)" desc="Trigger alert above this CPU %" settingKey="alert_cpu_threshold" type="number" />
            <SettingRow label="RAM Alert Threshold (%)" desc="Trigger alert above this RAM %" settingKey="alert_ram_threshold" type="number" />
          </div>
        )}
      </div>

      {/* System */}
      <div className="bg-surface-2 border border-white/5 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-white">System</h2>
        </div>
        {settings && (
          <div>
            <SettingRow label="Metrics Interval (seconds)" desc="How often to poll system metrics" settingKey="metrics_interval_sec" type="number" />
            <SettingRow label="Log Retention (days)" desc="Auto-prune logs older than this" settingKey="log_retention_days" type="number" />
          </div>
        )}
      </div>
    </div>
  );
}
