import { resolve, relative } from "node:path";

const DEFAULT_BASH_WHITELIST: RegExp[] = [
  /^npm (test|run|exec|ci)\b/,
  /^npx\b/,
  /^node\b/,
  /^tsc\b/,
  /^eslint\b/,
  /^prettier\b/,
  /^jest\b/,
  /^vitest\b/,
  /^pytest\b/,
  /^python -m pytest\b/,
  /^go (test|build|vet)\b/,
  /^cargo (test|build|check|clippy)\b/,
  /^make\b/,
  /^cat\b/,
  /^ls\b/,
  /^find\b/,
  /^grep\b/,
  /^head\b/,
  /^tail\b/,
  /^wc\b/,
  /^echo\b/,
];

// Explicitly blocked patterns (even if matched by whitelist)
const BASH_BLOCKLIST: RegExp[] = [
  /rm\s+(-rf?|--recursive)/,
  />\s*\/dev/,
  /curl\b.*\|.*sh/,
  /wget\b.*\|.*sh/,
  /chmod\s+777/,
  /sudo\b/,
  /eval\b/,
  /\$\(/,       // command substitution
  /`[^`]+`/,    // backtick substitution
];

export interface SafetyConfig {
  maxIterations: number;
  maxInputTokens: number;
  timeoutMs: number;
  workingDirectory: string;
  additionalBashWhitelist: RegExp[];
}

export function getDefaultSafetyConfig(workingDirectory: string): SafetyConfig {
  return {
    maxIterations: parseInt(process.env.MINIMAX_MAX_ITERATIONS ?? "25", 10),
    maxInputTokens: 500_000,
    timeoutMs: parseInt(process.env.MINIMAX_TIMEOUT_MS ?? "300000", 10),
    workingDirectory: resolve(workingDirectory),
    additionalBashWhitelist: parseAdditionalWhitelist(process.env.MINIMAX_BASH_WHITELIST),
  };
}

function parseAdditionalWhitelist(envValue: string | undefined): RegExp[] {
  if (!envValue) return [];
  return envValue.split(",").map(p => new RegExp(`^${p.trim()}`));
}

export function validateFilePath(filePath: string, workingDirectory: string): string {
  const resolved = resolve(workingDirectory, filePath);
  const rel = relative(workingDirectory, resolved);

  // Block traversal via ".." prefix
  if (rel.startsWith("..")) {
    throw new Error(`Path escapes working directory: ${filePath}`);
  }

  // Block absolute paths that don't share the working directory prefix
  // (handles Windows cross-drive paths where relative() returns an absolute path)
  if (!resolved.startsWith(resolve(workingDirectory) + "/") && resolved !== resolve(workingDirectory)) {
    throw new Error(`Path escapes working directory: ${filePath}`);
  }

  return resolved;
}

export function resolveWorkingDirectory(
  requestedWorkingDirectory: string | undefined,
  baseWorkingDirectory: string,
): string {
  const baseResolved = resolve(baseWorkingDirectory);
  if (!requestedWorkingDirectory) {
    return baseResolved;
  }
  return validateFilePath(requestedWorkingDirectory, baseResolved);
}

// Shell operators that allow command chaining — must be rejected
// before whitelist check to prevent "npm test && curl evil.com"
const SHELL_CHAIN_OPERATORS = /[;&|]|&&|\|\|/;

export function validateBashCommand(command: string, config: SafetyConfig): void {
  const trimmed = command.trim();

  // Reject command chaining operators first (P1 fix)
  if (SHELL_CHAIN_OPERATORS.test(trimmed)) {
    throw new Error(`Command chaining is not allowed: ${trimmed}`);
  }

  // Check blocklist
  for (const pattern of BASH_BLOCKLIST) {
    if (pattern.test(trimmed)) {
      throw new Error(`Blocked command pattern: ${trimmed}`);
    }
  }

  // Check whitelist
  const allWhitelist = [...DEFAULT_BASH_WHITELIST, ...config.additionalBashWhitelist];
  const allowed = allWhitelist.some(pattern => pattern.test(trimmed));
  if (!allowed) {
    throw new Error(`Command not in whitelist: ${trimmed}`);
  }
}
