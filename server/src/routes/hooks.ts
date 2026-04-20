import { Router, Request, Response } from 'express';
import { dbRun, dbGet } from '../db/database';
import { bus } from '../events/eventBus';
import fs from 'fs';

export const hooksRouter = Router();

interface TranscriptStats {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  model: string;
  messageCount: number;
}

// Parse a Claude Code .jsonl transcript file to extract real token usage
function parseTranscript(transcriptPath: string): TranscriptStats | null {
  try {
    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    let inputTokens = 0;
    let outputTokens = 0;
    let model = 'claude-sonnet-4-6';
    let messageCount = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // API response usage block
        if (entry.usage) {
          inputTokens  += entry.usage.input_tokens  || 0;
          outputTokens += entry.usage.output_tokens || 0;
        }
        // Nested message usage (streaming format)
        if (entry.message?.usage) {
          inputTokens  += entry.message.usage.input_tokens  || 0;
          outputTokens += entry.message.usage.output_tokens || 0;
        }
        if (entry.model) model = entry.model;
        if (entry.type === 'assistant' || entry.role === 'assistant') messageCount++;
      } catch { /* skip malformed lines */ }
    }

    // Anthropic pricing: $3/M input, $15/M output (sonnet approximation)
    const cost = inputTokens * 0.000003 + outputTokens * 0.000015;
    return { inputTokens, outputTokens, cost, model, messageCount };
  } catch {
    return null;
  }
}

// POST /api/hooks/claude  — called by Claude Code hook scripts
hooksRouter.post('/claude', (req: Request, res: Response) => {
  const { event, data } = req.body;

  if (!data?.session_id) return res.json({ ok: false, error: 'no session_id' });

  const { session_id, transcript_path } = data;
  const tool_name: string = data.tool_name ?? 'unknown';

  // Build a human-readable session name from the session ID
  const shortId = String(session_id).slice(0, 8);
  const sessionName = `Claude Session ${shortId}`;

  try {
    if (event === 'PostToolUse') {
      // Upsert session: create if new, increment message count if exists
      dbRun(`
        INSERT INTO sessions
          (id, workspace_id, name, model, provider, status, message_count, started_at, last_active)
        VALUES
          (?, 'default', ?, 'claude-sonnet-4-6', 'anthropic', 'active', 1, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          message_count = sessions.message_count + 1,
          last_active   = datetime('now'),
          status        = 'active'
      `, [session_id, sessionName]);

      // Log the tool call as a session event
      dbRun(`
        INSERT INTO session_events (session_id, event_type, data, created_at)
        VALUES (?, 'tool_use', ?, datetime('now'))
      `, [session_id, JSON.stringify({ tool: tool_name })]);

      const session = dbGet(`SELECT * FROM sessions WHERE id = ?`, [session_id]);
      bus.emit('session.update', session);
    }

    if (event === 'Stop') {
      // Try to get real token counts from the transcript file
      const stats = transcript_path ? parseTranscript(transcript_path) : null;

      if (stats && (stats.inputTokens > 0 || stats.outputTokens > 0)) {
        dbRun(`
          INSERT INTO sessions
            (id, workspace_id, name, model, provider, status,
             input_tokens, output_tokens, total_cost, message_count, started_at, last_active)
          VALUES
            (?, 'default', ?, ?, 'anthropic', 'idle', ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            status        = 'idle',
            model         = excluded.model,
            input_tokens  = excluded.input_tokens,
            output_tokens = excluded.output_tokens,
            total_cost    = excluded.total_cost,
            message_count = MAX(sessions.message_count, excluded.message_count),
            last_active   = datetime('now')
        `, [
          session_id, sessionName, stats.model,
          stats.inputTokens, stats.outputTokens, stats.cost, stats.messageCount,
        ]);
      } else {
        dbRun(`
          INSERT INTO sessions
            (id, workspace_id, name, model, provider, status, started_at, last_active)
          VALUES
            (?, 'default', ?, 'claude-sonnet-4-6', 'anthropic', 'idle', datetime('now'), datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            status      = 'idle',
            last_active = datetime('now')
        `, [session_id, sessionName]);
      }

      const session = dbGet(`SELECT * FROM sessions WHERE id = ?`, [session_id]);
      bus.emit('session.update', session);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[hooks] error:', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});
