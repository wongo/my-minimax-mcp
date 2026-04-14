# my-minimax-mcp

[English](README.md) | [繁體中文](README.zh-TW.md)

<p align="center">
  <img src="assets/banner.png" alt="Token costs burning vs MiniMax workflow efficiency" width="600">
</p>

MCP server that wraps [MiniMax AI](https://platform.minimax.io) as an autonomous code executor for Claude Code.

**Purpose**: Coding tasks consume the bulk of your Claude subscription quota on execution (writing, testing, debugging). This MCP server offloads that work to MiniMax API (~$0.04/task), so your Claude subscription handles significantly more tasks per day. Built-in savings tracking proves it with real data.

## Architecture

```
Claude Code (Opus) ─── orchestrator
    │
    ├── minimax_generate_code    → simple code generation
    ├── minimax_agent_task       → autonomous agent loop (read → write → test → debug)
    ├── minimax_chat             → multi-turn conversation
    ├── minimax_plan             → structured JSON implementation plan
    ├── minimax_cost_report      → session cost tracking
    ├── minimax_session_tracker  → cross-session usage tracking (auto-persist on shutdown)
    ├── minimax_web_search       → web search via MiniMax Coding Plan API
    └── minimax_understand_image → image analysis via MiniMax VLM
```

The key feature is the **agent loop**: MiniMax uses function calling to autonomously read files, write code, run tests, and debug — equivalent to a Sonnet sub-agent, but without consuming Claude subscription tokens.

## Tools

| Tool | Description | Default Model |
|------|-------------|---------------|
| `minimax_agent_task` | Autonomous coding: read files, write code, run tests, debug loop | `MINIMAX_DEFAULT_MODEL` |
| `minimax_generate_code` | Generate code, optionally write to file | `MINIMAX_DEFAULT_MODEL` |
| `minimax_chat` | Multi-turn conversation with context preservation | `MINIMAX_DEFAULT_MODEL` |
| `minimax_plan` | Structured implementation plan as JSON | `MINIMAX_DEFAULT_MODEL` |
| `minimax_cost_report` | Session token usage and cost breakdown | — |
| `minimax_session_tracker` | Cross-session usage tracking with self-improvement modes | — |
| `minimax_web_search` | Search the web using MiniMax AI | — |
| `minimax_understand_image` | Analyze images using MiniMax VLM (JPEG/PNG/WebP, max 20MB) | — |

## Installation

```bash
npm install my-minimax-mcp
```

## Setup

### 1. Get a MiniMax API Key

Sign up at [platform.minimax.io](https://platform.minimax.io) and create an API key.

### 2. Install & Configure

**Option A: Via npm (recommended)**

```bash
npm install my-minimax-mcp
```

**Option B: From source**

```bash
git clone https://github.com/wongo/my-minimax-mcp.git
cd my-minimax-mcp
npm install
npm run build
```

### 3. Create `.env`

```
MINIMAX_API_KEY=your_api_key_here
```

### 4. Register in Claude Code

```bash
claude mcp add --transport stdio --scope user minimax -- bash /path/to/my-minimax-mcp/run-mcp.sh
```

Or manually edit `~/.claude/settings.json`:

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

> **Note**: Use `claude mcp add` for the simplest setup, or edit `~/.claude/settings.json` directly.

Restart Claude Code. The 8 tools will appear automatically. Verify with `claude mcp list`.

### 5. Enable Self-Improvement Loop (Optional)

```bash
npx my-minimax-mcp --init
```

This displays the CLAUDE.md template and creates the usage log. Copy the template to `~/.claude/CLAUDE.md` to enable executor routing rules. Session tracking is automatic — the MCP server persists usage data on shutdown. See `templates/setup-guide.md` for details.

## CLI (for debugging)

```bash
# Code generation
npx tsx src/cli.ts --task "fibonacci in Python" --language python

# Chat
npx tsx src/cli.ts --mode chat --task "explain async/await"

# Autonomous agent
npx tsx src/cli.ts --mode agent --task "fix the failing tests" --dir ./my-project
```

CLI runs also append to `MINIMAX_COST_LOG`, so `--end-session` and `--savings-report` include normal CLI usage in addition to MCP usage.

## Configuration

All settings via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | API key (required) | — |
| `MINIMAX_DEFAULT_MODEL` | Default model used by all MiniMax chat/plan/code/agent tools unless a per-call override is supplied | `MiniMax-M2.7` |
| `MINIMAX_MAX_ITERATIONS` | Agent loop max iterations | `25` |
| `MINIMAX_TIMEOUT_MS` | Per-task timeout | `300000` (5min) |
| `MINIMAX_BASH_WHITELIST` | Additional allowed bash commands (comma-separated) | — |
| `MINIMAX_WORKING_DIR` | Base working directory for file operations; `minimax_agent_task` may only use this directory or a nested subdirectory | `process.cwd()` |
| `MINIMAX_COST_LOG` | Cost log file path | `~/.claude/minimax-costs.log` |
| `MINIMAX_USAGE_LOG` | Session usage log path | `~/.claude/minimax-usage.jsonl` |
| `MINIMAX_SESSION_TARGET` | Min MiniMax calls per session | `5` |

## Self-Improvement Loop

Usage tracking is **automatic** — the MCP server persists session data to `~/.claude/minimax-usage.jsonl` on shutdown (SIGTERM/SIGINT). No manual `start`/`end` calls required.

**Optional commands** via `minimax_session_tracker`:
- `"start"` — check current mode and recent trends
- `"status"` — mid-session progress with trend analytics and streak info
- `"end"` — explicit close with root cause notes if target was missed

**Modes:**
- **Normal**: Default. Target is `MINIMAX_SESSION_TARGET` calls (default: 5)
- **Warning**: Last session missed target — prioritize MiniMax
- **Forced**: 2 consecutive misses — all code changes must use MiniMax

**Trend analytics**: The `status` command returns trend direction (improving/declining/stable), streak length, and actionable insights.

**SessionEnd hook** (optional, for fully automatic tracking):

```bash
npx my-minimax-mcp --end-session
```

Add to `~/.claude/settings.json` hooks:

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

Set `MINIMAX_DEFAULT_MODEL` to the highest model your Token Plan supports. All MiniMax tools inherit this value by default, and the API will reject models not available on your plan.

## Token Savings Tracking

Every MiniMax call is tracked, and the savings are computed automatically. This includes normal CLI runs as well as MCP server usage. Use `minimax_cost_report` to see real-time savings per session, or run the CLI for cumulative reports.

### Real-time (per session)

`minimax_cost_report` now includes a `savings` section:
- **tokensOffloaded**: Exact count of tokens MiniMax handled instead of Claude
- **equivalentSonnetCalls**: How many Sonnet sub-agent calls that represents
- **avgTokensPerCall**: Self-adaptive metric (auto-improves with more data)

### Cumulative (historical)

```bash
npx my-minimax-mcp --savings-report
```

Shows all-time, monthly, and daily breakdowns with tool-level analysis:

```
=== MiniMax Token Savings Report ===

Tokens offloaded to MiniMax: 426,040 in + 161,496 out = 587,536 total
Equivalent Sonnet calls saved: ~68 (avg 8,635 tokens/call)
MiniMax API cost: $0.2468 (billed separately, not your subscription)

--- By Tool ---
  agent_task           400,254 tokens (68.1%) | 8 calls
  generate_code        144,290 tokens (24.6%) | 37 calls
  chat                  28,142 tokens (4.8%)  | 20 calls
```

### Self-Adaptive Accuracy

The `avgTokensPerCall` metric adapts to your usage patterns:
- **< 10 data points**: Uses conservative default (8,000 tokens/call)
- **10-100 data points**: Computes from all your metered calls
- **100+ data points**: Uses rolling window of last 100 calls

Confidence level (LOW/MEDIUM/HIGH) is reported so you know how reliable the estimate is. The more you use MiniMax, the more accurate the savings report becomes.

## Web Search & Image Understanding

These tools use MiniMax's Coding Plan API (separate from the chat completions endpoint). They are included in your Token Plan subscription at no additional per-call cost.

### Web Search

```
minimax_web_search { query: "TypeScript MCP server tutorial" }
```

Returns organic results (title, link, snippet, date) and related search suggestions.

### Image Understanding

```
minimax_understand_image {
  prompt: "Extract the business hours from this image",
  imageSource: "https://example.com/schedule.png"
}
```

Accepts three input types:
- **HTTP/HTTPS URL**: Fetched and converted to base64 automatically
- **Local file path**: Read from disk (supports `@` prefix)
- **Base64 data URL**: Passed through directly

Supported formats: JPEG, PNG, WebP (max 20MB).

## Features

- **Max output**: 65,536 tokens per response (~10,000 Chinese characters / ~50K English words)
- **Think tag stripping**: MiniMax `<think>...</think>` reasoning tags are automatically removed from all responses

## Security

The agent loop runs with strict sandboxing:

- **Bash whitelist**: Only `npm test`, `npx`, `node`, `tsc`, `eslint`, `pytest`, `go test`, `cargo test`, etc.
- **Command chaining blocked**: `&&`, `;`, `|` operators are rejected
- **Path isolation**: All file operations restricted to the working directory
- **Agent working-directory boundary**: `minimax_agent_task` can only operate inside `MINIMAX_WORKING_DIR` or one of its subdirectories
- **Iteration cap**: 25 iterations max per task (configurable)
- **Timeout**: 5 minutes per task (configurable)
- **Token budget**: 500K input tokens max per task

## Cost

MiniMax API pricing (per 1M tokens):

| Model | Input | Output | Best for |
|-------|-------|--------|----------|
| M2.5 | $0.118 | $0.99 | Routine code generation |
| M2.7 | $0.30 | $1.20 | Complex reasoning |

Typical task cost: **~$0.04** (agent loop with 10 iterations).

### Verified Test Results

Full integration test (14 MCP calls, 13 tests):

```
Total cost:   $0.012 (1.2 cents)
Input tokens: 38,913
Output tokens: 7,228
```

| Test | Result |
|------|--------|
| API connectivity | PASS |
| Code generation | PASS |
| Agent loop (autonomous bug fix) | PASS |
| Structured planning (JSON) | PASS |
| Multi-turn conversation | PASS |
| Cost tracking | PASS |
| Multi-file task (todo module) | PASS |
| Security (dangerous cmd blocked) | PASS |
| Routing (Opus → MiniMax, not Sonnet) | PASS |
| Graceful failure (max iterations) | PASS |
| Web search (Japanese query) | PASS |
| Image understanding (URL) | PASS |
| Image understanding (local file) | PASS |

## Testing

```bash
# Run all tests (74 tests)
npm test

# Run with coverage report
npm run coverage
```

Unit tests cover safety validation, cost tracking, file writing, server initialization, session tracking, image utilities, the Coding Plan client, and the savings calculator (adaptive averaging, cumulative grouping, tool breakdown). Coverage report uses Node.js built-in test coverage (`--experimental-test-coverage`).

## Project Structure

```
src/
├── mcp-server.ts           # MCP server entry (stdio transport)
├── cli.ts                  # CLI for debugging
├── client/
│   ├── minimax-client.ts   # OpenAI SDK wrapper for MiniMax chat API
│   ├── coding-plan-client.ts # Native fetch client for Coding Plan API (web search, VLM)
│   └── types.ts            # Shared types and pricing
├── agent/
│   ├── loop.ts             # Agent loop core logic
│   ├── functions.ts        # Function definitions for MiniMax
│   ├── executor.ts         # Function call executor
│   └── safety.ts           # Whitelist, path validation, limits
├── tools/
│   ├── agent-task.ts       # minimax_agent_task
│   ├── generate-code.ts    # minimax_generate_code
│   ├── chat.ts             # minimax_chat
│   ├── plan.ts             # minimax_plan
│   ├── web-search.ts       # minimax_web_search
│   ├── understand-image.ts # minimax_understand_image
│   └── index.ts            # Tool registry
├── conversation/
│   └── store.ts            # In-memory conversation store
└── utils/
    ├── cost-tracker.ts     # Token usage and cost tracking (with session ID)
    ├── session-tracker.ts  # Cross-session usage tracking and trend analytics
    ├── file-writer.ts      # Safe file writing
    ├── image.ts            # Image to base64 data URL conversion
    ├── savings-calculator.ts # Token savings computation (self-adaptive)
    └── retry.ts            # Exponential backoff retry
```

## License

MIT
