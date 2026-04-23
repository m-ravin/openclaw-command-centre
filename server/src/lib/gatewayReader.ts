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

// ── Logs (/tmp/openclaw/openclaw-YYYY-MM-DD.log JSON lines) ──────────────────
const TMP_LOG_DIR = '/tmp/openclaw';

export interface GatewayLog {
  id: string; workspace_id: string; level: string;
  source: string; message: string; logged_at: string;
  session_id: string | null; data: string; gateway_source: 'gateway';
}

/**
 * Parse an OpenClaw structured log line.
 * Format: { "0": subsystemJson|message, "1": message (optional),
 *            "_meta": { logLevelName, name, date }, "time": ISO }
 */
function parseOcLogLine(line: string, idx: number): GatewayLog | null {
  try {
    const e = JSON.parse(line);
    const meta = e._meta ?? {};

    // Extract subsystem name (stored as JSON string in _meta.name)
    let subsystem = 'gateway';
    try {
      const parsed = JSON.parse(meta.name ?? '{}');
      subsystem = parsed.subsystem ?? meta.name ?? 'gateway';
    } catch { subsystem = String(meta.name ?? 'gateway'); }

    // Extract human-readable message:
    // If "0" is a JSON object (subsystem descriptor), the real message is in "1"
    // Otherwise "0" IS the message
    let msg = '';
    try {
      const part0 = JSON.parse(e['0'] ?? '');
      // part0 is an object (subsystem descriptor) → message is in "1"
      msg = String(e['1'] ?? part0.subsystem ?? '');
    } catch {
      msg = String(e['0'] ?? '');
    }
    if (e['1'] && msg === e['0']) msg = String(e['1']); // fallback: prefer "1"

    // Level: use logLevelName from _meta
    const lvName = String(meta.logLevelName ?? 'INFO').toUpperCase();
    const lv = lvName === 'ERROR' ? 'error'
             : lvName === 'WARN'  ? 'warn'
             : lvName === 'DEBUG' ? 'debug'
             : 'info';

    const ts = e.time ?? meta.date ?? new Date().toISOString();

    return {
      id:             `gw-oc-${idx}`,
      workspace_id:   'default',
      level:          lv,
      source:         subsystem,
      message:        msg || `[${lvName}]`,
      logged_at:      ts,
      session_id:     null,
      data:           line,   // keep raw line as data for detail view
      gateway_source: 'gateway',
    };
  } catch { return null; }
}

export function readGatewayLogs(opts?: { q?: string; level?: string; limit?: number }): GatewayLog[] {
  const maxLimit = opts?.limit ?? 200;
  const logs: GatewayLog[] = [];

  // ── Primary: /tmp/openclaw/openclaw-YYYY-MM-DD.log files ──────────────────
  // Read all daily log files, sorted newest-date first
  if (fs.existsSync(TMP_LOG_DIR)) {
    try {
      const logFiles = fs.readdirSync(TMP_LOG_DIR)
        .filter(f => /^openclaw-\d{4}-\d{2}-\d{2}\.log$/.test(f))
        .sort()          // lexicographic = chronological for YYYY-MM-DD
        .reverse();      // newest date first

      let idx = 0;
      for (const fname of logFiles) {
        if (logs.length >= maxLimit) break;
        const fpath = path.join(TMP_LOG_DIR, fname);
        try {
          const lines = fs.readFileSync(fpath, 'utf-8')
            .split('\n').filter(Boolean);

          // Read from the END (newest entries) — large files need tail approach
          const tail = lines.slice(-Math.min(lines.length, maxLimit * 10)).reverse();

          for (const line of tail) {
            if (logs.length >= maxLimit) break;
            const log = parseOcLogLine(line, idx++);
            if (!log) continue;
            if (opts?.level && opts.level !== log.level) continue;
            if (opts?.q) {
              const q = opts.q.toLowerCase();
              if (!log.message.toLowerCase().includes(q) &&
                  !log.source.toLowerCase().includes(q)) continue;
            }
            logs.push(log);
          }
        } catch (err) {
          console.error(`[gateway:logs:${fname}]`, err);
        }
      }
    } catch (err) {
      console.error('[gateway:logs:readdir]', err);
    }
  }

  // ── Secondary: config-audit.jsonl (config change events) ──────────────────
  // Only fill remaining slots from this file
  const remaining = maxLimit - logs.length;
  if (remaining > 0 && fs.existsSync(AUDIT_LOG)) {
    try {
      const lines = fs.readFileSync(AUDIT_LOG, 'utf-8')
        .split('\n').filter(Boolean).reverse();
      let idx = 100000;
      for (const line of lines) {
        if (logs.length >= maxLimit) break;
        try {
          const e = JSON.parse(line);
          const event = String(e.event ?? 'config.event');
          let cmd = Array.isArray(e.argv) && e.argv.length > 2
            ? e.argv.slice(2).join(' ') : (e.configPath ?? '');
          const suspicious = Array.isArray(e.suspicious) && e.suspicious.length
            ? ` ⚠ ${e.suspicious.join(', ')}` : '';
          const msg = `[${event}] ${cmd}${suspicious}`.trim();
          const lv  = event.includes('error') || e.result === 'error' ? 'error'
                    : (e.suspicious?.length ?? 0) > 0 ? 'warn' : 'info';
          const ts  = e.ts ?? e.timestamp ?? new Date().toISOString();

          if (opts?.level && opts.level !== lv) continue;
          if (opts?.q) {
            const q = opts.q.toLowerCase();
            if (!msg.toLowerCase().includes(q) && !String(e.source ?? '').toLowerCase().includes(q)) continue;
          }
          logs.push({
            id: `gw-audit-${idx++}`, workspace_id: 'default',
            level: lv, source: String(e.source ?? 'config-io'),
            message: msg, logged_at: ts, session_id: null,
            data: line, gateway_source: 'gateway',
          });
        } catch { /* skip */ }
      }
    } catch (err) {
      console.error('[gateway:logs:audit]', err);
    }
  }

  // Sort all results newest-first
  logs.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
  return logs.slice(0, maxLimit);
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

// ── Sessions (task_runs as sessions) ─────────────────────────────────────────
/**
 * OpenClaw doesn't have a dedicated "sessions" table.
 * Each task_run represents one agent session (a single cron job execution or
 * channel conversation turn). We surface them here so the Sessions page
 * shows real activity instead of blank.
 *
 * owner_key formats seen:
 *   system:cron:{job_id}       → scheduled cron run
 *   channel:{channel}:{key}    → channel (WhatsApp, etc.) conversation
 */
export interface GatewaySession {
  id: string; workspace_id: string; name: string;
  model: string | null; provider: string;
  status: string; input_tokens: number; output_tokens: number;
  total_cost: number; message_count: number; error_count: number;
  started_at: string | null; last_active: string | null;
  source: 'gateway';
}

export function readGatewaySessions(): GatewaySession[] {
  if (!fs.existsSync(TASKS_DB)) return [];
  let db: DatabaseSync | null = null;
  try {
    db = new DatabaseSync(TASKS_DB, { readOnly: true });
    const rows = db.prepare(`
      SELECT task_id, owner_key, status, started_at, ended_at,
             last_event_at, terminal_summary, progress_summary, error
      FROM task_runs
      ORDER BY COALESCE(last_event_at, started_at) DESC
      LIMIT 200
    `).all() as any[];

    // Load cron job names for resolving owner_key → display name
    let jobNames: Record<string, string> = {};
    let jobModels: Record<string, string> = {};
    if (fs.existsSync(CRON_JSON)) {
      try {
        const raw = JSON.parse(fs.readFileSync(CRON_JSON, 'utf-8'));
        for (const j of (raw.jobs ?? [])) {
          jobNames[j.id]  = j.name;
          jobModels[j.id] = j.payload?.model ?? null;
        }
      } catch {}
    }

    return rows.map(r => {
      const ownerKey  = String(r.owner_key ?? '');
      const parts     = ownerKey.split(':');
      const kind      = parts[0] ?? 'system';         // "system" | "channel"
      const jobId     = parts[parts.length - 1] ?? '';

      // Build a friendly display name
      let name: string;
      if (kind === 'system' && jobNames[jobId]) {
        name = jobNames[jobId];                        // e.g. "Daily AI News"
      } else if (kind === 'channel') {
        name = `${parts[1] ?? 'channel'} / ${parts[2] ?? jobId}`;  // e.g. "whatsapp / default"
      } else {
        name = ownerKey || r.task_id;
      }

      const model    = jobModels[jobId] ?? null;
      const provider = model?.startsWith('claude') ? 'Anthropic'
                     : model?.includes('gpt')      ? 'OpenAI'
                     : model?.includes('groq')     ? 'Groq'
                     : 'OpenClaw';

      const status = mapStatus(r.status);

      return {
        id:            r.task_id as string,
        workspace_id:  'default',
        name,
        model,
        provider,
        status,
        input_tokens:  0,   // task_runs doesn't store token counts
        output_tokens: 0,
        total_cost:    0,
        message_count: 1,   // each task run = 1 execution
        error_count:   status === 'error' ? 1 : 0,
        started_at:    toIso(r.started_at),
        last_active:   toIso(r.last_event_at ?? r.ended_at ?? r.started_at),
        source:        'gateway' as const,
      };
    });
  } catch (err) {
    console.error('[gateway:sessions]', err);
    return [];
  } finally {
    try { db?.close(); } catch {} }
}
