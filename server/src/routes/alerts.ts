import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { bus } from '../events/eventBus';
import { v4 as uuidv4 } from 'uuid';

export const alertsRouter = Router();

alertsRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default', resolved = 'false', severity, limit = 50 } = req.query;
  let sql = `SELECT * FROM alerts WHERE workspace_id = ? AND resolved = ?`;
  const params: unknown[] = [workspace, resolved === 'true' ? 1 : 0];
  if (severity) { sql += ` AND severity = ?`; params.push(severity); }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(Number(limit));
  res.json(dbAll(sql, params));
});

alertsRouter.post('/', (req: Request, res: Response) => {
  const { workspace_id = 'default', type, severity = 'info', title, message, data = {} } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'type and title required' });
  const id = uuidv4();
  dbRun(
    `INSERT INTO alerts (id, workspace_id, type, severity, title, message, data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, workspace_id, type, severity, title, message, JSON.stringify(data)]
  );
  const alert = dbGet(`SELECT * FROM alerts WHERE id = ?`, [id]);
  bus.emit('alert.new', alert);
  res.status(201).json(alert);
});

alertsRouter.patch('/:id/acknowledge', (req: Request, res: Response) => {
  dbRun(`UPDATE alerts SET acknowledged = 1 WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

alertsRouter.patch('/:id/resolve', (req: Request, res: Response) => {
  dbRun(
    `UPDATE alerts SET resolved = 1, resolved_at = datetime('now') WHERE id = ?`,
    [req.params.id]
  );
  const alert = dbGet(`SELECT * FROM alerts WHERE id = ?`, [req.params.id]);
  bus.emit('alert.resolved', alert);
  res.json(alert);
});

// Alert Rules
alertsRouter.get('/rules', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  res.json(dbAll(`SELECT * FROM alert_rules WHERE workspace_id = ? ORDER BY created_at DESC`, [workspace]));
});

alertsRouter.post('/rules', (req: Request, res: Response) => {
  const { workspace_id = 'default', name, metric, operator = 'gt', threshold, window_mins = 5, severity = 'warning', channels = [] } = req.body;
  if (!name || !metric || threshold == null) return res.status(400).json({ error: 'name, metric, threshold required' });
  const id = uuidv4();
  dbRun(
    `INSERT INTO alert_rules (id, workspace_id, name, metric, operator, threshold, window_mins, severity, channels)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workspace_id, name, metric, operator, threshold, window_mins, severity, JSON.stringify(channels)]
  );
  res.status(201).json(dbGet(`SELECT * FROM alert_rules WHERE id = ?`, [id]));
});

alertsRouter.delete('/rules/:id', (req: Request, res: Response) => {
  dbRun(`DELETE FROM alert_rules WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});
