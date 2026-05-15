import { appendFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyError, type ErrorCategory } from "./error-classifier.js";
import { scrubSecrets, truncate } from "./secrets-scrubber.js";

export type { ErrorCategory };

export interface FailureRecord {
  timestamp: string;
  sessionId: string;
  tool: string;
  category: ErrorCategory;
  errorMessage: string;
  errorStack?: string;
  inputSummary?: string;
  callerProject?: string;
  workingDirectory?: string;
  model?: string;
  fingerprint: string;
}

function getDefaultLogsDir(): string {
  if (process.env.MINIMAX_FAILURE_LOG_DIR) {
    return process.env.MINIMAX_FAILURE_LOG_DIR;
  }
  // src/utils → src → root, then /logs
  const thisFile = fileURLToPath(import.meta.url);
  const utilsDir = dirname(thisFile);
  const srcDir = dirname(utilsDir);
  const rootDir = dirname(srcDir);
  return resolve(rootDir, "logs");
}

function getMonthlyFileName(prefix: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${prefix}-${year}-${month}.jsonl`;
}

function normalizeForFingerprint(category: ErrorCategory, message: string): string {
  // Strip file paths, line numbers, and specific values to normalize similar errors
  return `${category}:${message
    .replace(/\/[^\s:]+/g, "<path>")         // strip absolute paths
    .replace(/\\\\/g, "<path>")               // Windows paths
    .replace(/line \d+/gi, "line N")          // strip line numbers
    .replace(/:\d+:\d+/g, ":N:N")            // strip source locations
    .replace(/\b\d{5,}\b/g, "N")             // strip large numbers
    .trim()
    .slice(0, 200)}`;
}

function computeFingerprint(category: ErrorCategory, message: string): string {
  const normalized = normalizeForFingerprint(category, message);
  return createHash("sha256").update(normalized, "utf-8").digest("hex").slice(0, 12);
}

export class FailureLogger {
  private readonly logsDir: string;
  private readonly sessionId: string;

  constructor(logsDir?: string, sessionId?: string) {
    this.logsDir = logsDir ?? getDefaultLogsDir();
    this.sessionId = sessionId ?? new Date().toISOString();
  }

  async record(input: {
    tool: string;
    error: unknown;
    toolInput?: unknown;
    workingDirectory?: string;
    model?: string;
  }): Promise<void> {
    const { tool, error, toolInput, workingDirectory, model } = input;

    const category = classifyError(error);

    const rawMessage = error instanceof Error
      ? error.message
      : String(error);
    const rawStack = error instanceof Error ? error.stack : undefined;

    const errorMessage = truncate(scrubSecrets(rawMessage), 2000);
    const errorStack = rawStack
      ? truncate(scrubSecrets(rawStack), 4000)
      : undefined;

    let inputSummary: string | undefined;
    if (toolInput !== undefined) {
      try {
        const raw = JSON.stringify(toolInput);
        inputSummary = truncate(scrubSecrets(raw), 1000);
      } catch {
        inputSummary = truncate(scrubSecrets(String(toolInput)), 1000);
      }
    }

    const callerProject = workingDirectory
      ? basename(workingDirectory)
      : undefined;

    const fingerprint = computeFingerprint(category, rawMessage);

    const record: FailureRecord = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      tool,
      category,
      errorMessage,
      ...(errorStack !== undefined ? { errorStack } : {}),
      ...(inputSummary !== undefined ? { inputSummary } : {}),
      ...(callerProject !== undefined ? { callerProject } : {}),
      ...(workingDirectory !== undefined ? { workingDirectory } : {}),
      ...(model !== undefined ? { model } : {}),
      fingerprint,
    };

    const line = JSON.stringify(record) + "\n";

    // Fire-and-forget
    const filePath = resolve(this.logsDir, getMonthlyFileName("failures"));
    mkdir(this.logsDir, { recursive: true })
      .then(() => appendFile(filePath, line, "utf-8"))
      .catch(() => {});
  }
}
