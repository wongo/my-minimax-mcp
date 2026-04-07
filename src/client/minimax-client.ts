import OpenAI from "openai";
import type { ChatMessage, ChatOptions, ChatResponse, ChatWithToolsOptions, ModelId, TokenUsage } from "./types.js";

const DEFAULT_BASE_URL = "https://api.minimax.io/v1";
const DEFAULT_MAX_TOKENS = 65536;

/** Strip MiniMax's <think>...</think> reasoning tags from response content */
function stripThinkTags(content: string | null): string | null {
  if (!content) return content;
  return content.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim() || null;
}

export class MiniMaxClient {
  private client: OpenAI;
  private defaultModel: ModelId;

  constructor(apiKey: string, defaultModel: ModelId = "MiniMax-M2.5") {
    this.client = new OpenAI({
      apiKey,
      baseURL: DEFAULT_BASE_URL,
    });
    this.defaultModel = defaultModel;
  }

  async chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResponse> {
    const model = options.model ?? this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map(m => this.toOpenAIMessage(m)),
      temperature: options.temperature ?? 0.7,
      max_completion_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    });

    const choice = response.choices[0];
    return {
      content: stripThinkTags(choice?.message?.content ?? null),
      toolCalls: [],
      usage: this.extractUsage(response.usage),
      finishReason: choice?.finish_reason ?? "unknown",
    };
  }

  async chatWithTools(messages: ChatMessage[], options: ChatWithToolsOptions): Promise<ChatResponse> {
    const model = options.model ?? this.defaultModel;

    const tools = options.tools.map(t => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map(m => this.toOpenAIMessage(m)),
      tools,
      temperature: options.temperature ?? 0.7,
      max_completion_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    });

    const choice = response.choices[0];
    const toolCalls = (choice?.message?.tool_calls ?? [])
      .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => tc.type === "function")
      .map(tc => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));

    return {
      content: stripThinkTags(choice?.message?.content ?? null),
      toolCalls,
      usage: this.extractUsage(response.usage),
      finishReason: choice?.finish_reason ?? "unknown",
    };
  }

  private toOpenAIMessage(msg: ChatMessage): OpenAI.ChatCompletionMessageParam {
    if (msg.role === "tool") {
      return { role: "tool", content: msg.content, tool_call_id: msg.tool_call_id! };
    }
    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: "assistant",
        content: msg.content,
        tool_calls: msg.tool_calls.map(tc => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
    }
    return { role: msg.role, content: msg.content } as OpenAI.ChatCompletionMessageParam;
  }

  private extractUsage(usage: OpenAI.CompletionUsage | undefined): TokenUsage {
    return {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
    };
  }
}
