import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertBaseResp, downloadToFile } from "../src/tools/media-shared.ts";

// ── assertBaseResp ─────────────────────────────────────────────────────────────

test("assertBaseResp throws when base_resp.status_code !== 0", () => {
  assert.throws(
    () =>
      assertBaseResp(
        { base_resp: { status_code: 1004, status_msg: "rate limited" } },
        "Test context",
      ),
    (err: unknown) => {
      const msg = (err as Error).message;
      return msg.includes("1004") && msg.includes("rate limited");
    },
  );
});

test("assertBaseResp does NOT throw when base_resp.status_code === 0", () => {
  assert.doesNotThrow(() =>
    assertBaseResp(
      { base_resp: { status_code: 0, status_msg: "success" } },
      "Test context",
    ),
  );
});

test("assertBaseResp does NOT throw when base_resp is absent", () => {
  assert.doesNotThrow(() => assertBaseResp({ data: "anything" }, "Test context"));
});

test("assertBaseResp does NOT throw when input is not an object (null)", () => {
  assert.doesNotThrow(() => assertBaseResp(null, "Test context"));
});

test("assertBaseResp does NOT throw when input is not an object (string)", () => {
  assert.doesNotThrow(() => assertBaseResp("just a string", "Test context"));
});

// ── downloadToFile ─────────────────────────────────────────────────────────────

test("downloadToFile writes bytes to temp file and returns byte length", async () => {
  const originalFetch = globalThis.fetch;
  const body = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

  globalThis.fetch = async () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });

  try {
    const tmpDir = await mkdtemp(join(tmpdir(), "media-shared-"));
    const outputPath = join(tmpDir, "downloaded.bin");

    const byteLength = await downloadToFile("https://cdn.example.com/file.bin", outputPath);

    assert.strictEqual(byteLength, 4);

    const written = await readFile(outputPath);
    assert.deepStrictEqual(Array.from(written), [0x01, 0x02, 0x03, 0x04]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("downloadToFile throws on a non-ok response (404)", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(null, { status: 404 });

  try {
    await assert.rejects(
      () => downloadToFile("https://cdn.example.com/missing", "/tmp/out"),
      /404/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
