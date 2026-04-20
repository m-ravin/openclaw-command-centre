import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { bus } from '../events/eventBus';
import { v4 as uuidv4 } from 'uuid';

export const agentsRouter = Router();

agentsRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  const agents = dbAll(
    `SELECT a.*,
       (SELECT COUNT(*) FROM agent_calls WHERE caller_id = a.id OR callee_id = a.id) as call_count
     FROM agents a WHERE a.workspace_id = ? ORDER BY a.name`,
    [workspace]
  );
  res.json(agents);
});

agentsRouter.get('/graph', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;
  const nodes = dbAll(`SELECT * FROM agents WHERE workspace_id = ?`, [workspace]);
  const edges = dbAll(
    `SELECT ac.*, a1.name as caller_name, a2.name as callee_name
     FROM agent_calls ac
     LEFT JOIN agents a1 ON ac.caller_id = a1.id
     LEFT JOIN agents a2 ON ac.callee_id = a2.id
     WHERE ac.called_at >= datetime('now', '-24 hours')
     ORDER BY ac.called_at DESC LIMIT 500`,
    []
  );
  res.json({ nodes, edges });
});

agentsRouter.get('/:id', (req: Request, res: Response) => {
  const agent = dbGet(`SELECT * FROM agents WHERE id = ?`, [req.params.id]);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  const recentCalls = dbAll(
    `SELECT * FROM agent_calls WHERE caller_id = ? OR callee_id = ?
     ORDER BY called_at DESC LIMIT 50`,
    [req.params.id, req.params.id]
  );
  res.json({ agent, recentCalls });
});

agentsRouter.post('/', (req: Request, res: Response) => {
  const { name, type = 'claude', model, provider, system_prompt, tools = [], config = {}, workspace_id = 'default' } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = uuidv4();
  dbRun(
    `INSERT INTO agents (id, workspace_id, name, type, model, provider, system_prompt, tools, config)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workspace_id, name, type, model, provider, system_prompt, JSON.stringify(tools), JSON.stringify(config)]
  );
  const agent = dbGet(`SELECT * FROM agents WHERE id = ?`, [id]);
  bus.emit('agent.update', agent);
  res.status(201).json(agent);
});

agentsRouter.patch('/:id/status', (req: Request, res: Response) => {
  const { status } = req.body;
  const valid = ['running', 'stopped', 'error', 'pending'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'invalid status' });
  dbRun(`UPDATE agents SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, req.params.id]);
  const agent = dbGet(`SELECT * FROM agents WHERE id = ?`, [req.params.id]);
  bus.emit('agent.update', agent);
  res.json(agent);
});

agentsRouter.get('/:id/calls', (req: Request, res: Response) => {
  const { limit = 50, offset = 0 } = req.query;
  const calls = dbAll(
    `SELECT ac.*, a1.name as caller_name, a2.name as callee_name
     FROM agent_calls ac
     LEFT JOIN agents a1 ON ac.caller_id = a1.id
     LEFT JOIN agents a2 ON ac.callee_id = a2.id
     WHERE ac.caller_id = ? OR ac.callee_id = ?
     ORDER BY ac.called_at DESC LIMIT ? OFFSET ?`,
    [req.params.id, req.params.id, Number(limit), Number(offset)]
  );
  res.json(calls);
});
