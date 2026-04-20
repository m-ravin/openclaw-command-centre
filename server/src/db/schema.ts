// Database schema definitions — all tables for the OpenClaw Command Centre.
// Uses better-sqlite3 with SQLite for zero-dependency local operation.

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Workspaces ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT DEFAULT '#6366f1',
  icon        TEXT DEFAULT 'briefcase',
  config_path TEXT,
  log_path    TEXT,
  memory_path TEXT,
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Sessions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  model         TEXT,
  provider      TEXT,
  status        TEXT CHECK(status IN ('active','idle','error','terminated','paused')) DEFAULT 'idle',
  pid           INTEGER,
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_cost    REAL DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  error_count   INTEGER DEFAULT 0,
  tags          TEXT DEFAULT '[]',
  metadata      TEXT DEFAULT '{}',
  started_at    TEXT DEFAULT (datetime('now')),
  last_active   TEXT DEFAULT (datetime('now')),
  ended_at      TEXT
);

-- ─── Session Events (streaming) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_events (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  data        TEXT DEFAULT '{}',
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Agents ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT DEFAULT 'claude',
  model         TEXT,
  provider      TEXT,
  status        TEXT CHECK(status IN ('running','stopped','error','pending')) DEFAULT 'stopped',
  description   TEXT,
  system_prompt TEXT,
  tools         TEXT DEFAULT '[]',
  config        TEXT DEFAULT '{}',
  parent_id     TEXT REFERENCES agents(id),
  invocation_count INTEGER DEFAULT 0,
  error_count   INTEGER DEFAULT 0,
  total_cost    REAL DEFAULT 0,
  avg_latency_ms INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ─── Agent Calls (orchestration graph) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_calls (
  id            TEXT PRIMARY KEY,
  caller_id     TEXT REFERENCES agents(id),
  callee_id     TEXT REFERENCES agents(id),
  session_id    TEXT REFERENCES sessions(id),
  tool_name     TEXT,
  input         TEXT DEFAULT '{}',
  output        TEXT,
  status        TEXT CHECK(status IN ('success','error','timeout','pending')) DEFAULT 'pending',
  latency_ms    INTEGER,
  cost          REAL DEFAULT 0,
  error_msg     TEXT,
  called_at     TEXT DEFAULT (datetime('now')),
  completed_at  TEXT
);

-- ─── Cost Records ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cost_records (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id    TEXT REFERENCES sessions(id),
  agent_id      TEXT REFERENCES agents(id),
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd      REAL DEFAULT 0,
  request_type  TEXT DEFAULT 'completion',
  recorded_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cost_recorded ON cost_records(recorded_at);
CREATE INDEX IF NOT EXISTS idx_cost_provider  ON cost_records(provider);

-- ─── System Metrics ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_metrics (
  id          TEXT PRIMARY KEY,
  cpu_pct     REAL,
  mem_pct     REAL,
  mem_used_mb REAL,
  mem_total_mb REAL,
  disk_pct    REAL,
  disk_used_gb REAL,
  disk_total_gb REAL,
  net_rx_mb   REAL,
  net_tx_mb   REAL,
  cpu_temp    REAL,
  load_avg    TEXT,
  processes   INTEGER,
  recorded_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sys_recorded ON system_metrics(recorded_at);

-- ─── Scheduled Jobs ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  type          TEXT CHECK(type IN ('cron','interval','manual','webhook')) DEFAULT 'cron',
  schedule      TEXT,
  command       TEXT,
  agent_id      TEXT REFERENCES agents(id),
  enabled       INTEGER DEFAULT 1,
  last_run_at   TEXT,
  last_status   TEXT,
  last_duration_ms INTEGER,
  run_count     INTEGER DEFAULT 0,
  error_count   INTEGER DEFAULT 0,
  next_run_at   TEXT,
  config        TEXT DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ─── Job Runs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_runs (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status      TEXT CHECK(status IN ('success','error','running','skipped')) DEFAULT 'running',
  output      TEXT,
  error_msg   TEXT,
  duration_ms INTEGER,
  started_at  TEXT DEFAULT (datetime('now')),
  ended_at    TEXT
);

-- ─── Logs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id          TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id  TEXT REFERENCES sessions(id),
  agent_id    TEXT REFERENCES agents(id),
  level       TEXT CHECK(level IN ('debug','info','warn','error','fatal')) DEFAULT 'info',
  source      TEXT,
  message     TEXT NOT NULL,
  data        TEXT DEFAULT '{}',
  tags        TEXT DEFAULT '[]',
  logged_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_log_level    ON logs(level);
CREATE INDEX IF NOT EXISTS idx_log_source   ON logs(source);
CREATE INDEX IF NOT EXISTS idx_log_logged   ON logs(logged_at);

-- ─── Memory Files ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS memory_files (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  file_path       TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT CHECK(type IN ('user','feedback','project','reference','custom')) DEFAULT 'custom',
  content         TEXT,
  content_hash    TEXT,
  size_bytes      INTEGER DEFAULT 0,
  is_duplicate    INTEGER DEFAULT 0,
  duplicate_of    TEXT,
  tags            TEXT DEFAULT '[]',
  archived        INTEGER DEFAULT 0,
  last_modified   TEXT,
  synced_at       TEXT DEFAULT (datetime('now'))
);

-- ─── Operators (Users interacting with agents) ───────────────────────────────
CREATE TABLE IF NOT EXISTS operators (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  identifier      TEXT NOT NULL,
  display_name    TEXT,
  channel         TEXT,
  total_sessions  INTEGER DEFAULT 0,
  total_messages  INTEGER DEFAULT 0,
  total_tokens    INTEGER DEFAULT 0,
  total_cost      REAL DEFAULT 0,
  avg_session_mins REAL DEFAULT 0,
  last_seen       TEXT,
  first_seen      TEXT DEFAULT (datetime('now')),
  tags            TEXT DEFAULT '[]',
  metadata        TEXT DEFAULT '{}'
);

-- ─── Alerts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alerts (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  severity      TEXT CHECK(severity IN ('info','warning','error','critical')) DEFAULT 'info',
  title         TEXT NOT NULL,
  message       TEXT,
  data          TEXT DEFAULT '{}',
  acknowledged  INTEGER DEFAULT 0,
  resolved      INTEGER DEFAULT 0,
  notified_via  TEXT DEFAULT '[]',
  created_at    TEXT DEFAULT (datetime('now')),
  resolved_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_alert_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alert_created  ON alerts(created_at);

-- ─── Alert Rules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alert_rules (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  metric        TEXT NOT NULL,
  operator      TEXT CHECK(operator IN ('gt','lt','eq','gte','lte')) DEFAULT 'gt',
  threshold     REAL NOT NULL,
  window_mins   INTEGER DEFAULT 5,
  severity      TEXT DEFAULT 'warning',
  channels      TEXT DEFAULT '[]',
  enabled       INTEGER DEFAULT 1,
  cooldown_mins INTEGER DEFAULT 30,
  last_fired    TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ─── API Keys ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  key_preview   TEXT,
  key_hash      TEXT,
  status        TEXT CHECK(status IN ('valid','invalid','expired','unknown')) DEFAULT 'unknown',
  last_used     TEXT,
  last_checked  TEXT,
  permissions   TEXT DEFAULT '[]',
  metadata      TEXT DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ─── Prompts Lab ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS saved_prompts (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  content       TEXT NOT NULL,
  category      TEXT,
  tags          TEXT DEFAULT '[]',
  best_model    TEXT,
  avg_latency_ms INTEGER,
  avg_cost      REAL,
  run_count     INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ─── Prompt Runs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_runs (
  id            TEXT PRIMARY KEY,
  prompt_id     TEXT REFERENCES saved_prompts(id),
  prompt_text   TEXT NOT NULL,
  model         TEXT NOT NULL,
  provider      TEXT NOT NULL,
  response      TEXT,
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  latency_ms    INTEGER,
  cost          REAL DEFAULT 0,
  status        TEXT CHECK(status IN ('success','error','timeout')) DEFAULT 'success',
  error_msg     TEXT,
  run_at        TEXT DEFAULT (datetime('now'))
);

-- ─── Knowledge Base Sources ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kb_sources (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT CHECK(type IN ('directory','url','database','api')) DEFAULT 'directory',
  path          TEXT,
  status        TEXT CHECK(status IN ('healthy','error','syncing','stale')) DEFAULT 'healthy',
  doc_count     INTEGER DEFAULT 0,
  chunk_count   INTEGER DEFAULT 0,
  embedding_count INTEGER DEFAULT 0,
  duplicate_count INTEGER DEFAULT 0,
  failed_count  INTEGER DEFAULT 0,
  size_mb       REAL DEFAULT 0,
  last_synced   TEXT,
  next_sync     TEXT,
  error_msg     TEXT,
  config        TEXT DEFAULT '{}',
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ─── Backups ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backups (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT CHECK(type IN ('full','config','memory','database')) DEFAULT 'full',
  status        TEXT CHECK(status IN ('pending','running','success','error')) DEFAULT 'pending',
  path          TEXT,
  size_bytes    INTEGER DEFAULT 0,
  checksum      TEXT,
  error_msg     TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  completed_at  TEXT
);

-- ─── AI Insights ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS insights (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  category      TEXT CHECK(category IN ('cost','performance','security','usage','optimization')) DEFAULT 'usage',
  severity      TEXT CHECK(severity IN ('info','warning','error','critical','opportunity')) DEFAULT 'info',
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  data          TEXT DEFAULT '{}',
  action_label  TEXT,
  action_data   TEXT DEFAULT '{}',
  dismissed     INTEGER DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ─── Settings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT NOT NULL,
  description   TEXT,
  updated_at    TEXT DEFAULT (datetime('now'))
);

-- ─── Default workspace ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO workspaces (id, name, description, color)
VALUES ('default', 'Personal', 'Default personal workspace', '#6366f1');

-- ─── Default settings ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('privacy_blur_names',   'false', 'Blur operator names in UI'),
  ('privacy_blur_numbers', 'false', 'Blur cost numbers in UI'),
  ('privacy_demo_mode',    'false', 'Replace real data with demo values'),
  ('alert_budget_usd',     '50',    'Monthly budget alert threshold in USD'),
  ('alert_cpu_threshold',  '90',    'CPU % threshold for alert'),
  ('alert_ram_threshold',  '90',    'RAM % threshold for alert'),
  ('metrics_interval_sec', '10',    'System metrics collection interval'),
  ('log_retention_days',   '30',    'Days to retain log records'),
  ('backup_auto_enabled',  'false', 'Enable automatic scheduled backups'),
  ('backup_interval_hours','24',    'Hours between automatic backups');
`;
