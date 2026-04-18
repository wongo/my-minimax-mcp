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
      case "edit_file_batch":
        return this.editFileBatch(
          args.path as string,
          args.edits as Array<{ old_string: string; new_string: string }>,
        );
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
    const { newContent, matchType } = applyEdit(content, oldString, newString, path);
    await writeFile(resolved, newContent, "utf-8");
    return matchType === "fuzzy" ? `File edited (fuzzy match): ${path}` : `File edited: ${path}`;
  }

  private async editFileBatch(
    path: string,
    edits: Array<{ old_string: string; new_string: string }>,
  ): Promise<string> {
    const resolved = validateFilePath(path, this.config.workingDirectory);
    let content = await readFile(resolved, "utf-8");

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      try {
        const result = applyEdit(content, edit.old_string, edit.new_string, path);
        content = result.newContent;
      } catch (err) {
        throw new Error(
          `Batch edit failed at edit ${i} (0-indexed): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    await writeFile(resolved, content, "utf-8");
    return `File edited (batch, ${edits.length} changes): ${path}`;
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

// ── Edit helpers ─────────────────────────────────────────────────────────────

/** Normalize a string for fuzzy comparison: CRLF → LF, strip trailing spaces per line. */
function normalizeWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/** Simple word-overlap similarity score between two strings (0–1). No external deps. */
function wordOverlapScore(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const total = wordsA.size + wordsB.size;
  return total === 0 ? 0 : (2 * overlap) / total;
}

/** Find the first-line of old_string in content (normalized), return its position in the original. */
function findNormalizedMatch(
  content: string,
  oldString: string,
): { start: number; end: number } | null {
  const normalizedContent = normalizeWhitespace(content);
  const normalizedOld = normalizeWhitespace(oldString);

  const idx = normalizedContent.indexOf(normalizedOld);
  if (idx === -1) return null;

  // Check there's exactly one match
  const afterFirst = normalizedContent.indexOf(normalizedOld, idx + 1);
  if (afterFirst !== -1) return null; // >1 match — not safe to use

  // Map position from normalized content back to original content.
  // We rebuild the original content character-by-character, tracking the
  // offset mapping as we go.
  const origLines = content.split("\n");
  const normLines = normalizedContent.split("\n");

  // Build a mapping: normalizedOffset → originalOffset for line starts
  let origOffset = 0;
  let normOffset = 0;
  const origLineStarts: number[] = [];
  const normLineStarts: number[] = [];

  for (let i = 0; i < origLines.length; i++) {
    origLineStarts.push(origOffset);
    normLineStarts.push(normOffset);
    // Original: line + \n (or \r\n)
    origOffset += origLines[i].length + 1;
    // Normalized: trimEnd(line) + \n
    normOffset += normLines[i].length + 1;
  }

  // Find which normalized line contains idx
  let startLine = 0;
  for (let i = normLineStarts.length - 1; i >= 0; i--) {
    if (normLineStarts[i] <= idx) {
      startLine = i;
      break;
    }
  }
  const startOffsetInNormLine = idx - normLineStarts[startLine];

  // The normalized old string spans some lines — figure out how many
  const normOldLines = normalizedOld.split("\n");
  const endLine = startLine + normOldLines.length - 1;

  if (endLine >= origLines.length) return null;

  // Original start: line start + same char offset (trimEnd only removes trailing
  // spaces, so leading chars are identical)
  const origStart = origLineStarts[startLine] + startOffsetInNormLine;

  // Original end: account for CRLF and trailing-space differences on each line
  const lastNormLine = normOldLines[normOldLines.length - 1];
  const origEndLineContent = origLines[endLine];
  // Find where lastNormLine ends in origEndLineContent (it's a trimEnd of origEndLineContent substr)
  const origLineOffset = startLine === endLine ? startOffsetInNormLine : 0;
  const origEnd = origLineStarts[endLine] + origLineOffset + lastNormLine.length;

  // Verify the original slice, when normalized, equals normalizedOld
  const origSlice = content.slice(origStart, origEnd);
  if (normalizeWhitespace(origSlice) !== normalizedOld) return null;

  return { start: origStart, end: origEnd };
}

/** Build a "closest matches" error hint by scoring each line of content against old_string first line. */
function buildClosestMatchesHint(content: string, oldString: string): string {
  const firstLine = oldString.split(/\r?\n/)[0];
  const lines = content.split(/\r?\n/);

  const scored = lines.map((line, idx) => ({
    lineNum: idx + 1,
    line,
    score: wordOverlapScore(firstLine, line),
  }));

  scored.sort((a, b) => b.score - a.score);
  const top3 = scored.slice(0, 3).filter((s) => s.score > 0);

  if (top3.length === 0) return "";
  return (
    "\nClosest matches:\n" +
    top3.map((s) => `  Line ${s.lineNum}: ${s.line}`).join("\n")
  );
}

interface ApplyEditResult {
  newContent: string;
  matchType: "exact" | "fuzzy";
}

/**
 * Apply a single edit (old_string → new_string) to content.
 * 1. Try exact match.
 * 2. If 0 exact matches, try whitespace-normalized match.
 * 3. If still no match or >1, throw with helpful hints.
 */
function applyEdit(
  content: string,
  oldString: string,
  newString: string,
  path: string,
): ApplyEditResult {
  const exactOccurrences = content.split(oldString).length - 1;

  if (exactOccurrences === 1) {
    return {
      newContent: content.replace(oldString, newString),
      matchType: "exact",
    };
  }

  if (exactOccurrences > 1) {
    // Find all line numbers where exact match starts
    const lines = content.split(/\r?\n/);
    let pos = 0;
    const matchLineNums: number[] = [];
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const lineEnd = pos + lines[lineIdx].length + 1;
      if (content.slice(pos, lineEnd + oldString.length).includes(oldString)) {
        // More precise: check if oldString starts within this line
        const fromHere = content.indexOf(oldString, pos);
        if (fromHere !== -1 && fromHere < lineEnd) {
          matchLineNums.push(lineIdx + 1);
        }
      }
      pos = lineEnd;
    }
    throw new Error(
      `String found ${exactOccurrences} times in ${path}, expected exactly 1. Lines: ${matchLineNums.join(", ")}`,
    );
  }

  // exactOccurrences === 0 — try fuzzy match
  const fuzzyMatch = findNormalizedMatch(content, oldString);
  if (fuzzyMatch !== null) {
    const newContent =
      content.slice(0, fuzzyMatch.start) + newString + content.slice(fuzzyMatch.end);
    return { newContent, matchType: "fuzzy" };
  }

  // No match at all — provide helpful hints
  const hint = buildClosestMatchesHint(content, oldString);
  throw new Error(`String not found in ${path}.${hint}`);
}

// ── Glob helper ───────────────────────────────────────────────────────────────

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
