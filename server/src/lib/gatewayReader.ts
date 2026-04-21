/**
 * gatewayReader.ts
 * Opens the OpenClaw gateway SQLite databases read-only and returns
 * flow_runs / task_runs shaped to match the Command Centre's job format.
 * Called directly from route handlers — no background sync needed.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import os   from 'os';
import fs   from 'fs';

const HOME     = os.homedir();
const FLOWS_DB = path.join(HOME, '.openclaw', 'flows', 'registry.sqlite');
const TASKS_DB = path.join(HOME, '.openclaw', 'tasks',  'runs.sqlite');

// ── Shared types ──────────────────────────────────────────────────────────────
export interface GatewayJob {
  id: string; name: string; schedule: string; type: string;
  last_status: string; last_run_at: string | null; run_count: number;
  error_count: number; total_tokens: number; last_model: string | null;
  enabled: number; source: 'gateway';
}

export interface GatewayRun {
  id: string; job_id: string; status: string;
  started_at: string | null; ended_at: string | null;
  duration_ms: number | null; output: string | null; error_msg: string | null;
  source: 'gateway';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toIso(ts: number | null | undefined): string | null {
  if (!ts) return null;
  return new Date(ts > 1_000_000_000_000 ? ts : ts * 1000).toISOString();
}

function mapFlowStatus(s: string): string {
  return ({ running: 'running', active: 'running',
            pending: 'pending', waiting: 'pending',
            completed: 'success', done: 'success', succeeded: 'success',
            failed: 'error', error: 'error', cancelled: 'error' } as Record<string, string>)
    [s?.toLowerCase()] ?? 'pending';
}

function mapTaskStatus(s: string): string {
  return ({ running: 'running', active: 'running',
            completed: 'success', done: 'success', succeeded: 'success',
            failed: 'error', error: 'error', cancelled: 'error',
            pending: 'running' } as Record<string, string>)
    [s?.toLowerCase()] ?? 'running';
}

// ── Gateway flows → jobs ──────────────────────────────────────────────────────
export function readGatewayJobs(): GatewayJob[] {
  if (!fs.existsSync(FLOWS_DB)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(FLOWS_DB, { readOnly: true });
    const rows = db.prepare(`
      SELECT flow_id, goal, status, created_at, updated_at, ended_at
      FROM   flow_runs
      ORDER  BY updated_at DESC
      LIMIT  500
    `).all() as any[];

    return rows.map(f => ({
      id:           f.flow_id,
      name:         (f.goal as string)?.trim() || `Flow ${String(f.flow_id).slice(0, 8)}`,
      schedule:     'openclaw-flow',
      type:         'manual',
      last_status:  mapFlowStatus(f.status),
      last_run_at:  toIso(f.updated_at),
      run_count:    0,
      error_count:  0,
      total_tokens: 0,
      last_model:   null,
      enabled:      1,
      source:       'gateway' as const,
    }));
  } catch (err) {
    console.error('[gateway:flows]', err);
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

// ── Gateway task_runs → job_runs ──────────────────────────────────────────────
export function readGatewayRuns(jobId?: string): GatewayRun[] {
  if (!fs.existsSync(TASKS_DB)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(TASKS_DB, { readOnly: true });

    const sql = jobId
      ? `SELECT * FROM task_runs WHERE parent_flow_id = ? ORDER BY last_event_at DESC LIMIT 100`
      : `SELECT * FROM task_runs ORDER BY last_event_at DESC LIMIT 1000`;

    const rows = db.prepare(sql).all(...(jobId ? [jobId] : [])) as any[];

    return rows.map(r => {
      const sMs = r.started_at ? (r.started_at > 1e12 ? r.started_at : r.started_at * 1000) : null;
      const eMs = r.ended_at   ? (r.ended_at   > 1e12 ? r.ended_at   : r.ended_at   * 1000) : null;
      return {
        id:          r.task_id,
        job_id:      r.parent_flow_id ?? r.run_id ?? 'orphan',
        status:      mapTaskStatus(r.status),
        started_at:  toIso(r.started_at),
        ended_at:    toIso(r.ended_at),
        duration_ms: sMs && eMs ? Math.max(0, eMs - sMs) : null,
        output:      r.terminal_summary ?? r.label ?? null,
        error_msg:   r.error ?? null,
        source:      'gateway' as const,
      };
    });
  } catch (err) {
    console.error('[gateway:tasks]', err);
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

export const gatewayAvailable = () => fs.existsSync(FLOWS_DB) || fs.existsSync(TASKS_DB);
