'use client';
import { cn } from '@/lib/utils';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';

interface GaugeProps {
  label: string;
  value: number;
  unit?: string;
  sub?: string;
  color?: string;
}

function gaugeColor(pct: number): string {
  if (pct >= 90) return '#ef4444';
  if (pct >= 75) return '#f59e0b';
  return '#10b981';
}

export function SystemGauge({ label, value, unit = '%', sub, color }: GaugeProps) {
  const c = color ?? gaugeColor(value);
  const data = [{ value, fill: c }];

  return (
    <div className="flex flex-col items-center bg-surface-2 border border-white/5 rounded-xl p-4">
      <div className="relative w-24 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="68%" outerRadius="95%"
            barSize={8}
            data={data}
            startAngle={225} endAngle={-45}
          >
            <RadialBar background={{ fill: '#1f2433' }} dataKey="value" cornerRadius={4} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-white">{Math.round(value)}</span>
          <span className="text-[10px] text-slate-500">{unit}</span>
        </div>
      </div>
      <p className="text-xs font-medium text-slate-300 mt-2">{label}</p>
      {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
