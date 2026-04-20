import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { bus } from '../events/eventBus';
import { v4 as uuidv4 } from 'uuid';

export const insightsRouter = Router();

insightsRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default', dismissed = 'false', category } = req.query;
  let sql = `SELECT * FROM insights WHERE workspace_id = ? AND dismissed = ?`;
  const params: unknown[] = [workspace, dismissed === 'true' ? 1 : 0];
  if (category) { sql += ` AND category = ?`; params.push(category); }
  sql += ` ORDER BY created_at DESC`;
  res.json(dbAll(sql, params));
});

insightsRouter.post('/:id/dismiss', (req: Request, res: Response) => {
  dbRun(`UPDATE insights SET dismissed = 1 WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

// Generate fresh AI insights based on DB telemetry
insightsRouter.post('/generate', async (req: Request, res: Response) => {
  const { workspace_id = 'default' } = req.body;
  const generated: string[] = [];

  // Cost spike detection
  const thisWeek = dbGet<{ c: number }>(
    `SELECT SUM(cost_usd) as c FROM cost_records
     WHERE workspace_id = ? AND recorded_at >= datetime('now','-7 days')`,
    [workspace_id]
  )?.c ?? 0;
  const lastWeek = dbGet<{ c: number }>(
    `SELECT SUM(cost_usd) as c FROM cost_records
     WHERE workspace_id = ? AND recorded_at BETWEEN datetime('now','-14 days') AND datetime('now','-7 days')`,
    [workspace_id]
  )?.c ?? 0;
  if (lastWeek > 0 && thisWeek / lastWeek > 1.2) {
    const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
    const id = uuidv4();
    dbRun(
      `INSERT OR REPLACE INTO insights (id, workspace_id, type, category, severity, title, body, created_at)
       VALUES (?, ?, 'cost_spike', 'cost', 'warning', ?, ?, datetime('now'))`,
      [id, workspace_id,
       `Costs up ${pct}% this week`,
       `Token spend rose from $${lastWeek.toFixed(2)} to $${thisWeek.toFixed(2)} vs last week.`]
    );
    bus.emit('insight.new', dbGet(`SELECT * FROM insights WHERE id = ?`, [id]));
    generated.push('cost_spike');
  }

  // Failing jobs
  const failingJobs = dbGet<{ n: number }>(
    `SELECT COUNT(*) as n FROM jobs WHERE workspace_id = ? AND last_status = 'error'`,
    [workspace_id]
  )?.n ?? 0;
  if (failingJobs > 0) {
    const id = uuidv4();
    dbRun(
      `INSERT INTO insights (id, workspace_id, type, category, severity, title, body, created_at)
       VALUES (?, ?, 'job_failures', 'performance', 'error', ?, ?, datetime('now'))`,
      [id, workspace_id,
       `${failingJobs} scheduled job${failingJobs > 1 ? 's' : ''} failing`,
       `${failingJobs} job${failingJobs > 1 ? 's have' : ' has'} error status. Check the Jobs dashboard.`]
    );
    generated.push('job_failures');
  }

  // Budget warning
  const budget = parseFloat(dbGet<{ value: string }>(`SELECT value FROM settings WHERE key = 'alert_budget_usd'`)?.value ?? '50');
  const monthCost = dbGet<{ c: number }>(
    `SELECT SUM(cost_usd) as c FROM cost_records WHERE workspace_id = ? AND recorded_at >= date('now','start of month')`,
    [workspace_id]
  )?.c ?? 0;
  if (monthCost / budget > 0.8) {
    const id = uuidv4();
    dbRun(
      `INSERT INTO insights (id, workspace_id, type, category, severity, title, body, created_at)
       VALUES (?, ?, 'budget_warn', 'cost', 'warning', ?, ?, datetime('now'))`,
      [id, workspace_id,
       `Budget ${Math.round((monthCost/budget)*100)}% used this month`,
       `Spent $${monthCost.toFixed(2)} of $${budget} monthly budget. Pace suggests overage.`]
    );
    generated.push('budget_warn');
  }

  res.json({ generated, count: generated.length });
});
