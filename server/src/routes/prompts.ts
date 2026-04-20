import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

export const promptsRouter = Router();

promptsRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default', category, q } = req.query;
  let sql = `SELECT * FROM saved_prompts WHERE workspace_id = ?`;
  const params: unknown[] = [workspace];
  if (category) { sql += ` AND category = ?`; params.push(category); }
  if (q)        { sql += ` AND (name LIKE ? OR content LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }
  sql += ` ORDER BY run_count DESC`;
  res.json(dbAll(sql, params));
});

promptsRouter.post('/', (req: Request, res: Response) => {
  const { workspace_id = 'default', name, content, category, tags = [] } = req.body;
  if (!name || !content) return res.status(400).json({ error: 'name and content required' });
  const id = uuidv4();
  dbRun(
    `INSERT INTO saved_prompts (id, workspace_id, name, content, category, tags)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, workspace_id, name, content, category ?? null, JSON.stringify(tags)]
  );
  res.status(201).json(dbGet(`SELECT * FROM saved_prompts WHERE id = ?`, [id]));
});

// Run a prompt against a provider
promptsRouter.post('/run', async (req: Request, res: Response) => {
  const { prompt, model, provider, api_key, prompt_id, workspace_id = 'default' } = req.body;
  if (!prompt || !model || !provider) return res.status(400).json({ error: 'prompt, model, provider required' });

  const start = Date.now();
  const runId = uuidv4();
  let response = '';
  let input_tokens = 0;
  let output_tokens = 0;
  let status: 'success' | 'error' | 'timeout' = 'success';
  let error_msg = '';

  try {
    if (provider === 'anthropic') {
      const key = api_key || process.env.ANTHROPIC_API_KEY;
      const resp = await axios.post(
        'https://api.anthropic.com/v1/messages',
        { model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] },
        { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 30000 }
      );
      response = resp.data.content[0]?.text ?? '';
      input_tokens  = resp.data.usage?.input_tokens ?? 0;
      output_tokens = resp.data.usage?.output_tokens ?? 0;
    } else if (provider === 'openai') {
      const key = api_key || process.env.OPENAI_API_KEY;
      const resp = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        { model, messages: [{ role: 'user', content: prompt }] },
        { headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' }, timeout: 30000 }
      );
      response = resp.data.choices[0]?.message?.content ?? '';
      input_tokens  = resp.data.usage?.prompt_tokens ?? 0;
      output_tokens = resp.data.usage?.completion_tokens ?? 0;
    } else if (provider === 'ollama') {
      const base = process.env.OLLAMA_HOST || 'http://localhost:11434';
      const resp = await axios.post(
        `${base}/api/generate`,
        { model, prompt, stream: false },
        { timeout: 60000 }
      );
      response = resp.data.response ?? '';
    }
  } catch (err: unknown) {
    status = 'error';
    error_msg = (err as Error).message ?? String(err);
  }

  const latency = Date.now() - start;
  const cost = (input_tokens * 0.000003 + output_tokens * 0.000015);

  dbRun(
    `INSERT INTO prompt_runs
       (id, prompt_id, prompt_text, model, provider, response, input_tokens, output_tokens, latency_ms, cost, status, error_msg)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [runId, prompt_id ?? null, prompt, model, provider, response, input_tokens, output_tokens, latency, cost, status, error_msg]
  );

  if (prompt_id) {
    dbRun(`UPDATE saved_prompts SET run_count = run_count + 1 WHERE id = ?`, [prompt_id]);
  }

  res.json({ id: runId, response, input_tokens, output_tokens, latency_ms: latency, cost, status, error_msg });
});

promptsRouter.get('/:id/runs', (req: Request, res: Response) => {
  res.json(dbAll(
    `SELECT * FROM prompt_runs WHERE prompt_id = ? ORDER BY run_at DESC LIMIT 50`,
    [req.params.id]
  ));
});
