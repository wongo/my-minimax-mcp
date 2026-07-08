import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { MEDIA_BASE_URL } from "../src/tools/media-shared.ts";
import { generateVideo } from "../src/tools/generate-video.ts";
import { CostTracker } from "../src/utils/cost-tracker.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API_KEY = "test-key-video";

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Set poll interval to 1 ms so tests complete fast
const POLL_ENV_KEY = "MINIMAX_MEDIA_POLL_MS";
const ORIGINAL_POLL_MS = process.env[POLL_ENV_KEY];
before(() => {
  process.env[POLL_ENV_KEY] = "1";
});
after(() => {
  if (ORIGINAL_POLL_MS === undefined) {
    delete process.env[POLL_ENV_KEY];
  } else {
    process.env[POLL_ENV_KEY] = ORIGINAL_POLL_MS;
  }
});

// Builds a fetch stub that returns queued responses in call order.
// Records every requested URL so tests can assert the tool hit the right
// endpoints in the right sequence. Throws if the tool makes more calls than
// were queued, so a test can never pass because an unexpected call returned
// undefined.
type QueuedResponse = Response | ((url: string) => Response);
interface QueueFetch {
  fetch: typeof globalThis.fetch;
  calls: string[];
}
function makeQueueFetch(responses: QueuedResponse[]): QueueFetch {
  const queue = [...responses];
  const calls: string[] = [];
  const fetch = (async (url: string | URL) => {
    const requested = String(url);
    calls.push(requested);
    const res = queue.shift();
    if (res === undefined) {
      throw new Error(`Unexpected fetch call #${calls.length} to ${requested} — queue exhausted`);
    }
    return typeof res === "function" ? res(requested) : res;
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function newTracker(): CostTracker {
  return new CostTracker(join(tmpdir(), "video-costs.log"));
}

test("generateVideo: happy path — submit → poll → retrieve → returns correct JSON", async () => {
  const originalFetch = globalThis.fetch;
  const q = makeQueueFetch([
    // Step 1: submit
    makeJsonResponse({ task_id: "t1", base_resp: { status_code: 0 } }),
    // Step 2: first poll — still processing
    makeJsonResponse({ task_id: "t1", status: "Processing", base_resp: { status_code: 0 } }),
    // Step 3: second poll — success
    makeJsonResponse({ task_id: "t1", status: "Success", file_id: "f1", base_resp: { status_code: 0 } }),
    // Step 4: retrieve
    makeJsonResponse({
      file: { file_id: "f1", download_url: "https://cdn.example.com/x.mp4" },
      base_resp: { status_code: 0 },
    }),
  ]);
  globalThis.fetch = q.fetch;

  try {
    const result = await generateVideo(API_KEY, newTracker(), { prompt: "a cat playing piano" });
    const parsed = JSON.parse(result) as {
      success: boolean;
      taskId: string;
      fileId: string;
      videoUrl: string;
    };

    assert.strictEqual(parsed.success, true);
    assert.strictEqual(parsed.taskId, "t1");
    assert.strictEqual(parsed.fileId, "f1");
    assert.strictEqual(parsed.videoUrl, "https://cdn.example.com/x.mp4");

    // The queue is positional, so assert the tool actually hit the documented
    // endpoints in the documented order — otherwise a wrong-endpoint bug would
    // still consume the queue and pass.
    assert.strictEqual(q.calls.length, 4);
    assert.strictEqual(q.calls[0], `${MEDIA_BASE_URL}/video_generation`);
    assert.ok(q.calls[1].startsWith(`${MEDIA_BASE_URL}/query/video_generation?task_id=t1`), q.calls[1]);
    assert.ok(q.calls[2].startsWith(`${MEDIA_BASE_URL}/query/video_generation?task_id=t1`), q.calls[2]);
    assert.ok(q.calls[3].startsWith(`${MEDIA_BASE_URL}/files/retrieve?file_id=f1`), q.calls[3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateVideo: rejects when submit base_resp status_code is non-zero", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeQueueFetch([
    makeJsonResponse({ base_resp: { status_code: 2056, status_msg: "invalid model" } }),
  ]).fetch;

  try {
    await assert.rejects(
      () => generateVideo(API_KEY, newTracker(), { prompt: "test" }),
      /2056|invalid model/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateVideo: rejects when submit response has no task_id", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeQueueFetch([
    makeJsonResponse({ base_resp: { status_code: 0 } }),
  ]).fetch;

  try {
    await assert.rejects(
      () => generateVideo(API_KEY, newTracker(), { prompt: "test" }),
      /task_id/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateVideo: rejects when poll returns status 'Fail'", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeQueueFetch([
    makeJsonResponse({ task_id: "t2", base_resp: { status_code: 0 } }),
    makeJsonResponse({ task_id: "t2", status: "Processing", base_resp: { status_code: 0 } }),
    makeJsonResponse({ task_id: "t2", status: "Fail", base_resp: { status_code: 0, status_msg: "generation error" } }),
  ]).fetch;

  try {
    await assert.rejects(
      () => generateVideo(API_KEY, newTracker(), { prompt: "test" }),
      /failed|generation error/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// A "Success" status with no file_id means the task finished and the response was
// malformed — it must NOT be reported as a timeout, which would send whoever is
// debugging it looking for a slow API instead of a bad payload.
test("generateVideo: Success without file_id rejects as malformed, not as a timeout", async () => {
  const originalFetch = globalThis.fetch;
  const q = makeQueueFetch([
    makeJsonResponse({ task_id: "t3", base_resp: { status_code: 0 } }),
    makeJsonResponse({ task_id: "t3", status: "Success", base_resp: { status_code: 0 } }),
  ]);
  globalThis.fetch = q.fetch;

  try {
    await assert.rejects(
      () => generateVideo(API_KEY, newTracker(), { prompt: "test" }),
      (err: Error) => {
        assert.match(err.message, /Success but returned no file_id/);
        assert.doesNotMatch(err.message, /timed out/i);
        return true;
      },
    );
    // It must bail on the first Success poll, not keep polling to exhaustion.
    assert.strictEqual(q.calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("generateVideo: rejects when retrieve has no download_url", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = makeQueueFetch([
    makeJsonResponse({ task_id: "t4", base_resp: { status_code: 0 } }),
    makeJsonResponse({ task_id: "t4", status: "Processing", base_resp: { status_code: 0 } }),
    makeJsonResponse({ task_id: "t4", status: "Success", file_id: "f4", base_resp: { status_code: 0 } }),
    makeJsonResponse({ file: { file_id: "f4" }, base_resp: { status_code: 0 } }),
  ]).fetch;

  try {
    await assert.rejects(
      () => generateVideo(API_KEY, newTracker(), { prompt: "test" }),
      /download_url/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
