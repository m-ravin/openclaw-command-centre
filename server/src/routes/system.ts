import { Router, Request, Response } from 'express';
import { dbAll, dbGet } from '../db/database';
import si from 'systeminformation';

export const systemRouter = Router();

systemRouter.get('/metrics', async (_req: Request, res: Response) => {
  const recent = dbAll(
    `SELECT * FROM system_metrics ORDER BY recorded_at DESC LIMIT 1`,
    []
  );
  res.json(recent[0] ?? null);
});

systemRouter.get('/metrics/history', (req: Request, res: Response) => {
  const { minutes = 60 } = req.query;
  const rows = dbAll(
    `SELECT * FROM system_metrics
     WHERE recorded_at >= datetime('now', '-' || ? || ' minutes')
     ORDER BY recorded_at ASC`,
    [Number(minutes)]
  );
  res.json(rows);
});

systemRouter.get('/info', async (_req: Request, res: Response) => {
  try {
    const [os, cpu, mem, disk] = await Promise.all([
      si.osInfo(),
      si.cpu(),
      si.mem(),
      si.fsSize(),
    ]);
    res.json({ os, cpu, memory: mem, disk });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

systemRouter.get('/processes', async (_req: Request, res: Response) => {
  try {
    const procs = await si.processes();
    // Return top 20 by CPU
    const top = [...procs.list]
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 20);
    res.json({ total: procs.all, top });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
