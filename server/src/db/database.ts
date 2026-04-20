// Uses Node.js built-in node:sqlite (available Node 22.5+, no compilation needed).
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { SCHEMA_SQL } from './schema';

let db: DatabaseSync;

export function getDb(): DatabaseSync {
  if (!db) {
    const dbDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    fs.mkdirSync(dbDir, { recursive: true });
    const dbPath = path.join(dbDir, 'openclaw.db');
    db = new DatabaseSync(dbPath);
    db.exec(SCHEMA_SQL);
    // Live migrations — try/catch because SQLite throws if column already exists
    const migrations = [
      `ALTER TABLE job_runs ADD COLUMN input_tokens INTEGER DEFAULT 0`,
      `ALTER TABLE job_runs ADD COLUMN output_tokens INTEGER DEFAULT 0`,
      `ALTER TABLE job_runs ADD COLUMN model TEXT`,
      `ALTER TABLE job_runs ADD COLUMN cost REAL DEFAULT 0`,
      `ALTER TABLE jobs    ADD COLUMN total_tokens INTEGER DEFAULT 0`,
      `ALTER TABLE jobs    ADD COLUMN last_model TEXT`,
    ];
    for (const m of migrations) {
      try { db.exec(m); } catch { /* column already exists */ }
    }
  }
  return db;
}

export function dbAll<T>(sql: string, params: unknown[] = []): T[] {
  const stmt = getDb().prepare(sql);
  return stmt.all(...params) as T[];
}

export function dbGet<T>(sql: string, params: unknown[] = []): T | undefined {
  const stmt = getDb().prepare(sql);
  return stmt.get(...params) as T | undefined;
}

export function dbRun(sql: string, params: unknown[] = []) {
  const stmt = getDb().prepare(sql);
  return stmt.run(...params);
}
