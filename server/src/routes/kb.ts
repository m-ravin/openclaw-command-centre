import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export const kbRouter = Router();

kbRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  res.json(dbAll(`SELECT * FROM kb_sources WHERE workspace_id = ? ORDER BY created_at DESC`, [workspace]));
});

kbRouter.get('/:id', (req: Request, res: Response) => {
  const src = dbGet(`SELECT * FROM kb_sources WHERE id = ?`, [req.params.id]);
  if (!src) return res.status(404).json({ error: 'Source not found' });
  res.json(src);
});

kbRouter.post('/', (req: Request, res: Response) => {
  const { workspace_id = 'default', name, type = 'directory', path } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  dbRun(
    `INSERT INTO kb_sources (id, workspace_id, name, type, path) VALUES (?, ?, ?, ?, ?)`,
    [id, workspace_id, name, type, path ?? null]
  );
  res.status(201).json(dbGet(`SELECT * FROM kb_sources WHERE id = ?`, [id]));
});

kbRouter.post('/:id/sync', (req: Request, res: Response) => {
  // Mark as syncing — real sync would run in background worker
  dbRun(
    `UPDATE kb_sources SET status = 'syncing', last_synced = datetime('now') WHERE id = ?`,
    [req.params.id]
  );
  // Simulate sync completing after 2 seconds
  setTimeout(() => {
    dbRun(`UPDATE kb_sources SET status = 'healthy' WHERE id = ?`, [req.params.id]);
  }, 2000);
  res.json({ ok: true, message: 'Sync started' });
});

kbRouter.delete('/:id', (req: Request, res: Response) => {
  dbRun(`DELETE FROM kb_sources WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});
