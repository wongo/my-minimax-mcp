import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, relative } from "node:path";

export async function safeWriteFile(
  filePath: string,
  content: string,
  workingDirectory: string,
): Promise<string> {
  const resolved = resolve(workingDirectory, filePath);
  const rel = relative(workingDirectory, resolved);

  if (rel.startsWith("..")) {
    throw new Error(`Path escapes working directory: ${filePath}`);
  }

  await mkdir(dirname(resolved), { recursive: true });
  await writeFile(resolved, content, "utf-8");

  return resolved;
}
