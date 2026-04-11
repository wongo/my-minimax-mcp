# MiniMax MCP — Setup Guide

## 1. Install

```bash
npm install my-minimax-mcp
```

## 2. Get API Key

Sign up at [platform.minimax.io](https://platform.minimax.io) and create an API key.

## 3. Register in Claude Code

```bash
claude mcp add --transport stdio --scope user minimax -- npx my-minimax-mcp
```

Or add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "minimax": {
      "command": "npx",
      "args": ["my-minimax-mcp"],
      "env": {
        "MINIMAX_API_KEY": "your-api-key",
        "MINIMAX_DEFAULT_MODEL": "MiniMax-M2.7"
      }
    }
  }
}
```

Set `MINIMAX_DEFAULT_MODEL` to the highest model your Token Plan supports.

## 4. Enable Self-Improvement Loop

Copy `templates/CLAUDE.md` from this package to your Claude Code configuration:

```bash
# Find the template location
npx my-minimax-mcp --init
```

Or manually copy to `~/.claude/CLAUDE.md` (global) or your project's CLAUDE.md.

## 5. (Optional) Add SessionEnd Hook

For fully automatic session tracking without any AI intervention:

```json
{
  "hooks": {
    "SessionEnd": [{
      "hooks": [{
        "type": "command",
        "command": "npx my-minimax-mcp --end-session",
        "timeout": 10
      }]
    }]
  }
}
```

Add this to your `~/.claude/settings.json`.

## 6. Verify

Restart Claude Code and verify:

```bash
claude mcp list  # Should show "minimax" with 6 tools
```

Session tracking is automatic — the MCP server persists usage data on shutdown.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MINIMAX_API_KEY` | (required) | MiniMax API key |
| `MINIMAX_DEFAULT_MODEL` | `MiniMax-M2.7` | Default model for all tools |
| `MINIMAX_USAGE_LOG` | `~/.claude/minimax-usage.jsonl` | Session usage log path |
| `MINIMAX_SESSION_TARGET` | `5` | Minimum MiniMax calls per session |
| `MINIMAX_MAX_ITERATIONS` | `25` | Agent loop max iterations |
| `MINIMAX_TIMEOUT_MS` | `300000` | Per-task timeout (5min) |
| `MINIMAX_BASH_WHITELIST` | — | Additional allowed bash commands |
| `MINIMAX_WORKING_DIR` | `process.cwd()` | Working directory for file ops |
| `MINIMAX_COST_LOG` | `~/.claude/minimax-costs.log` | Cost log file path |
