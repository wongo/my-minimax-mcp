import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// Load .env manually to avoid dotenv stdout pollution (breaks MCP stdio protocol)
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = process.env.DOTENV_CONFIG_PATH ?? resolve(__dirname, "..", ".env");
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
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MiniMaxClient } from "./client/minimax-client.js";
import type { ModelId } from "./client/types.js";
import { ConversationStore } from "./conversation/store.js";
import { CostTracker } from "./utils/cost-tracker.js";
import { generateCode } from "./tools/generate-code.js";
import { agentTask } from "./tools/agent-task.js";
import { chat } from "./tools/chat.js";
import { plan } from "./tools/plan.js";

const apiKey = process.env.MINIMAX_API_KEY;
if (!apiKey) {
  console.error("MINIMAX_API_KEY environment variable is required");
  process.exit(1);
}

const defaultModel = (process.env.MINIMAX_DEFAULT_MODEL ?? "MiniMax-M2.5") as ModelId;
const costLogPath = process.env.MINIMAX_COST_LOG || undefined;
const workingDirectory = process.env.MINIMAX_WORKING_DIR || process.cwd();

const client = new MiniMaxClient(apiKey, defaultModel);
const conversationStore = new ConversationStore();
const costTracker = new CostTracker(costLogPath);

const server = new McpServer({
  name: "minimax",
  version: "1.0.0",
});

// Tool 1: minimax_generate_code
server.tool(
  "minimax_generate_code",
  "Generate code using MiniMax AI. Returns generated code and optionally writes it to a file.",
  {
    task: z.string().describe("Description of the code to generate"),
    language: z.string().describe("Programming language (e.g., typescript, python, go)"),
    filePath: z.string().optional().describe("If provided, write generated code to this file path"),
    model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.5)"),
    context: z.string().optional().describe("Additional context about the codebase or requirements"),
  },
  async (input) => {
    try {
      const result = await generateCode(client, costTracker, workingDirectory, input);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// Tool 2: minimax_agent_task
server.tool(
  "minimax_agent_task",
  "Execute a complete coding task autonomously. MiniMax AI will read files, write code, run tests, and debug in an autonomous loop until the task is complete.",
  {
    task: z.string().describe("Full description of the task for the agent to complete"),
    workingDirectory: z.string().describe("Absolute path to the working directory for file operations"),
    model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.5)"),
    maxIterations: z.number().optional().describe("Maximum agent loop iterations (default: 25)"),
    systemPrompt: z.string().optional().describe("Custom system prompt for the agent"),
  },
  async (input) => {
    try {
      const result = await agentTask(client, costTracker, input);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// Tool 3: minimax_chat
server.tool(
  "minimax_chat",
  "Multi-turn chat with MiniMax AI. Supports conversation context preservation across multiple calls.",
  {
    message: z.string().describe("Message to send to MiniMax"),
    conversationId: z.string().optional().describe("ID of existing conversation to continue"),
    model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.7)"),
    systemPrompt: z.string().optional().describe("System prompt (only for new conversations)"),
  },
  async (input) => {
    try {
      const result = await chat(client, conversationStore, costTracker, input);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// Tool 4: minimax_plan
server.tool(
  "minimax_plan",
  "Generate a structured implementation plan as JSON using MiniMax AI.",
  {
    task: z.string().describe("Description of the task to plan"),
    codebaseContext: z.string().optional().describe("Context about the codebase"),
    model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.7)"),
  },
  async (input) => {
    try {
      const result = await plan(client, costTracker, input);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
    }
  },
);

// Tool 5: minimax_cost_report
server.tool(
  "minimax_cost_report",
  "Get a cost and token usage report for this session.",
  {},
  async () => {
    const report = costTracker.getReport();
    return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
  },
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
