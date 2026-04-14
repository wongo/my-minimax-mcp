import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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

