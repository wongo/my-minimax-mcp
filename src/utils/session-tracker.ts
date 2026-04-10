import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

export interface SessionEntry {
  date: string;
  calls: number;
  cost: number;
  targetMet: boolean;
  notes: string;
}

export type SessionMode = "normal" | "warning" | "forced";

export interface StartResult {
  mode: SessionMode;
  message: string;
  recentSessions: SessionEntry[];
}

export interface EndResult {
  entry: SessionEntry;
  targetMet: boolean;
  message: string;
}

export interface StatusResult {
  mode: SessionMode;
  currentCalls: number;
  target: number;
  onTrack: boolean;
}

const DEFAULT_LOG_PATH = resolve(homedir(), ".claude", "minimax-usage.jsonl");

export class SessionTracker {
  private readonly logPath: string;
  private readonly target: number;

  constructor(logPath?: string, target: number = 5) {
    this.logPath = logPath ?? DEFAULT_LOG_PATH;
    this.target = Number.isInteger(target) && target > 0 ? target : 5;
  }

  async start(): Promise<StartResult> {
    const entries = await this.readLog();
    const mode = this.determineMode(entries);
    const recent = entries.slice(-3);

    let message: string;
    switch (mode) {
      case "normal":
        message = `Session started. Mode: normal. Target: ≥${this.target} MiniMax calls.`;
        break;
      case "warning": {
        const last = entries[entries.length - 1];
        message = `⚠ Last session missed target (${last?.calls ?? 0} calls). Mode: warning. Prioritize MiniMax for all code generation.`;
        break;
      }
      case "forced":
        message = `🔴 2 consecutive misses. Mode: FORCED. ALL code changes must use MiniMax tools.`;
        break;
    }

    return { mode, message, recentSessions: recent };
  }

  async end(calls: number, cost: number, notes?: string): Promise<EndResult> {
    const targetMet = calls >= this.target;
    const entry: SessionEntry = {
      date: new Date().toISOString(),
      calls,
      cost: Math.round(cost * 1_000_000) / 1_000_000,
      targetMet,
      notes: notes ?? (targetMet ? "" : "No root cause provided"),
    };

    const persisted = await this.appendEntry(entry);

    const status = targetMet ? "Target met" : "Target missed";
    const persistNote = persisted ? "Session recorded." : "WARNING: Failed to persist session log.";
    const message = targetMet
      ? `✅ ${status} (${calls}/${this.target} calls, $${entry.cost.toFixed(4)}). ${persistNote}`
      : `❌ ${status} (${calls}/${this.target} calls). Please provide root cause analysis. ${persistNote}`;

    return { entry, targetMet, message };
  }

  async status(currentCalls: number): Promise<StatusResult> {
    const entries = await this.readLog();
    const mode = this.determineMode(entries);

    return {
      mode,
      currentCalls,
      target: this.target,
      onTrack: currentCalls >= this.target,
    };
  }

  private determineMode(entries: SessionEntry[]): SessionMode {
    if (entries.length === 0) return "normal";

    const last = entries[entries.length - 1];
    if (last.targetMet) return "normal";

    if (entries.length >= 2) {
      const secondLast = entries[entries.length - 2];
      if (!secondLast.targetMet) return "forced";
    }

    return "warning";
  }

  private isValidEntry(obj: unknown): obj is SessionEntry {
    if (typeof obj !== "object" || obj === null) return false;
    const e = obj as Record<string, unknown>;
    return (
      typeof e.date === "string" &&
      typeof e.calls === "number" &&
      typeof e.cost === "number" &&
      typeof e.targetMet === "boolean" &&
      typeof e.notes === "string"
    );
  }

  private async readLog(): Promise<SessionEntry[]> {
    let content: string;
    try {
      content = await readFile(this.logPath, "utf-8");
    } catch (err: unknown) {
      // File not found → empty log (first run)
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      // Other errors (permissions, broken symlinks) → propagate
      throw err;
    }

    const entries: SessionEntry[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (this.isValidEntry(parsed)) {
          entries.push(parsed);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  }

  private async appendEntry(entry: SessionEntry): Promise<boolean> {
    try {
      await mkdir(dirname(this.logPath), { recursive: true });
      await writeFile(this.logPath, JSON.stringify(entry) + "\n", { flag: "a" });
      return true;
    } catch {
      return false;
    }
  }
}
