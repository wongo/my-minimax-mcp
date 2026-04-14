import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, relative } from "node:path";
import { validateFilePath, validateBashCommand, type SafetyConfig } from "./safety.js";

const execFileAsync = promisify(execFile);

export class FunctionExecutor {
  constructor(private config: SafetyConfig) {}

  async execute(functionName: string, args: Record<string, unknown>): Promise<string> {
    switch (functionName) {
      case "read_file":
        return this.readFile(args.path as string);
      case "write_file":
        return this.writeFile(args.path as string, args.content as string);
      case "edit_file":
        return this.editFile(args.path as string, args.old_string as string, args.new_string as string);
      case "run_bash":
        return this.runBash(args.command as string, args.timeout_ms as number | undefined);
      case "list_files":
        return this.listFiles(args.pattern as string);
      case "search_content":
        return this.searchContent(args.pattern as string, args.path as string | undefined, args.glob as string | undefined);
      case "task_complete":
        return JSON.stringify({ status: "complete", summary: args.summary, files_changed: args.files_changed ?? [] });
      case "task_failed":
        return JSON.stringify({ status: "failed", reason: args.reason });
      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  }

  private async readFile(path: string): Promise<string> {
    const resolved = validateFilePath(path, this.config.workingDirectory);
    const content = await readFile(resolved, "utf-8");
    return content;
  }

  private async writeFile(path: string, content: string): Promise<string> {
    const resolved = validateFilePath(path, this.config.workingDirectory);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, "utf-8");
    return `File written: ${path}`;
  }

  private async editFile(path: string, oldString: string, newString: string): Promise<string> {
    const resolved = validateFilePath(path, this.config.workingDirectory);
    const content = await readFile(resolved, "utf-8");
    const occurrences = content.split(oldString).length - 1;
    if (occurrences === 0) {
      throw new Error(`String not found in ${path}`);
    }
    if (occurrences > 1) {
      throw new Error(`String found ${occurrences} times in ${path}, expected exactly 1`);
    }
    const newContent = content.replace(oldString, newString);
    await writeFile(resolved, newContent, "utf-8");
    return `File edited: ${path}`;
  }

  private async runBash(command: string, timeoutMs?: number): Promise<string> {
    validateBashCommand(command, this.config);
    const timeout = timeoutMs ?? 30_000;
    try {
      const { stdout, stderr } = await execFileAsync("sh", ["-c", command], {
        cwd: this.config.workingDirectory,
        timeout,
        maxBuffer: 1024 * 1024,
      });
      const output = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");
      // Truncate very long output
      return output.length > 10_000 ? output.slice(0, 10_000) + "\n... (truncated)" : output;
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message: string };
      return `Command failed: ${error.message}\n${error.stdout ?? ""}\n${error.stderr ?? ""}`.trim();
    }
  }

  private async listFiles(pattern: string): Promise<string> {
    const files = await this.walkFiles(this.config.workingDirectory);
    const matcher = globToRegExp(pattern);
    const matches = files
      .map((file) => relative(this.config.workingDirectory, file).replaceAll("\\", "/"))
      .filter((file) => matcher.test(file));

    return matches.join("\n") || "No files found";
  }

  private async searchContent(pattern: string, path?: string, fileGlob?: string): Promise<string> {
    const searchPath = path ? validateFilePath(path, this.config.workingDirectory) : this.config.workingDirectory;
    const args = ["-rn", "--color=never"];
    if (fileGlob) args.push("--include", fileGlob);
    args.push(pattern, searchPath);
    try {
      const { stdout } = await execFileAsync("grep", args, {
        timeout: 10_000,
        maxBuffer: 1024 * 1024,
      });
      const result = stdout.trim();
      return result.length > 10_000 ? result.slice(0, 10_000) + "\n... (truncated)" : result;
    } catch {
      return "No matches found";
    }
  }

  private async walkFiles(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.walkFiles(fullPath));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replaceAll("\\", "/");
  let regex = "^";

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const next = normalized[i + 1];

    if (char === "*" && next === "*" && normalized[i + 2] === "/") {
      regex += "(?:.*/)?";
      i += 2;
      continue;
    }

    if (char === "*" && next === "*") {
      regex += ".*";
      i++;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      regex += `\\${char}`;
      continue;
    }

    regex += char;
  }

  regex += "$";
  return new RegExp(regex);
}
