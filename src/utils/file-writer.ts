import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";

export async function safeWriteFile(
  filePath: string,
  content: string,
  workingDirectory: string,
): Promise<string> {
  const resolved = resolve(workingDirectory, filePath);
  const resolvedWorkDir = resolve(workingDirectory);
  const rel = relative(resolvedWorkDir, resolved);

  // Block parent-directory traversal
  if (rel.startsWith("..")) {
    throw new Error(
      `Path escapes working directory: ${filePath}. Use a path relative to: ${resolvedWorkDir}`,
    );
  }

  // Block absolute paths that don't share the working directory prefix
  // (handles Windows cross-drive paths where relative() returns an absolute path)
  if (!resolved.startsWith(resolvedWorkDir + "/") && resolved !== resolvedWorkDir) {
    throw new Error(
      `Path escapes working directory: ${filePath}. Use a path relative to: ${resolvedWorkDir}`,
    );
  }

  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, "utf-8");

  return resolved;
}
