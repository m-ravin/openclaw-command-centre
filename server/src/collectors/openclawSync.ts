/**
 * OpenClaw Gateway Sync
 * Reads flow_runs and task_runs from the OpenClaw gateway's SQLite databases
 * and upserts them into the Command Centre's database every 30 seconds.
 *
 * Gateway databases (read-only):
 *   ~/.openclaw/flows/registry.sqlite  → flow_runs  → jobs table
 *   ~/.openclaw/tasks/runs.sqlite      → task_runs  → job_runs table
 */
import { DatabaseSync } from 'node:sqlite';
import { dbRun, dbGet } from '../db/database';
import { bus } from '../events/eventBus';
import path from 'path';
import os from 'os';
import fs from 'fs';

const HOME      = os.homedir();
const FLOWS_DB  = path.join(HOME, '.openclaw', 'flows', 'registry.sqlite');
const TASKS_DB  = path.join(HOME, '.openclaw', 'tasks', 'runs.sqlite');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a Unix timestamp (seconds or milliseconds) to ISO string */
function toIso(ts: number | null | undefined): string | null {
  if (!ts) return null;
  const ms = ts > 1_000_000_000_000 ? ts : ts * 1000; // detect ms vs s
  return new Date(ms).toISOString();
}

/** Map OpenClaw task_run status → job_runs CHECK constraint values */
function mapRunStatus(s: string): 'success' | 'error' | 'running' | 'skipped' {
  const m: Record<string, 'success' | 'error' | 'running' | 'skipped'> = {
    completed:  'success',
    done:       'success',
    succeeded:  'success',
    success:    'success',
    failed:     'error',
    error:      'error',
    cancelled:  'error',
    running:    'running',
    active:     'running',
    pending:    'running',
    skipped:    'skipped',
  };
  return m[s?.toLowerCase()] ?? 'running';
}

/** Map OpenClaw flow status to a human-readable last_status string */
function mapFlowStatus(s: string): string {
  const m: Record<string, string> = {
    running:   'running',
    active:    'running',
    pending:   'pending',
    waiting:   'pending',
    completed: 'success',
    done:      'success',
    succeeded: 'success',
    failed:    'error',
    error:     'error',
    cancelled: 'error',
  };
  return m[s?.toLowerCase()] ?? 'pending';
}

// ── Sync state ────────────────────────────────────────────────────────────────
let lastSyncAt: string | null = null;
export function getSyncStatus() { return { lastSyncAt, flows: FLOWS_DB, tasks: TASKS_DB }; }

// ── Flow sync ─────────────────────────────────────────────────────────────────
function syncFlows(): number {
  if (!fs.existsSync(FLOWS_DB)) return 0;

  let gw: DatabaseSync | null = null;
  try {
    gw = new DatabaseSync(FLOWS_DB, { readOnly: true });
    const rows = gw.prepare(`
      SELECT flow_id, goal, status, created_at, updated_at, ended_at
      FROM   flow_runs
      ORDER  BY updated_at DESC
      LIMIT  500
    `).all() as any[];

    for (const f of rows) {
      const name       = (f.goal as string)?.trim() || `Flow ${String(f.flow_id).slice(0, 8)}`;
      const lastStatus = mapFlowStatus(f.status);
      const createdAt  = toIso(f.created_at) ?? new Date().toISOString();

      // Upsert into jobs — map flow_id → id, goal → name
      dbRun(`
        INSERT INTO jobs (id, workspace_id, name, type, schedule, last_status, enabled, created_at)
        VALUES (?, 'default', ?, 'manual', 'openclaw-flow', ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          name        = excluded.name,
          last_status = excluded.last_status
      `, [f.flow_id, name, lastStatus, createdAt]);
    }

    return rows.length;
  } catch (err) {
    console.error('[sync:flows]', err);
    return 0;
  } finally {
    try { gw?.close(); } catch {}
  }
}

// ── Task run sync ─────────────────────────────────────────────────────────────
function syncTaskRuns(): number {
  if (!fs.existsSync(TASKS_DB)) return 0;

  let gw: DatabaseSync | null = null;
  try {
    gw = new DatabaseSync(TASKS_DB, { readOnly: true });
    const rows = gw.prepare(`
      SELECT task_id, parent_flow_id, run_id, label, task, status,
             started_at, ended_at, last_event_at, error, terminal_summary
      FROM   task_runs
      ORDER  BY last_event_at DESC
      LIMIT  1000
    `).all() as any[];

    for (const r of rows) {
      const jobId     = (r.parent_flow_id || r.run_id || 'orphan') as string;
      const status    = mapRunStatus(r.status);
      const startedAt = toIso(r.started_at) ?? new Date().toISOString();
      const endedAt   = toIso(r.ended_at);

      // Duration in ms
      let durationMs: number | null = null;
      if (r.started_at && r.ended_at) {
        const sMs = r.started_at > 1e12 ? r.started_at : r.started_at * 1000;
        const eMs = r.ended_at   > 1e12 ? r.ended_at   : r.ended_at   * 1000;
        durationMs = Math.max(0, eMs - sMs);
      }

      // Ensure parent job exists so FK doesn't fail
      const jobExists = dbGet(`SELECT id FROM jobs WHERE id = ?`, [jobId]);
      if (!jobExists && jobId !== 'orphan') {
        dbRun(`
          INSERT OR IGNORE INTO jobs (id, workspace_id, name, type, schedule, enabled, created_at)
          VALUES (?, 'default', ?, 'manual', 'openclaw-task', 1, datetime('now'))
        `, [jobId, `Task Group ${String(jobId).slice(0, 8)}`]);
      }

      // Upsert task run into job_runs
      dbRun(`
        INSERT INTO job_runs (id, job_id, status, output, error_msg, duration_ms, started_at, ended_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status      = excluded.status,
          ended_at    = excluded.ended_at,
          duration_ms = excluded.duration_ms,
          error_msg   = excluded.error_msg,
          output      = excluded.output
      `, [
        r.task_id,
        jobId,
        status,
        (r.terminal_summary || r.label || r.task || null) as string | null,
        r.error ?? null,
        durationMs,
        startedAt,
        endedAt,
      ]);
    }

    return rows.length;
  } catch (err) {
    console.error('[sync:tasks]', err);
    return 0;
  } finally {
    try { gw?.close(); } catch {}
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function startOpenClawSync(intervalSec = 30) {
  const hasFlows = fs.existsSync(FLOWS_DB);
  const hasTasks = fs.existsSync(TASKS_DB);

  if (!hasFlows && !hasTasks) {
    console.log('[sync] No OpenClaw gateway databases found — skipping');
    return;
  }

  console.log(`[sync] Gateway DBs found → syncing every ${intervalSec}s`);
  console.log(`[sync]   flows : ${FLOWS_DB}`);
  console.log(`[sync]   tasks : ${TASKS_DB}`);

  const doSync = () => {
    try {
      const flows = syncFlows();
      const tasks = syncTaskRuns();
      lastSyncAt  = new Date().toISOString();
      if (flows + tasks > 0) {
        bus.emit('jobs.sync', { flows, tasks, ts: lastSyncAt });
        console.log(`[sync] ✓ ${flows} flows, ${tasks} task runs synced`);
      }
    } catch (err) {
      console.error('[sync] error:', err);
    }
  };

  doSync();                                    // immediate on boot
  setInterval(doSync, intervalSec * 1000);    // then every N seconds
}
