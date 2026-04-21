import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

import { getDb } from './db/database';
import { bus } from './events/eventBus';
import { startSystemCollector } from './collectors/systemCollector';
import { initJobScheduler } from './routes/jobs';

import { sessionsRouter }  from './routes/sessions';
import { costsRouter }     from './routes/costs';
import { agentsRouter }    from './routes/agents';
import { logsRouter }      from './routes/logs';
import { systemRouter }    from './routes/system';
import { alertsRouter }    from './routes/alerts';
import { memoryRouter }    from './routes/memory';
import { securityRouter }  from './routes/security';
import { jobsRouter }      from './routes/jobs';
import { insightsRouter }  from './routes/insights';
import { promptsRouter }   from './routes/prompts';
import { settingsRouter }  from './routes/settings';
import { kbRouter }        from './routes/kb';
import { operatorsRouter } from './routes/operators';
import { filesRouter }     from './routes/files';
import { hooksRouter }     from './routes/hooks';

const PORT      = parseInt(process.env.PORT ?? '4000', 10);
const WS_PORT   = parseInt(process.env.WS_PORT ?? '4001', 10);
const ORIGIN    = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

// ─── HTTP Server ─────────────────────────────────────────────────────────────
const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(rateLimit({ windowMs: 60_000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.use('/api/sessions',  sessionsRouter);
app.use('/api/costs',     costsRouter);
app.use('/api/agents',    agentsRouter);
app.use('/api/logs',      logsRouter);
app.use('/api/system',    systemRouter);
app.use('/api/alerts',    alertsRouter);
app.use('/api/memory',    memoryRouter);
app.use('/api/security',  securityRouter);
app.use('/api/jobs',      jobsRouter);
app.use('/api/insights',  insightsRouter);
app.use('/api/prompts',   promptsRouter);
app.use('/api/settings',  settingsRouter);
app.use('/api/kb',        kbRouter);
app.use('/api/operators', operatorsRouter);
app.use('/api/files',    filesRouter);
app.use('/api/hooks',    hooksRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    ws_clients: bus.connectionCount,
    ts: new Date().toISOString(),
  });
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const httpServer = createServer(app);
const wss = new WebSocketServer({ port: WS_PORT });
bus.attach(wss);

// ─── Bootstrap ───────────────────────────────────────────────────────────────
function start() {
  // Initialise DB (runs SCHEMA_SQL)
  getDb();

  // Start background collectors
  const metricsInterval = parseInt(
    process.env.METRICS_INTERVAL_SEC ?? '10', 10
  );
  startSystemCollector(metricsInterval);


  // Load cron jobs
  initJobScheduler();

  httpServer.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════╗
║   OpenClaw Command Centre — Server v1.0.0        ║
╠══════════════════════════════════════════════════╣
║  API   → http://localhost:${PORT}                    ║
║  WS    → ws://localhost:${WS_PORT}                   ║
║  Env   → ${process.env.NODE_ENV ?? 'development'}                       ║
╚══════════════════════════════════════════════════╝
    `);
  });
}

start();
