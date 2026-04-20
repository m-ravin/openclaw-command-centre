import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';

export const securityRouter = Router();

// API Keys
securityRouter.get('/keys', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  // Never return actual key hashes to client
  const keys = dbAll(
    `SELECT id, workspace_id, name, provider, key_preview, status,
            last_used, last_checked, permissions, metadata, created_at
     FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC`,
    [workspace]
  );
  res.json(keys);
});

securityRouter.post('/keys', (req: Request, res: Response) => {
  const { workspace_id = 'default', name, provider, key_value } = req.body;
  if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });
  const id = uuidv4();
  const preview = key_value ? `${key_value.slice(0, 8)}****${key_value.slice(-4)}` : undefined;
  dbRun(
    `INSERT INTO api_keys (id, workspace_id, name, provider, key_preview, status)
     VALUES (?, ?, ?, ?, ?, 'unknown')`,
    [id, workspace_id, name, provider, preview ?? null]
  );
  res.status(201).json(dbGet(`SELECT id, name, provider, key_preview, status FROM api_keys WHERE id = ?`, [id]));
});

securityRouter.post('/keys/:id/validate', async (req: Request, res: Response) => {
  const key = dbGet<{ provider: string }>(`SELECT * FROM api_keys WHERE id = ?`, [req.params.id]);
  if (!key) return res.status(404).json({ error: 'Key not found' });

  // Simple reachability check per provider
  let status: 'valid' | 'invalid' | 'unknown' = 'unknown';
  try {
    // Just check provider endpoint is reachable — real validation needs actual key test call
    const endpoints: Record<string, string> = {
      anthropic:  'https://api.anthropic.com',
      openai:     'https://api.openai.com',
      gemini:     'https://generativelanguage.googleapis.com',
      openrouter: 'https://openrouter.ai',
    };
    const url = endpoints[key.provider];
    if (url) {
      await new Promise((resolve, reject) => {
        https.get(url, (r) => { status = r.statusCode !== 404 ? 'valid' : 'invalid'; resolve(null); }).on('error', reject);
      });
    }
  } catch { status = 'unknown'; }

  dbRun(
    `UPDATE api_keys SET status = ?, last_checked = datetime('now') WHERE id = ?`,
    [status, req.params.id]
  );
  res.json({ id: req.params.id, status });
});

securityRouter.delete('/keys/:id', (req: Request, res: Response) => {
  dbRun(`DELETE FROM api_keys WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

// Security audit summary
securityRouter.get('/audit', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;

  const invalidKeys = dbGet<{ n: number }>(
    `SELECT COUNT(*) as n FROM api_keys WHERE workspace_id = ? AND status = 'invalid'`,
    [workspace]
  )?.n ?? 0;

  const recentErrors = dbGet<{ n: number }>(
    `SELECT COUNT(*) as n FROM logs
     WHERE workspace_id = ? AND level IN ('error','fatal') AND logged_at >= datetime('now','-1 hour')`,
    [workspace]
  )?.n ?? 0;

  const criticalAlerts = dbGet<{ n: number }>(
    `SELECT COUNT(*) as n FROM alerts
     WHERE workspace_id = ? AND severity = 'critical' AND resolved = 0`,
    [workspace]
  )?.n ?? 0;

  const score = Math.max(0, 100 - invalidKeys * 15 - recentErrors * 2 - criticalAlerts * 10);

  res.json({
    score,
    invalid_keys: invalidKeys,
    recent_errors: recentErrors,
    critical_alerts: criticalAlerts,
    recommendations: [
      invalidKeys > 0 && 'Rotate invalid API keys immediately',
      recentErrors > 10 && 'High error rate — investigate logs',
      criticalAlerts > 0 && 'Unresolved critical alerts require attention',
    ].filter(Boolean),
  });
});
