import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FunctionExecutor } from "../src/agent/executor.ts";
import { getDefaultSafetyConfig } from "../src/agent/safety.ts";
import { AGENT_FUNCTIONS } from "../src/agent/functions.ts";

// ── web_search tool in AGENT_FUNCTIONS ────────────────────────────────────────

test("AGENT_FUNCTIONS includes web_search", () => {
  const names = AGENT_FUNCTIONS.map((f) => f.name);
  assert.ok(names.includes("web_search"), `Expected web_search in ${names.join(", ")}`);
});

const webSearchFn = AGENT_FUNCTIONS.find((f) => f.name === "web_search");
assert.ok(webSearchFn, "web_search function definition should exist");

test("web_search function has correct schema", () => {
  assert.equal(webSearchFn!.parameters.type, "object");
  assert.deepEqual(webSearchFn!.parameters.required, ["query"]);
  assert.equal(webSearchFn!.parameters.properties.query.type, "string");
  assert.equal(
    webSearchFn!.description.includes("limited budget"),
    true,
    "web_search description should mention limited budget",
  );
});

// ── web_search via FunctionExecutor ───────────────────────────────────────────

test("execute(web_search) returns closure result when webSearch is injected", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "websearch-exec-"));
  const config = getDefaultSafetyConfig(workingDirectory);

  const mockResult = JSON.stringify({ results: [{ title: "Test", url: "https://example.com" }] });
  const mockWebSearch = async (query: string) => {
    assert.equal(query, "typescript latest version");
    return mockResult;
  };

  const executor = new FunctionExecutor(config, mockWebSearch);
  const result = await executor.execute("web_search", { query: "typescript latest version" });

  assert.equal(result, mockResult);
});

test("search counter increments on each successful web_search call", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "websearch-counter-"));
  const config = getDefaultSafetyConfig(workingDirectory);
  config.maxWebSearches = 3;

  let callCount = 0;
  const mockWebSearch = async (_query: string) => {
    callCount++;
    return JSON.stringify({ results: [] });
  };

  const executor = new FunctionExecutor(config, mockWebSearch);

  await executor.execute("web_search", { query: "q1" });
  await executor.execute("web_search", { query: "q2" });
  await executor.execute("web_search", { query: "q3" });

  assert.equal(callCount, 3, `Expected 3 calls, got ${callCount}`);
});

test("after maxWebSearches calls, further calls return budget exhausted message and do NOT invoke closure", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "websearch-budget-"));
  const config = getDefaultSafetyConfig(workingDirectory);
  config.maxWebSearches = 2;

  let callCount = 0;
  const mockWebSearch = async (_query: string) => {
    callCount++;
    return JSON.stringify({ results: [] });
  };

  const executor = new FunctionExecutor(config, mockWebSearch);

  // Exhaust the budget
  await executor.execute("web_search", { query: "q1" });
  await executor.execute("web_search", { query: "q2" });
  assert.equal(callCount, 2);

  // One more — should return exhausted message, not invoke closure
  const result = await executor.execute("web_search", { query: "q3" });

  assert.equal(callCount, 2, "Closure should NOT be called again after budget exhausted");
  assert.ok(
    result.includes("budget exhausted"),
    `Expected "budget exhausted" in result, got: ${result}`,
  );
  assert.ok(
    result.includes("2/2"),
    `Expected "2/2" in exhausted message, got: ${result}`,
  );
});

test("execute(web_search) returns 'not available' message when no webSearch closure provided (backward compat)", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "websearch-noclosure-"));
  const config = getDefaultSafetyConfig(workingDirectory);

  // No second argument
  const executor = new FunctionExecutor(config);
  const result = await executor.execute("web_search", { query: "anything" });

  assert.ok(
    result.includes("not available"),
    `Expected "not available" in result, got: ${result}`,
  );
});

test("execute(web_search) decrements counter on failure (failed call does not count against budget)", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "websearch-fail-"));
  const config = getDefaultSafetyConfig(workingDirectory);
  config.maxWebSearches = 1;

  let callCount = 0;
  let shouldFail = true;
  const mockWebSearch = async (_query: string) => {
    if (shouldFail) {
      shouldFail = false;
      throw new Error("network error");
    }
    callCount++;
    return JSON.stringify({ results: [] });
  };

  const executor = new FunctionExecutor(config, mockWebSearch);

  // First call fails — should not count against budget
  await executor.execute("web_search", { query: "q1" });

  // Second call succeeds — now exhaust budget normally
  await executor.execute("web_search", { query: "q2" });
  await executor.execute("web_search", { query: "q3" }); // budget exhausted

  assert.equal(callCount, 1, `Expected 1 successful call after retry, got ${callCount}`);
});

test("execute(web_search) failure returns 'Web search failed' message with error details", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "websearch-err-"));
  const config = getDefaultSafetyConfig(workingDirectory);
  config.maxWebSearches = 5;

  const mockWebSearch = async (_query: string) => {
    throw new Error("rate limit exceeded");
  };

  const executor = new FunctionExecutor(config, mockWebSearch);
  const result = await executor.execute("web_search", { query: "anything" });

  assert.ok(
    result.includes("Web search failed"),
    `Expected "Web search failed" in result, got: ${result}`,
  );
  assert.ok(
    result.includes("rate limit exceeded"),
    `Expected "rate limit exceeded" in result, got: ${result}`,
  );
});

test("FunctionExecutor list_files respects glob semantics for nested paths", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-"));
  await mkdir(join(workingDirectory, "src/nested"), { recursive: true });
  await mkdir(join(workingDirectory, "docs"), { recursive: true });
  await writeFile(join(workingDirectory, "src/index.ts"), "export {};\n");
  await writeFile(join(workingDirectory, "src/nested/util.ts"), "export const util = true;\n");
  await writeFile(join(workingDirectory, "src/nested/util.js"), "module.exports = {};\n");
  await writeFile(join(workingDirectory, "README.md"), "# root\n");
  await writeFile(join(workingDirectory, "docs/guide.md"), "# docs\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));

  const tsMatches = await executor.execute("list_files", { pattern: "src/**/*.ts" });
  assert.match(tsMatches, /src\/index\.ts/);
  assert.match(tsMatches, /src\/nested\/util\.ts/);
  assert.doesNotMatch(tsMatches, /util\.js/);

  const topLevelMarkdown = await executor.execute("list_files", { pattern: "*.md" });
  assert.equal(topLevelMarkdown, "README.md");
});

test("edit_file exact match still works (regression)", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-edit-"));
  const filePath = join(workingDirectory, "foo.ts");
  await writeFile(filePath, "const x = 1;\nconst y = 2;\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  const result = await executor.execute("edit_file", {
    path: "foo.ts",
    old_string: "const x = 1;",
    new_string: "const x = 42;",
  });

  assert.match(result, /File edited: foo\.ts/);
  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("const x = 42;"));
  assert.ok(content.includes("const y = 2;"));
});

test("edit_file CRLF file with LF old_string → throws CRLF hint error (not silent corruption)", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-edit-"));
  const filePath = join(workingDirectory, "crlf.ts");
  // File on disk has CRLF line endings
  await writeFile(filePath, "const a = 1;\r\nconst b = 2;\r\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  // User passes LF old_string — should now throw instead of silently mixing line endings
  let errorMessage = "";
  try {
    await executor.execute("edit_file", {
      path: "crlf.ts",
      old_string: "const a = 1;\nconst b = 2;",
      new_string: "const a = 10;\nconst b = 20;",
    });
    assert.fail("Should have thrown an error");
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  assert.ok(errorMessage.length > 0, "Should have thrown an error");
  assert.match(errorMessage, /CRLF/i, `Error should mention CRLF. Got: ${errorMessage}`);
  assert.match(errorMessage, /\\\\r\\\\n|\\r\\n|include.*\\r\\n/i, `Error should hint to include \\r\\n. Got: ${errorMessage}`);
  // File should be unchanged
  const content = await readFile(filePath, "utf-8");
  assert.equal(content, "const a = 1;\r\nconst b = 2;\r\n");
});

test("edit_file fuzzy match: trailing whitespace mismatch", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-edit-"));
  const filePath = join(workingDirectory, "trailing.ts");
  // File has trailing spaces on some lines
  await writeFile(filePath, "function foo() {   \n  return 42;  \n}\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  // User passes clean old_string without trailing spaces
  const result = await executor.execute("edit_file", {
    path: "trailing.ts",
    old_string: "function foo() {\n  return 42;\n}",
    new_string: "function foo() {\n  return 99;\n}",
  });

  assert.match(result, /File edited \(fuzzy match\): trailing\.ts/);
  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("return 99;"));
});

test("edit_file error includes closest line numbers and snippets", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-edit-"));
  const filePath = join(workingDirectory, "hints.ts");
  await writeFile(filePath, "const alpha = 1;\nconst beta = 2;\nconst gamma = 3;\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  let errorMessage = "";
  try {
    await executor.execute("edit_file", {
      path: "hints.ts",
      old_string: "const alphaX = 999;",
      new_string: "const alphaX = 0;",
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  assert.ok(errorMessage.length > 0, "Should have thrown an error");
  assert.match(errorMessage, /Closest matches/i);
  assert.match(errorMessage, /Line \d+/);
  // Should contain at least one snippet from the file
  assert.ok(
    errorMessage.includes("alpha") || errorMessage.includes("beta") || errorMessage.includes("gamma"),
    `Error should contain file content snippets. Got: ${errorMessage}`,
  );
});

test("edit_file_batch success: 3 sequential edits to same file", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-batch-"));
  const filePath = join(workingDirectory, "batch.ts");
  await writeFile(filePath, "const a = 1;\nconst b = 2;\nconst c = 3;\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  const result = await executor.execute("edit_file_batch", {
    path: "batch.ts",
    edits: [
      { old_string: "const a = 1;", new_string: "const a = 10;" },
      { old_string: "const b = 2;", new_string: "const b = 20;" },
      { old_string: "const c = 3;", new_string: "const c = 30;" },
    ],
  });

  assert.match(result, /File edited \(batch, 3 changes\): batch\.ts/);
  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("const a = 10;"));
  assert.ok(content.includes("const b = 20;"));
  assert.ok(content.includes("const c = 30;"));
});

test("edit_file_batch rollback: one edit fails, file on disk unchanged", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-batch-"));
  const filePath = join(workingDirectory, "rollback.ts");
  const originalContent = "const x = 1;\nconst y = 2;\n";
  await writeFile(filePath, originalContent);

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  let errorMessage = "";
  try {
    await executor.execute("edit_file_batch", {
      path: "rollback.ts",
      edits: [
        { old_string: "const x = 1;", new_string: "const x = 99;" },
        { old_string: "DOES_NOT_EXIST", new_string: "whatever" },
      ],
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  assert.ok(errorMessage.length > 0, "Should have thrown an error");
  assert.match(errorMessage, /edit 1/i);
  // File should be unchanged
  const content = await readFile(filePath, "utf-8");
  assert.equal(content, originalContent);
});

test("edit_file_batch CRLF file with multi-line LF old_string → throws CRLF hint error (not silent corruption)", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-batch-"));
  const filePath = join(workingDirectory, "fuzzy-batch.ts");
  // File has CRLF line endings
  await writeFile(filePath, "const p = 1;\r\nconst q = 2;\r\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  // User passes multi-line LF old_string — exact match fails (file has CRLF), fuzzy would succeed
  // Should throw CRLF hint error rather than silently corrupting line endings
  let errorMessage = "";
  try {
    await executor.execute("edit_file_batch", {
      path: "fuzzy-batch.ts",
      edits: [
        // Multi-line edit with LF only — won't exact-match a CRLF file
        { old_string: "const p = 1;\nconst q = 2;", new_string: "const p = 10;\nconst q = 20;" },
      ],
    });
    assert.fail("Should have thrown an error");
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  assert.ok(errorMessage.length > 0, "Should have thrown a CRLF error");
  assert.match(errorMessage, /CRLF/i, `Error should mention CRLF. Got: ${errorMessage}`);
  // File should be unchanged (batch atomicity — no write happened)
  const content = await readFile(filePath, "utf-8");
  assert.equal(content, "const p = 1;\r\nconst q = 2;\r\n");
});

// ── Fix #2 additional tests ──────────────────────────────────────────────────

test("edit_file CRLF file with exact CRLF old_string → succeeds via exact path", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-crlf-"));
  const filePath = join(workingDirectory, "crlf-exact.ts");
  await writeFile(filePath, "const a = 1;\r\nconst b = 2;\r\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  // User correctly includes \r\n in old_string → exact match path → success
  const result = await executor.execute("edit_file", {
    path: "crlf-exact.ts",
    old_string: "const a = 1;\r\nconst b = 2;",
    new_string: "const a = 10;\r\nconst b = 20;",
  });

  assert.match(result, /File edited: crlf-exact\.ts/);
  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("const a = 10;"));
  assert.ok(content.includes("const b = 20;"));
});

test("edit_file LF file with CRLF in old_string → fuzzy match still works (LF file unaffected)", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-lf-"));
  const filePath = join(workingDirectory, "lf-file.ts");
  // LF-only file
  await writeFile(filePath, "const x = 1;\nconst y = 2;\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  // User passes \r\n in old_string but file is LF → fuzzy match normalizes CRLF→LF and succeeds
  const result = await executor.execute("edit_file", {
    path: "lf-file.ts",
    old_string: "const x = 1;\r\nconst y = 2;",
    new_string: "const x = 10;\nconst y = 20;",
  });

  assert.match(result, /File edited \(fuzzy match\): lf-file\.ts/);
  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("const x = 10;"));
  assert.ok(content.includes("const y = 20;"));
});

// ── Fix #1 atomicity tests ───────────────────────────────────────────────────

test("edit_file_batch atomicity: successful batch produces correct final content (regression)", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-atomic-"));
  const filePath = join(workingDirectory, "atomic.ts");
  await writeFile(filePath, "const a = 1;\nconst b = 2;\nconst c = 3;\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  const result = await executor.execute("edit_file_batch", {
    path: "atomic.ts",
    edits: [
      { old_string: "const a = 1;", new_string: "const a = 100;" },
      { old_string: "const b = 2;", new_string: "const b = 200;" },
      { old_string: "const c = 3;", new_string: "const c = 300;" },
    ],
  });

  assert.match(result, /File edited \(batch, 3 changes\): atomic\.ts/);
  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("const a = 100;"));
  assert.ok(content.includes("const b = 200;"));
  assert.ok(content.includes("const c = 300;"));
});

test("edit_file_batch atomicity: no .tmp artifact left behind after successful batch", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-atomic-"));
  const filePath = join(workingDirectory, "notmp.ts");
  await writeFile(filePath, "const val = 1;\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  await executor.execute("edit_file_batch", {
    path: "notmp.ts",
    edits: [{ old_string: "const val = 1;", new_string: "const val = 99;" }],
  });

  // No .tmp files should remain in the directory
  const entries = await readdir(workingDirectory);
  const tmpFiles = entries.filter((e) => e.endsWith(".tmp"));
  assert.equal(tmpFiles.length, 0, `Unexpected .tmp files left: ${tmpFiles.join(", ")}`);
});

test("edit_file_batch atomicity: write failure leaves original file unchanged and rethrows", async () => {
  // Skip this test on non-POSIX systems where chmod may not restrict write
  if (process.platform === "win32") return;

  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-atomic-"));
  const filePath = join(workingDirectory, "protected.ts");
  const originalContent = "const z = 42;\n";
  await writeFile(filePath, originalContent);

  // Make the directory read-only so the temp file write (and rename) fail
  await chmod(workingDirectory, 0o555);

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  let errorThrown = false;
  try {
    await executor.execute("edit_file_batch", {
      path: "protected.ts",
      edits: [{ old_string: "const z = 42;", new_string: "const z = 0;" }],
    });
  } catch {
    errorThrown = true;
  } finally {
    // Restore permissions so cleanup can proceed
    await chmod(workingDirectory, 0o755);
  }

  assert.ok(errorThrown, "Should have thrown an error when directory is not writable");
  // Original file should be readable and unchanged (it was already written before chmod)
  const content = await readFile(filePath, "utf-8");
  assert.equal(content, originalContent);
  // No .tmp files left (atomicWrite cleans up on failure)
  const entries = await readdir(workingDirectory);
  const tmpFiles = entries.filter((e) => e.endsWith(".tmp"));
  assert.equal(tmpFiles.length, 0, `Unexpected .tmp files left: ${tmpFiles.join(", ")}`);
});

// ── Fix #1: list_files ignores heavy directories ─────────────────────────────

test("list_files ignores node_modules, .git, dist", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-ignores-"));
  await mkdir(join(workingDirectory, "src"), { recursive: true });
  await mkdir(join(workingDirectory, "node_modules/pkg"), { recursive: true });
  await mkdir(join(workingDirectory, ".git"), { recursive: true });
  await mkdir(join(workingDirectory, "dist"), { recursive: true });
  await writeFile(join(workingDirectory, "src/a.ts"), "export const a = 1;\n");
  await writeFile(join(workingDirectory, "node_modules/pkg/b.ts"), "export const b = 2;\n");
  await writeFile(join(workingDirectory, ".git/config"), "[core]\n");
  await writeFile(join(workingDirectory, "dist/out.js"), "console.log(1);\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  const result = await executor.execute("list_files", { pattern: "**/*" });

  assert.match(result, /src\/a\.ts/, `Expected src/a.ts in result, got: ${result}`);
  assert.doesNotMatch(result, /node_modules/, `node_modules should not appear, got: ${result}`);
  assert.doesNotMatch(result, /\.git/, `.git should not appear, got: ${result}`);
  assert.doesNotMatch(result, /dist/, `dist should not appear, got: ${result}`);
});

// ── Fix #2: search_content distinguishes no-match from error ─────────────────

test("search_content returns 'No matches found' for a legitimate no-match (grep exits 1)", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-se-"));
  await writeFile(join(workingDirectory, "sample.txt"), "hello world\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  const result = await executor.execute("search_content", { pattern: "DEFINITELY_NOT_PRESENT_xyz", path: undefined });

  assert.equal(result, "No matches found");
});

test("search_content returns matches when pattern is found", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-se-"));
  const filePath = join(workingDirectory, "sample.txt");
  await writeFile(filePath, "hello world\nfoo bar\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  const result = await executor.execute("search_content", { pattern: "foo", path: undefined });

  assert.ok(result.includes("sample.txt"), `Expected file name in result, got: ${result}`);
  assert.ok(result.includes("foo"), `Expected 'foo' in result, got: ${result}`);
});

test("search_content throws on invalid regex (grep exits 2), does not return 'No matches found'", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-se-"));
  await writeFile(join(workingDirectory, "sample.txt"), "hello world\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  let threw = false;
  let errorMessage = "";
  try {
    // Invalid regex: unbalanced bracket
    await executor.execute("search_content", { pattern: "[", path: undefined });
  } catch (err) {
    threw = true;
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  assert.ok(threw, "Should have thrown on invalid regex");
  assert.ok(
    errorMessage.includes("search_content failed"),
    `Expected 'search_content failed' in error, got: ${errorMessage}`,
  );
  assert.ok(
    !errorMessage.includes("No matches found"),
    `Should NOT say 'No matches found' for a real error, got: ${errorMessage}`,
  );
});

// grep exits 2 on any error — including one unreadable file — even when it already
// matched elsewhere and wrote those matches to stdout. Failing the whole search in
// that case loses results the agent needs. Skipped when running as root, which can
// read the unreadable file and so never triggers the exit-2 path.
test("search_content returns partial matches when grep errors on one file but matched others", { skip: process.getuid?.() === 0 ? "runs as root" : false }, async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-partial-"));
  await writeFile(join(workingDirectory, "readable.txt"), "needle here\n");
  const locked = join(workingDirectory, "locked.txt");
  await writeFile(locked, "needle also here\n");
  await chmod(locked, 0o000);

  try {
    const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
    const result = await executor.execute("search_content", { pattern: "needle" });

    assert.ok(result.includes("readable.txt"), `expected the readable match, got: ${result}`);
    assert.ok(!result.includes("No matches found"), `should not report no matches, got: ${result}`);
  } finally {
    await chmod(locked, 0o600).catch(() => {});
  }
});

// ── Fix #3: write_file and edit_file are atomic (no .tmp left behind) ────────

test("write_file creates parent directories and writes file atomically", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-atomic-"));
  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));

  await executor.execute("write_file", {
    path: "nested/deep/x.txt",
    content: "deep content\n",
  });

  const filePath = join(workingDirectory, "nested/deep/x.txt");
  const content = await readFile(filePath, "utf-8");
  assert.equal(content, "deep content\n");

  // No .tmp artifact left behind
  const entries = await readdir(workingDirectory, { recursive: true });
  const tmpFiles = entries.filter((e) => String(e).endsWith(".tmp"));
  assert.equal(tmpFiles.length, 0, `Unexpected .tmp files left: ${tmpFiles.join(", ")}`);
});

test("write_file atomicity: no .tmp artifact left behind after successful write", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-atomic-"));
  const filePath = join(workingDirectory, "atomic_write.txt");
  await writeFile(filePath, "initial\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  await executor.execute("write_file", {
    path: "atomic_write.txt",
    content: "updated\n",
  });

  const content = await readFile(filePath, "utf-8");
  assert.equal(content, "updated\n");

  // No .tmp files should remain in the directory
  const entries = await readdir(workingDirectory);
  const tmpFiles = entries.filter((e) => e.endsWith(".tmp"));
  assert.equal(tmpFiles.length, 0, `Unexpected .tmp files left: ${tmpFiles.join(", ")}`);
});

test("edit_file atomicity: no .tmp artifact left behind after successful edit", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-atomic-"));
  const filePath = join(workingDirectory, "atomic_edit.txt");
  await writeFile(filePath, "const val = 1;\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  await executor.execute("edit_file", {
    path: "atomic_edit.txt",
    old_string: "const val = 1;",
    new_string: "const val = 99;",
  });

  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("const val = 99;"));

  // No .tmp files should remain in the directory
  const entries = await readdir(workingDirectory);
  const tmpFiles = entries.filter((e) => e.endsWith(".tmp"));
  assert.equal(tmpFiles.length, 0, `Unexpected .tmp files left: ${tmpFiles.join(", ")}`);
});

