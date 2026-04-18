import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
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

test("edit_file fuzzy match: file has CRLF, user passes LF in old_string", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-edit-"));
  const filePath = join(workingDirectory, "crlf.ts");
  // File on disk has CRLF line endings
  await writeFile(filePath, "const a = 1;\r\nconst b = 2;\r\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  // User passes LF old_string
  const result = await executor.execute("edit_file", {
    path: "crlf.ts",
    old_string: "const a = 1;\nconst b = 2;",
    new_string: "const a = 10;\nconst b = 20;",
  });

  assert.match(result, /File edited \(fuzzy match\): crlf\.ts/);
  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("const a = 10;"));
  assert.ok(content.includes("const b = 20;"));
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

test("edit_file_batch fuzzy fallback works for each edit", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-executor-batch-"));
  const filePath = join(workingDirectory, "fuzzy-batch.ts");
  // File has CRLF line endings
  await writeFile(filePath, "const p = 1;\r\nconst q = 2;\r\n");

  const executor = new FunctionExecutor(getDefaultSafetyConfig(workingDirectory));
  // User passes LF in old_strings
  const result = await executor.execute("edit_file_batch", {
    path: "fuzzy-batch.ts",
    edits: [
      { old_string: "const p = 1;", new_string: "const p = 10;" },
      { old_string: "const q = 2;", new_string: "const q = 20;" },
    ],
  });

  assert.match(result, /File edited \(batch, 2 changes\): fuzzy-batch\.ts/);
  const content = await readFile(filePath, "utf-8");
  assert.ok(content.includes("const p = 10;"));
  assert.ok(content.includes("const q = 20;"));
});

