import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/mcp-server.ts";

function makeEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { MINIMAX_API_KEY: "test-key", ...overrides };
}

test("createServer throws when MINIMAX_API_KEY is missing", () => {
  assert.throws(
    () => createServer({}),
    /MINIMAX_API_KEY environment variable is required/,
  );
});

test("createServer returns an MCP server instance when MINIMAX_API_KEY is provided", () => {
  const server = createServer(makeEnv());
  assert.ok(server);
});

test("createServer accepts MINIMAX_DEFAULT_MODEL override", () => {
  const server = createServer(makeEnv({ MINIMAX_DEFAULT_MODEL: "MiniMax-M2.7" }));
  assert.ok(server);
});

test("createServer accepts MINIMAX_WORKING_DIR override", () => {
  const server = createServer(makeEnv({ MINIMAX_WORKING_DIR: "/tmp/custom-dir" }));
  assert.ok(server);
});

test("createServer accepts MINIMAX_COST_LOG override", () => {
  const server = createServer(makeEnv({ MINIMAX_COST_LOG: "/tmp/cost.log" }));
  assert.ok(server);
});
