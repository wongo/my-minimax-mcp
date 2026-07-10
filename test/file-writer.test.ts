import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { safeWriteFile } from "../src/utils/file-writer.ts";

test("safeWriteFile creates missing directories and writes content", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-file-writer-"));
  const writtenPath = await safeWriteFile("nested/output.txt", "hello world", workingDirectory);

  assert.equal(writtenPath, join(workingDirectory, "nested/output.txt"));
  const content = await readFile(writtenPath, "utf-8");
  assert.equal(content, "hello world");
});

test("safeWriteFile rejects paths that escape the working directory", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-file-writer-"));

  await assert.rejects(
    () => safeWriteFile("../outside.txt", "nope", workingDirectory),
    /Path escapes working directory/,
  );
});

test("safeWriteFile rejects absolute paths outside the working directory", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-file-writer-"));

  await assert.rejects(
    () => safeWriteFile("/tmp/evil.txt", "nope", workingDirectory),
    /Path escapes working directory/,
  );
});

test("safeWriteFile error message includes workingDirectory and 'relative' hint", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-file-writer-"));

  let errorMessage = "";
  try {
    await safeWriteFile("../outside.txt", "nope", workingDirectory);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  assert.match(errorMessage, /relative/i);
  assert.ok(errorMessage.includes(workingDirectory), `Error message should include workingDirectory path. Got: ${errorMessage}`);
});

test("safeWriteFile rejects a symlinked parent that points outside the working directory", async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-file-writer-"));
  const outsideDirectory = await mkdtemp(join(tmpdir(), "minimax-file-writer-outside-"));
  await symlink(outsideDirectory, join(workingDirectory, "escape"), "dir");

  await assert.rejects(
    () => safeWriteFile("escape/output.txt", "nope", workingDirectory),
    /Path escapes working directory/,
  );
});

test("safeWriteFile atomically replaces content while preserving file permissions", async () => {
  if (process.platform === "win32") return;

  const workingDirectory = await mkdtemp(join(tmpdir(), "minimax-file-writer-"));
  const filePath = join(workingDirectory, "script.sh");
  await writeFile(filePath, "old\n");
  await chmod(filePath, 0o751);

  await safeWriteFile("script.sh", "new\n", workingDirectory);

  assert.equal(await readFile(filePath, "utf-8"), "new\n");
  assert.equal((await stat(filePath)).mode & 0o777, 0o751);
});
