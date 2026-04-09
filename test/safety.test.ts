import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultSafetyConfig, validateBashCommand, validateFilePath } from "../src/agent/safety.ts";
import { withEnv } from "./helpers.ts";

test("validateFilePath allows files inside the working directory", () => {
  const resolved = validateFilePath("src/index.ts", "/tmp/project");
  assert.equal(resolved, "/tmp/project/src/index.ts");
});

test("validateFilePath rejects parent-directory traversal", () => {
  assert.throws(
    () => validateFilePath("../secrets.txt", "/tmp/project"),
    /Path escapes working directory/,
  );
});

test("validateBashCommand allows whitelisted commands", () => {
  const config = getDefaultSafetyConfig("/tmp/project");
  assert.doesNotThrow(() => validateBashCommand("npm test", config));
  assert.doesNotThrow(() => validateBashCommand("npx tsx src/cli.ts", config));
});

test("validateBashCommand rejects chaining operators and blocked patterns", () => {
  const config = getDefaultSafetyConfig("/tmp/project");
  assert.throws(
    () => validateBashCommand("npm test && echo hacked", config),
    /Command chaining is not allowed/,
  );
  assert.throws(
    () => validateBashCommand("sudo npm test", config),
    /Blocked command pattern/,
  );
});

test("validateBashCommand rejects commands outside the whitelist", () => {
  const config = getDefaultSafetyConfig("/tmp/project");
  assert.throws(
    () => validateBashCommand("git status", config),
    /Command not in whitelist/,
  );
});

test("getDefaultSafetyConfig reads environment overrides", async () => {
  await withEnv(
    {
      MINIMAX_MAX_ITERATIONS: "9",
      MINIMAX_TIMEOUT_MS: "1234",
      MINIMAX_BASH_WHITELIST: "git status,git diff",
    },
    () => {
      const config = getDefaultSafetyConfig("/tmp/project");
      assert.equal(config.maxIterations, 9);
      assert.equal(config.timeoutMs, 1234);
      assert.equal(config.additionalBashWhitelist.length, 2);
      assert.doesNotThrow(() => validateBashCommand("git status", config));
    },
  );
});
