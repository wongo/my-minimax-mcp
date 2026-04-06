# minimax-mcp

MCP server that wraps [MiniMax AI](https://platform.minimax.io) as an autonomous code executor for Claude Code.

**Purpose**: Offload heavy executor work (code generation, bug fixing, testing) from Claude's subscription quota to the MiniMax API — independent billing at ~$0.04/task.

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

## Setup

### 1. Get a MiniMax API Key

Sign up at [platform.minimax.io](https://platform.minimax.io) and create an API key.

### 2. Install & Configure

```bash
git clone https://github.com/wongo/minimax-mcp.git
cd minimax-mcp
npm install
```

Create `.env`:
```
MINIMAX_API_KEY=your_api_key_here
```

### 3. Register in Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "minimax": {
      "command": "npx",
      "args": ["tsx", "/path/to/minimax-mcp/src/mcp-server.ts"],
      "env": {
        "DOTENV_CONFIG_PATH": "/path/to/minimax-mcp/.env"
      }
    }
  }
}
```

Restart Claude Code. The 5 tools will appear automatically.

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
