import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
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
