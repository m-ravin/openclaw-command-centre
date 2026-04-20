// Scans the local filesystem for Claude/OpenClaw config and memory files.
// Returns each file with its size, last modified date, and type.
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const filesRouter = Router();

const HOME = os.homedir();

// Well-known paths OpenClaw / Claude CLI creates
const SCAN_PATHS = [
  { dir: path.join(HOME, '.claude'),          label: 'Claude Config Root' },
  { dir: path.join(HOME, '.claude', 'memory'),label: 'Memory Store'       },
  { dir: path.join(HOME, '.claude', 'projects'),label: 'Projects'         },
  { dir: path.join(HOME, '.config', 'claude'),label: 'Claude XDG Config'  },
];

// Extra well-known single files to always include if they exist
const KNOWN_FILES = [
  path.join(HOME, '.claude', 'CLAUDE.md'),
  path.join(HOME, '.claude', 'MEMORY.md'),
  path.join(HOME, '.claude', 'settings.json'),
  path.join(HOME, '.claude', 'settings.local.json'),
];

interface FileEntry {
  name: string;
  path: string;
  size_bytes: number;
  size_human: string;
  type: string;
  last_modified: string;
  label: string;
}

function humanSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)     return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function guessType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('memory') || lower.endsWith('.md') && lower.includes('mem')) return 'memory';
  if (lower.endsWith('.md'))   return 'markdown';
  if (lower.endsWith('.json')) return 'config';
  if (lower.endsWith('.log'))  return 'log';
  if (lower.endsWith('.db') || lower.endsWith('.sqlite')) return 'database';
  return 'file';
}

filesRouter.get('/openclaw', (_req: Request, res: Response) => {
  const results: FileEntry[] = [];
  const seen = new Set<string>();

  // Scan each known directory
  for (const { dir, label } of SCAN_PATHS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fullPath = path.join(dir, entry.name);
        if (seen.has(fullPath)) continue;
        seen.add(fullPath);
        try {
          const stat = fs.statSync(fullPath);
          results.push({
            name: entry.name,
            path: fullPath.replace(HOME, '~'),
            size_bytes: stat.size,
            size_human: humanSize(stat.size),
            type: guessType(entry.name),
            last_modified: stat.mtime.toISOString(),
            label,
          });
        } catch { /* permission denied */ }
      }
    } catch { /* dir not readable */ }
  }

  // Add any known single files not already collected
  for (const fp of KNOWN_FILES) {
    if (!fs.existsSync(fp) || seen.has(fp)) continue;
    try {
      const stat = fs.statSync(fp);
      results.push({
        name: path.basename(fp),
        path: fp.replace(HOME, '~'),
        size_bytes: stat.size,
        size_human: humanSize(stat.size),
        type: guessType(path.basename(fp)),
        last_modified: stat.mtime.toISOString(),
        label: 'Claude Config Root',
      });
    } catch { /* ignore */ }
  }

  // Sort: largest first
  results.sort((a, b) => b.size_bytes - a.size_bytes);

  const total_bytes = results.reduce((s, f) => s + f.size_bytes, 0);
  res.json({
    files: results,
    total_files: results.length,
    total_bytes,
    total_human: humanSize(total_bytes),
    scanned_paths: SCAN_PATHS.map(p => p.dir.replace(HOME, '~')),
  });
});
