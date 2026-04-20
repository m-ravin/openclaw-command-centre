// Seeds the database with realistic demo data for development.
import { getDb, dbRun } from './database';
import { v4 as uuidv4 } from 'uuid';

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function randomInt(min: number, max: number) {
  return Math.floor(randomBetween(min, max));
}
function pastDate(hoursAgo: number) {
  return new Date(Date.now() - hoursAgo * 3600_000).toISOString();
}

const PROVIDERS = ['anthropic', 'openai', 'ollama', 'gemini', 'openrouter'];
const MODELS = [
  'claude-sonnet-4-6', 'claude-opus-4-7', 'gpt-4o', 'gpt-4o-mini',
  'gemini-1.5-pro', 'llama3.1:8b', 'qwen3.5:4b',
];
const STATUSES = ['active', 'idle', 'error', 'terminated'];

export async function seed() {
  const db = getDb();

  // Extra workspaces
  const workspaces = [
    { id: 'work',    name: 'Work',     color: '#10b981' },
    { id: 'testlab', name: 'Test Lab', color: '#f59e0b' },
  ];
  for (const w of workspaces) {
    db.prepare(`INSERT OR IGNORE INTO workspaces (id, name, color) VALUES (?, ?, ?)`).run(w.id, w.name, w.color);
  }

  // Sessions
  const sessionIds: string[] = [];
  const sessionData = [
    { name: 'Research Assistant', model: 'claude-sonnet-4-6', provider: 'anthropic', status: 'active' },
    { name: 'Code Review Bot',    model: 'gpt-4o',            provider: 'openai',    status: 'active' },
    { name: 'Data Pipeline',      model: 'claude-opus-4-7',   provider: 'anthropic', status: 'idle' },
    { name: 'Support Agent',      model: 'gpt-4o-mini',       provider: 'openai',    status: 'active' },
    { name: 'Summary Worker',     model: 'qwen3.5:4b',        provider: 'ollama',    status: 'idle' },
    { name: 'Translation Service',model: 'gemini-1.5-pro',    provider: 'gemini',    status: 'error' },
  ];
  for (const s of sessionData) {
    const id = uuidv4();
    sessionIds.push(id);
    db.prepare(`
      INSERT OR IGNORE INTO sessions
        (id, workspace_id, name, model, provider, status, input_tokens, output_tokens,
         total_cost, message_count, error_count, started_at, last_active)
      VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, s.name, s.model, s.provider, s.status,
      randomInt(10000, 500000), randomInt(5000, 200000),
      randomBetween(0.1, 25).toFixed(4),
      randomInt(20, 500), randomInt(0, 10),
      pastDate(randomInt(1, 72)), pastDate(randomInt(0, 2))
    );
  }

  // Agents
  const agentIds: string[] = [];
  const agentData = [
    { name: 'Orchestrator',      type: 'claude', model: 'claude-opus-4-7',  status: 'running' },
    { name: 'Web Searcher',      type: 'tool',   model: 'gpt-4o',           status: 'running' },
    { name: 'Code Executor',     type: 'tool',   model: 'claude-sonnet-4-6',status: 'running' },
    { name: 'Memory Manager',    type: 'system', model: 'claude-sonnet-4-6',status: 'stopped' },
    { name: 'Email Composer',    type: 'claude', model: 'gpt-4o-mini',      status: 'error' },
    { name: 'Data Analyst',      type: 'claude', model: 'gemini-1.5-pro',   status: 'running' },
    { name: 'Document Ingestor', type: 'tool',   model: 'llama3.1:8b',      status: 'stopped' },
  ];
  for (const a of agentData) {
    const id = uuidv4();
    agentIds.push(id);
    db.prepare(`
      INSERT OR IGNORE INTO agents
        (id, workspace_id, name, type, model, provider, status,
         invocation_count, error_count, total_cost, avg_latency_ms, created_at)
      VALUES (?, 'default', ?, ?, ?, 'anthropic', ?, ?, ?, ?, ?, ?)
    `).run(
      id, a.name, a.type, a.model, a.status,
      randomInt(50, 2000), randomInt(0, 50),
      randomBetween(0.5, 40).toFixed(4),
      randomInt(200, 3000),
      pastDate(randomInt(1, 200))
    );
  }

  // Cost records (last 30 days)
  for (let day = 0; day < 30; day++) {
    for (let req = 0; req < randomInt(5, 20); req++) {
      const provider = PROVIDERS[randomInt(0, PROVIDERS.length)];
      const model    = MODELS[randomInt(0, MODELS.length)];
      const input    = randomInt(500, 10000);
      const output   = randomInt(200, 5000);
      const cost     = (input * 0.000003 + output * 0.000015).toFixed(6);
      db.prepare(`
        INSERT INTO cost_records
          (id, workspace_id, provider, model, input_tokens, output_tokens, cost_usd, recorded_at)
        VALUES (?, 'default', ?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), provider, model, input, output, cost, pastDate(day * 24 + randomInt(0, 23)));
    }
  }

  // System metrics (last 2 hours at 10-sec intervals)
  for (let i = 0; i < 720; i++) {
    db.prepare(`
      INSERT INTO system_metrics
        (id, cpu_pct, mem_pct, mem_used_mb, mem_total_mb, disk_pct,
         disk_used_gb, disk_total_gb, net_rx_mb, net_tx_mb, processes, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(),
      randomBetween(5, 85).toFixed(1),
      randomBetween(40, 75).toFixed(1),
      randomBetween(6000, 11000).toFixed(0),
      16384,
      randomBetween(55, 70).toFixed(1),
      randomBetween(200, 250).toFixed(1),
      512,
      randomBetween(0.1, 50).toFixed(2),
      randomBetween(0.05, 20).toFixed(2),
      randomInt(200, 350),
      new Date(Date.now() - i * 10_000).toISOString()
    );
  }

  // Scheduled jobs
  const JOB_MODELS = ['claude-sonnet-4-6', 'gpt-4o-mini', 'llama3.1:8b', 'claude-opus-4-7', 'gpt-4o'];
  const jobData = [
    { name: 'Daily Cost Report',    schedule: '0 8 * * *',   type: 'cron',    last_status: 'success', model: 'claude-sonnet-4-6' },
    { name: 'Memory Dedup',         schedule: '0 2 * * *',   type: 'cron',    last_status: 'success', model: 'llama3.1:8b'      },
    { name: 'KB Sync',              schedule: '*/30 * * * *', type: 'cron',   last_status: 'error',   model: 'claude-sonnet-4-6' },
    { name: 'Session Cleanup',      schedule: '0 0 * * 0',   type: 'cron',    last_status: 'success', model: 'gpt-4o-mini'      },
    { name: 'Backup Config',        schedule: '0 3 * * *',   type: 'cron',    last_status: 'success', model: 'claude-sonnet-4-6' },
    { name: 'Health Check Webhook', schedule: '*/5 * * * *', type: 'webhook', last_status: 'success', model: 'gpt-4o-mini'      },
  ];
  const jobIds: string[] = [];
  for (const j of jobData) {
    const id = uuidv4();
    jobIds.push(id);
    const totalTokens = randomInt(5000, 200000);
    db.prepare(`
      INSERT OR IGNORE INTO jobs
        (id, workspace_id, name, type, schedule, enabled,
         last_run_at, last_status, last_model, total_tokens,
         run_count, error_count, created_at)
      VALUES (?, 'default', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, j.name, j.type, j.schedule,
      pastDate(randomInt(1, 24)), j.last_status, j.model, totalTokens,
      randomInt(50, 500), j.last_status === 'error' ? randomInt(1, 10) : 0,
      pastDate(randomInt(5, 30) * 24)
    );
    // Seed 5 recent job runs with token data
    for (let r = 0; r < 5; r++) {
      const runStatus = r === 0 && j.last_status === 'error' ? 'error' : 'success';
      const inp  = randomInt(200, 8000);
      const outp = Math.round(inp * randomBetween(0.3, 0.8));
      const dur  = randomInt(500, 15000);
      db.prepare(`
        INSERT INTO job_runs
          (id, job_id, status, model, input_tokens, output_tokens, cost, duration_ms,
           output, started_at, ended_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), id, runStatus, j.model,
        inp, outp, (inp * 0.000003 + outp * 0.000015).toFixed(6), dur,
        runStatus === 'error' ? 'Timeout: connection reset' : 'Completed successfully',
        pastDate(r * 24 + randomInt(0, 6)),
        pastDate(r * 24 + randomInt(0, 6) - dur / 3600000)
      );
    }
  }

  // Logs
  const logMessages = [
    { level: 'info',  source: 'session',  message: 'Session started successfully' },
    { level: 'warn',  source: 'cost',     message: 'Token usage 80% of daily budget' },
    { level: 'error', source: 'agent',    message: 'Tool call failed: timeout after 30s' },
    { level: 'info',  source: 'memory',   message: 'Memory sync completed: 42 files' },
    { level: 'warn',  source: 'system',   message: 'CPU usage exceeded 85%' },
    { level: 'fatal', source: 'session',  message: 'Session crashed: connection reset' },
    { level: 'info',  source: 'job',      message: 'Daily report generated and sent' },
    { level: 'debug', source: 'agent',    message: 'Tool call: web_search completed' },
  ];
  for (let i = 0; i < 200; i++) {
    const lm = logMessages[randomInt(0, logMessages.length)];
    db.prepare(`
      INSERT INTO logs (id, workspace_id, level, source, message, logged_at)
      VALUES (?, 'default', ?, ?, ?, ?)
    `).run(uuidv4(), lm.level, lm.source, lm.message, pastDate(randomBetween(0, 48)));
  }

  // Operators
  const operatorNames = ['alice@example.com', 'bob@example.com', 'carol@example.com', 'dave@example.com'];
  for (const name of operatorNames) {
    db.prepare(`
      INSERT OR IGNORE INTO operators
        (id, workspace_id, identifier, display_name, channel,
         total_sessions, total_messages, total_tokens, total_cost, last_seen)
      VALUES (?, 'default', ?, ?, 'web', ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), name, name.split('@')[0],
      randomInt(5, 100), randomInt(200, 5000),
      randomInt(50000, 2000000),
      randomBetween(1, 80).toFixed(2),
      pastDate(randomBetween(0, 6))
    );
  }

  // Memory files
  const memFiles = [
    { name: 'user_preferences', type: 'user',      path: '~/.claude/memory/user_preferences.md' },
    { name: 'project_context',  type: 'project',   path: '~/.claude/memory/project_context.md' },
    { name: 'feedback_notes',   type: 'feedback',  path: '~/.claude/memory/feedback_notes.md' },
    { name: 'api_references',   type: 'reference', path: '~/.claude/memory/api_references.md' },
    { name: 'duplicate_notes',  type: 'user',      path: '~/.claude/memory/duplicate_notes.md' },
  ];
  for (const mf of memFiles) {
    db.prepare(`
      INSERT OR IGNORE INTO memory_files
        (id, workspace_id, file_path, name, type, size_bytes, is_duplicate, last_modified)
      VALUES (?, 'default', ?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), mf.path, mf.name, mf.type,
      randomInt(500, 10000), mf.name === 'duplicate_notes' ? 1 : 0,
      pastDate(randomInt(1, 168))
    );
  }

  // Alerts
  const alertData = [
    { type: 'budget',   severity: 'warning',  title: 'Budget at 78%',             message: 'Monthly spend is $39 of $50 budget' },
    { type: 'cpu',      severity: 'warning',  title: 'High CPU Usage',             message: 'CPU averaged 88% for 5 minutes' },
    { type: 'session',  severity: 'error',    title: 'Session Crash',              message: 'Translation Service crashed at 14:32' },
    { type: 'job',      severity: 'error',    title: 'KB Sync Failed',             message: 'Knowledge base sync returned error 3 times' },
    { type: 'security', severity: 'critical', title: 'Invalid API Key Detected',   message: 'OpenAI key returned 401 — rotation required' },
  ];
  for (const a of alertData) {
    db.prepare(`
      INSERT INTO alerts (id, workspace_id, type, severity, title, message, created_at)
      VALUES (?, 'default', ?, ?, ?, ?, ?)
    `).run(uuidv4(), a.type, a.severity, a.title, a.message, pastDate(randomBetween(0, 12)));
  }

  // AI Insights
  const insightData = [
    { type: 'cost_spike',   category: 'cost',         severity: 'warning',     title: 'Costs up 34% this week', body: 'Token spend increased from $18.20 to $24.40 vs last week. Primary driver: GPT-4o usage in Code Review Bot.' },
    { type: 'model_slow',   category: 'performance',  severity: 'info',        title: 'Gemini 1.5 Pro slower than usual', body: 'Average latency 4.2s vs baseline 1.8s. Consider routing to Claude for time-sensitive tasks.' },
    { type: 'cost_opt',     category: 'optimization', severity: 'opportunity', title: 'Save $220/month by routing to Haiku', body: '62% of your requests use simple classification. Routing these to Claude Haiku maintains quality while cutting costs.' },
    { type: 'user_burn',    category: 'usage',        severity: 'warning',     title: 'alice@example.com: high token burn', body: 'This operator consumed 340k tokens today vs 80k average. Manual review recommended.' },
    { type: 'job_fail',     category: 'performance',  severity: 'critical',    title: '3 automations failing repeatedly', body: 'KB Sync, Email Composer, and Translation Service have >20% error rate over 24h.' },
  ];
  for (const ins of insightData) {
    db.prepare(`
      INSERT INTO insights (id, workspace_id, type, category, severity, title, body, created_at)
      VALUES (?, 'default', ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), ins.type, ins.category, ins.severity, ins.title, ins.body, pastDate(randomBetween(0, 4)));
  }

  // API Keys
  const keyData = [
    { name: 'Anthropic Production', provider: 'anthropic', status: 'valid',   preview: 'sk-ant-****-Xk2p' },
    { name: 'OpenAI Main',          provider: 'openai',    status: 'invalid', preview: 'sk-****-uJ9m' },
    { name: 'Gemini API',           provider: 'gemini',    status: 'valid',   preview: 'AIza****-9Kqr' },
    { name: 'OpenRouter',           provider: 'openrouter',status: 'unknown', preview: 'sk-or-****-3Lmn' },
  ];
  for (const k of keyData) {
    db.prepare(`
      INSERT OR IGNORE INTO api_keys
        (id, workspace_id, name, provider, key_preview, status, last_checked)
      VALUES (?, 'default', ?, ?, ?, ?, ?)
    `).run(uuidv4(), k.name, k.provider, k.preview, k.status, pastDate(randomBetween(1, 12)));
  }

  // KB Sources
  const kbData = [
    { name: 'Docs Folder',   type: 'directory', path: '~/docs',      status: 'healthy', docs: 142, chunks: 892  },
    { name: 'Knowledge Wiki',type: 'url',       path: 'https://wiki',status: 'stale',   docs: 55,  chunks: 310  },
    { name: 'Code Repo',     type: 'directory', path: '~/code',      status: 'syncing', docs: 380, chunks: 2400 },
    { name: 'Support Tickets',type: 'api',      path: 'https://api', status: 'error',   docs: 0,   chunks: 0    },
  ];
  for (const k of kbData) {
    db.prepare(`
      INSERT OR IGNORE INTO kb_sources
        (id, workspace_id, name, type, path, status, doc_count, chunk_count, last_synced)
      VALUES (?, 'default', ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), k.name, k.type, k.path, k.status, k.docs, k.chunks, pastDate(randomBetween(1, 48)));
  }

  console.log('✅ Seed data inserted successfully');
}

seed().catch(console.error);
