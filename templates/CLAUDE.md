# MiniMax MCP — Self-Improvement Protocol

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

## Session Protocol (MANDATORY)

### Session Start

Call `minimax_session_tracker` with command `"start"` at the beginning of every session.
Follow the mode instructions returned:

- **normal**: Proceed as usual. Target: 5+ MiniMax calls per session.
- **warning**: Last session missed target. Prioritize MiniMax for all code generation.
- **forced**: 2 consecutive misses. ALL code changes MUST use MiniMax tools. No exceptions.

### Edit Gate (before EVERY Edit call)

Before calling the Edit tool for any code change, output:

> [Executor Check] Should this go to MiniMax? Reason: ___

Opus Edit is ONLY justified when:
1. Change is 3 lines or fewer in an already-read file
2. MiniMax already failed on this specific task (cite the failure)
3. Task requires deep context across 5+ files

Everything else MUST use MiniMax:
- New files/components -> `minimax_generate_code`
- Self-contained bug fix -> `minimax_agent_task`
- Content/article generation -> `minimax_generate_code`
- Code review -> `minimax_chat`

### Session End

Before ending the session:
1. Call `minimax_session_tracker` with command `"end"`
2. If target not met, provide root cause in the `notes` parameter
3. Root cause must be specific (not just "will improve next time")

## Fallback Policy

- **Connection errors** (529/5xx/timeout): Retry up to 2 times with backoff (5s, then 15s). If all fail, route remaining tasks to Sonnet.
- **Output errors** (incorrect result): Retry once. If still fails, fall back to Sonnet for THIS task only. Subsequent tasks still use MiniMax.

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

Before Edit: "[Executor Check] Should this go to MiniMax?"
Session start: minimax_session_tracker command:"start"
Session end:   minimax_session_tracker command:"end"
```
