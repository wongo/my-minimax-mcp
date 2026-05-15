import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MiniMaxClient } from "./client/minimax-client.js";
import { CodingPlanClient } from "./client/coding-plan-client.js";
import type { ModelId } from "./client/types.js";
import { ConversationStore } from "./conversation/store.js";
import { CostTracker } from "./utils/cost-tracker.js";
import { SessionTracker } from "./utils/session-tracker.js";
import { generateCode } from "./tools/generate-code.js";
import { agentTask } from "./tools/agent-task.js";
import { chat } from "./tools/chat.js";
import { plan } from "./tools/plan.js";
import { webSearch } from "./tools/web-search.js";
import { understandImage } from "./tools/understand-image.js";
import { resolveWorkingDirectory } from "./agent/safety.js";
import { FailureLogger } from "./utils/failure-logger.js";
import { Telemetry } from "./utils/telemetry.js";

export function loadEnvFile(envPath = process.env.DOTENV_CONFIG_PATH ?? resolve(__dirname, "..", ".env")): void {
  try {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env not found — rely on process.env from MCP server config
  }
}

export function createServer(
  env: NodeJS.ProcessEnv = process.env,
  externalCostTracker?: CostTracker,
  externalSessionTracker?: SessionTracker,
): McpServer {
  const apiKey = env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY environment variable is required");
  }

  const defaultModel = (env.MINIMAX_DEFAULT_MODEL ?? "MiniMax-M2.7") as ModelId;
  const costLogPath = env.MINIMAX_COST_LOG || undefined;
  const workingDirectory = env.MINIMAX_WORKING_DIR || process.cwd();

  const client = new MiniMaxClient(apiKey, defaultModel);
  const codingPlanClient = new CodingPlanClient(apiKey, env.MINIMAX_API_HOST);
  const conversationStore = new ConversationStore();
  const costTracker = externalCostTracker ?? new CostTracker(costLogPath);

  const require = createRequire(import.meta.url);
  const pkg = require("../package.json") as { version: string };

  const failureLogger = new FailureLogger(undefined, costTracker.sessionId);
  const telemetry = new Telemetry(undefined, costTracker.sessionId);

  const server = new McpServer({
    name: "my-minimax-mcp",
    version: pkg.version,
  });

  server.tool(
    "minimax_generate_code",
    "Generate code using MiniMax AI. Returns generated code and optionally writes it to a file.",
    {
      task: z.string().describe("Description of the code to generate"),
      language: z.string().describe("Programming language (e.g., typescript, python, go)"),
      filePath: z.string().optional().describe("If provided, write generated code to this file path"),
      model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model override (default: MINIMAX_DEFAULT_MODEL env var, typically M2.7)"),
      context: z.string().optional().describe("Additional context about the codebase or requirements"),
    },
    async (input) => {
      const start = Date.now();
      try {
        const result = await generateCode(client, costTracker, workingDirectory, input);
        await telemetry.recordSuccess({
          tool: "minimax_generate_code",
          durationMs: Date.now() - start,
          model: input.model ?? defaultModel,
          callerProject: basename(workingDirectory),
        });
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        await failureLogger.record({
          tool: "minimax_generate_code",
          error: err,
          toolInput: input,
          workingDirectory,
          model: input.model ?? defaultModel,
        });
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.registerTool(
    "minimax_agent_task",
    {
      description: "Execute a complete coding task autonomously. MiniMax AI will read files, write code, run tests, and debug in an autonomous loop until the task is complete.",
      inputSchema: {
        task: z.string().describe("Full description of the task for the agent to complete"),
        workingDirectory: z.string().describe("Absolute path to the working directory for file operations"),
        model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model override (default: MINIMAX_DEFAULT_MODEL env var, typically M2.7)"),
        maxIterations: z.number().optional().describe("Maximum agent loop iterations (default: 25)"),
        systemPrompt: z.string().optional().describe("Custom system prompt for the agent"),
      },
    },
    async (input, extra) => {
      const start = Date.now();
      let resolvedWorkingDir: string | undefined;
      try {
        resolvedWorkingDir = resolveWorkingDirectory(input.workingDirectory, workingDirectory);
        const progressToken = extra._meta?.progressToken;
        const onProgress = progressToken !== undefined
          ? async (info: { iteration: number; maxIterations: number; lastAction: string; message: string }) => {
              await extra.sendNotification({
                method: "notifications/progress" as const,
                params: {
                  progressToken,
                  progress: info.iteration,
                  total: info.maxIterations,
                  message: info.message,
                },
              });
            }
          : undefined;

        const resultJson = await agentTask(
          client,
          costTracker,
          {
            ...input,
            workingDirectory: resolvedWorkingDir,
          },
          onProgress,
        );

        // Parse the agent result to check for soft failures (iteration_limit)
        let parsedResult: { success?: boolean; reason?: string; iterations?: number; tokensUsed?: { inputTokens: number; outputTokens: number } } = {};
        try {
          parsedResult = JSON.parse(resultJson) as typeof parsedResult;
        } catch {
          // not JSON — ignore
        }

        const durationMs = Date.now() - start;
        const model = input.model ?? defaultModel;
        const callerProject = basename(resolvedWorkingDir);

        await telemetry.recordSuccess({
          tool: "minimax_agent_task",
          durationMs,
          model,
          callerProject,
          iterationsUsed: parsedResult.iterations,
          tokensUsed: parsedResult.tokensUsed,
        });

        // Soft failure: task completed (no exception) but hit iteration limit
        if (parsedResult.reason === "iteration_limit") {
          await failureLogger.record({
            tool: "minimax_agent_task",
            error: new Error(`Reached maximum iterations`),
            toolInput: { task: input.task, maxIterations: input.maxIterations },
            workingDirectory: resolvedWorkingDir,
            model,
          });
        }

        return { content: [{ type: "text", text: resultJson }] };
      } catch (err) {
        await failureLogger.record({
          tool: "minimax_agent_task",
          error: err,
          toolInput: { task: input.task, workingDirectory: input.workingDirectory, maxIterations: input.maxIterations },
          workingDirectory: resolvedWorkingDir,
          model: input.model ?? defaultModel,
        });
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "minimax_chat",
    "Multi-turn chat with MiniMax AI. Supports conversation context preservation across multiple calls.",
    {
      message: z.string().describe("Message to send to MiniMax"),
      conversationId: z.string().optional().describe("ID of existing conversation to continue"),
      model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model override (default: MINIMAX_DEFAULT_MODEL env var, typically M2.7)"),
      systemPrompt: z.string().optional().describe("System prompt (only for new conversations)"),
    },
    async (input) => {
      const start = Date.now();
      try {
        const result = await chat(client, conversationStore, costTracker, input);
        await telemetry.recordSuccess({
          tool: "minimax_chat",
          durationMs: Date.now() - start,
          model: input.model ?? defaultModel,
          callerProject: basename(workingDirectory),
        });
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        await failureLogger.record({
          tool: "minimax_chat",
          error: err,
          toolInput: input,
          workingDirectory,
          model: input.model ?? defaultModel,
        });
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "minimax_plan",
    "Generate a structured implementation plan as JSON using MiniMax AI.",
    {
      task: z.string().describe("Description of the task to plan"),
      codebaseContext: z.string().optional().describe("Context about the codebase"),
      model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model override (default: MINIMAX_DEFAULT_MODEL env var, typically M2.7)"),
    },
    async (input) => {
      const start = Date.now();
      try {
        const result = await plan(client, costTracker, input);
        await telemetry.recordSuccess({
          tool: "minimax_plan",
          durationMs: Date.now() - start,
          model: input.model ?? defaultModel,
          callerProject: basename(workingDirectory),
        });
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        await failureLogger.record({
          tool: "minimax_plan",
          error: err,
          toolInput: input,
          workingDirectory,
          model: input.model ?? defaultModel,
        });
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "minimax_cost_report",
    "Get a cost, token usage, and savings report for this session. Shows tokens offloaded to MiniMax that would have consumed Claude subscription quota.",
    {},
    async () => {
      const report = costTracker.getReport();
      const s = report.savings;
      const formatted = {
        session: {
          callCount: report.callCount,
          totalTokens: report.totalTokens,
          minimaxCost: `$${report.totalCost.toFixed(6)}`,
        },
        savings: {
          tokensOffloaded: s.tokensOffloaded,
          equivalentSonnetCalls: s.equivalentSonnetCalls,
          avgTokensPerCall: s.avgTokensPerCall,
          dataPointsUsed: s.dataPointsUsed,
          message: s.totalCalls > 0
            ? `This session: MiniMax handled ${s.tokensOffloaded.total.toLocaleString()} tokens for your coding tasks. That's ~${s.equivalentSonnetCalls} Sonnet sub-agent calls that didn't touch your Claude subscription.`
            : "No MiniMax calls yet this session.",
        },
        breakdown: report.breakdown,
      };
      return { content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  server.tool(
    "minimax_web_search",
    "Search the web using MiniMax AI. Returns results with titles, links, snippets, and related searches.",
    {
      query: z.string().describe("Search query"),
    },
    async (input) => {
      const start = Date.now();
      try {
        const result = await webSearch(codingPlanClient, costTracker, input);
        await telemetry.recordSuccess({
          tool: "minimax_web_search",
          durationMs: Date.now() - start,
          callerProject: basename(workingDirectory),
        });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        await failureLogger.record({
          tool: "minimax_web_search",
          error: err,
          toolInput: input,
          workingDirectory,
        });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  server.tool(
    "minimax_understand_image",
    "Analyze an image using MiniMax AI vision. Supports URLs, local file paths, or base64 data URLs (JPEG/PNG/WebP, max 20MB).",
    {
      prompt: z.string().describe("Question or instruction about the image"),
      imageSource: z.string().describe("Image URL (HTTP/HTTPS), local file path, or base64 data URL"),
    },
    async (input) => {
      const start = Date.now();
      try {
        const result = await understandImage(codingPlanClient, costTracker, input);
        await telemetry.recordSuccess({
          tool: "minimax_understand_image",
          durationMs: Date.now() - start,
          callerProject: basename(workingDirectory),
        });
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        await failureLogger.record({
          tool: "minimax_understand_image",
          error: err,
          toolInput: input,
          workingDirectory,
        });
        return { content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  const sessionTracker = externalSessionTracker ?? new SessionTracker(
    env.MINIMAX_USAGE_LOG || undefined,
    Number(env.MINIMAX_SESSION_TARGET) || 5,
  );
  const projectDir = workingDirectory;

  server.tool(
    "minimax_session_tracker",
    "Track MiniMax usage across sessions for self-improvement. " +
    "'start': check mode (auto-called on first tool use if not explicit). " +
    "'end': record session + optional root cause notes. " +
    "'status': mid-session progress with trend analytics.",
    {
      command: z.enum(["start", "end", "status"]).describe("start: check mode; end: record session; status: progress + trend"),
      notes: z.string().optional().describe("For 'end': root cause if target missed (required when missing)"),
    },
    async (input) => {
      const start = Date.now();
      try {
        switch (input.command) {
          case "start": {
            const result = await sessionTracker.start();
            await telemetry.recordSuccess({
              tool: "minimax_session_tracker",
              durationMs: Date.now() - start,
              callerProject: basename(workingDirectory),
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case "end": {
            const report = costTracker.getReport();
            const savingsData = {
              tokensOffloaded: report.savings.tokensOffloaded.total,
              equivalentSonnetCalls: report.savings.equivalentSonnetCalls,
            };
            const result = await sessionTracker.end(
              report.callCount, report.totalCost, input.notes,
              costTracker.sessionId, projectDir, savingsData,
            );
            await telemetry.recordSuccess({
              tool: "minimax_session_tracker",
              durationMs: Date.now() - start,
              callerProject: basename(workingDirectory),
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case "status": {
            const report = costTracker.getReport();
            const result = await sessionTracker.status(report.callCount);
            await telemetry.recordSuccess({
              tool: "minimax_session_tracker",
              durationMs: Date.now() - start,
              callerProject: basename(workingDirectory),
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
        }
      } catch (err) {
        await failureLogger.record({
          tool: "minimax_session_tracker",
          error: err,
          toolInput: input,
          workingDirectory,
        });
        return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
      }
    },
  );

  return server;
}

async function main() {
  loadEnvFile();
  const env = process.env;

  const costTracker = new CostTracker(env.MINIMAX_COST_LOG || undefined);
  const sessionTracker = new SessionTracker(
    env.MINIMAX_USAGE_LOG || undefined,
    Number(env.MINIMAX_SESSION_TARGET) || 5,
  );
  const projectDir = env.MINIMAX_WORKING_DIR || process.cwd();

  // Guard against double persistence (explicit "end" + SIGTERM)
  let sessionPersisted = false;

  // Wrap the tool's "end" command to set the guard
  const originalEnd = sessionTracker.end.bind(sessionTracker);
  sessionTracker.end = async (...args) => {
    sessionPersisted = true;
    return originalEnd(...args);
  };

  // Auto-persist session on shutdown (only if not already persisted)
  const persistSession = async () => {
    if (sessionPersisted) return;
    const report = costTracker.getReport();
    if (report.callCount > 0) {
      sessionPersisted = true;
      const savingsData = {
        tokensOffloaded: report.savings.tokensOffloaded.total,
        equivalentSonnetCalls: report.savings.equivalentSonnetCalls,
      };
      await originalEnd(
        report.callCount, report.totalCost, "auto-persisted on shutdown",
        costTracker.sessionId, projectDir, savingsData,
      );
    }
  };

  process.on("SIGTERM", async () => {
    await persistSession();
    process.exit(0);
  });
  process.on("SIGINT", async () => {
    await persistSession();
    process.exit(0);
  });

  const server = createServer(env, costTracker, sessionTracker);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.argv.includes("--init") || process.argv.includes("--end-session") || process.argv.includes("--savings-report")) {
    import("./cli.js").catch((err) => {
      console.error("Failed to run CLI command:", err);
      process.exit(1);
    });
  } else {
    main().catch((err) => {
      console.error("Failed to start MCP server:", err);
      process.exit(1);
    });
  }
}
