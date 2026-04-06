import { z } from "zod";
import { MiniMaxClient } from "../client/minimax-client.js";
import type { ModelId } from "../client/types.js";
import { calculateCost } from "../client/types.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { withRetry } from "../utils/retry.js";

export const planSchema = z.object({
  task: z.string().describe("Description of the task to plan"),
  codebaseContext: z.string().optional().describe("Context about the current codebase structure and relevant files"),
  model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.7)"),
});

export type PlanInput = z.infer<typeof planSchema>;

export async function plan(
  client: MiniMaxClient,
  costTracker: CostTracker,
  input: PlanInput,
): Promise<string> {
  const model = (input.model ?? "MiniMax-M2.7") as ModelId;

  const systemPrompt = `You are an expert software architect. Create a structured implementation plan as JSON.

Return a JSON object with this exact structure:
{
  "steps": [
    { "order": 1, "description": "Step description", "files": ["file1.ts"], "dependencies": [] }
  ],
  "files": [
    { "path": "src/file1.ts", "action": "create|modify|delete", "description": "What changes" }
  ],
  "dependencies": [
    { "name": "package-name", "version": "^1.0.0", "reason": "Why needed" }
  ],
  "estimatedComplexity": "low|medium|high",
  "risks": ["Potential risk 1"]
}`;

  const userMessage = input.codebaseContext
    ? `Codebase context:\n${input.codebaseContext}\n\nTask: ${input.task}`
    : input.task;

  const response = await withRetry(() =>
    client.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      { model, responseFormat: { type: "json_object" } },
    ),
  );

  await costTracker.record("plan", model, response.usage);

  let planData: unknown;
  try {
    planData = JSON.parse(response.content ?? "{}");
  } catch {
    planData = { raw: response.content };
  }

  return JSON.stringify({
    plan: planData,
    tokensUsed: response.usage,
    cost: calculateCost(response.usage, model),
  });
}
