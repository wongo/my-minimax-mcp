# my-minimax-mcp

[English](README.md) | [繁體中文](README.zh-TW.md)

MCP server that wraps [MiniMax AI](https://platform.minimax.io) as an autonomous code executor for Claude Code.

**Purpose**: A typical coding task consumes 85% of tokens on execution (writing, testing, debugging) and only 15% on planning. This MCP server moves that 85% to MiniMax API (~$0.04/task), so your Claude subscription handles 5-7x more tasks per day.

## Architecture

```
Claude Code (Opus) ─── orchestrator
    │
    ├── minimax_generate_code    → simple code generation
    ├── minimax_agent_task       → autonomous agent loop (read → write → test → debug)
    ├── minimax_chat             → multi-turn conversation
    ├── minimax_plan             → structured JSON implementation plan
    └── minimax_cost_report      → session cost tracking
```

The key feature is the **agent loop**: MiniMax uses function calling to autonomously read files, write code, run tests, and debug — equivalent to a Sonnet sub-agent, but without consuming Claude subscription tokens.

## Tools

| Tool | Description | Default Model |
|------|-------------|---------------|
| `minimax_agent_task` | Autonomous coding: read files, write code, run tests, debug loop | M2.5 |
| `minimax_generate_code` | Generate code, optionally write to file | M2.5 |
| `minimax_chat` | Multi-turn conversation with context preservation | M2.7 |
| `minimax_plan` | Structured implementation plan as JSON | M2.7 |
| `minimax_cost_report` | Session token usage and cost breakdown | — |

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

Or manually edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "minimax": {
      "command": "bash",
      "args": ["/path/to/my-minimax-mcp/run-mcp.sh"]
    }
  }
}
```

> **Note**: MCP servers must be registered in `~/.claude.json` (not `~/.claude/settings.json`). Use `claude mcp add` for the correct setup.

Restart Claude Code. The 5 tools will appear automatically. Verify with `claude mcp list`.

## CLI (for debugging)

```bash
# Code generation
npx tsx src/cli.ts --task "fibonacci in Python" --language python

# Chat
npx tsx src/cli.ts --mode chat --task "explain async/await"

# Autonomous agent
npx tsx src/cli.ts --mode agent --task "fix the failing tests" --dir ./my-project
```

## Configuration

All settings via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MINIMAX_API_KEY` | API key (required) | — |
| `MINIMAX_DEFAULT_MODEL` | Default model | `MiniMax-M2.5` |
| `MINIMAX_MAX_ITERATIONS` | Agent loop max iterations | `25` |
| `MINIMAX_TIMEOUT_MS` | Per-task timeout | `300000` (5min) |
| `MINIMAX_BASH_WHITELIST` | Additional allowed bash commands (comma-separated) | — |
| `MINIMAX_WORKING_DIR` | Working directory for file operations | `process.cwd()` |
| `MINIMAX_COST_LOG` | Cost log file path | `~/.claude/minimax-costs.log` |

## Features

- **Max output**: 65,536 tokens per response (~10,000 Chinese characters / ~50K English words)
- **Think tag stripping**: MiniMax `<think>...</think>` reasoning tags are automatically removed from all responses

## Security

The agent loop runs with strict sandboxing:

- **Bash whitelist**: Only `npm test`, `npx`, `node`, `tsc`, `eslint`, `pytest`, `go test`, `cargo test`, etc.
- **Command chaining blocked**: `&&`, `;`, `|` operators are rejected
- **Path isolation**: All file operations restricted to the working directory
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

Full integration test (11 MCP calls, 10 tests):

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

## Testing

```bash
# Run all tests (15 tests)
npm test

# Run with coverage report
npm run coverage
```

Unit tests cover safety validation, cost tracking, file writing, and server initialization. Coverage report uses Node.js built-in test coverage (`--experimental-test-coverage`).

## Project Structure

```
src/
├── mcp-server.ts           # MCP server entry (stdio transport)
├── cli.ts                  # CLI for debugging
├── client/
│   ├── minimax-client.ts   # OpenAI SDK wrapper for MiniMax API
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
│   └── index.ts            # Tool registry
├── conversation/
│   └── store.ts            # In-memory conversation store
└── utils/
    ├── cost-tracker.ts     # Token usage and cost tracking
    ├── file-writer.ts      # Safe file writing
    └── retry.ts            # Exponential backoff retry
```

## License

MIT
