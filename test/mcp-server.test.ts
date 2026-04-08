import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/mcp-server.ts";

test("createServer throws when MINIMAX_API_KEY is missing", () => {
  assert.throws(
    () => createServer({ ...omit(process.env, "MINIMAX_API_KEY") }),
    /MINIMAX_API_KEY environment variable is required/,
  );
});

test("createServer returns an MCP server instance when MINIMAX_API_KEY is provided", () => {
  const server = createServer({ ...process.env, MINIMAX_API_KEY: "test-key" });
  assert.ok(server);
});

function omit(env: NodeJS.ProcessEnv, key: string): NodeJS.ProcessEnv {
  const next = { ...env };
  delete next[key];
  return next;
}
