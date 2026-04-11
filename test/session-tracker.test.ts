import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionTracker } from "../src/utils/session-tracker.js";

function tmpLog(): string {
  return join(tmpdir(), `minimax-test-usage-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

describe("SessionTracker", () => {
  let logPath: string;

  beforeEach(() => {
    logPath = tmpLog();
  });

  afterEach(async () => {
    try { await rm(logPath); } catch { /* ignore */ }
  });

  it("start() returns normal mode when no log exists", async () => {
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.equal(result.mode, "normal");
    assert.ok(result.message.includes("normal"));
    assert.equal(result.recentSessions.length, 0);
    assert.equal(result.trend, "insufficient_data");
    assert.equal(result.streak, 0);
  });

  it("start() returns warning mode after 1 miss", async () => {
    await writeFile(logPath, JSON.stringify({ date: "2026-04-10", calls: 2, cost: 0.01, targetMet: false, notes: "test" }) + "\n");
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.equal(result.mode, "warning");
    assert.ok(result.message.includes("warning"));
  });

  it("start() returns forced mode after 2 consecutive misses", async () => {
    const lines = [
      JSON.stringify({ date: "2026-04-09", calls: 1, cost: 0.005, targetMet: false, notes: "miss 1" }),
      JSON.stringify({ date: "2026-04-10", calls: 3, cost: 0.02, targetMet: false, notes: "miss 2" }),
    ].join("\n") + "\n";
    await writeFile(logPath, lines);
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.equal(result.mode, "forced");
    assert.ok(result.message.includes("FORCED"));
  });

  it("start() returns normal mode when last session met target", async () => {
    const lines = [
      JSON.stringify({ date: "2026-04-09", calls: 1, cost: 0.005, targetMet: false, notes: "miss" }),
      JSON.stringify({ date: "2026-04-10", calls: 7, cost: 0.05, targetMet: true, notes: "" }),
    ].join("\n") + "\n";
    await writeFile(logPath, lines);
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.equal(result.mode, "normal");
  });

  it("end() records target met when calls >= target", async () => {
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.end(6, 0.045);
    assert.equal(result.targetMet, true);
    assert.ok(result.message.includes("Target met"));
    assert.equal(result.entry.calls, 6);
  });

  it("end() records target missed when calls < target", async () => {
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.end(4, 0.01, "Only did quick edits");
    assert.equal(result.targetMet, false);
    assert.ok(result.message.includes("Target missed"));
    assert.equal(result.entry.notes, "Only did quick edits");
  });

  it("end() appends JSONL entry with sessionId and project", async () => {
    const tracker = new SessionTracker(logPath, 5);
    await tracker.end(5, 0.03, undefined, "session-abc", "/project/foo");
    await tracker.end(8, 0.06, undefined, "session-def", "/project/bar");
    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.equal(first.calls, 5);
    assert.equal(first.sessionId, "session-abc");
    assert.equal(first.project, "/project/foo");
    assert.equal(second.calls, 8);
    assert.equal(second.sessionId, "session-def");
  });

  it("status() returns current progress with trend and insight", async () => {
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.status(3);
    assert.equal(result.mode, "normal");
    assert.equal(result.currentCalls, 3);
    assert.equal(result.target, 5);
    assert.equal(result.dynamicTarget, 5);
    assert.equal(result.onTrack, false);
    assert.equal(result.trend, "insufficient_data");
    assert.equal(typeof result.insight, "string");
  });

  it("status() reports onTrack when calls meet target", async () => {
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.status(7);
    assert.equal(result.onTrack, true);
    assert.equal(result.dynamicTarget, 5);
  });

  it("handles malformed JSONL lines gracefully", async () => {
    const lines = [
      "not valid json",
      JSON.stringify({ date: "2026-04-10", calls: 6, cost: 0.04, targetMet: true, notes: "" }),
      "{broken",
    ].join("\n") + "\n";
    await writeFile(logPath, lines);
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.equal(result.mode, "normal");
    assert.equal(result.recentSessions.length, 1);
  });

  it("end() marks target missed when calls < target", async () => {
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.end(2, 0.005);
    assert.equal(result.targetMet, false);
    assert.ok(result.message.includes("Target missed"));
  });

  // Trend calculation tests
  it("start() calculates improving trend", async () => {
    const entries = [
      { date: "2026-04-06", calls: 2, cost: 0.01, targetMet: false, notes: "" },
      { date: "2026-04-07", calls: 3, cost: 0.02, targetMet: false, notes: "" },
      { date: "2026-04-08", calls: 5, cost: 0.03, targetMet: true, notes: "" },
      { date: "2026-04-09", calls: 7, cost: 0.04, targetMet: true, notes: "" },
      { date: "2026-04-10", calls: 9, cost: 0.05, targetMet: true, notes: "" },
    ];
    await writeFile(logPath, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.equal(result.trend, "improving");
    assert.equal(result.streak, 3);
  });

  it("start() calculates declining trend", async () => {
    const entries = [
      { date: "2026-04-06", calls: 9, cost: 0.05, targetMet: true, notes: "" },
      { date: "2026-04-07", calls: 7, cost: 0.04, targetMet: true, notes: "" },
      { date: "2026-04-08", calls: 5, cost: 0.03, targetMet: true, notes: "" },
      { date: "2026-04-09", calls: 3, cost: 0.02, targetMet: false, notes: "" },
      { date: "2026-04-10", calls: 2, cost: 0.01, targetMet: false, notes: "" },
    ];
    await writeFile(logPath, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.equal(result.trend, "declining");
  });

  it("start() shows streak in message", async () => {
    const entries = [
      { date: "2026-04-08", calls: 6, cost: 0.03, targetMet: true, notes: "" },
      { date: "2026-04-09", calls: 7, cost: 0.04, targetMet: true, notes: "" },
      { date: "2026-04-10", calls: 8, cost: 0.05, targetMet: true, notes: "" },
    ];
    await writeFile(logPath, entries.map(e => JSON.stringify(e)).join("\n") + "\n");
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.ok(result.message.includes("3-session streak"));
    assert.equal(result.streak, 3);
  });

  // Backfill test
  it("readLog backfills missing sessionId and project fields", async () => {
    const oldEntry = { date: "2026-04-10", calls: 5, cost: 0.03, targetMet: true, notes: "" };
    await writeFile(logPath, JSON.stringify(oldEntry) + "\n");
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.start();
    assert.equal(result.recentSessions.length, 1);
    assert.equal(result.recentSessions[0].sessionId, "2026-04-10");
    assert.equal(result.recentSessions[0].project, "unknown");
  });

  // Invalid target validation
  it("constructor rejects invalid target values", async () => {
    const t1 = new SessionTracker(logPath, -1);
    const r1 = await t1.status(10);
    assert.equal(r1.target, 5); // falls back to default

    const t2 = new SessionTracker(logPath, 0.5);
    const r2 = await t2.status(10);
    assert.equal(r2.target, 5);
  });
});
