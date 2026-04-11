import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { MiniMaxClient } from "./client/minimax-client.js";
import type { ModelId } from "./client/types.js";
import { calculateCost } from "./client/types.js";
import { CostTracker } from "./utils/cost-tracker.js";
import { SessionTracker } from "./utils/session-tracker.js";
import { runAgentLoop } from "./agent/loop.js";

const __cliDirname = dirname(fileURLToPath(import.meta.url));

// Route to sub-command before requiring API key
if (process.argv.includes("--init")) {
  runInit();
  process.exit(0);
}

if (process.argv.includes("--end-session")) {
  runEndSession().then(() => process.exit(0)).catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  // Only require API key for non-utility commands
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.error("Error: MINIMAX_API_KEY environment variable is required");
    console.error("Set it in .env file or export MINIMAX_API_KEY=your_key");
    process.exit(1);
  }

  main(apiKey).catch((err) => {
    console.error("Error:", err.message ?? err);
    process.exit(1);
  });
}

function parseArgs(argv: string[]): {
  mode: "chat" | "generate" | "agent";
  task: string;
  model: ModelId;
  language: string;
  workingDir: string;
} {
  const args = argv.slice(2);
  let mode: "chat" | "generate" | "agent" = "generate";
  let task = "";
  let model: ModelId = "MiniMax-M2.7";
  let language = "typescript";
  let workingDir = process.cwd();

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--mode":
        mode = args[++i] as "chat" | "generate" | "agent";
        break;
      case "--task":
      case "-t":
        task = args[++i];
        break;
      case "--model":
      case "-m":
        model = args[++i] as ModelId;
        break;
      case "--language":
      case "-l":
        language = args[++i];
        break;
      case "--dir":
      case "-d":
        workingDir = args[++i];
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
      default:
        if (!task && !args[i].startsWith("-")) {
          task = args[i];
        }
    }
  }

  if (!task) {
    console.error("Error: --task is required");
    printHelp();
    process.exit(1);
  }

  return { mode, task, model, language, workingDir };
}

function printHelp(): void {
  console.log(`
my-minimax-mcp CLI

Usage:
  npx my-minimax-mcp --task "description" [options]
  npx my-minimax-mcp --init
  npx my-minimax-mcp --end-session [--session-id ID]

Options:
  --task, -t       Task description (required for generate/chat/agent)
  --mode           Mode: generate | chat | agent (default: generate)
  --model, -m      Model: MiniMax-M2.5 | MiniMax-M2.7 (default: MiniMax-M2.7)
  --language, -l   Language for code generation (default: typescript)
  --dir, -d        Working directory for agent mode (default: cwd)
  --init           Set up Self-Improvement Loop (CLAUDE.md template + usage log)
  --end-session    Aggregate current session from cost log and persist to usage log
  --session-id     Session ID to match in cost log (default: latest session)
  --help, -h       Show this help

Examples:
  npx my-minimax-mcp --init
  npx my-minimax-mcp --task "hello world in Python" --language python
  npx my-minimax-mcp --mode agent --task "fix the failing tests" --dir ./my-project
  npx my-minimax-mcp --end-session
`);
}

async function main(apiKey: string) {
  const { mode, task, model, language, workingDir } = parseArgs(process.argv);
  const client = new MiniMaxClient(apiKey, model);
  const costTracker = new CostTracker();

  console.log(`Mode: ${mode} | Model: ${model}`);
  console.log(`Task: ${task}\n`);

  if (mode === "agent") {
    console.log(`Working directory: ${workingDir}`);
    console.log("Starting agent loop...\n");
    const result = await runAgentLoop(client, {
      task,
      workingDirectory: workingDir,
      model,
    });
    console.log(`\nResult: ${result.success ? "SUCCESS" : "FAILED"}`);
    console.log(`Summary: ${result.summary}`);
    console.log(`Iterations: ${result.iterations}`);
    console.log(`Files changed: ${result.filesChanged.join(", ") || "none"}`);
    console.log(`Tokens: ${result.tokensUsed.inputTokens} in / ${result.tokensUsed.outputTokens} out`);
    console.log(`Cost: $${result.cost.toFixed(6)}`);
  } else if (mode === "chat") {
    const response = await client.chat(
      [
        { role: "system", content: "You are a helpful AI assistant." },
        { role: "user", content: task },
      ],
      { model },
    );
    console.log(response.content ?? "(no response)");
    console.log(`\nTokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    console.log(`Cost: $${calculateCost(response.usage, model).toFixed(6)}`);
  } else {
    const systemPrompt = `You are an expert programmer. Generate clean, production-ready ${language} code. Return ONLY the code without markdown fences or explanations.`;
    const response = await client.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: task },
      ],
      { model },
    );
    console.log(response.content ?? "(no response)");
    console.log(`\nTokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`);
    console.log(`Cost: $${calculateCost(response.usage, model).toFixed(6)}`);
  }
}

function runInit(): void {
  console.log("my-minimax-mcp — Self-Improvement Loop Setup\n");

  const templatePath = resolve(__cliDirname, "..", "templates", "CLAUDE.md");
  if (existsSync(templatePath)) {
    console.log(`CLAUDE.md template: ${templatePath}`);
    console.log("Copy this to ~/.claude/CLAUDE.md or your project's CLAUDE.md\n");
    console.log("--- Template Preview ---");
    const content = readFileSync(templatePath, "utf-8");
    const lines = content.split("\n").slice(0, 20);
    console.log(lines.join("\n"));
    console.log("...\n");
  } else {
    console.log("Template not found at expected location.");
    console.log("Find templates/ in the installed package directory.\n");
  }

  const usageLog = resolve(homedir(), ".claude", "minimax-usage.jsonl");
  const claudeDir = dirname(usageLog);
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }
  if (!existsSync(usageLog)) {
    writeFileSync(usageLog, "");
    console.log(`Created usage log: ${usageLog}`);
  } else {
    console.log(`Usage log exists: ${usageLog}`);
  }

  console.log("\nSetup complete. Restart Claude Code to activate.");
}

interface CostLogEntry {
  timestamp: string;
  sessionId?: string;
  tool: string;
  model: string;
  tokensUsed: { inputTokens: number; outputTokens: number };
  cost: number;
}

/**
 * Read cost log, aggregate entries for the most recent (or specified) session,
 * and persist a session entry to the usage JSONL.
 * Designed to be called from a Claude Code SessionEnd hook.
 */
async function runEndSession(): Promise<void> {
  const costLogPath = process.env.MINIMAX_COST_LOG || resolve(homedir(), ".claude", "minimax-costs.log");
  const sessionTarget = Number(process.env.MINIMAX_SESSION_TARGET) || 5;

  // Parse --session-id if provided
  const sessionIdIdx = process.argv.indexOf("--session-id");
  const targetSessionId = sessionIdIdx !== -1 ? process.argv[sessionIdIdx + 1] : undefined;

  // Parse --notes if provided
  const notesIdx = process.argv.indexOf("--notes");
  const notes = notesIdx !== -1 ? process.argv[notesIdx + 1] : undefined;

  let content: string;
  try {
    content = await readFile(costLogPath, "utf-8");
  } catch {
    console.log("No cost log found. Nothing to aggregate.");
    return;
  }

  // Parse all entries
  const entries: CostLogEntry[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as CostLogEntry);
    } catch {
      // skip malformed
    }
  }

  if (entries.length === 0) {
    console.log("Cost log is empty. Nothing to aggregate.");
    return;
  }

  // Filter entries for the target session
  let sessionEntries: CostLogEntry[];
  if (targetSessionId) {
    sessionEntries = entries.filter(e => e.sessionId === targetSessionId);
  } else {
    // Find the latest sessionId (entries with sessionId field)
    const withSession = entries.filter(e => e.sessionId);
    if (withSession.length > 0) {
      const latestSessionId = withSession[withSession.length - 1].sessionId!;
      sessionEntries = withSession.filter(e => e.sessionId === latestSessionId);
    } else {
      // Legacy logs without sessionId: cannot reliably determine session boundaries.
      // Require explicit --session-id for legacy logs.
      console.log("Cost log entries lack sessionId. Use --session-id to specify which session to aggregate.");
      console.log("Tip: Upgrade to v1.2.0+ to automatically include sessionId in cost entries.");
      return;
    }
  }

  if (sessionEntries.length === 0) {
    console.log("No entries found for this session. Nothing to record.");
    return;
  }

  const totalCalls = sessionEntries.length;
  const totalCost = sessionEntries.reduce((sum, e) => sum + e.cost, 0);
  const sessionId = sessionEntries[0].sessionId ?? sessionEntries[0].timestamp;

  const tracker = new SessionTracker(undefined, sessionTarget);
  const result = await tracker.end(totalCalls, totalCost, notes, sessionId, process.cwd());

  console.log(`Session aggregated: ${totalCalls} calls, $${result.entry.cost.toFixed(4)}`);
  console.log(result.message);
}
