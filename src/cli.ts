import "dotenv/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { MiniMaxClient } from "./client/minimax-client.js";
import type { ModelId } from "./client/types.js";
import { calculateCost } from "./client/types.js";
import { CostTracker } from "./utils/cost-tracker.js";
import { runAgentLoop } from "./agent/loop.js";

const __cliDirname = dirname(fileURLToPath(import.meta.url));

// Handle --init before requiring API key
if (process.argv.includes("--init")) {
  runInit();
  process.exit(0);
}

const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  console.error("Error: MINIMAX_API_KEY environment variable is required");
  console.error("Set it in .env file or export MINIMAX_API_KEY=your_key");
  process.exit(1);
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
        // If no flag, treat as task
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

Options:
  --task, -t     Task description (required for generate/chat/agent)
  --mode         Mode: generate | chat | agent (default: generate)
  --model, -m    Model: MiniMax-M2.5 | MiniMax-M2.7 (default: MiniMax-M2.7)
  --language, -l Language for code generation (default: typescript)
  --dir, -d      Working directory for agent mode (default: cwd)
  --init         Set up Self-Improvement Loop (CLAUDE.md template + usage log)
  --help, -h     Show this help

Examples:
  npx my-minimax-mcp --init
  npx my-minimax-mcp --task "hello world in Python" --language python
  npx my-minimax-mcp --mode agent --task "fix the failing tests" --dir ./my-project
  npx my-minimax-mcp --mode chat --task "explain async/await in TypeScript"
`);
}

async function main() {
  const { mode, task, model, language, workingDir } = parseArgs(process.argv);
  const client = new MiniMaxClient(apiKey!, model);
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
    // generate mode
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

  // Show template location
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

  // Create usage log if needed
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

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
