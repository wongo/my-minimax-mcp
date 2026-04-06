import { z } from "zod";
import { MiniMaxClient } from "../client/minimax-client.js";
import type { ModelId } from "../client/types.js";
import { calculateCost } from "../client/types.js";
import { ConversationStore } from "../conversation/store.js";
import { CostTracker } from "../utils/cost-tracker.js";
import { withRetry } from "../utils/retry.js";

export const chatSchema = z.object({
  message: z.string().describe("Message to send to MiniMax"),
  conversationId: z.string().optional().describe("ID of existing conversation to continue (omit to start new)"),
  model: z.enum(["MiniMax-M2.5", "MiniMax-M2.7", "MiniMax-M2.5-highspeed", "MiniMax-M2.7-highspeed"]).optional().describe("Model to use (default: MiniMax-M2.7)"),
  systemPrompt: z.string().optional().describe("System prompt (only used when starting a new conversation)"),
});

export type ChatInput = z.infer<typeof chatSchema>;

export async function chat(
  client: MiniMaxClient,
  conversationStore: ConversationStore,
  costTracker: CostTracker,
  input: ChatInput,
): Promise<string> {
  const model = (input.model ?? "MiniMax-M2.7") as ModelId;

  let conversationId: string;
  if (input.conversationId && conversationStore.has(input.conversationId)) {
    conversationId = input.conversationId;
  } else {
    conversationId = conversationStore.create(input.systemPrompt ?? "You are a helpful AI assistant.");
  }

  conversationStore.append(conversationId, "user", input.message);
  const messages = conversationStore.getMessages(conversationId);

  const response = await withRetry(() =>
    client.chat(messages, { model }),
  );

  const reply = response.content ?? "";
  conversationStore.append(conversationId, "assistant", reply);
  await costTracker.record("chat", model, response.usage);

  return JSON.stringify({
    response: reply,
    conversationId,
    tokensUsed: response.usage,
    cost: calculateCost(response.usage, model),
  });
}
