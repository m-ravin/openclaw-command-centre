import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { v4 as uuidv4 } from 'uuid';

export const operatorsRouter = Router();

operatorsRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default', limit = 100, offset = 0 } = req.query;
  const rows = dbAll(
    `SELECT * FROM operators WHERE workspace_id = ? ORDER BY total_cost DESC LIMIT ? OFFSET ?`,
    [workspace, Number(limit), Number(offset)]
  );
  res.json(rows);
});

operatorsRouter.get('/:id', (req: Request, res: Response) => {
  const op = dbGet(`SELECT * FROM operators WHERE id = ?`, [req.params.id]);
  if (!op) return res.status(404).json({ error: 'Operator not found' });
  res.json(op);
});

operatorsRouter.post('/', (req: Request, res: Response) => {
  const { workspace_id = 'default', identifier, display_name, channel = 'web' } = req.body;
  if (!identifier) return res.status(400).json({ error: 'identifier required' });
  const id = uuidv4();
  dbRun(
    `INSERT OR IGNORE INTO operators (id, workspace_id, identifier, display_name, channel)
     VALUES (?, ?, ?, ?, ?)`,
    [id, workspace_id, identifier, display_name ?? null, channel]
  );
  res.status(201).json(dbGet(`SELECT * FROM operators WHERE identifier = ? AND workspace_id = ?`, [identifier, workspace_id]));
});
