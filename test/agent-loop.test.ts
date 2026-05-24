import test from "node:test";
import assert from "node:assert/strict";
import { buildIterationLimitDiagnostics } from "../src/agent/loop.ts";

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