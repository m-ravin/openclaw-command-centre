import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { bus } from '../events/eventBus';
import { v4 as uuidv4 } from 'uuid';
import { readGatewaySessions } from '../lib/gatewayReader';

export const sessionsRouter = Router();

sessionsRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default', status, limit = 50, offset = 0 } = req.query;
  let sql = `SELECT * FROM sessions WHERE workspace_id = ?`;
  const params: unknown[] = [workspace];
  if (status) { sql += ` AND status = ?`; params.push(status); }
  sql += ` ORDER BY last_active DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));
  const ccSessions = dbAll(sql, params);

  // Merge with real OpenClaw task_runs (each run = a session)
  const gwSessions = readGatewaySessions()
    .filter(s => !status || s.status === status);  // apply status filter

  // Deduplicate: CC sessions take priority (by id)
  const ccIds = new Set(ccSessions.map((s: any) => s.id));
  const merged = [
    ...ccSessions,
    ...gwSessions.filter(s => !ccIds.has(s.id)),
  ].slice(Number(offset), Number(offset) + Number(limit));

  const total = ccSessions.length + gwSessions.length;
  res.json({ sessions: merged, total });
});

sessionsRouter.get('/:id', (req: Request, res: Response) => {
  const session = dbGet(`SELECT * FROM sessions WHERE id = ?`, [req.params.id]);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const events = dbAll(`SELECT * FROM session_events WHERE session_id = ? ORDER BY created_at DESC LIMIT 100`, [req.params.id]);
  res.json({ session, events });
});

sessionsRouter.post('/', (req: Request, res: Response) => {
  const { name, model, provider, workspace_id = 'default', metadata = {} } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  dbRun(
    `INSERT INTO sessions (id, workspace_id, name, model, provider, status, metadata)
     VALUES (?, ?, ?, ?, ?, 'active', ?)`,
    [id, workspace_id, name, model, provider, JSON.stringify(metadata)]
  );
  const session = dbGet(`SELECT * FROM sessions WHERE id = ?`, [id]);
  bus.emit('session.update', session);
  res.status(201).json(session);
});

sessionsRouter.patch('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  const valid = ['active', 'idle', 'error', 'terminated', 'paused'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'invalid status' });
  const extra = status === 'terminated' ? `, ended_at = datetime('now')` : ``;
  dbRun(`UPDATE sessions SET status = ?, last_active = datetime('now')${extra} WHERE id = ?`, [status, req.params.id]);
  const session = dbGet(`SELECT * FROM sessions WHERE id = ?`, [req.params.id]);
  bus.emit('session.update', session);
  res.json(session);
});

sessionsRouter.delete('/:id', (req: Request, res: Response) => {
  dbRun(`UPDATE sessions SET status = 'terminated', ended_at = datetime('now') WHERE id = ?`, [req.params.id]);
  bus.emit('session.update', { id: req.params.id, status: 'terminated' });
  res.json({ ok: true });
});

sessionsRouter.get('/stats/summary', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;

  // CC DB counts
  const ccCounts = dbAll<{ status: string; n: number }>(
    `SELECT status, COUNT(*) as n FROM sessions WHERE workspace_id = ? GROUP BY status`,
    [workspace]
  );
  const agg = dbGet<{ total_cost: number; total_tokens: number; total_messages: number }>(
    `SELECT SUM(total_cost) as total_cost, SUM(input_tokens+output_tokens) as total_tokens,
            SUM(message_count) as total_messages
     FROM sessions WHERE workspace_id = ?`,
    [workspace]
  );

  // Gateway counts — merge into cc counts map
  const gwSessions = readGatewaySessions();
  const countMap: Record<string, number> = {};
  for (const c of ccCounts) countMap[c.status] = (countMap[c.status] ?? 0) + c.n;
  for (const s of gwSessions) countMap[s.status] = (countMap[s.status] ?? 0) + 1;
  const counts = Object.entries(countMap).map(([status, n]) => ({ status, n }));

  res.json({
    counts,
    total_cost:     agg?.total_cost     ?? 0,
    total_tokens:   agg?.total_tokens   ?? 0,
    total_messages: (agg?.total_messages ?? 0) + gwSessions.length,
  });
});
