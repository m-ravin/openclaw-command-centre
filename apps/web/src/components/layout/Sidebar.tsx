'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Activity, DollarSign, Bot, ScrollText,
  Brain, ShieldCheck, Clock, Settings, ChevronLeft, ChevronRight,
  Zap, Users, Database, FlaskConical,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';

const NAV = [
  { href: '/',          label: 'Dashboard',  icon: LayoutDashboard, group: 'main' },
  { href: '/sessions',  label: 'Sessions',   icon: Activity,        group: 'main' },
  { href: '/agents',    label: 'Agents',     icon: Bot,             group: 'main' },
  { href: '/costs',     label: 'Costs',      icon: DollarSign,      group: 'ops'  },
  { href: '/logs',      label: 'Logs',       icon: ScrollText,      group: 'ops'  },
  { href: '/jobs',      label: 'Jobs',       icon: Clock,           group: 'ops'  },
  { href: '/memory',    label: 'Memory',     icon: Brain,           group: 'data' },
  { href: '/knowledge', label: 'Knowledge',  icon: Database,        group: 'data' },
  { href: '/operators', label: 'Operators',  icon: Users,           group: 'data' },
  { href: '/prompts',   label: 'Prompt Lab', icon: FlaskConical,    group: 'tools'},
  { href: '/security',  label: 'Security',   icon: ShieldCheck,     group: 'tools'},
  { href: '/settings',  label: 'Settings',   icon: Settings,        group: 'tools'},
];

const GROUPS: Record<string, string> = {
  main:  'OVERVIEW',
  ops:   'OPERATIONS',
  data:  'DATA',
  tools: 'TOOLS',
};

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useAppStore();

  const grouped = NAV.reduce((acc, item) => {
    if (!acc[item.group]) acc[item.group] = [];
    acc[item.group].push(item);
    return acc;
  }, {} as Record<string, typeof NAV>);

  return (
    <aside className={cn(
      'flex flex-col bg-surface-1 border-r border-white/5 transition-all duration-200 shrink-0',
      sidebarCollapsed ? 'w-14' : 'w-56'
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-white/5">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-brand/20 border border-brand/40 shrink-0">
          <Zap className="w-4 h-4 text-brand" />
        </div>
        {!sidebarCollapsed && (
          <span className="font-semibold text-sm text-white tracking-wide truncate">
            OpenClaw CC
          </span>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {Object.entries(grouped).map(([group, items]) => (
          <div key={group}>
            {!sidebarCollapsed && (
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest px-2 mb-1">
                {GROUPS[group]}
              </p>
            )}
            <ul className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={sidebarCollapsed ? label : undefined}
                      className={cn(
                        'flex items-center gap-3 px-2 py-2 rounded-lg text-sm transition-all group',
                        active
                          ? 'bg-brand/15 text-brand border border-brand/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0', active && 'text-brand')} />
                      {!sidebarCollapsed && <span className="truncate">{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="p-2 border-t border-white/5">
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center w-full h-8 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
