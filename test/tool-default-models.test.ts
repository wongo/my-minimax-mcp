import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateCode } from "../src/tools/generate-code.ts";
import { chat } from "../src/tools/chat.ts";
import { plan } from "../src/tools/plan.ts";
import { agentTask } from "../src/tools/agent-task.ts";
import { CostTracker } from "../src/utils/cost-tracker.ts";
import { ConversationStore } from "../src/conversation/store.ts";
import type { ChatResponse, ChatWithToolsOptions, ChatOptions, ChatMessage, ModelId } from "../src/client/types.ts";
import type { MiniMaxClient } from "../src/client/minimax-client.ts";

const DEFAULT_MODEL: ModelId = "MiniMax-M2.7-highspeed";

function makeChatResponse(content: string): ChatResponse {
  return {
    content,
    toolCalls: [],
    usage: { inputTokens: 10, outputTokens: 5 },
    finishReason: "stop",
  };
}

test("generateCode, chat, and plan inherit the MiniMaxClient default model when input.model is omitted", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-default-models-"));
  const logPath = join(workingDirectory, "costs.log");
  const seenModels: ModelId[] = [];

  const client = {
    getDefaultModel: () => DEFAULT_MODEL,
    chat: async (_messages: ChatMessage[], options: ChatOptions = {}) => {
      seenModels.push((options.model ?? DEFAULT_MODEL) as ModelId);
      if (options.responseFormat?.type === "json_object") {
        return makeChatResponse("{\"steps\":[]}");
      }
      return makeChatResponse("ok");
    },
  } as unknown as MiniMaxClient;

  const generateTracker = new CostTracker(logPath);
  const chatTracker = new CostTracker(logPath);
  const planTracker = new CostTracker(logPath);

  await generateCode(client, generateTracker, workingDirectory, {
    task: "generate code",
    language: "typescript",
  });
  await chat(client, new ConversationStore(), chatTracker, {
    message: "hello",
  });
  await plan(client, planTracker, {
    task: "make a plan",
  });

  assert.deepEqual(seenModels, [DEFAULT_MODEL, DEFAULT_MODEL, DEFAULT_MODEL]);
  assert.equal(generateTracker.getReport().breakdown[0].model, DEFAULT_MODEL);
  assert.equal(chatTracker.getReport().breakdown[0].model, DEFAULT_MODEL);
  assert.equal(planTracker.getReport().breakdown[0].model, DEFAULT_MODEL);
});

test("agentTask inherits the MiniMaxClient default model and explicit overrides still win", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-agent-model-"));
  const logPath = join(workingDirectory, "costs.log");
  const seenModels: ModelId[] = [];

  const client = {
    getDefaultModel: () => DEFAULT_MODEL,
    chatWithTools: async (_messages: ChatMessage[], options: ChatWithToolsOptions) => {
      seenModels.push((options.model ?? DEFAULT_MODEL) as ModelId);
      return {
        content: null,
        toolCalls: [
          {
            id: "call_1",
            type: "function" as const,
            function: {
              name: "task_complete",
              arguments: JSON.stringify({ summary: "done", files_changed: [] }),
            },
          },
        ],
        usage: { inputTokens: 20, outputTokens: 10 },
        finishReason: "tool_calls",
      };
    },
  } as unknown as MiniMaxClient;

  const defaultTracker = new CostTracker(logPath);
  await agentTask(client, defaultTracker, {
    task: "finish task",
    workingDirectory,
    maxIterations: 1,
  });

  const overrideTracker = new CostTracker(logPath);
  await agentTask(client, overrideTracker, {
    task: "finish task",
    workingDirectory,
    maxIterations: 1,
    model: "MiniMax-M2.5",
  });

  assert.deepEqual(seenModels, [DEFAULT_MODEL, "MiniMax-M2.5"]);
  assert.equal(defaultTracker.getReport().breakdown[0].model, DEFAULT_MODEL);
  assert.equal(overrideTracker.getReport().breakdown[0].model, "MiniMax-M2.5");
});
