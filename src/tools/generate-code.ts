import { z } from "zod";
import { MiniMaxClient } from "../client/minimax-client.js";
import type { ModelId } from "../client/types.js";
import { calculateCost } from "../client/types.js";
import { safeWriteFile } from "../utils/file-writer.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { withRetry } from "../utils/retry.js";

export const generateCodeSchema = z.object({
  task: z.string().describe("Description of the code to generate"),
  language: z.string().describe("Programming language (e.g., typescript, python, go)"),
  filePath: z.string().optional().describe("If provided, write generated code to this file path"),
  model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.5)"),
  context: z.string().optional().describe("Additional context about the codebase or requirements"),
});

export type GenerateCodeInput = z.infer<typeof generateCodeSchema>;

export async function generateCode(
  client: MiniMaxClient,
  costTracker: CostTracker,
  workingDirectory: string,
  input: GenerateCodeInput,
): Promise<string> {
  const model = input.model ?? client.getDefaultModel();

  const systemPrompt = `You are an expert programmer. Generate clean, production-ready ${input.language} code. Return ONLY the code without markdown fences or explanations.`;

  const userMessage = input.context
    ? `Context:\n${input.context}\n\nTask: ${input.task}`
    : input.task;

  const response = await withRetry(() =>
    client.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      { model },
    ),
  );

  const code = response.content ?? "";
  await costTracker.record("generate_code", model, response.usage);

  let filePath: string | undefined;
  if (input.filePath) {
    filePath = await safeWriteFile(input.filePath, code, workingDirectory);
  }

  return JSON.stringify({
    code,
    filePath,
    tokensUsed: response.usage,
    cost: calculateCost(response.usage, model),
  });
}
