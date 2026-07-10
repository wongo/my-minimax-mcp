import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tts } from "../src/tools/tts.ts";
import { CostTracker } from "../src/utils/cost-tracker.ts";

const API_KEY = "test-key-tts";
const HELLO_HEX = Buffer.from("hello").toString("hex"); // "68656c6c6f"

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("tts: success with JSON hex body", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    makeJsonResponse({ data: { audio: HELLO_HEX }, base_resp: { status_code: 0 } });

  try {
    const tracker = new CostTracker(join(tmpdir(), "tts-costs.log"));
    const result = await tts(API_KEY, tracker, { text: "hello" });
    const parsed = JSON.parse(result) as { success: boolean; audioSizeBytes: number };

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.audioSizeBytes, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tts: success writes decoded bytes to outputFile", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    makeJsonResponse({ data: { audio: HELLO_HEX }, base_resp: { status_code: 0 } });

  try {
    const tmpDir = await mkdtemp(join(tmpdir(), "tts-out-"));
    const outPath = join(tmpDir, "audio.mp3");

    const tracker = new CostTracker(join(tmpdir(), "tts-costs.log"));
    const result = await tts(API_KEY, tracker, { text: "hello", outputFile: outPath });
    const parsed = JSON.parse(result) as { success: boolean; audioSizeBytes: number };

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.audioSizeBytes, 5);

    const fileContents = await readFile(outPath);
    assert.strictEqual(fileContents.toString("utf-8"), "hello");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tts: rejects when base_resp status_code is non-zero", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    makeJsonResponse({ base_resp: { status_code: 1004, status_msg: "rate limited" } });

  try {
    const tracker = new CostTracker(join(tmpdir(), "tts-costs.log"));
    await assert.rejects(
      () => tts(API_KEY, tracker, { text: "hello" }),
      /rate limited/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tts: rejects when audio field is empty", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    makeJsonResponse({ data: { audio: "" }, base_resp: { status_code: 0 } });

  try {
    const tracker = new CostTracker(join(tmpdir(), "tts-costs.log"));
    await assert.rejects(
      () => tts(API_KEY, tracker, { text: "hello" }),
      /empty audio/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tts: rejects malformed hex audio", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    makeJsonResponse({ data: { audio: "abc" }, base_resp: { status_code: 0 } });

  try {
    const tracker = new CostTracker(join(tmpdir(), "tts-costs.log"));
    await assert.rejects(
      () => tts(API_KEY, tracker, { text: "hello" }),
      /malformed hex audio/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tts: rejects on HTTP error (status 500)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => makeJsonResponse({ base_resp: { status_code: 0 } }, 500);

  try {
    const tracker = new CostTracker(join(tmpdir(), "tts-costs.log"));
    await assert.rejects(
      () => tts(API_KEY, tracker, { text: "hello" }),
      /500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
