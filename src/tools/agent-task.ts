import { z } from "zod";
import { MiniMaxClient } from "../client/minimax-client.js";
import type { ModelId } from "../client/types.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { runAgentLoop } from "../agent/loop.js";

export const agentTaskSchema = z.object({
  task: z.string().describe("Full description of the task for the agent to complete autonomously"),
  workingDirectory: z.string().describe("Absolute path to the working directory for file operations"),
  model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.5)"),
  maxIterations: z.number().optional().describe("Maximum agent loop iterations (default: 25)"),
  systemPrompt: z.string().optional().describe("Custom system prompt for the agent"),
});

export type AgentTaskInput = z.infer<typeof agentTaskSchema>;

export async function agentTask(
  client: MiniMaxClient,
  costTracker: CostTracker,
  input: AgentTaskInput,
): Promise<string> {
  const model = (input.model ?? "MiniMax-M2.5") as ModelId;

  const result = await runAgentLoop(client, {
    task: input.task,
    workingDirectory: input.workingDirectory,
    model,
    maxIterations: input.maxIterations,
    systemPrompt: input.systemPrompt,
  });

  await costTracker.record("agent_task", model, result.tokensUsed);

  return JSON.stringify(result);
}
