# OpenClaw Command Centre

Enterprise-grade AI agent operations command centre. Monitor, optimize, secure, and scale your OpenClaw AI workflows from a single mission-control dashboard.

## Features

| Module | What it does |
|---|---|
| **Mission Control** | Real-time overview — agents, spend, CPU, alerts, AI insights |
| **Sessions** | Monitor all sessions with status, token use, cost, restart/terminate controls |
| **Costs** | Daily spend charts, ROI vs human work, budget alerts, provider breakdown |
| **Agents** | Visual agent grid with start/stop controls and call-count stats |
| **Logs** | Full-text search across structured logs with level/source filters |
| **Memory** | Browse, edit, and sync Claude memory files; duplicate detection |
| **Security** | API key audit, validation, alert management, security score |
| **Jobs** | Cron scheduler with run-now, toggle, and run-history |
| **Prompt Lab** | Test prompts against any model, side-by-side comparison, save winners |
| **Knowledge** | Vector DB source health, sync status, doc/chunk counts |
| **Operators** | Per-user token and cost usage tracking |
| **Settings** | Privacy controls (blur names/numbers), budget, alert thresholds |

## Quick Start

### Prerequisites
- Node.js v22.5+ (uses built-in `node:sqlite`)
- npm

### Install

```bash
# Install server deps
cd server && npm install

# Install web deps
cd apps/web && npm install --no-workspaces
```

### Run (Windows)

```bash
scripts/start.bat
```

### Run (Linux/macOS)

**Terminal 1 — API Server:**
```bash
cd server
NODE_OPTIONS=--experimental-sqlite npx tsx src/index.ts
```

**Terminal 2 — Seed DB (first time only):**
```bash
cd server
NODE_OPTIONS=--experimental-sqlite npx tsx src/db/seed.ts
```

**Terminal 3 — Frontend:**
```bash
cd apps/web
node node_modules/next/dist/bin/next dev -p 3000
```

Open **http://localhost:3000**

## Architecture

```
openclaw-command-centre/
├── apps/web/              # Next.js 15 frontend (React + Tailwind)
│   └── src/
│       ├── app/           # Pages (one per sidebar section)
│       ├── components/    # UI components (StatCard, Badge, Gauge…)
│       ├── hooks/         # useLiveData, useLiveList
│       ├── lib/           # api.ts, ws.ts, utils.ts
│       └── store/         # Zustand global state
├── server/                # Node.js backend
│   └── src/
│       ├── db/            # node:sqlite schema + seed
│       ├── routes/        # REST API handlers (one per domain)
│       ├── events/        # WebSocket event bus
│       └── collectors/    # systemCollector (CPU/RAM/disk)
├── scripts/
│   └── start.bat          # Windows one-click launcher
└── docker/                # Docker files (coming soon)
```

## Environment Variables

**server/.env**
```
PORT=4000
WS_PORT=4001
NODE_ENV=development
FRONTEND_ORIGIN=http://localhost:3000
DATA_DIR=./data
METRICS_INTERVAL_SEC=10
```

**apps/web/.env.local**
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=ws://localhost:4001
```

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, Recharts, Zustand, SWR
- **Backend**: Node.js, Express, node:sqlite (built-in, no compilation)
- **Realtime**: WebSocket (ws) event bus
- **System metrics**: systeminformation
- **Scheduler**: node-cron
