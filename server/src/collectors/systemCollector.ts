// Polls OS-level metrics (CPU, RAM, disk, network) and stores them.
// Broadcasts each sample over the event bus for real-time dashboard updates.

import si from 'systeminformation';
import { v4 as uuidv4 } from 'uuid';
import { dbRun } from '../db/database';
import { bus } from '../events/eventBus';

let intervalHandle: NodeJS.Timeout | null = null;

export interface SystemSnapshot {
  cpu_pct:       number;
  mem_pct:       number;
  mem_used_mb:   number;
  mem_total_mb:  number;
  disk_pct:      number;
  disk_used_gb:  number;
  disk_total_gb: number;
  net_rx_mb:     number;
  net_tx_mb:     number;
  cpu_temp:      number | null;
  processes:     number;
  load_avg:      number[];
  recorded_at:   string;
}

let prevNetRx = 0;
let prevNetTx = 0;

async function collect(): Promise<SystemSnapshot> {
  const [cpu, mem, disk, net, temp, procs, load] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.networkStats(),
    si.cpuTemperature().catch(() => ({ main: null })),
    si.processes(),
    si.currentLoad().then(l => l.avgLoad),
  ]);

  const primaryDisk = disk[0] ?? { use: 0, used: 0, size: 0 };
  const netTotal = net.reduce((acc, n) => {
    acc.rx += n.rx_sec ?? 0;
    acc.tx += n.tx_sec ?? 0;
    return acc;
  }, { rx: 0, tx: 0 });

  const rxMb = netTotal.rx / 1024 / 1024;
  const txMb = netTotal.tx / 1024 / 1024;
  prevNetRx = rxMb;
  prevNetTx = txMb;

  return {
    cpu_pct:       parseFloat(cpu.currentLoad.toFixed(1)),
    mem_pct:       parseFloat(((mem.used / mem.total) * 100).toFixed(1)),
    mem_used_mb:   Math.round(mem.used / 1024 / 1024),
    mem_total_mb:  Math.round(mem.total / 1024 / 1024),
    disk_pct:      parseFloat(primaryDisk.use?.toFixed(1) ?? '0'),
    disk_used_gb:  parseFloat((primaryDisk.used / 1e9).toFixed(2)),
    disk_total_gb: parseFloat((primaryDisk.size / 1e9).toFixed(2)),
    net_rx_mb:     parseFloat(rxMb.toFixed(3)),
    net_tx_mb:     parseFloat(txMb.toFixed(3)),
    cpu_temp:      (temp as { main: number | null }).main,
    processes:     procs.all,
    load_avg:      [load ?? 0],
    recorded_at:   new Date().toISOString(),
  };
}

function persist(snap: SystemSnapshot) {
  dbRun(
    `INSERT INTO system_metrics
       (id, cpu_pct, mem_pct, mem_used_mb, mem_total_mb, disk_pct,
        disk_used_gb, disk_total_gb, net_rx_mb, net_tx_mb, cpu_temp,
        load_avg, processes, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uuidv4(), snap.cpu_pct, snap.mem_pct, snap.mem_used_mb, snap.mem_total_mb,
      snap.disk_pct, snap.disk_used_gb, snap.disk_total_gb,
      snap.net_rx_mb, snap.net_tx_mb, snap.cpu_temp,
      JSON.stringify(snap.load_avg), snap.processes, snap.recorded_at,
    ]
  );
}

export function startSystemCollector(intervalSec = 10) {
  if (intervalHandle) return;

  const tick = async () => {
    try {
      const snap = await collect();
      persist(snap);
      bus.emit('system.metrics', snap);
    } catch (err) {
      console.error('[SystemCollector]', err);
    }
  };

  tick();
  intervalHandle = setInterval(tick, intervalSec * 1000);
  console.log(`[SystemCollector] started (interval=${intervalSec}s)`);
}

export function stopSystemCollector() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
