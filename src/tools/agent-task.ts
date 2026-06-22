import { z } from "zod";
import { MiniMaxClient } from "../client/minimax-client.js";
import { CodingPlanClient } from "../client/coding-plan-client.js";
import type { ModelId } from "../client/types.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { runAgentLoop, type OnProgressCallback } from "../agent/loop.js";

export const agentTaskSchema = z.object({
  task: z.string().describe("Full description of the task for the agent to complete autonomously"),
  workingDirectory: z.string().describe("Absolute path to the working directory for file operations"),
  model: z.enum(["MiniMax-M3", "MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.5)"),
  maxIterations: z.number().optional().describe("Maximum agent loop iterations (default: 25)"),
  maxInputTokens: z.number().optional().describe("Maximum input tokens per task (default: 500000, override for large tasks)"),
  systemPrompt: z.string().optional().describe("Custom system prompt for the agent"),
});

export type AgentTaskInput = z.infer<typeof agentTaskSchema>;

export async function agentTask(
  client: MiniMaxClient,
  costTracker: CostTracker,
  codingPlanClient: CodingPlanClient,
  input: AgentTaskInput,
  onProgress?: OnProgressCallback,
): Promise<string> {
  const model = input.model ?? client.getDefaultModel();

  const webSearch = async (query: string): Promise<string> => {
    const result = await codingPlanClient.webSearch(query);
    await costTracker.recordUnmetered("web_search");
    return JSON.stringify(result);
  };

  const result = await runAgentLoop(client, {
    task: input.task,
    workingDirectory: input.workingDirectory,
    model,
    maxIterations: input.maxIterations,
    maxInputTokens: input.maxInputTokens,
    systemPrompt: input.systemPrompt,
    webSearch,
    onProgress,
  });

  await costTracker.record("agent_task", model, result.tokensUsed);

  return JSON.stringify(result);
}
