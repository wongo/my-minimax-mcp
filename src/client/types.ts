export type ModelId = "MiniMax-M2.7" | "MiniMax-M2.5" | "MiniMax-M2.5-highspeed" | "MiniMax-M2.7-highspeed";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CostInfo {
  tokensUsed: TokenUsage;
  cost: number; // USD
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatOptions {
  model?: ModelId;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" } | { type: "text" };
}

export interface ChatWithToolsOptions extends ChatOptions {
  tools: FunctionDefinition[];
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  finishReason: string;
}

// Cost per 1M tokens in USD
export const MODEL_PRICING: Record<ModelId, { input: number; output: number }> = {
  "MiniMax-M2.7": { input: 0.30, output: 1.20 },
  "MiniMax-M2.5": { input: 0.118, output: 0.99 },
  "MiniMax-M2.5-highspeed": { input: 0.118, output: 0.99 },
  "MiniMax-M2.7-highspeed": { input: 0.30, output: 1.20 },
};

export function calculateCost(usage: TokenUsage, model: ModelId): number {
  const pricing = MODEL_PRICING[model];
  return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000;
}
