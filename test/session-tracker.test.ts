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
    const result = await tracker.end(2, 0.01, "Only did quick edits");
    assert.equal(result.targetMet, false);
    assert.ok(result.message.includes("Target missed"));
    assert.equal(result.entry.notes, "Only did quick edits");
  });

  it("end() appends JSONL entry to file", async () => {
    const tracker = new SessionTracker(logPath, 5);
    await tracker.end(5, 0.03);
    await tracker.end(8, 0.06);
    const content = await readFile(logPath, "utf-8");
    const lines = content.trim().split("\n");
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]);
    const second = JSON.parse(lines[1]);
    assert.equal(first.calls, 5);
    assert.equal(second.calls, 8);
  });

  it("status() returns current progress", async () => {
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.status(3);
    assert.equal(result.mode, "normal");
    assert.equal(result.currentCalls, 3);
    assert.equal(result.target, 5);
    assert.equal(result.onTrack, false);
  });

  it("status() reports onTrack when calls meet target", async () => {
    const tracker = new SessionTracker(logPath, 5);
    const result = await tracker.status(7);
    assert.equal(result.onTrack, true);
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
});
