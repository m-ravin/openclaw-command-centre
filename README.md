# OpenClaw Command Centre

> Enterprise-grade AI agent operations dashboard — monitor, control, and optimise every Claude/AI session from a single mission-control interface.

![Node.js](https://img.shields.io/badge/Node.js-22.5%2B-339933?logo=node.js&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## Table of Contents

1. [What is OpenClaw Command Centre?](#what-is-openclaw-command-centre)
2. [Feature Overview](#feature-overview)
3. [Quick Start](#quick-start)
4. [User Guide](#user-guide)
   - [Mission Control (Dashboard)](#1-mission-control-dashboard)
   - [Sessions](#2-sessions)
   - [Costs](#3-costs)
   - [Agents](#4-agents)
   - [Jobs](#5-jobs)
   - [Logs Explorer](#6-logs-explorer)
   - [Memory Browser](#7-memory-browser)
   - [Security Center](#8-security-center)
   - [Prompt Lab](#9-prompt-lab)
   - [Knowledge Base](#10-knowledge-base)
   - [Operators](#11-operators)
   - [Settings](#12-settings)
5. [Architecture](#architecture)
6. [Environment Variables](#environment-variables)
7. [Tech Stack](#tech-stack)
8. [Installation Guide](#installation-guide)

---

## What is OpenClaw Command Centre?

OpenClaw Command Centre is a self-hosted web dashboard that gives you full visibility and control over your AI agent operations. Whether you are running one Claude session or dozens of autonomous agents across multiple workspaces, this tool surfaces everything in one place:

- **Real-time system and agent metrics** via WebSocket
- **Token and cost tracking** per session, agent, operator, and job
- **Security auditing** for API keys and alert rules
- **File inspection** — see every OpenClaw file on disk with size and type
- **Kanban job scheduler** with cron support and per-run token history
- **Prompt Lab** for testing and comparing model responses side by side

---

## Feature Overview

| Module | What it does |
|---|---|
| **Mission Control** | Live overview — agent status, spend, CPU/RAM/disk gauges, AI insights |
| **Sessions** | Token bar charts per session, cost, message count, resume/pause/terminate |
| **Costs** | Daily spend charts with 24h/3d/1w/30d/90d selector, provider breakdown |
| **Agents** | Agent grid with start/stop controls + OpenClaw files-on-disk inspector |
| **Jobs** | Kanban board (Running/Scheduled/Finished) with token and model stats per card |
| **Logs** | Full-text log search with level/source/date filters |
| **Memory** | Browse and edit Claude memory files; duplicate detection |
| **Security** | API key audit, validation, alert management, security score |
| **Prompt Lab** | Test prompts live, side-by-side model comparison, save winning prompts |
| **Knowledge** | Vector DB source health, sync status, document and chunk counts |
| **Operators** | Per-user token and cost usage tracking |
| **Settings** | Privacy blur toggle, budget thresholds, alert configuration |

---

## Quick Start

### Prerequisites

- **Node.js v22.5+** — uses the built-in `node:sqlite` (no compilation required)
- **npm v10+**

### Install and run

```bash
# 1. Clone the repo
git clone https://github.com/m-ravin/openclaw-command-centre.git
cd openclaw-command-centre

# 2. Install dependencies
npm install
cd apps/web && npm install && cd ../..

# 3. Seed demo data (optional but recommended for first run)
cd server
NODE_OPTIONS=--experimental-sqlite npx tsx src/db/seed.ts
cd ..
```

**Terminal 1 — Start the API server:**
```bash
cd server
NODE_OPTIONS=--experimental-sqlite npx tsx src/index.ts
```

**Terminal 2 — Start the frontend:**
```bash
cd apps/web
node node_modules/next/dist/bin/next dev -p 3000
```

Open **http://localhost:3000** — the dashboard is live.

> **Windows users:** Double-click `scripts/start.bat` to launch both servers automatically.

---

## User Guide

### 1. Mission Control (Dashboard)

The home page (`/`) is your live operations overview.

**What you see:**
- **Agent status ring** — active vs idle vs error count at a glance
- **Spend today** — total cost in the last 24 hours
- **System gauges** — CPU usage %, RAM used/total, disk free %
- **Recent alerts** — last 5 alerts with severity colour coding
- **AI Insights** — automatically generated observations about cost spikes, error rates, and efficiency opportunities

**How to use it:**
- Watch the system gauges in the top row for resource pressure
- Click any alert card to jump to the Alert Center with that alert pre-filtered
- Insights cards show `info`, `warning`, `critical`, or `opportunity` — act on `critical` first
- The dashboard auto-refreshes every 10 seconds; the WebSocket badge in the top bar shows connection state

---

### 2. Sessions

The Sessions page (`/sessions`) shows every active and historical chat session with full token and cost breakdowns.

**Views:**
- **Cards view** (default) — one card per session with a token usage bar showing input vs output split
- **Table view** — sortable columns including ↑ Input Tokens, ↓ Output Tokens, Total Tokens, Cost, Messages

**Token bars:**
Each session card shows two progress bars:
- **Blue (↑)** — input tokens sent to the model (your prompts + context)
- **Cyan (↓)** — output tokens generated by the model (responses)

This split helps identify sessions that are expensive due to large context windows vs sessions generating verbose responses.

**Status filters:**
Use the pill buttons to filter by `All`, `active`, `idle`, `error`, or `terminated`.

**Actions:**
| Button | When visible | What it does |
|---|---|---|
| Resume | Session is `idle` | Sets status back to `active` |
| Pause | Session is `active` | Sets status to `paused` |
| Terminate | Any non-terminated | Permanently ends the session |

**KPI row** at the top shows aggregate totals: Active count, Idle count, Errors, Total sessions, Total Tokens, and Total Cost across all sessions.

---

### 3. Costs

The Costs page (`/costs`) tracks spending over time with chart breakdowns.

**Day range selector:**
Click any pill to change the reporting window:
- `24 h` — last 24 hours
- `3 d` — last 3 days
- `1 wk` — last 7 days
- `30 d` — last 30 days (default)
- `90 d` — last 90 days

**Charts available:**
- **Daily spend bar chart** — cost per day with input/output token volume overlay
- **Provider breakdown** — cost split by AI provider (Anthropic, OpenAI, etc.)
- **Cost by model** — which models are costing the most

**Budget alerts:**
Configure a budget threshold in Settings. When daily spend approaches the limit, an alert fires automatically and appears in the Alert Center.

---

### 4. Agents

The Agents page (`/agents`) has two sections.

**Agent grid:**
Each card shows:
- Agent name, type, provider, and model
- Status badge (running / stopped / error)
- Call count, error count, average latency
- Total cost for the agent

Click **Start** or **Stop** to control individual agents.

**OpenClaw Files on Disk:**
Below the agent grid is a file inspector that scans your local Claude installation:

| Column | Description |
|---|---|
| File | Filename with type icon (memory, markdown, config, database) |
| Location | Full path on disk |
| Category | File type label (Memory, Config, Markdown, etc.) |
| Size | File size with a relative size bar comparing all files |
| Modified | How long ago the file was last changed |

Scanned paths are shown as grey pills at the top of the table. Click the **refresh** button (↻) to re-scan.

Common files detected:
- `~/.claude/CLAUDE.md` — your global Claude instructions
- `~/.claude/MEMORY.md` — memory index
- `~/.claude/memory/*.md` — individual memory files
- `~/.claude/settings.json` — Claude settings
- `~/.claude/projects/*/` — per-project memory files

---

### 5. Jobs

The Jobs page (`/jobs`) is a kanban-style job scheduler.

**Three columns:**
| Column | What goes here |
|---|---|
| **Running** | Jobs currently executing |
| **Scheduled** | Jobs with a cron schedule waiting to fire |
| **Finished** | Completed job runs |

**Each job card shows:**
- Job name and cron schedule (e.g. `0 * * * *` = every hour)
- Agent name and model it runs on
- Token grid: total tokens consumed, number of runs, total cost
- Last run timestamp and duration
- Actions: **Run Now** (triggers immediate execution), **Enable/Disable** toggle

**Token and model tracking:**
Every time a job runs, the tokens consumed and model used are recorded in `job_runs`. The card shows the **last run's model** so you can see if a job switched models unexpectedly.

**List view:**
Toggle to the list view (☰) for a compact table with sortable columns: Status, Schedule, Agent, Model, Tokens, Runs, Last Run, Cost.

---

### 6. Logs Explorer

The Logs page (`/logs`) lets you search and filter all structured logs from your agents and system.

**Filters:**
- **Search** — full-text search across log messages
- **Level** — `debug`, `info`, `warning`, `error`, `critical`
- **Source** — filter by which agent or system component produced the log
- **Date range** — narrow to a specific time window

**Log levels are colour-coded:**
- Grey — debug
- White — info
- Yellow — warning
- Red — error / critical

Use the **Export** button to download filtered logs as JSON or CSV for external analysis.

---

### 7. Memory Browser

The Memory page (`/memory`) gives you a file-level view of Claude's memory system.

**What you can do:**
- Browse all memory files indexed in `MEMORY.md`
- View file contents in the right panel
- Edit memory files directly in the browser
- Detect duplicates — files with overlapping content are flagged
- Sync changes back to disk

**Memory types shown:**
- `user` — notes about the user's preferences and profile
- `feedback` — corrections and confirmed approaches
- `project` — ongoing project context
- `reference` — pointers to external systems

---

### 8. Security Center

The Security page (`/security`) audits your API keys and security posture.

**Security score:**
A 0–100 score calculated from: key age, key rotation frequency, unused keys, open alert rules, and failed authentication attempts.

**API key audit table:**
| Column | Description |
|---|---|
| Key name | Label for the key |
| Provider | Which AI provider it belongs to |
| Status | Active / expired / revoked |
| Last used | When it was last used |
| Age | How old the key is |
| Action | Validate / revoke |

**Alert rules:**
Configure rules that fire when thresholds are breached — e.g. "alert if daily cost > $10" or "alert if error rate > 5%".

---

### 9. Prompt Lab

The Prompt Lab (`/prompts`) is a live testing environment for your prompts.

**How to use:**
1. Select a provider and model from the dropdowns
2. Type your system prompt (optional) and user message
3. Click **Run** — the response streams in real time with token count and latency
4. **Compare mode** — run the same prompt against two models side by side
5. Click **Save** to store the prompt with its name, tags, and best response

**Saved prompts library:**
All saved prompts appear in a searchable list. Click any entry to reload it into the editor for further testing or editing.

---

### 10. Knowledge Base

The Knowledge page (`/knowledge`) shows the health of your vector database sources.

**Source table columns:**
- Source name and type (PDF, URL, database)
- Status (synced / syncing / error)
- Document count and chunk count
- Last sync time
- Sync now button

Use this page to identify sources that have drifted out of sync or failed to index.

---

### 11. Operators

The Operators page (`/operators`) tracks usage per human user or team member.

**What is tracked per operator:**
- Total tokens consumed (input + output)
- Total cost
- Number of sessions started
- Number of errors generated
- Last active timestamp

This is useful for charge-back reporting or identifying which users are the heaviest consumers.

---

### 12. Settings

The Settings page (`/settings`) controls global dashboard behaviour.

**Privacy controls:**
- **Blur numbers** — hides all token counts and costs behind a blur. Useful when screen sharing or recording demos without revealing sensitive spend data. Toggle it on/off at any time from the top bar eye icon.
- **Blur names** — hides agent and session names

**Workspace selector:**
The top bar shows the active workspace. Click it to switch between workspaces. Each workspace has its own sessions, costs, and agent data.

**Budget thresholds:**
Set a daily or monthly spend limit. When the threshold is approached (configurable at 80% and 100%), an alert fires automatically.

**Alert preferences:**
Configure which alert types trigger notifications and their severity levels.

---

## Architecture

```
openclaw-command-centre/
├── apps/web/                  # Next.js 15 frontend
│   └── src/
│       ├── app/               # Pages — one file per sidebar section
│       ├── components/        # Shared UI (StatCard, Badge, Gauge…)
│       ├── hooks/             # useLiveData (WebSocket), useLiveList
│       ├── lib/               # api.ts (REST), ws.ts (WebSocket), utils.ts
│       └── store/             # Zustand global state (workspace, privacy)
├── server/                    # Express REST + WebSocket API
│   └── src/
│       ├── db/                # node:sqlite schema, migrations, seed
│       ├── routes/            # One router per domain (sessions, agents…)
│       ├── events/            # WebSocket event bus
│       └── collectors/        # systemCollector — CPU/RAM/disk/network
├── docker/                    # Docker Compose + Dockerfiles
├── scripts/
│   └── start.bat              # Windows one-click launcher
├── INSTALL.md                 # Full cross-platform installation guide
└── README.md                  # This file
```

**Data flow:**
```
Browser  ──SWR polling──▶  Express REST API  ──▶  node:sqlite DB
Browser  ◀──WebSocket──    Event Bus          ◀──  systemCollector / routes
```

---

## Environment Variables

**`server/.env`** (copy from `server/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP API port |
| `WS_PORT` | `4001` | WebSocket port |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowed origin |
| `NODE_ENV` | `development` | `development` or `production` |
| `METRICS_INTERVAL_SEC` | `10` | System metrics collection interval |
| `DB_PATH` | `./data/openclaw.db` | SQLite database file path |

**`apps/web/.env.local`** (optional — defaults work for local dev):

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:4000/api` | API base URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:4001` | WebSocket URL |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | Next.js 15, React 19 |
| Styling | Tailwind CSS (dark-mode custom palette) |
| Charts | Recharts |
| Data fetching | SWR (REST) + WebSocket |
| Global state | Zustand with persist |
| Backend | Node.js, Express |
| Database | `node:sqlite` (Node.js built-in v22.5+) |
| Real-time | WebSocket (`ws` library) |
| System metrics | `systeminformation` |
| Job scheduler | `node-cron` |
| Security | Helmet, CORS, rate-limiting |

---

## Installation Guide

For detailed per-platform instructions (Ubuntu/Debian, macOS, Windows, Docker), see **[INSTALL.md](./INSTALL.md)**.

---

## License

MIT — see [LICENSE](./LICENSE) for details.
