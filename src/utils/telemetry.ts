import { appendFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ErrorCategory } from "./error-classifier.js";

export type { ErrorCategory };

export interface SuccessRecord {
  timestamp: string;
  sessionId: string;
  tool: string;
  durationMs: number;
  model?: string;
  callerProject?: string;
  iterationsUsed?: number;
  tokensUsed?: { inputTokens: number; outputTokens: number };
}

export interface RetryRecord {
  timestamp: string;
  sessionId: string;
  tool: string;
  attempt: number;
  succeeded: boolean;
  errorCategory?: ErrorCategory;
  errorMessage?: string;
}

function getDefaultLogsDir(): string {
  if (process.env.MINIMAX_FAILURE_LOG_DIR) {
    return process.env.MINIMAX_FAILURE_LOG_DIR;
  }
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

export class Telemetry {
  private readonly logsDir: string;
  private readonly sessionId: string;

  constructor(logsDir?: string, sessionId?: string) {
    this.logsDir = logsDir ?? getDefaultLogsDir();
    this.sessionId = sessionId ?? new Date().toISOString();
  }

  async recordSuccess(record: Omit<SuccessRecord, "timestamp" | "sessionId">): Promise<void> {
    const entry: SuccessRecord = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      ...record,
    };
    const line = JSON.stringify(entry) + "\n";
    const filePath = resolve(this.logsDir, getMonthlyFileName("success"));
    mkdir(this.logsDir, { recursive: true })
      .then(() => appendFile(filePath, line, "utf-8"))
      .catch(() => {});
  }

  async recordRetry(record: Omit<RetryRecord, "timestamp" | "sessionId">): Promise<void> {
    const entry: RetryRecord = {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      ...record,
    };
    const line = JSON.stringify(entry) + "\n";
    const filePath = resolve(this.logsDir, getMonthlyFileName("retries"));
    mkdir(this.logsDir, { recursive: true })
      .then(() => appendFile(filePath, line, "utf-8"))
      .catch(() => {});
  }
}
