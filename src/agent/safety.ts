import { resolve } from "node:path";
import { resolvePathWithinRoot } from "../utils/path-safety.js";

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
  />{1,2}\s*(\/|~|\.\.)/,  // redirection to absolute/home/parent paths — escapes cwd (covers /dev too)
  /curl\b.*\|.*sh/,
  /wget\b.*\|.*sh/,
  /chmod\s+777/,
  /sudo\b/,
  /eval\b/,
  /\$\(/,       // command substitution
  /`[^`]+`/,    // backtick substitution
  /\bnode\b.*\s(--eval\b|-e\b|--print\b|-p\b)/,  // node inline code execution bypasses the whitelist
  /\bfind\b.*\s(-delete|-exec|-execdir|-ok|-okdir)\b/,  // find can delete/exec outside any other guard
];

export interface SafetyConfig {
  maxIterations: number;
  maxInputTokens: number;
  maxWebSearches: number;
  timeoutMs: number;
  workingDirectory: string;
  additionalBashWhitelist: RegExp[];
}

export function getDefaultSafetyConfig(workingDirectory: string): SafetyConfig {
  return {
    maxIterations: parseIntegerEnv("MINIMAX_MAX_ITERATIONS", 25, 1),
    maxInputTokens: parseIntegerEnv("MINIMAX_MAX_INPUT_TOKENS", 500_000, 1),
    timeoutMs: parseIntegerEnv("MINIMAX_TIMEOUT_MS", 300_000, 1),
    workingDirectory: resolve(workingDirectory),
    additionalBashWhitelist: parseAdditionalWhitelist(process.env.MINIMAX_BASH_WHITELIST),
    maxWebSearches: parseIntegerEnv("MINIMAX_MAX_WEB_SEARCHES", 10, 0),
  };
}

function parseIntegerEnv(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;

  const trimmed = raw.trim();
  const value = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer greater than or equal to ${minimum}; received ${JSON.stringify(raw)}`);
  }
  return value;
}

function parseAdditionalWhitelist(envValue: string | undefined): RegExp[] {
  if (!envValue) return [];
  return envValue
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .map((pattern) => new RegExp(`^${escapeRegExp(pattern)}(?:\\s|$)`));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateFilePath(filePath: string, workingDirectory: string): string {
  return resolvePathWithinRoot(filePath, workingDirectory);
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
const SHELL_CHAIN_OPERATORS = /[\r\n;&|]/;

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
