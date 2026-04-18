import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FunctionExecutor } from "../src/agent/executor.ts";
import { getDefaultSafetyConfig } from "../src/agent/safety.ts";

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

