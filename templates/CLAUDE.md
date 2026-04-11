# MiniMax MCP — Behavioral Rules

## Model Configuration

Set `MINIMAX_DEFAULT_MODEL` to the highest model your Token Plan supports:

| Token Plan | Recommended Model |
|------------|-------------------|
| Standard | `MiniMax-M2.5` |
| Pro | `MiniMax-M2.7` |
| Pro+ (highspeed) | `MiniMax-M2.7-highspeed` |

## Model Roles

- **Opus (Claude)**: requirements analysis, planning, architecture decisions, orchestration, verification
- **MiniMax (via MCP tools)**: code generation, autonomous coding tasks, planning, review. Independent billing.
- **Sonnet**: fallback when MiniMax fails or tasks require deep cross-file context

## Executor Selection (first match wins)

| Priority | Condition | Executor |
|----------|-----------|----------|
| 1 | Deep cross-file context needed | Sonnet sub-agent |
| 2 | Environment-specific (Docker, DB, env vars) | Sonnet sub-agent |
| 3 | New file/component/structured output | `minimax_generate_code` |
| 4 | Self-contained bug fix or feature | `minimax_agent_task` |
| 5 | Implementation plan | `minimax_plan` |
| 6 | Code review / discussion | `minimax_chat` |
| 7 | Everything else | Sonnet sub-agent |

## Session Tracking (Automatic)

The MCP server **automatically** tracks usage and persists session data on shutdown. No manual `start`/`end` calls required.

Optional commands for explicit control:
- `minimax_session_tracker` command `"start"` — check current mode and recent trends
- `minimax_session_tracker` command `"status"` — mid-session progress with trend analytics
- `minimax_session_tracker` command `"end"` — explicit close with root cause notes if target missed

### Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| **normal** | Default / last session hit target | Proceed as usual |
| **warning** | Last session missed target | Prioritize MiniMax for all code generation |
| **forced** | 2 consecutive misses | ALL code changes MUST use MiniMax |

### Target

Target = `MINIMAX_SESSION_TARGET` (default: 5 MiniMax calls per session).

## Fallback Policy

- **Connection errors** (529/5xx/timeout): Retry up to 2 times with backoff (5s, then 15s). If all fail, route remaining tasks to Sonnet.
- **Output errors** (incorrect result): Retry once. If still fails, fall back to Sonnet for THIS task only.

## Known MiniMax Limitations

| Limitation | Workaround |
|-----------|------------|
| `filePath` writes to wrong directory | Use returned `code` field + Write tool to correct path |
| Editing existing files is unreliable | Provide full file content + explicit edit instructions |
| Poor cross-file context | Use Sonnet sub-agent for multi-file changes |

**Good at**: Independent content generation (articles, SQL, new components, config, migrations, tests)
**Not good at**: Reading many existing files then making small tweaks

## Quick Reference

```
New file       -> minimax_generate_code
Bug fix        -> minimax_agent_task
Plan           -> minimax_plan
Review/discuss -> minimax_chat
Cross-file     -> Sonnet

Session auto-tracked. Use "status" command for progress.
```
