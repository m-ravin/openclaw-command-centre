import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { bus } from '../events/eventBus';
import { v4 as uuidv4 } from 'uuid';
import cron from 'node-cron';
import { exec } from 'child_process';

export const jobsRouter = Router();

const activeTasks: Map<string, cron.ScheduledTask> = new Map();

export function initJobScheduler() {
  const jobs = dbAll<{ id: string; schedule: string; enabled: number; command: string; name: string }>(
    `SELECT id, schedule, enabled, command, name FROM jobs WHERE type = 'cron' AND enabled = 1`
  );
  for (const job of jobs) scheduleJob(job);
  console.log(`[JobScheduler] loaded ${jobs.length} cron jobs`);
}

function scheduleJob(job: { id: string; schedule: string; command?: string; name: string }) {
  if (!job.schedule || !cron.validate(job.schedule)) return;
  const task = cron.schedule(job.schedule, () => runJob(job.id));
  activeTasks.set(job.id, task);
}

async function runJob(id: string): Promise<void> {
  const job = dbGet<{ id: string; name: string; command: string; agent_id: string }>(
    `SELECT * FROM jobs WHERE id = ?`, [id]
  );
  if (!job) return;

  const runId  = uuidv4();
  const start  = Date.now();
  // Simulate realistic token usage for agent-backed jobs
  const model  = job.agent_id
    ? (dbGet<{ model: string }>(`SELECT model FROM agents WHERE id = ?`, [job.agent_id])?.model ?? 'claude-sonnet-4-6')
    : 'claude-sonnet-4-6';

  dbRun(
    `INSERT INTO job_runs (id, job_id, status, model, started_at) VALUES (?, ?, 'running', ?, datetime('now'))`,
    [runId, id, model]
  );
  dbRun(`UPDATE jobs SET last_run_at = datetime('now') WHERE id = ?`, [id]);
  bus.emit('job.update', { id, status: 'running', run_id: runId });

  const result = await new Promise<{ ok: boolean; output: string; error?: string }>((resolve) => {
    if (!job.command) return resolve({ ok: true, output: 'No command configured' });
    exec(job.command, { timeout: 60000 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, output: stdout, error: stderr || err.message });
      else     resolve({ ok: true,  output: stdout });
    });
  });

  const duration     = Date.now() - start;
  const status       = result.ok ? 'success' : 'error';
  // Simulate token use proportional to duration
  const inputTokens  = Math.round(duration / 10 + Math.random() * 500);
  const outputTokens = Math.round(inputTokens * 0.6);
  const cost         = inputTokens * 0.000003 + outputTokens * 0.000015;

  dbRun(
    `UPDATE job_runs SET status=?, output=?, error_msg=?, duration_ms=?,
       input_tokens=?, output_tokens=?, cost=?, ended_at=datetime('now') WHERE id=?`,
    [status, result.output, result.error ?? null, duration,
     inputTokens, outputTokens, cost, runId]
  );
  dbRun(
    `UPDATE jobs SET last_status=?, last_duration_ms=?, last_model=?,
       total_tokens = total_tokens + ?,
       run_count   = run_count   + 1,
       error_count = error_count + ? WHERE id=?`,
    [status, duration, model, inputTokens + outputTokens, result.ok ? 0 : 1, id]
  );
  bus.emit('job.update', { id, status, duration_ms: duration, input_tokens: inputTokens, output_tokens: outputTokens });
}

// ── Kanban summary ─────────────────────────────────────────────────────────
jobsRouter.get('/kanban', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;

  const allJobs = dbAll<{
    id: string; name: string; type: string; schedule: string; description: string;
    enabled: number; last_status: string; last_run_at: string; last_duration_ms: number;
    run_count: number; error_count: number; total_tokens: number; last_model: string;
    agent_id: string; next_run_at: string;
  }>(`SELECT * FROM jobs WHERE workspace_id = ?`, [workspace]);

  // Enrich with agent name + last run tokens
  const enriched = allJobs.map(job => {
    const agent = job.agent_id
      ? dbGet<{ name: string; model: string }>(`SELECT name, model FROM agents WHERE id = ?`, [job.agent_id])
      : null;
    const lastRun = dbGet<{ input_tokens: number; output_tokens: number; cost: number; model: string; status: string }>(
      `SELECT input_tokens, output_tokens, cost, model, status
       FROM job_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT 1`,
      [job.id]
    );
    return { ...job, agent_name: agent?.name ?? null, agent_model: agent?.model ?? null, last_run: lastRun ?? null };
  });

  const running  = enriched.filter(j => j.last_status === 'running');
  const pending  = enriched.filter(j => j.enabled && j.last_status !== 'running');
  const finished = enriched.filter(j => !j.enabled || j.last_status === 'success' || j.last_status === 'error');

  res.json({ running, pending, finished });
});

// ── CRUD ───────────────────────────────────────────────────────────────────
jobsRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  res.json(dbAll(`SELECT * FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC`, [workspace]));
});

jobsRouter.get('/:id', (req: Request, res: Response) => {
  const job = dbGet(`SELECT * FROM jobs WHERE id = ?`, [req.params.id]);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const runs = dbAll(
    `SELECT * FROM job_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT 20`,
    [req.params.id]
  );
  res.json({ job, runs });
});

jobsRouter.post('/', (req: Request, res: Response) => {
  const { name, type = 'cron', schedule, command, description, workspace_id = 'default' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  dbRun(
    `INSERT INTO jobs (id, workspace_id, name, type, schedule, command, description)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, workspace_id, name, type, schedule ?? null, command ?? null, description ?? null]
  );
  const job = dbGet<{ id: string; schedule: string; enabled: number; command: string; name: string }>(
    `SELECT * FROM jobs WHERE id = ?`, [id]
  );
  if (job?.schedule) scheduleJob(job);
  res.status(201).json(job);
});

jobsRouter.post('/:id/run', async (req: Request, res: Response) => {
  if (!dbGet(`SELECT id FROM jobs WHERE id = ?`, [req.params.id]))
    return res.status(404).json({ error: 'Job not found' });
  runJob(req.params.id);
  res.json({ ok: true, message: 'Job triggered' });
});

jobsRouter.patch('/:id/toggle', (req: Request, res: Response) => {
  const job = dbGet<{ enabled: number; id: string; schedule: string; command: string; name: string }>(
    `SELECT * FROM jobs WHERE id = ?`, [req.params.id]
  );
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const newEnabled = job.enabled ? 0 : 1;
  dbRun(`UPDATE jobs SET enabled = ? WHERE id = ?`, [newEnabled, req.params.id]);
  if (newEnabled && job.schedule) scheduleJob(job);
  else { activeTasks.get(req.params.id)?.stop(); activeTasks.delete(req.params.id); }
  res.json({ enabled: !!newEnabled });
});

jobsRouter.delete('/:id', (req: Request, res: Response) => {
  activeTasks.get(req.params.id)?.stop();
  activeTasks.delete(req.params.id);
  dbRun(`DELETE FROM jobs WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});
