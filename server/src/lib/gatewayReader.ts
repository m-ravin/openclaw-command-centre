/**
 * gatewayReader.ts
 * Reads directly from OpenClaw gateway files and SQLite databases (read-only).
 *
 * Sources discovered:
 *   ~/.openclaw/cron/jobs.json          → cron job definitions (name, schedule, model, state)
 *   ~/.openclaw/tasks/runs.sqlite       → task_runs (execution history, owner_key links to job id)
 *   ~/.openclaw/memory/main.sqlite      → files + chunks (memory browser)
 *   ~/.openclaw/logs/commands.log       → JSON-lines command log (logs explorer)
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import os   from 'os';
import fs   from 'fs';

const HOME          = os.homedir();
const OC_DIR        = path.join(HOME, '.openclaw');
const TASKS_DB      = path.join(OC_DIR, 'tasks',  'runs.sqlite');
const MEMORY_DB     = path.join(OC_DIR, 'memory', 'main.sqlite');
const CRON_JSON     = path.join(OC_DIR, 'cron',   'jobs.json');
const COMMANDS_LOG  = path.join(OC_DIR, 'logs', 'commands.log');
const AUDIT_LOG     = path.join(OC_DIR, 'logs', 'config-audit.jsonl');

// ── Helpers ───────────────────────────────────────────────────────────────────
function toIso(ts: number | null | undefined): string | null {
  if (!ts) return null;
  return new Date(ts > 1_000_000_000_000 ? ts : ts * 1000).toISOString();
}

function mapStatus(s: string): string {
  return ({
    succeeded: 'success', completed: 'success', done: 'success', success: 'success',
    failed: 'error', error: 'error', timed_out: 'error', cancelled: 'error', timeout: 'error',
    running: 'running', active: 'running', pending: 'running',
  } as Record<string, string>)[s?.toLowerCase()] ?? 'error';
}

// ── Cron Jobs (jobs.json) ─────────────────────────────────────────────────────
interface CronJobDef {
  id: string; name: string; description?: string; enabled: boolean;
  createdAtMs: number; updatedAtMs: number;
  schedule?: { kind: string; expr?: string; tz?: string };
  payload?: { model?: string; message?: string; timeoutSeconds?: number };
  delivery?: { channel?: string; mode?: string };
  state?: {
    nextRunAtMs?: number; lastRunAtMs?: number;
    lastRunStatus?: string; lastStatus?: string;
    lastDurationMs?: number; consecutiveErrors?: number;
    lastError?: string; lastErrorReason?: string;
  };
}

export interface GatewayJob {
  id: string; name: string; description: string; schedule: string;
  type: string; last_status: string; last_run_at: string | null;
  next_run_at: string | null; run_count: number; error_count: number;
  total_tokens: number; last_model: string | null; enabled: number;
  delivery_channel: string | null; source: 'gateway';
}

export function readGatewayCronJobs(): GatewayJob[] {
  if (!fs.existsSync(CRON_JSON)) return [];
  try {
    const raw   = JSON.parse(fs.readFileSync(CRON_JSON, 'utf-8'));
    const jobs: CronJobDef[] = raw.jobs ?? [];

    // Get run counts from task_runs (owner_key = "system:cron:{job_id}")
    let runCounts: Record<string, number> = {};
    if (fs.existsSync(TASKS_DB)) {
      let db: DatabaseSync | null = null;
      try {
        db = new DatabaseSync(TASKS_DB, { readOnly: true });
        const rows = db.prepare(`
          SELECT owner_key, COUNT(*) as n
          FROM task_runs GROUP BY owner_key
        `).all() as any[];
        for (const r of rows) {
          const id = String(r.owner_key).split(':').pop() ?? '';
          runCounts[id] = Number(r.n);
        }
      } finally { try { db?.close(); } catch {} }
    }

    return jobs.map(j => ({
      id:               j.id,
      name:             j.name,
      description:      j.description ?? '',
      schedule:         j.schedule?.expr ?? 'manual',
      type:             'cron',
      last_status:      mapStatus(j.state?.lastStatus ?? j.state?.lastRunStatus ?? 'pending'),
      last_run_at:      toIso(j.state?.lastRunAtMs),
      next_run_at:      toIso(j.state?.nextRunAtMs),
      run_count:        runCounts[j.id] ?? 0,
      error_count:      j.state?.consecutiveErrors ?? 0,
      total_tokens:     0,
      last_model:       j.payload?.model ?? null,
      enabled:          j.enabled ? 1 : 0,
      delivery_channel: j.delivery?.channel ?? null,
      source:           'gateway' as const,
    }));
  } catch (err) {
    console.error('[gateway:cron]', err);
    return [];
  }
}

// ── Job Runs (task_runs) ──────────────────────────────────────────────────────
export interface GatewayRun {
  id: string; job_id: string; status: string;
  started_at: string | null; ended_at: string | null;
  duration_ms: number | null; output: string | null; error_msg: string | null;
  source: 'gateway';
}

export function readGatewayRuns(jobId?: string): GatewayRun[] {
  if (!fs.existsSync(TASKS_DB)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(TASKS_DB, { readOnly: true });

    // owner_key format: "system:cron:{job_id}"
    const ownerKey = jobId ? `system:cron:${jobId}` : null;
    const sql = ownerKey
      ? `SELECT * FROM task_runs WHERE owner_key = ? ORDER BY started_at DESC LIMIT 100`
      : `SELECT * FROM task_runs ORDER BY started_at DESC LIMIT 1000`;
    const rows = db.prepare(sql).all(...(ownerKey ? [ownerKey] : [])) as any[];

    return rows.map(r => {
      const sMs = r.started_at ? (r.started_at > 1e12 ? r.started_at : r.started_at * 1000) : null;
      const eMs = r.ended_at   ? (r.ended_at   > 1e12 ? r.ended_at   : r.ended_at   * 1000) : null;
      // Extract job id from owner_key
      const jid = String(r.owner_key ?? '').split(':').pop() ?? r.owner_key;
      return {
        id:          r.task_id as string,
        job_id:      jid,
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
    try { db?.close(); } catch {} }
}

// ── Operators (cron jobs as operators) ───────────────────────────────────────
export interface GatewayOperator {
  id: string; workspace_id: string; identifier: string;
  display_name: string; channel: string;
  session_count: number; total_cost: number;
  total_tokens: number; total_messages: number;
  error_count: number; last_active: string | null;
  source: 'gateway';
}

export function readGatewayOperators(): GatewayOperator[] {
  if (!fs.existsSync(TASKS_DB)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(TASKS_DB, { readOnly: true });

    // Group by owner_key, join with cron jobs for real names
    const rows = db.prepare(`
      SELECT owner_key,
             COUNT(*)                                                              AS total_runs,
             SUM(CASE WHEN status IN ('failed','timed_out','error','cancelled')
                      THEN 1 ELSE 0 END)                                          AS error_count,
             MAX(last_event_at)                                                    AS last_active
      FROM   task_runs
      WHERE  owner_key IS NOT NULL
      GROUP  BY owner_key
      ORDER  BY last_active DESC
    `).all() as any[];

    // Load cron jobs for name lookup
    let jobNames: Record<string, string> = {};
    let jobChannels: Record<string, string> = {};
    if (fs.existsSync(CRON_JSON)) {
      try {
        const raw = JSON.parse(fs.readFileSync(CRON_JSON, 'utf-8'));
        for (const j of (raw.jobs ?? [])) {
          jobNames[j.id]    = j.name;
          jobChannels[j.id] = j.delivery?.channel ?? 'cron';
        }
      } catch {}
    }

    return rows.map(r => {
      const parts  = String(r.owner_key).split(':');
      const jobId  = parts[parts.length - 1];
      const name   = jobNames[jobId] ?? `Cron ${jobId.slice(0, 8)}`;
      const channel = jobChannels[jobId] ?? parts[1] ?? 'cron';
      return {
        id:             r.owner_key as string,
        workspace_id:   'default',
        identifier:     r.owner_key as string,
        display_name:   name,
        channel,
        session_count:  Number(r.total_runs),
        total_cost:     0,
        total_tokens:   0,
        total_messages: Number(r.total_runs),
        error_count:    Number(r.error_count),
        last_active:    toIso(r.last_active),
        source:         'gateway' as const,
      };
    });
  } catch (err) {
    console.error('[gateway:operators]', err);
    return [];
  } finally {
    try { db?.close(); } catch {} }
}

// ── Logs (config-audit.jsonl + commands.log JSON lines) ──────────────────────
export interface GatewayLog {
  id: string; workspace_id: string; level: string;
  source: string; message: string; logged_at: string;
  session_id: string | null; data: string; gateway_source: 'gateway';
}

/** Extract a human-readable message from an audit log entry */
function auditMessage(entry: any): string {
  const event = String(entry.event ?? entry.action ?? 'event');
  // Pull the meaningful openclaw sub-command from argv (skip node binary and openclaw binary)
  let cmd = '';
  if (Array.isArray(entry.argv) && entry.argv.length > 2) {
    cmd = entry.argv.slice(2).join(' ');
  }
  const suspiciousNote = Array.isArray(entry.suspicious) && entry.suspicious.length
    ? ` ⚠ ${entry.suspicious.join(', ')}`
    : '';
  return cmd
    ? `[${event}] ${cmd}${suspiciousNote}`
    : `[${event}] ${entry.configPath ?? entry.sessionKey ?? ''}${suspiciousNote}`.trim();
}

/** Derive log level from audit entry fields */
function auditLevel(entry: any): string {
  const event  = String(entry.event ?? entry.action ?? '').toLowerCase();
  const source = String(entry.source ?? '').toLowerCase();
  const suspicious = Array.isArray(entry.suspicious) ? entry.suspicious : [];

  if (event.includes('error') || event.includes('fail') ||
      source.includes('error') || entry.result === 'error') return 'error';
  if (event.includes('warn') || suspicious.length > 0)       return 'warn';
  return 'info';
}

/** Parse a single JSONL file and return log entries, newest-first */
function parseJsonlLog(
  filePath: string,
  idPrefix: string,
  startIdx: number,
  opts?: { q?: string; level?: string; limit?: number },
): { logs: GatewayLog[]; nextIdx: number } {
  const logs: GatewayLog[] = [];
  let idx = startIdx;
  if (!fs.existsSync(filePath)) return { logs, nextIdx: idx };

  try {
    const lines = fs.readFileSync(filePath, 'utf-8')
      .trim().split('\n').filter(Boolean).reverse(); // newest first

    for (const line of lines) {
      if (logs.length >= (opts?.limit ?? 500)) break;
      try {
        const entry = JSON.parse(line);
        const src   = String(entry.source ?? 'gateway');
        const msg   = auditMessage(entry);
        const lv    = auditLevel(entry);
        const ts    = entry.ts ?? entry.timestamp ?? new Date().toISOString();

        if (opts?.level && opts.level !== lv) continue;
        if (opts?.q) {
          const q = opts.q.toLowerCase();
          if (!msg.toLowerCase().includes(q) && !src.toLowerCase().includes(q)) continue;
        }

        logs.push({
          id:             `${idPrefix}-${idx++}`,
          workspace_id:   'default',
          level:          lv,
          source:         src,
          message:        msg,
          logged_at:      ts,
          session_id:     entry.sessionKey ?? null,
          data:           JSON.stringify(entry),
          gateway_source: 'gateway',
        });
      } catch { /* skip malformed lines */ }
    }
  } catch (err) {
    console.error(`[gateway:logs:${filePath}]`, err);
  }
  return { logs, nextIdx: idx };
}

export function readGatewayLogs(opts?: { q?: string; level?: string; limit?: number }): GatewayLog[] {
  const maxLimit = opts?.limit ?? 200;

  // Read audit log first (primary source — many entries)
  const { logs: auditLogs, nextIdx } = parseJsonlLog(AUDIT_LOG, 'gw-audit', 0, { ...opts, limit: maxLimit });

  // Also pull from commands.log (secondary — usually few entries)
  const { logs: cmdLogs } = parseJsonlLog(COMMANDS_LOG, 'gw-cmd', nextIdx,
    { ...opts, limit: Math.max(0, maxLimit - auditLogs.length) });

  // Merge and sort newest-first, deduplicate by message+timestamp
  const seen = new Set<string>();
  const merged: GatewayLog[] = [];
  for (const log of [...auditLogs, ...cmdLogs]) {
    const key = `${log.logged_at}|${log.message}`;
    if (!seen.has(key)) { seen.add(key); merged.push(log); }
  }
  merged.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
  return merged.slice(0, maxLimit);
}

// ── Memory ────────────────────────────────────────────────────────────────────
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
    const files = db.prepare(
      `SELECT path, source, hash, mtime, size FROM files ORDER BY mtime DESC`
    ).all() as any[];

    return files
      .map(f => {
        const chunks  = db!.prepare(
          `SELECT text FROM chunks WHERE path = ? ORDER BY start_line ASC`
        ).all(f.path) as any[];
        const content = chunks.map((c: any) => c.text).join('\n');
        const name    = path.basename(f.path as string, path.extname(f.path as string));

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
    try { db?.close(); } catch {} }
}

export function readGatewayMemoryStats() {
  if (!fs.existsSync(MEMORY_DB)) return null;
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(MEMORY_DB, { readOnly: true });
    const row = db.prepare(
      `SELECT COUNT(*) as total, SUM(size) as total_bytes FROM files`
    ).get() as any;
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
    try { db?.close(); } catch {} }
}

export const gatewayAvailable = () =>
  fs.existsSync(TASKS_DB) || fs.existsSync(CRON_JSON);
