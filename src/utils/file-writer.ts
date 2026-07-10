import { writeFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { resolvePathWithinRoot } from "./path-safety.js";

export async function safeWriteFile(
  filePath: string,
  content: string,
  workingDirectory: string,
): Promise<string> {
  const resolvedWorkDir = resolve(workingDirectory);
  let resolved: string;
  try {
    resolved = resolvePathWithinRoot(filePath, resolvedWorkDir);
  } catch (err) {
    throw new Error(
      `Path escapes working directory: ${filePath}. Use a path relative to: ${resolvedWorkDir}`,
      { cause: err },
    );
  }

  await mkdir(dirname(resolved), { recursive: true });
  await atomicWrite(resolved, content);

  return resolved;
}

async function atomicWrite(targetPath: string, content: string): Promise<void> {
  const tmpPath = join(dirname(targetPath), `.${randomUUID()}.tmp`);
  let mode: number | undefined;
  try {
    mode = (await stat(targetPath)).mode & 0o777;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  try {
    await writeFile(tmpPath, content, {
      encoding: "utf-8",
      ...(mode !== undefined ? { mode } : {}),
    });
    await rename(tmpPath, targetPath);
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    throw err;
  }
}
