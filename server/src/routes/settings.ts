import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';

export const settingsRouter = Router();

settingsRouter.get('/', (_req: Request, res: Response) => {
  const settings = dbAll<{ key: string; value: string; description: string }>(
    `SELECT key, value, description, updated_at FROM settings ORDER BY key`
  );
  const obj: Record<string, string> = {};
  for (const s of settings) obj[s.key] = s.value;
  res.json(obj);
});

settingsRouter.get('/:key', (req: Request, res: Response) => {
  const row = dbGet(`SELECT * FROM settings WHERE key = ?`, [req.params.key]);
  if (!row) return res.status(404).json({ error: 'Setting not found' });
  res.json(row);
});

settingsRouter.put('/:key', (req: Request, res: Response) => {
  const { value } = req.body;
  if (value == null) return res.status(400).json({ error: 'value required' });
  dbRun(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [req.params.key, String(value)]
  );
  res.json(dbGet(`SELECT * FROM settings WHERE key = ?`, [req.params.key]));
});

settingsRouter.put('/bulk', (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    dbRun(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, String(value)]
    );
  }
  res.json({ updated: Object.keys(updates).length });
});

// Workspace management
settingsRouter.get('/workspaces/all', (_req: Request, res: Response) => {
  res.json(dbAll(`SELECT * FROM workspaces ORDER BY created_at ASC`));
});

settingsRouter.post('/workspaces', (req: Request, res: Response) => {
  const { name, description, color = '#6366f1', icon = 'briefcase', config_path, log_path, memory_path } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  dbRun(
    `INSERT OR IGNORE INTO workspaces (id, name, description, color, icon, config_path, log_path, memory_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, description ?? null, color, icon, config_path ?? null, log_path ?? null, memory_path ?? null]
  );
  res.status(201).json(dbGet(`SELECT * FROM workspaces WHERE id = ?`, [id]));
});
