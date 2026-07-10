import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateMusic } from "../src/tools/generate-music.ts";
import { CostTracker } from "../src/utils/cost-tracker.ts";

const API_KEY = "test-key-music";
const HELLO_HEX = Buffer.from("hello-music").toString("hex"); // "68656c6c6f2d6d75736963"

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("generateMusic: instrumental success", async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedBody: unknown;

  globalThis.fetch = async (_url: string | URL, init?: RequestInit) => {
    capturedBody = init?.body ? JSON.parse(init.body as string) : undefined;
    return makeJsonResponse({
      data: { audio: HELLO_HEX, status: 2 },
      base_resp: { status_code: 0 },
    });
  };

  try {
    const tracker = new CostTracker(join(tmpdir(), "music-costs.log"));
    const result = await generateMusic(
      API_KEY,
      tracker,
      { prompt: "lofi", instrumental: true },
    );
    const parsed = JSON.parse(result) as { success: boolean; audioSizeBytes: number };

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.audioSizeBytes, HELLO_HEX.length / 2);

    assert.deepStrictEqual((capturedBody as Record<string, unknown>)["model"], "music-2.6");
    assert.strictEqual((capturedBody as Record<string, unknown>)["is_instrumental"], true);
    assert.strictEqual((capturedBody as Record<string, unknown>)["output_format"], "hex");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateMusic: vocal mode sends lyrics and not is_instrumental", async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> = {};

  globalThis.fetch = async (_url: string | URL, init?: RequestInit) => {
    if (init?.body) capturedBody = JSON.parse(init.body as string);
    return makeJsonResponse({
      data: { audio: HELLO_HEX, status: 2 },
      base_resp: { status_code: 0 },
    });
  };

  try {
    const tracker = new CostTracker(join(tmpdir(), "music-costs.log"));
    await generateMusic(
      API_KEY,
      tracker,
      { lyrics: "[Verse]\nhello world" },
    );

    assert.strictEqual(capturedBody["lyrics"], "[Verse]\nhello world");
    assert.strictEqual("is_instrumental" in capturedBody, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateMusic: rejects when neither prompt nor lyrics is provided", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 200 });

  try {
    const tracker = new CostTracker(join(tmpdir(), "music-costs.log"));
    await assert.rejects(
      () => generateMusic(API_KEY, tracker, {}),
      /prompt|lyrics/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateMusic: rejects when base_resp status_code is non-zero", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    makeJsonResponse({ base_resp: { status_code: 2001, status_msg: "invalid request" } });

  try {
    const tracker = new CostTracker(join(tmpdir(), "music-costs.log"));
    await assert.rejects(
      () => generateMusic(API_KEY, tracker, { prompt: "lofi" }),
      /invalid request/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateMusic: rejects when audio field is empty", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    makeJsonResponse({ data: { audio: "" }, base_resp: { status_code: 0 } });

  try {
    const tracker = new CostTracker(join(tmpdir(), "music-costs.log"));
    await assert.rejects(
      () => generateMusic(API_KEY, tracker, { prompt: "lofi" }),
      /empty/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateMusic: rejects malformed hex audio", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    makeJsonResponse({ data: { audio: "not-hex" }, base_resp: { status_code: 0 } });

  try {
    const tracker = new CostTracker(join(tmpdir(), "music-costs.log"));
    await assert.rejects(
      () => generateMusic(API_KEY, tracker, { prompt: "lofi" }),
      /malformed hex audio/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
