/**
 * gatewayReader.ts
 * Reads directly from OpenClaw gateway SQLite databases (read-only).
 *
 * Data model discovered:
 *   ~/.openclaw/flows/registry.sqlite  → flow_runs   (empty — not used)
 *   ~/.openclaw/tasks/runs.sqlite      → task_runs   (11 real job runs)
 *
 * Strategy: group task_runs by `label` → each unique label = one Job.
 *           each individual task_run   = one JobRun under that label.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import os   from 'os';
import fs   from 'fs';

const HOME     = os.homedir();
const TASKS_DB = path.join(HOME, '.openclaw', 'tasks', 'runs.sqlite');

// ── Types ─────────────────────────────────────────────────────────────────────
export interface GatewayJob {
  id: string; name: string; schedule: string; type: string;
  last_status: string; last_run_at: string | null;
  run_count: number; error_count: number;
  total_tokens: number; last_model: string | null;
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

/** Map gateway status values → Command Centre status */
function mapStatus(s: string): string {
  return ({
    succeeded:  'success',
    completed:  'success',
    done:       'success',
    success:    'success',
    failed:     'error',
    error:      'error',
    timed_out:  'error',
    cancelled:  'error',
    running:    'running',
    active:     'running',
    pending:    'running',
  } as Record<string, string>)[s?.toLowerCase()] ?? 'error';
}

/** Convert a label to a stable gateway job ID */
function labelToId(label: string): string {
  return `gw-${label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;
}

/** Reverse: extract label from gateway job ID for querying */
function idToLabel(id: string): string {
  return id.replace(/^gw-/, '').replace(/-/g, ' ');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns one virtual Job per unique task label found in task_runs.
 * Stats (run_count, error_count, last_run_at) are aggregated from all runs.
 */
export function readGatewayJobs(): GatewayJob[] {
  if (!fs.existsSync(TASKS_DB)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(TASKS_DB, { readOnly: true });

    const rows = db.prepare(`
      SELECT
        label,
        COUNT(*)                                                          AS run_count,
        SUM(CASE WHEN status IN ('failed','timed_out','error','cancelled')
                 THEN 1 ELSE 0 END)                                      AS error_count,
        MAX(started_at)                                                   AS last_run_at,
        (SELECT status FROM task_runs t2
         WHERE  t2.label = t1.label
         ORDER  BY started_at DESC LIMIT 1)                              AS last_status
      FROM   task_runs t1
      WHERE  label IS NOT NULL AND label != ''
      GROUP  BY label
      ORDER  BY MAX(started_at) DESC
    `).all() as any[];

    return rows.map(r => ({
      id:           labelToId(r.label),
      name:         r.label as string,
      schedule:     'openclaw-scheduled',
      type:         'manual',
      last_status:  mapStatus(r.last_status),
      last_run_at:  toIso(r.last_run_at),
      run_count:    Number(r.run_count),
      error_count:  Number(r.error_count),
      total_tokens: 0,
      last_model:   null,
      enabled:      1,
      source:       'gateway' as const,
    }));
  } catch (err) {
    console.error('[gateway:jobs]', err);
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

/**
 * Returns all task_runs for a given gateway job ID (matched by label),
 * or all task_runs if no jobId provided.
 */
export function readGatewayRuns(jobId?: string): GatewayRun[] {
  if (!fs.existsSync(TASKS_DB)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(TASKS_DB, { readOnly: true });

    const isGateway = jobId?.startsWith('gw-');
    const sql = isGateway
      ? `SELECT * FROM task_runs WHERE label = ? ORDER BY started_at DESC LIMIT 100`
      : `SELECT * FROM task_runs ORDER BY started_at DESC LIMIT 1000`;

    const params = isGateway ? [idToLabel(jobId!)] : [];

    // Need to reconstruct the label from the ID with proper casing
    // so do a case-insensitive match instead
    const sqlCI = isGateway
      ? `SELECT * FROM task_runs WHERE LOWER(label) = LOWER(?) ORDER BY started_at DESC LIMIT 100`
      : sql;

    const rows = db.prepare(sqlCI).all(...params) as any[];

    return rows.map(r => {
      const sMs = r.started_at ? (r.started_at > 1e12 ? r.started_at : r.started_at * 1000) : null;
      const eMs = r.ended_at   ? (r.ended_at   > 1e12 ? r.ended_at   : r.ended_at   * 1000) : null;
      return {
        id:          r.task_id as string,
        job_id:      labelToId(r.label ?? 'unknown'),
        status:      mapStatus(r.status),
        started_at:  toIso(r.started_at),
        ended_at:    toIso(r.ended_at),
        duration_ms: sMs && eMs ? Math.max(0, eMs - sMs) : null,
        output:      (r.terminal_summary ?? r.progress_summary ?? null) as string | null,
        error_msg:   (r.error ?? null) as string | null,
        source:      'gateway' as const,
      };
    });
  } catch (err) {
    console.error('[gateway:runs]', err);
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

export const gatewayAvailable = () => fs.existsSync(TASKS_DB);

// ── Memory ────────────────────────────────────────────────────────────────────
const MEMORY_DB = path.join(HOME, '.openclaw', 'memory', 'main.sqlite');

export interface GatewayMemoryFile {
  id: string; name: string; file_path: string; type: string;
  content: string; size_bytes: number; last_modified: string | null;
  is_duplicate: number; archived: number; source: 'gateway';
}

export function readGatewayMemory(q?: string): GatewayMemoryFile[] {
  if (!fs.existsSync(MEMORY_DB)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(MEMORY_DB, { readOnly: true });

    // Get all files
    const files = db.prepare(`
      SELECT path, source, hash, mtime, size FROM files ORDER BY mtime DESC
    `).all() as any[];

    return files
      .map(f => {
        // Concatenate all text chunks for this file
        const chunks = db!.prepare(
          `SELECT text FROM chunks WHERE path = ? ORDER BY start_line ASC`
        ).all(f.path) as any[];
        const content = chunks.map((c: any) => c.text).join('\n');

        // Filter by search query if provided
        const name = path.basename(f.path as string, path.extname(f.path as string));
        if (q && !name.toLowerCase().includes(q.toLowerCase()) &&
                 !content.toLowerCase().includes(q.toLowerCase())) return null;

        return {
          id:            f.path as string,
          name,
          file_path:     f.path as string,
          type:          f.source as string ?? 'memory',
          content,
          size_bytes:    Number(f.size),
          last_modified: toIso(f.mtime),
          is_duplicate:  0,
          archived:      0,
          source:        'gateway' as const,
        };
      })
      .filter(Boolean) as GatewayMemoryFile[];
  } catch (err) {
    console.error('[gateway:memory]', err);
    return [];
  } finally {
    try { db?.close(); } catch {}
  }
}

export function readGatewayMemoryStats() {
  if (!fs.existsSync(MEMORY_DB)) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(MEMORY_DB, { readOnly: true });
    const row = db.prepare(`
      SELECT COUNT(*) as total, SUM(size) as total_bytes FROM files
    `).get() as any;
    return {
      total:       Number(row?.total ?? 0),
      duplicates:  0,
      archived:    0,
      total_bytes: Number(row?.total_bytes ?? 0),
      by_type:     [{ type: 'memory', n: Number(row?.total ?? 0) }],
    };
  } catch (err) {
    console.error('[gateway:memory:stats]', err);
    return null;
  } finally {
    try { db?.close(); } catch {}
  }
}
