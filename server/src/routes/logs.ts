import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import { readGatewayLogs } from '../lib/gatewayReader';

export const logsRouter = Router();

logsRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default', level, source, q, session_id, agent_id, limit = 100, offset = 0 } = req.query;
  let sql = `SELECT * FROM logs WHERE workspace_id = ?`;
  const params: unknown[] = [workspace];

  if (level)      { sql += ` AND level = ?`;       params.push(level); }
  if (source)     { sql += ` AND source = ?`;      params.push(source); }
  if (session_id) { sql += ` AND session_id = ?`;  params.push(session_id); }
  if (agent_id)   { sql += ` AND agent_id = ?`;    params.push(agent_id); }
  if (q)          { sql += ` AND message LIKE ?`;  params.push(`%${q}%`); }

  const total = (dbGet<{ n: number }>(
    sql.replace('SELECT *', 'SELECT COUNT(*) as n'), params
  )?.n) ?? 0;

  sql += ` ORDER BY logged_at DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));
  const ccLogs = dbAll(sql, params);

  // Merge gateway logs (commands.log) with CC logs
  const gwLogs = readGatewayLogs({
    q:     q as string | undefined,
    level: level as string | undefined,
    limit: Number(limit),
  });

  const merged = [...ccLogs, ...gwLogs]
    .sort((a: any, b: any) => new Date(b.logged_at ?? 0).getTime() - new Date(a.logged_at ?? 0).getTime())
    .slice(Number(offset), Number(offset) + Number(limit));

  res.json({ logs: merged, total: total + gwLogs.length });
});

logsRouter.get('/sources', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  const sources = dbAll<{ source: string; n: number }>(
    `SELECT source, COUNT(*) as n FROM logs WHERE workspace_id = ? GROUP BY source ORDER BY n DESC`,
    [workspace]
  );
  res.json(sources);
});

logsRouter.get('/stats', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  const byLevel = dbAll<{ level: string; n: number }>(
    `SELECT level, COUNT(*) as n FROM logs WHERE workspace_id = ? AND logged_at >= datetime('now','-24 hours')
     GROUP BY level`,
    [workspace]
  );
  const timeline = dbAll(
    `SELECT strftime('%H:00', logged_at) as hour, level, COUNT(*) as n
     FROM logs WHERE workspace_id = ? AND logged_at >= datetime('now','-24 hours')
     GROUP BY hour, level ORDER BY hour`,
    [workspace]
  );
  res.json({ by_level: byLevel, timeline });
});

logsRouter.post('/', (req: Request, res: Response) => {
  const { workspace_id = 'default', level = 'info', source, message, data = {}, session_id, agent_id } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const id = uuidv4();
  dbRun(
    `INSERT INTO logs (id, workspace_id, session_id, agent_id, level, source, message, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workspace_id, session_id ?? null, agent_id ?? null, level, source ?? null, message, JSON.stringify(data)]
  );
  res.status(201).json({ id });
});

logsRouter.delete('/prune', (req: Request, res: Response) => {
  const { workspace = 'default', days = 30 } = req.query;
  const result = dbRun(
    `DELETE FROM logs WHERE workspace_id = ? AND logged_at < datetime('now', '-' || ? || ' days')`,
    [workspace, Number(days)]
  );
  res.json({ deleted: result.changes });
});
