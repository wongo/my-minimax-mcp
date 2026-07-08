import test from "node:test";
import assert from "node:assert/strict";
import { buildIterationLimitDiagnostics, buildTokenBudgetDiagnostics, type AgentTaskOptions } from "../src/agent/loop.js";
import { getDefaultSafetyConfig } from "../src/agent/safety.js";

// ─── stillProgressing=true ────────────────────────────────────────────────────

test("stillProgressing=true when last action is write_file", () => {
  const result = buildIterationLimitDiagnostics(
    ["read_file → foo.ts", "list_files → src/", "write_file → bar.ts"],
    ["bar.ts"],
    25,
  );
  assert.equal(result.stillProgressing, true);
});

test("stillProgressing=true when last action is edit_file_batch", () => {
  const result = buildIterationLimitDiagnostics(
    ["read_file → foo.ts", "edit_file → bar.ts", "edit_file_batch → [baz.ts, qux.ts]"],
    ["baz.ts", "qux.ts"],
    25,
  );
  assert.equal(result.stillProgressing, true);
});

test("stillProgressing=false when all last actions are read_file/list_files", () => {
  const result = buildIterationLimitDiagnostics(
    ["read_file → foo.ts", "list_files → src/", "search_content → bar"],
    [],
    25,
  );
  assert.equal(result.stillProgressing, false);
});

// ─── suggestion ──────────────────────────────────────────────────────────────

test("suggestion mentions higher maxIterations when stillProgressing", () => {
  const result = buildIterationLimitDiagnostics(
    ["read_file → foo.ts", "list_files → src/", "write_file → bar.ts"],
    ["bar.ts"],
    25,
  );
  assert.ok(result.suggestion.includes("38"), `expected "38" in suggestion: ${result.suggestion}`);
  assert.ok(result.suggestion.includes("Retry with maxIterations="), `expected "Retry with maxIterations=" in suggestion: ${result.suggestion}`);
});

test("suggestion mentions task decomposition when NOT progressing", () => {
  const result = buildIterationLimitDiagnostics(
    ["read_file → foo.ts", "list_files → src/", "search_content → bar"],
    [],
    25,
  );
  assert.ok(result.suggestion.includes("decomposing"), `expected "decomposing" in suggestion: ${result.suggestion}`);
  assert.ok(!result.suggestion.includes("Retry with maxIterations="), `expected no "Retry with maxIterations=" in suggestion: ${result.suggestion}`);
});

test("suggested maxIterations is ceil(current * 1.5) — 25 → 38", () => {
  const result = buildIterationLimitDiagnostics(
    ["write_file → foo.ts"],
    ["foo.ts"],
    25,
  );
  assert.ok(result.suggestion.includes("38"), `expected "38" in suggestion: ${result.suggestion}`);
});

test("suggested maxIterations is ceil(current * 1.5) — 10 → 15", () => {
  const result = buildIterationLimitDiagnostics(
    ["edit_file → foo.ts"],
    ["foo.ts"],
    10,
  );
  assert.ok(result.suggestion.includes("15"), `expected "15" in suggestion: ${result.suggestion}`);
});

// ─── passthrough ─────────────────────────────────────────────────────────────

test("filesModified and lastActions are passed through unchanged", () => {
  const lastActions = ["read_file → foo.ts", "list_files → src/", "write_file → bar.ts"];
  const filesModified = ["bar.ts", "baz.ts"];
  const result = buildIterationLimitDiagnostics(lastActions, filesModified, 25);
  assert.deepEqual(result.lastActions, lastActions);
  assert.deepEqual(result.filesModified, filesModified);
});

// ─── token budget diagnostics ────────────────────────────────────────────────
// Regression: token-budget exhaustion used to reuse the iteration-limit
// diagnostics, telling callers to raise maxIterations — useless advice when
// the loop ran out of tokens, not turns.

test("token budget diagnostics suggest raising maxInputTokens, not maxIterations", () => {
  const result = buildTokenBudgetDiagnostics(
    ["read_file → foo.ts", "edit_file → bar.ts"],
    ["bar.ts"],
    500_000,
  );
  assert.equal(result.stillProgressing, true);
  assert.ok(
    result.suggestion.includes("maxInputTokens="),
    `expected "maxInputTokens=" in suggestion: ${result.suggestion}`,
  );
  assert.ok(
    !result.suggestion.includes("maxIterations="),
    `suggestion must not mention maxIterations: ${result.suggestion}`,
  );
});

test("token budget suggested value is rounded up to the next 100k — 500k → 800k", () => {
  const result = buildTokenBudgetDiagnostics(["write_file → foo.ts"], ["foo.ts"], 500_000);
  assert.ok(result.suggestion.includes("800000"), `expected "800000" in: ${result.suggestion}`);
});

test("token budget diagnostics recommend decomposition when not progressing", () => {
  const result = buildTokenBudgetDiagnostics(
    ["read_file → a.ts", "read_file → b.ts", "search_content → x"],
    [],
    500_000,
  );
  assert.equal(result.stillProgressing, false);
  assert.ok(result.suggestion.includes("Decompose"), `expected "Decompose" in: ${result.suggestion}`);
  assert.ok(!result.suggestion.includes("maxInputTokens="), result.suggestion);
});

// ─── maxInputTokens override ─────────────────────────────────────────────────────

test("maxInputTokens override in AgentTaskOptions passes through to SafetyConfig", async () => {
  const options: AgentTaskOptions = {
    task: "test task",
    workingDirectory: "/tmp",
    maxInputTokens: 1000000,
  };
  const config = {
    ...getDefaultSafetyConfig(options.workingDirectory),
    ...(options.maxIterations ? { maxIterations: options.maxIterations } : {}),
    ...(options.maxInputTokens ? { maxInputTokens: options.maxInputTokens } : {}),
  };
  assert.equal(config.maxInputTokens, 1000000);
});