import { Router, Request, Response } from 'express';
import { dbAll, dbGet } from '../db/database';

export const costsRouter = Router();

costsRouter.get('/summary', (req: Request, res: Response) => {
  const { workspace = 'default', days = 30 } = req.query;
  const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();

  const total = dbGet<{ cost: number; tokens: number }>(
    `SELECT SUM(cost_usd) as cost, SUM(input_tokens+output_tokens) as tokens
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= ?`,
    [workspace, since]
  );

  const today = dbGet<{ cost: number }>(
    `SELECT SUM(cost_usd) as cost FROM cost_records
     WHERE workspace_id = ? AND recorded_at >= date('now')`,
    [workspace]
  );

  const byProvider = dbAll<{ provider: string; cost: number; tokens: number }>(
    `SELECT provider, SUM(cost_usd) as cost, SUM(input_tokens+output_tokens) as tokens
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= ?
     GROUP BY provider ORDER BY cost DESC`,
    [workspace, since]
  );

  const byModel = dbAll<{ model: string; provider: string; cost: number; requests: number }>(
    `SELECT model, provider, SUM(cost_usd) as cost, COUNT(*) as requests
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= ?
     GROUP BY model ORDER BY cost DESC`,
    [workspace, since]
  );

  const daily = dbAll<{ date: string; cost: number; tokens: number }>(
    `SELECT date(recorded_at) as date, SUM(cost_usd) as cost, SUM(input_tokens+output_tokens) as tokens
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= ?
     GROUP BY date(recorded_at) ORDER BY date ASC`,
    [workspace, since]
  );

  const budget = dbGet<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'alert_budget_usd'`
  );

  res.json({
    total_cost: total?.cost ?? 0,
    total_tokens: total?.tokens ?? 0,
    today_cost: today?.cost ?? 0,
    budget_usd: parseFloat(budget?.value ?? '50'),
    by_provider: byProvider,
    by_model: byModel,
    daily,
  });
});

costsRouter.get('/records', (req: Request, res: Response) => {
  const { workspace = 'default', provider, model, limit = 100, offset = 0 } = req.query;
  let sql = `SELECT * FROM cost_records WHERE workspace_id = ?`;
  const params: unknown[] = [workspace];
  if (provider) { sql += ` AND provider = ?`; params.push(provider); }
  if (model)    { sql += ` AND model = ?`;    params.push(model); }
  sql += ` ORDER BY recorded_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));
  res.json(dbAll(sql, params));
});

costsRouter.get('/savings', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  // Estimate: each 1000 tokens saved = ~3 minutes of human work at $30/hr
  const row = dbGet<{ tokens: number }>(
    `SELECT SUM(input_tokens+output_tokens) as tokens
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= date('now', '-30 days')`,
    [workspace]
  );
  const tokens = row?.tokens ?? 0;
  const humanMinutes = (tokens / 1000) * 3;
  const humanCost = (humanMinutes / 60) * 30;
  const aiCost = (dbGet<{ c: number }>(
    `SELECT SUM(cost_usd) as c FROM cost_records
     WHERE workspace_id = ? AND recorded_at >= date('now', '-30 days')`,
    [workspace]
  )?.c) ?? 0;

  res.json({
    human_minutes_saved: Math.round(humanMinutes),
    human_cost_usd: parseFloat(humanCost.toFixed(2)),
    ai_cost_usd: parseFloat(aiCost.toFixed(4)),
    roi_multiplier: aiCost > 0 ? parseFloat((humanCost / aiCost).toFixed(1)) : 999,
    tokens_processed: tokens,
  });
});
