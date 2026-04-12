import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { CodingPlanClient } from "../src/client/coding-plan-client.js";

describe("CodingPlanClient", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = mock.fn();
    globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("constructor accepts custom baseUrl", () => {
    const client = new CodingPlanClient("test-key", "https://custom.api.io");
    assert.ok(client);
  });

  it("webSearch sends correct URL, headers, and body", async () => {
    mockFetch.mock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        organic: [{ title: "Result", link: "https://example.com", snippet: "text" }],
        related_searches: [],
        base_resp: { status_code: 0, status_msg: "success" },
      }),
    }));

    const client = new CodingPlanClient("test-key-123");
    const result = await client.webSearch("TypeScript MCP");

    assert.strictEqual(mockFetch.mock.callCount(), 1);
    const [url, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(url, "https://api.minimax.io/v1/coding_plan/search");
    assert.strictEqual(options.method, "POST");
    assert.strictEqual(options.headers.Authorization, "Bearer test-key-123");
    assert.strictEqual(options.headers["MM-API-Source"], "Minimax-MCP");
    assert.strictEqual(options.headers["Content-Type"], "application/json");

    const body = JSON.parse(options.body);
    assert.deepStrictEqual(body, { q: "TypeScript MCP" });

    assert.strictEqual(result.organic.length, 1);
    assert.strictEqual(result.organic[0].title, "Result");
  });

  it("understandImage sends correct URL and body", async () => {
    mockFetch.mock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        content: "A photo of a cat",
        base_resp: { status_code: 0, status_msg: "success" },
      }),
    }));

    const client = new CodingPlanClient("test-key");
    const result = await client.understandImage("What is this?", "data:image/png;base64,abc");

    const [url, options] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(url, "https://api.minimax.io/v1/coding_plan/vlm");

    const body = JSON.parse(options.body);
    assert.deepStrictEqual(body, { prompt: "What is this?", image_url: "data:image/png;base64,abc" });

    assert.strictEqual(result.content, "A photo of a cat");
  });

  it("uses custom baseUrl in request URL", async () => {
    mockFetch.mock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        organic: [],
        related_searches: [],
        base_resp: { status_code: 0, status_msg: "" },
      }),
    }));

    const client = new CodingPlanClient("key", "https://api.minimaxi.com");
    await client.webSearch("test");

    const [url] = mockFetch.mock.calls[0].arguments;
    assert.strictEqual(url, "https://api.minimaxi.com/v1/coding_plan/search");
  });

  it("throws on HTTP error with status property", async () => {
    mockFetch.mock.mockImplementation(async () => ({
      ok: false,
      status: 500,
    }));

    const client = new CodingPlanClient("test-key");
    await assert.rejects(
      () => client.webSearch("test"),
      (err: Error & { status?: number }) => {
        assert.ok(err.message.includes("500"));
        assert.strictEqual(err.status, 500);
        return true;
      },
    );
  });

  it("throws on non-zero base_resp status_code", async () => {
    mockFetch.mock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        base_resp: { status_code: 1004, status_msg: "invalid api key" },
      }),
    }));

    const client = new CodingPlanClient("bad-key");
    await assert.rejects(
      () => client.webSearch("test"),
      /invalid api key/,
    );
  });

  it("throws with default message when status_msg is empty", async () => {
    mockFetch.mock.mockImplementation(async () => ({
      ok: true,
      json: async () => ({
        base_resp: { status_code: 9999 },
      }),
    }));

    const client = new CodingPlanClient("key");
    await assert.rejects(
      () => client.understandImage("test", "data:image/png;base64,x"),
      /Unknown API error/,
    );
  });
});
