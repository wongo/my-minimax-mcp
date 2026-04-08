import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { CostTracker } from "../src/utils/cost-tracker.ts";

test("CostTracker aggregates usage, call count, and rounded total cost", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "minimax-cost-tracker-"));
  const logPath = join(tempDirectory, "costs.log");
  const tracker = new CostTracker(logPath);

  await tracker.record("minimax_generate_code", "MiniMax-M2.5", {
    inputTokens: 1000,
    outputTokens: 500,
  });
  await tracker.record("minimax_chat", "MiniMax-M2.7", {
    inputTokens: 2000,
    outputTokens: 1000,
  });

  const report = tracker.getReport();
  assert.equal(report.callCount, 2);
  assert.deepEqual(report.totalTokens, {
    inputTokens: 3000,
    outputTokens: 1500,
  });
  assert.equal(report.totalCost, 0.002413);
  assert.equal(report.breakdown.length, 2);

  await delay(25);
  const logLines = (await readFile(logPath, "utf-8")).trim().split("\n");
  assert.equal(logLines.length, 2);
});

test("CostTracker reset clears accumulated report state", async () => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "minimax-cost-tracker-"));
  const tracker = new CostTracker(join(tempDirectory, "costs.log"));

  await tracker.record("minimax_generate_code", "MiniMax-M2.5", {
    inputTokens: 10,
    outputTokens: 10,
  });
  tracker.reset();

  const report = tracker.getReport();
  assert.equal(report.callCount, 0);
  assert.equal(report.totalCost, 0);
  assert.deepEqual(report.totalTokens, {
    inputTokens: 0,
    outputTokens: 0,
  });
  assert.deepEqual(report.breakdown, []);
});
