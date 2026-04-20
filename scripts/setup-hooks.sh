#!/bin/bash
# Sets up Claude Code hooks to report real session/token data to the dashboard.
set -e

DASHBOARD_URL="http://localhost:4000"
HOOKS_DIR="$HOME/.claude/hooks"
SETTINGS_FILE="$HOME/.claude/settings.json"

echo ""
echo "OpenClaw Dashboard — Claude Code Hook Setup"
echo "============================================"

# ── 1. Create hooks directory ────────────────────────────────────────────────
mkdir -p "$HOOKS_DIR"
echo "✓ Created $HOOKS_DIR"

# ── 2. PostToolUse hook — fires after every tool call ────────────────────────
cat > "$HOOKS_DIR/tool-use.sh" << HOOKEOF
#!/bin/bash
# Sends tool usage events to the OpenClaw dashboard (non-blocking)
INPUT=\$(cat)
curl -s -X POST ${DASHBOARD_URL}/api/hooks/claude \\
  -H "Content-Type: application/json" \\
  -d "{\"event\":\"PostToolUse\",\"data\":\$INPUT}" \\
  --max-time 2 > /dev/null 2>&1 &
exit 0
HOOKEOF

# ── 3. Stop hook — fires when a Claude session ends ──────────────────────────
cat > "$HOOKS_DIR/stop.sh" << HOOKEOF
#!/bin/bash
# Sends final session stats (real token counts from transcript) to the dashboard
INPUT=\$(cat)
curl -s -X POST ${DASHBOARD_URL}/api/hooks/claude \\
  -H "Content-Type: application/json" \\
  -d "{\"event\":\"Stop\",\"data\":\$INPUT}" \\
  --max-time 5 > /dev/null 2>&1
exit 0
HOOKEOF

chmod +x "$HOOKS_DIR/tool-use.sh" "$HOOKS_DIR/stop.sh"
echo "✓ Hook scripts created"

# ── 4. Merge hooks into ~/.claude/settings.json ──────────────────────────────
# Ensure the file exists
if [ ! -f "$SETTINGS_FILE" ]; then
  echo '{}' > "$SETTINGS_FILE"
fi

# Check for jq
if ! command -v jq &> /dev/null; then
  echo ""
  echo "⚠ jq not found — installing it now..."
  sudo apt-get install -y jq -q
fi

HOOKS_JSON=$(cat << 'JSONEOF'
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/tool-use.sh" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/stop.sh" }]
      }
    ]
  }
}
JSONEOF
)

# Deep-merge hooks into existing settings (preserves any other settings you have)
CURRENT=$(cat "$SETTINGS_FILE")
MERGED=$(echo "$CURRENT" "$HOOKS_JSON" | jq -s '.[0] * .[1]')
echo "$MERGED" > "$SETTINGS_FILE"

echo "✓ Hooks registered in $SETTINGS_FILE"
echo ""
echo "All done! What happens next:"
echo "  • Every Claude Code tool call  → session appears live in the dashboard"
echo "  • When a session ends          → real token counts and cost are recorded"
echo "  • Open http://localhost:3000   → Sessions page shows your actual usage"
echo ""
echo "Restart Claude Code (or start a new session) to activate the hooks."
