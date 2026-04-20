# OpenClaw Command Centre — Installation Guide

Complete cross-platform setup instructions for Ubuntu/Debian, macOS, Windows, and Docker.

---

## Prerequisites (all platforms)

| Requirement | Minimum Version | Notes |
|---|---|---|
| Node.js | **v22.5+** | Built-in `node:sqlite` requires v22.5+. Use nvm/fnm to manage versions. |
| npm | v10+ | Comes with Node.js |
| Git | Any | For cloning |

> **Why Node 22.5+?** The server uses `node:sqlite` — Node's built-in SQLite module introduced in v22.5. This eliminates the need to compile native modules (no Python, no MSBuild required).

---

## Ubuntu / Debian

### 1. Install Node.js 22 via NodeSource

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # must be v22.5+
```

### 2. Clone the repository

```bash
git clone https://github.com/raviinfo001/openclaw-command-centre.git
cd openclaw-command-centre
```

### 3. Install dependencies

```bash
# Install all workspace dependencies from the monorepo root
npm install

# Install web app dependencies separately (Next.js workspace isolation)
cd apps/web && npm install && cd ../..
```

### 4. Configure environment

```bash
cp server/.env.example server/.env
# Edit as needed — defaults work out of the box
nano server/.env
```

### 5. Seed the database (optional — adds demo data)

```bash
cd server
NODE_OPTIONS=--experimental-sqlite npx tsx src/db/seed.ts
cd ..
```

### 6. Start the application

**Terminal 1 — API server:**
```bash
cd server
NODE_OPTIONS=--experimental-sqlite npx tsx src/index.ts &
```

**Terminal 2 — Frontend:**
```bash
cd apps/web
npx next dev -p 3000 &
```

Open **http://localhost:3000** in your browser.

---

## macOS

### 1. Install Node.js 22

**Option A — Homebrew (recommended):**
```bash
brew install node@22
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Option B — nvm:**
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
nvm use 22
```

### 2. Clone and install

```bash
git clone https://github.com/raviinfo001/openclaw-command-centre.git
cd openclaw-command-centre
npm install
cd apps/web && npm install && cd ../..
```

### 3. Configure and seed

```bash
cp server/.env.example server/.env

# Optional: seed demo data
cd server
NODE_OPTIONS=--experimental-sqlite npx tsx src/db/seed.ts
cd ..
```

### 4. Start the application

**Terminal 1:**
```bash
cd server && NODE_OPTIONS=--experimental-sqlite npx tsx src/index.ts
```

**Terminal 2:**
```bash
cd apps/web && node node_modules/next/dist/bin/next dev -p 3000
```

Open **http://localhost:3000**.

---

## Windows 10/11

### 1. Install Node.js 22

Download the **Node.js 22 LTS** installer from https://nodejs.org and run it.

Verify in **Command Prompt** or **PowerShell**:
```cmd
node --version
```

### 2. Clone the repository

```cmd
git clone https://github.com/raviinfo001/openclaw-command-centre.git
cd openclaw-command-centre
```

### 3. Install dependencies

```cmd
npm install
cd apps\web && npm install && cd ..\..
```

### 4. Configure environment

```cmd
copy server\.env.example server\.env
notepad server\.env
```

### 5. Seed demo data (optional)

```cmd
cd server
set NODE_OPTIONS=--experimental-sqlite
npx tsx src/db/seed.ts
cd ..
```

### 6. Start the application

**Option A — Double-click launcher (easiest):**
Run `scripts\start.bat` — it opens two CMD windows automatically.

**Option B — Manual (two CMD windows):**

Window 1:
```cmd
cd server
set NODE_OPTIONS=--experimental-sqlite
npx tsx src/index.ts
```

Window 2:
```cmd
cd apps\web
node node_modules\next\dist\bin\next dev -p 3000
```

Open **http://localhost:3000** in your browser.

> **Windows Firewall**: If prompted, allow Node.js through the firewall for localhost access.

---

## Docker (Self-Hosted)

The easiest way to run on any machine with Docker installed.

### 1. Install Docker Desktop

- Windows/macOS: https://www.docker.com/products/docker-desktop
- Ubuntu: `sudo apt-get install docker.io docker-compose-plugin`

### 2. Clone the repository

```bash
git clone https://github.com/raviinfo001/openclaw-command-centre.git
cd openclaw-command-centre
```

### 3. Configure environment

```bash
cp server/.env.example server/.env
# Edit if needed — defaults work for Docker
```

### 4. Build and run

```bash
docker compose -f docker/docker-compose.yml up --build
```

This will:
- Build the server image (Node 22 Alpine)
- Build the Next.js frontend image
- Start both services with health checks
- Expose port **3000** (frontend) and **4000** (API)

### 5. Access the app

Open **http://localhost:3000** — the app is live.

### Useful Docker commands

```bash
# Run in background
docker compose -f docker/docker-compose.yml up -d

# View logs
docker compose -f docker/docker-compose.yml logs -f

# Stop
docker compose -f docker/docker-compose.yml down

# Rebuild after code changes
docker compose -f docker/docker-compose.yml up --build --force-recreate

# Reset database (delete volume)
docker compose -f docker/docker-compose.yml down -v
```

---

## Environment Variables

The server reads from `server/.env`. All variables are optional — defaults work for local development.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | HTTP API port |
| `WS_PORT` | `4001` | WebSocket port |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | CORS allowed origin |
| `NODE_ENV` | `development` | `development` or `production` |
| `METRICS_INTERVAL_SEC` | `10` | How often to collect system metrics |
| `DB_PATH` | `./data/openclaw.db` | SQLite database file location |

---

## Verifying the Installation

Once both server and frontend are running:

1. Open http://localhost:3000 — you should see the dashboard
2. Open http://localhost:4000/api/health — should return `{"status":"ok",...}`
3. Check the WebSocket connection — the Live Feed in the sidebar should show real-time events

If you seeded demo data, all pages will be populated. Without seeding, the dashboard shows zeros until real agent activity is detected.

---

## Troubleshooting

### "node:sqlite is not available"
Your Node.js version is below 22.5. Update Node:
```bash
# Using nvm
nvm install 22 && nvm use 22
```

### Port already in use
```bash
# Linux/macOS — kill process on port 3000 or 4000
lsof -ti:3000 | xargs kill -9
lsof -ti:4000 | xargs kill -9
```
```cmd
:: Windows
for /f "tokens=5" %a in ('netstat -aon ^| findstr :3000') do taskkill /F /PID %a
```

### Module not found errors
```bash
# Re-install from scratch
rm -rf node_modules apps/web/node_modules server/node_modules
npm install
cd apps/web && npm install && cd ../..
```

### Database locked / corrupted
```bash
rm -f server/data/openclaw.db
# Restart server — it recreates the schema automatically
```
