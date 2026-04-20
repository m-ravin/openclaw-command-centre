'use client';
import useSWR from 'swr';
import { get } from '@/lib/api';
import { useAppStore } from '@/store/appStore';
import { formatCost, formatTokens, relativeTime } from '@/lib/utils';
import { Users } from 'lucide-react';

interface Operator {
  id: string; identifier: string; display_name: string; channel: string;
  total_sessions: number; total_messages: number; total_tokens: number;
  total_cost: number; last_seen: string;
}

export default function OperatorsPage() {
  const { workspace, privacyBlurNames, privacyBlurNums } = useAppStore();
  const blurName = privacyBlurNames ? 'blur-sm select-none' : '';
  const blurNum  = privacyBlurNums  ? 'blur-sm select-none' : '';

  const { data: operators } = useSWR(
    `/operators?workspace=${workspace}`,
    (u: string) => get<Operator[]>(u),
    { refreshInterval: 30000 }
  );

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-xl font-bold text-white">Operators</h1>
        <p className="text-sm text-slate-500">Users interacting with your agents and their usage patterns</p>
      </div>

      <div className="bg-surface-2 border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5 text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left">Operator</th>
              <th className="px-4 py-3 text-left">Channel</th>
              <th className="px-4 py-3 text-right">Sessions</th>
              <th className="px-4 py-3 text-right">Messages</th>
              <th className="px-4 py-3 text-right">Tokens</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-left">Last Seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {operators?.map(op => (
              <tr key={op.id} className="hover:bg-white/2">
                <td className="px-4 py-3">
                  <div>
                    <p className={`font-medium text-white ${blurName}`}>{op.display_name ?? op.identifier}</p>
                    <p className={`text-xs text-slate-500 ${blurName}`}>{op.identifier}</p>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-400 capitalize">{op.channel}</td>
                <td className="px-4 py-3 text-right text-slate-300">{op.total_sessions}</td>
                <td className="px-4 py-3 text-right text-slate-300">{op.total_messages?.toLocaleString()}</td>
                <td className={`px-4 py-3 text-right text-slate-300 ${blurNum}`}>{formatTokens(op.total_tokens)}</td>
                <td className={`px-4 py-3 text-right text-accent-amber font-mono text-xs ${blurNum}`}>{formatCost(op.total_cost)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{relativeTime(op.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
