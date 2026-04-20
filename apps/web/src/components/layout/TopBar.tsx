'use client';
import { useState, useEffect } from 'react';
import { Bell, Search, Eye, EyeOff, Wifi, WifiOff, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/appStore';
import { liveSocket } from '@/lib/ws';
import useSWR from 'swr';
import { get } from '@/lib/api';

interface Workspace { id: string; name: string; color: string; }

export function TopBar() {
  const { workspace, setWorkspace, privacyBlurNums, toggleBlurNums, demoMode, toggleDemoMode } = useAppStore();
  const [wsConnected, setWsConnected] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [showWorkspaces, setShowWorkspaces] = useState(false);

  const { data: workspaces } = useSWR<Workspace[]>(
    '/settings/workspaces/all',
    (url: string) => get(url)
  );
  const currentWs = workspaces?.find(w => w.id === workspace);

  const { data: alerts } = useSWR(
    `/alerts?workspace=${workspace}&resolved=false`,
    (url: string) => get<unknown[]>(url),
    { refreshInterval: 30000 }
  );

  useEffect(() => {
    setAlertCount((alerts as unknown[])?.length ?? 0);
  }, [alerts]);

  useEffect(() => {
    liveSocket.connect(workspace);
    const unsub1 = liveSocket.on('__connected',    () => setWsConnected(true));
    const unsub2 = liveSocket.on('__disconnected', () => setWsConnected(false));
    liveSocket.on('alert.new', () => setAlertCount(c => c + 1));
    return () => { unsub1(); unsub2(); };
  }, [workspace]);

  return (
    <header className="flex items-center h-14 px-4 gap-4 bg-surface-1 border-b border-white/5 shrink-0">
      {/* Global search */}
      <div className="flex-1 max-w-lg relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search sessions, logs, memory, agents…"
          className="w-full bg-surface-3 border border-white/5 rounded-lg pl-9 pr-4 py-1.5
                     text-sm text-slate-300 placeholder:text-slate-600
                     focus:outline-none focus:border-brand/40 focus:bg-surface-4 transition-colors"
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600
                        bg-surface-4 px-1.5 py-0.5 rounded font-mono">
          ⌘K
        </kbd>
      </div>

      {/* Workspace switcher */}
      <div className="relative">
        <button
          onClick={() => setShowWorkspaces(v => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-3 border border-white/5
                     hover:border-white/10 text-sm text-slate-300 hover:text-white transition-colors"
        >
          {currentWs && (
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: currentWs.color }} />
          )}
          <span>{currentWs?.name ?? 'Personal'}</span>
          <ChevronDown className="w-3 h-3 text-slate-500" />
        </button>
        {showWorkspaces && workspaces && (
          <div className="absolute right-0 top-10 z-50 bg-surface-2 border border-white/10 rounded-xl
                          shadow-xl shadow-black/40 p-1 min-w-[160px]">
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => { setWorkspace(ws.id); setShowWorkspaces(false); }}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-left transition-colors',
                  ws.id === workspace ? 'bg-brand/15 text-brand' : 'text-slate-300 hover:bg-white/5'
                )}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ws.color }} />
                {ws.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Privacy toggles */}
      <button
        onClick={toggleBlurNums}
        title={privacyBlurNums ? 'Unblur numbers' : 'Blur numbers (screenshot mode)'}
        className={cn(
          'p-2 rounded-lg transition-colors text-sm',
          privacyBlurNums ? 'bg-brand/15 text-brand' : 'text-slate-500 hover:text-white hover:bg-white/5'
        )}
      >
        {privacyBlurNums ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>

      {/* WS indicator */}
      <div className={cn('flex items-center gap-1.5 text-xs', wsConnected ? 'text-accent-green' : 'text-slate-600')}>
        {wsConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{wsConnected ? 'Live' : 'Offline'}</span>
      </div>

      {/* Alerts bell */}
      <button className="relative p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors">
        <Bell className="w-4 h-4" />
        {alertCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-accent-red rounded-full text-[9px]
                           font-bold text-white flex items-center justify-center">
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </button>
    </header>
  );
}
