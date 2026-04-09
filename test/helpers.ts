import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

/**
 * Poll a file until it contains at least `expectedLines` non-empty lines,
 * or throw after `timeoutMs`.
 */
export async function waitForFileLines(
  filePath: string,
  expectedLines: number,
  timeoutMs = 2000,
): Promise<string[]> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const content = (await readFile(filePath, "utf-8")).trim();
      if (content) {
        const lines = content.split("\n");
        if (lines.length >= expectedLines) return lines;
      }
    } catch {
      // file not yet written
    }
    await delay(10);
  }
  throw new Error(`File ${filePath} did not reach ${expectedLines} lines within ${timeoutMs}ms`);
}

/**
 * Run a callback with temporary environment variable overrides,
 * then restore originals regardless of success/failure.
 */
export async function withEnv(
  overrides: Record<string, string>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    process.env[key] = overrides[key];
  }
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
