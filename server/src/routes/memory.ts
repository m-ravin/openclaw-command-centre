import { Router, Request, Response } from 'express';
import { dbAll, dbGet, dbRun } from '../db/database';
import { bus } from '../events/eventBus';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { readGatewayMemory, readGatewayMemoryStats } from '../lib/gatewayReader';

export const memoryRouter = Router();

memoryRouter.get('/', (req: Request, res: Response) => {
  const { workspace = 'default', type, archived = 'false', q, limit = 100, offset = 0 } = req.query;

  // Read from gateway memory DB directly
  const gatewayFiles = readGatewayMemory(q as string | undefined);

  // Also include any manually added files from Command Centre DB
  let sql = `SELECT * FROM memory_files WHERE workspace_id = ? AND archived = ?`;
  const params: unknown[] = [workspace, archived === 'true' ? 1 : 0];
  if (type) { sql += ` AND type = ?`; params.push(type); }
  if (q)    { sql += ` AND (name LIKE ? OR content LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }
  sql += ` ORDER BY last_modified DESC LIMIT ? OFFSET ?`;
  params.push(Number(limit), Number(offset));
  const ccFiles = dbAll(sql, params);

  // Gateway files take priority; merge with CC files (avoid duplicates by name)
  const ccNames = new Set(ccFiles.map((f: any) => f.name));
  const merged  = [...ccFiles, ...gatewayFiles.filter(f => !ccNames.has(f.name))];
  res.json(merged);
});

memoryRouter.get('/:id', (req: Request, res: Response) => {
  const file = dbGet(`SELECT * FROM memory_files WHERE id = ?`, [req.params.id]);
  if (!file) return res.status(404).json({ error: 'Memory file not found' });
  res.json(file);
});

memoryRouter.put('/:id', (req: Request, res: Response) => {
  const { content } = req.body;
  const file = dbGet<{ file_path: string }>(`SELECT * FROM memory_files WHERE id = ?`, [req.params.id]);
  if (!file) return res.status(404).json({ error: 'Memory file not found' });

  const hash = crypto.createHash('sha256').update(content ?? '').digest('hex');
  dbRun(
    `UPDATE memory_files SET content = ?, content_hash = ?, size_bytes = ?,
      last_modified = datetime('now'), synced_at = datetime('now') WHERE id = ?`,
    [content, hash, Buffer.byteLength(content ?? ''), req.params.id]
  );

  // Try to write to actual filesystem
  try {
    const resolvedPath = file.file_path.replace('~', process.env.HOME || process.env.USERPROFILE || '');
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, content ?? '');
  } catch { /* filesystem write is best-effort */ }

  bus.emit('memory.update', { id: req.params.id });
  res.json(dbGet(`SELECT * FROM memory_files WHERE id = ?`, [req.params.id]));
});

memoryRouter.post('/:id/archive', (req: Request, res: Response) => {
  dbRun(`UPDATE memory_files SET archived = 1 WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

memoryRouter.get('/stats/summary', (req: Request, res: Response) => {
  const { workspace = 'default' } = req.query;

  // Try gateway stats first
  const gwStats = readGatewayMemoryStats();
  if (gwStats && gwStats.total > 0) {
    return res.json(gwStats);
  }

  // Fall back to Command Centre DB
  const stats = dbGet<{ total: number; duplicates: number; archived: number; total_bytes: number }>(
    `SELECT COUNT(*) as total,
       SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicates,
       SUM(CASE WHEN archived = 1 THEN 1 ELSE 0 END) as archived,
       SUM(size_bytes) as total_bytes
     FROM memory_files WHERE workspace_id = ?`,
    [workspace]
  );
  const byType = dbAll<{ type: string; n: number }>(
    `SELECT type, COUNT(*) as n FROM memory_files WHERE workspace_id = ? GROUP BY type`,
    [workspace]
  );
  res.json({ ...stats, by_type: byType });
});

// Scan memory folder and sync to DB
memoryRouter.post('/sync', async (req: Request, res: Response) => {
  const { workspace_id = 'default', memory_path } = req.body;
  const resolved = (memory_path || `${process.env.HOME || '~'}/.claude/memory`)
    .replace('~', process.env.HOME || process.env.USERPROFILE || '');

  let synced = 0;
  if (fs.existsSync(resolved)) {
    const files = fs.readdirSync(resolved).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    for (const file of files) {
      const fullPath = path.join(resolved, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const stat = fs.statSync(fullPath);
      const existing = dbGet<{ id: string; content_hash: string }>(
        `SELECT id, content_hash FROM memory_files WHERE file_path = ?`, [fullPath]
      );
      if (!existing) {
        dbRun(
          `INSERT INTO memory_files (id, workspace_id, file_path, name, content, content_hash, size_bytes, last_modified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), workspace_id, fullPath, path.basename(file, path.extname(file)),
           content, hash, stat.size, stat.mtime.toISOString()]
        );
        synced++;
      } else if (existing.content_hash !== hash) {
        dbRun(
          `UPDATE memory_files SET content = ?, content_hash = ?, size_bytes = ?, last_modified = ? WHERE id = ?`,
          [content, hash, stat.size, stat.mtime.toISOString(), existing.id]
        );
        synced++;
      }
    }
  }
  res.json({ synced, path: resolved });
});
