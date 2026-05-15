import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Telemetry } from "../src/utils/telemetry.ts";
import { waitForFileLines } from "./helpers.ts";

function getYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

test("Telemetry: recordSuccess writes to success monthly file", async () => {
  const logsDir = await mkdtemp(join(tmpdir(), "minimax-telemetry-success-"));
  const telemetry = new Telemetry(logsDir, "test-session-s1");

  await telemetry.recordSuccess({
    tool: "minimax_agent_task",
    durationMs: 1234,
    model: "MiniMax-M2.7",
    callerProject: "my-project",
    iterationsUsed: 7,
    tokensUsed: { inputTokens: 1000, outputTokens: 500 },
  });

  const expectedFile = join(logsDir, `success-${getYearMonth()}.jsonl`);
  const lines = await waitForFileLines(expectedFile, 1);
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.tool, "minimax_agent_task");
  assert.equal(record.sessionId, "test-session-s1");
  assert.equal(record.durationMs, 1234);
  assert.equal(record.model, "MiniMax-M2.7");
  assert.equal(record.callerProject, "my-project");
  assert.equal(record.iterationsUsed, 7);
  assert.deepEqual(record.tokensUsed, { inputTokens: 1000, outputTokens: 500 });
  assert.ok(record.timestamp, "should have a timestamp");
});

test("Telemetry: recordRetry writes to retries monthly file", async () => {
  const logsDir = await mkdtemp(join(tmpdir(), "minimax-telemetry-retry-"));
  const telemetry = new Telemetry(logsDir, "test-session-r1");

  await telemetry.recordRetry({
    tool: "minimax_chat",
    attempt: 2,
    succeeded: false,
    errorCategory: "api_5xx",
    errorMessage: "500 Internal Server Error",
  });

  const expectedFile = join(logsDir, `retries-${getYearMonth()}.jsonl`);
  const lines = await waitForFileLines(expectedFile, 1);
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.tool, "minimax_chat");
  assert.equal(record.sessionId, "test-session-r1");
  assert.equal(record.attempt, 2);
  assert.equal(record.succeeded, false);
  assert.equal(record.errorCategory, "api_5xx");
  assert.equal(record.errorMessage, "500 Internal Server Error");
  assert.ok(record.timestamp, "should have a timestamp");
});

test("Telemetry: multiple successes go to correct file", async () => {
  const logsDir = await mkdtemp(join(tmpdir(), "minimax-telemetry-multi-"));
  const telemetry = new Telemetry(logsDir, "test-session-m1");

  await telemetry.recordSuccess({ tool: "minimax_generate_code", durationMs: 100 });
  await telemetry.recordSuccess({ tool: "minimax_chat", durationMs: 200 });
  await telemetry.recordSuccess({ tool: "minimax_plan", durationMs: 300 });

  const expectedFile = join(logsDir, `success-${getYearMonth()}.jsonl`);
  const lines = await waitForFileLines(expectedFile, 3);
  assert.equal(lines.filter(l => l.trim()).length, 3);
});

test("Telemetry: recordSuccess — write failure does not throw (fire-and-forget)", async () => {
  const telemetry = new Telemetry("/nonexistent/invalid/path", "test-session-noop");

  await assert.doesNotReject(
    async () => {
      await telemetry.recordSuccess({ tool: "minimax_chat", durationMs: 50 });
      await new Promise(resolve => setTimeout(resolve, 50));
    },
    "Telemetry.recordSuccess() should never throw",
  );
});

test("Telemetry: recordRetry — write failure does not throw (fire-and-forget)", async () => {
  const telemetry = new Telemetry("/nonexistent/invalid/path", "test-session-noop2");

  await assert.doesNotReject(
    async () => {
      await telemetry.recordRetry({ tool: "minimax_chat", attempt: 1, succeeded: true });
      await new Promise(resolve => setTimeout(resolve, 50));
    },
    "Telemetry.recordRetry() should never throw",
  );
});
