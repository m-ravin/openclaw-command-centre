import { Router, Request, Response } from 'express';
import { dbAll, dbGet } from '../db/database';
import { readGatewayCostSummary } from '../lib/gatewayReader';

export const costsRouter = Router();

costsRouter.get('/summary', (req: Request, res: Response) => {
  const { workspace = 'default', days = 30 } = req.query;
  const since = new Date(Date.now() - Number(days) * 86400_000).toISOString();

  // ── Gateway real data (sessions.json has actual token counts) ──────────────
  const gw = readGatewayCostSummary(Number(days));

  // ── CC DB data (manual sessions / job_runs that have cost records) ─────────
  const ccTotal = dbGet<{ cost: number; tokens: number }>(
    `SELECT SUM(cost_usd) as cost, SUM(input_tokens+output_tokens) as tokens
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= ?`,
    [workspace, since]
  );
  const ccToday = dbGet<{ cost: number }>(
    `SELECT SUM(cost_usd) as cost FROM cost_records
     WHERE workspace_id = ? AND recorded_at >= date('now')`,
    [workspace]
  );
  const ccByProvider = dbAll<{ provider: string; cost: number; tokens: number }>(
    `SELECT provider, SUM(cost_usd) as cost, SUM(input_tokens+output_tokens) as tokens
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= ?
     GROUP BY provider ORDER BY cost DESC`,
    [workspace, since]
  );
  const ccByModel = dbAll<{ model: string; provider: string; cost: number; requests: number }>(
    `SELECT model, provider, SUM(cost_usd) as cost, COUNT(*) as requests
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= ?
     GROUP BY model ORDER BY cost DESC`,
    [workspace, since]
  );
  const ccDaily = dbAll<{ date: string; cost: number; tokens: number }>(
    `SELECT date(recorded_at) as date, SUM(cost_usd) as cost, SUM(input_tokens+output_tokens) as tokens
     FROM cost_records WHERE workspace_id = ? AND recorded_at >= ?
     GROUP BY date(recorded_at) ORDER BY date ASC`,
    [workspace, since]
  );

  const budget = dbGet<{ value: string }>(
    `SELECT value FROM settings WHERE key = 'alert_budget_usd'`
  );

  // ── Merge: gateway data + CC data ─────────────────────────────────────────
  // Merge daily charts
  const dailyMap: Record<string, { cost: number; tokens: number }> = {};
  for (const d of gw.daily)   dailyMap[d.date] = { cost: (dailyMap[d.date]?.cost ?? 0) + d.cost, tokens: (dailyMap[d.date]?.tokens ?? 0) + d.tokens };
  for (const d of ccDaily)    dailyMap[d.date] = { cost: (dailyMap[d.date]?.cost ?? 0) + (d.cost ?? 0), tokens: (dailyMap[d.date]?.tokens ?? 0) + (d.tokens ?? 0) };

  // Merge by-provider
  const provMap: Record<string, { cost: number; tokens: number }> = {};
  for (const p of gw.byProvider) provMap[p.provider] = { cost: (provMap[p.provider]?.cost ?? 0) + p.cost, tokens: (provMap[p.provider]?.tokens ?? 0) + p.inputTokens + p.outputTokens };
  for (const p of ccByProvider)  provMap[p.provider] = { cost: (provMap[p.provider]?.cost ?? 0) + (p.cost ?? 0), tokens: (provMap[p.provider]?.tokens ?? 0) + (p.tokens ?? 0) };

  // Merge by-model
  const modMap: Record<string, { provider: string; cost: number; requests: number }> = {};
  for (const m of gw.byModel)  modMap[m.model] = { provider: m.provider, cost: (modMap[m.model]?.cost ?? 0) + m.cost, requests: (modMap[m.model]?.requests ?? 0) + m.requests };
  for (const m of ccByModel)   modMap[m.model] = { provider: m.provider, cost: (modMap[m.model]?.cost ?? 0) + (m.cost ?? 0), requests: (modMap[m.model]?.requests ?? 0) + m.requests };

  const totalCost   = gw.totalCost   + (ccTotal?.cost   ?? 0);
  const totalTokens = (gw.totalInputTokens + gw.totalOutputTokens) + (ccTotal?.tokens ?? 0);
  const todayCost   = (ccToday?.cost ?? 0); // gw doesn't split by today easily

  res.json({
    total_cost:    totalCost,
    total_tokens:  totalTokens,
    today_cost:    todayCost,
    budget_usd:    parseFloat(budget?.value ?? '50'),
    is_local_model: gw.isLocalModel,   // flag so UI can show "Local model" note
    by_provider:   Object.entries(provMap).map(([provider, v]) => ({ provider, ...v })).sort((a, b) => b.tokens - a.tokens),
    by_model:      Object.entries(modMap).map(([model, v])     => ({ model, ...v })).sort((a, b) => b.cost - a.cost),
    by_job:        gw.byJob,           // per-job/session token breakdown from sessions.json
    daily:         Object.entries(dailyMap).map(([date, v])    => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
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
