import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chat } from "../src/tools/chat.ts";
import { ConversationStore } from "../src/conversation/store.ts";
import { CostTracker } from "../src/utils/cost-tracker.ts";
import type { ChatMessage, ChatOptions, ChatResponse } from "../src/client/types.ts";
import type { MiniMaxClient } from "../src/client/minimax-client.ts";

function makeClient(handler: (messages: ChatMessage[], options: ChatOptions) => Promise<ChatResponse>): MiniMaxClient {
  return {
    getDefaultModel: () => "MiniMax-M2.7",
    chat: handler,
  } as unknown as MiniMaxClient;
}

async function makeTracker(): Promise<CostTracker> {
  const directory = await mkdtemp(join(tmpdir(), "minimax-chat-"));
  return new CostTracker(join(directory, "costs.log"));
}

test("chat rejects an unknown conversation id instead of silently starting over", async () => {
  let clientCalled = false;
  const client = makeClient(async () => {
    clientCalled = true;
    throw new Error("should not be called");
  });
  const tracker = await makeTracker();

  await assert.rejects(
    () => chat(client, new ConversationStore(), tracker, {
      message: "hello",
      conversationId: "missing-id",
    }),
    /Conversation not found: missing-id/,
  );
  assert.equal(clientCalled, false);
});

test("chat does not persist a user message when the API request fails", async () => {
  const store = new ConversationStore();
  const conversationId = store.create("system");
  store.append(conversationId, "user", "previous");
  store.append(conversationId, "assistant", "reply");
  const before = store.getMessages(conversationId);

  const client = makeClient(async () => {
    const error = new Error("bad request") as Error & { status: number };
    error.status = 400;
    throw error;
  });
  const tracker = await makeTracker();

  await assert.rejects(
    () => chat(client, store, tracker, {
      message: "not persisted",
      conversationId,
    }),
    /bad request/,
  );
  assert.deepEqual(store.getMessages(conversationId), before);
});

test("chat persists the user and assistant messages after a successful request", async () => {
  const store = new ConversationStore();
  const client = makeClient(async (messages) => {
    assert.equal(messages.at(-1)?.content, "hello");
    return {
      content: "world",
      toolCalls: [],
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: "stop",
    };
  });
  const tracker = await makeTracker();

  const result = JSON.parse(await chat(client, store, tracker, { message: "hello" })) as {
    conversationId: string;
  };
  assert.deepEqual(
    store.getMessages(result.conversationId).map(({ role, content }) => ({ role, content })),
    [
      { role: "system", content: "You are a helpful AI assistant." },
      { role: "user", content: "hello" },
      { role: "assistant", content: "world" },
    ],
  );
});
