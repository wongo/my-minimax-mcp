import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";

export interface SessionEntry {
  date: string;
  sessionId: string;
  project: string;
  calls: number;
  cost: number;
  targetMet: boolean;
  notes: string;
  tokensOffloaded?: number;
  equivalentSonnetCalls?: number;
}

export type SessionMode = "normal" | "warning" | "forced";
export type Trend = "improving" | "declining" | "stable" | "insufficient_data";

export interface StartResult {
  mode: SessionMode;
  message: string;
  recentSessions: SessionEntry[];
  trend: Trend;
  streak: number;
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
  dynamicTarget: number;
  onTrack: boolean;
  trend: Trend;
  streak: number;
  insight: string;
}

const DEFAULT_LOG_PATH = resolve(homedir(), ".claude", "minimax-usage.jsonl");

export class SessionTracker {
  private readonly logPath: string;
  private readonly baseTarget: number;
  private initialized = false;
  private cachedMode: SessionMode = "normal";
  private cachedEntries: SessionEntry[] = [];

  constructor(logPath?: string, target: number = 5) {
    this.logPath = logPath ?? DEFAULT_LOG_PATH;
    this.baseTarget = Number.isInteger(target) && target > 0 ? target : 5;
  }

  /**
   * Auto-initialize: called internally on first access.
   * Also callable explicitly via the "start" command.
   */
  async start(): Promise<StartResult> {
    const entries = await this.readLog();
    this.cachedEntries = entries;
    const mode = this.determineMode(entries);
    this.cachedMode = mode;
    this.initialized = true;
    const recent = entries.slice(-5);
    const trend = this.calculateTrend(entries);
    const streak = this.calculateStreak(entries);

    let message: string;
    switch (mode) {
      case "normal":
        message = `Session started. Mode: normal. Base target: ≥${this.baseTarget} MiniMax calls.`;
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

    if (streak > 0) {
      message += ` 🔥 ${streak}-session streak!`;
    }

    return { mode, message, recentSessions: recent, trend, streak };
  }

  async end(
    calls: number,
    cost: number,
    notes?: string,
    sessionId?: string,
    project?: string,
    savingsData?: { tokensOffloaded: number; equivalentSonnetCalls: number },
  ): Promise<EndResult> {
    const dynamicTarget = this.computeTarget();
    const targetMet = calls >= dynamicTarget;
    const entry: SessionEntry = {
      date: new Date().toISOString(),
      sessionId: sessionId ?? new Date().toISOString(),
      project: project ?? process.cwd(),
      calls,
      cost: Math.round(cost * 1_000_000) / 1_000_000,
      targetMet,
      notes: notes ?? (targetMet ? "" : "No root cause provided"),
      ...(savingsData && {
        tokensOffloaded: savingsData.tokensOffloaded,
        equivalentSonnetCalls: savingsData.equivalentSonnetCalls,
      }),
    };

    const persisted = await this.appendEntry(entry);

    const status = targetMet ? "Target met" : "Target missed";
    const persistNote = persisted ? "Session recorded." : "WARNING: Failed to persist session log.";
    const message = targetMet
      ? `✅ ${status} (${calls}/${dynamicTarget} calls, $${entry.cost.toFixed(4)}). ${persistNote}`
      : `❌ ${status} (${calls}/${dynamicTarget} calls). Please provide root cause analysis. ${persistNote}`;

    return { entry, targetMet, message };
  }

  async status(currentCalls: number): Promise<StatusResult> {
    if (!this.initialized) {
      await this.ensureInitialized();
    }

    const entries = this.cachedEntries;
    const mode = this.cachedMode;
    const dynamicTarget = this.computeTarget();
    const trend = this.calculateTrend(entries);
    const streak = this.calculateStreak(entries);

    let insight: string;
    if (streak >= 5) {
      insight = `Excellent! ${streak}-session streak. Keep it up.`;
    } else if (streak >= 3) {
      insight = `Good momentum: ${streak} consecutive sessions on target.`;
    } else if (trend === "declining") {
      const recent3 = entries.slice(-3).map(e => e.calls);
      insight = `Usage declining: ${recent3.join("→")} calls. Consider routing more tasks to MiniMax.`;
    } else if (trend === "improving") {
      insight = "Usage improving. On the right track.";
    } else {
      insight = `Target: ${dynamicTarget} calls. Current: ${currentCalls}.`;
    }

    return {
      mode,
      currentCalls,
      target: this.baseTarget,
      dynamicTarget,
      onTrack: currentCalls >= dynamicTarget,
      trend,
      streak,
      insight,
    };
  }

  /**
   * Returns the session target.
   * Note: We only see MiniMax call count, not total session activity,
   * so we cannot reliably exempt "short" sessions. Use baseTarget as-is.
   */
  private computeTarget(): number {
    return this.baseTarget;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.start();
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

  private calculateTrend(entries: SessionEntry[]): Trend {
    if (entries.length < 3) return "insufficient_data";

    const recent = entries.slice(-5);
    const callCounts = recent.map(e => e.calls);

    // Simple linear direction: compare first half avg to second half avg
    const mid = Math.floor(callCounts.length / 2);
    const firstHalf = callCounts.slice(0, mid);
    const secondHalf = callCounts.slice(mid);

    const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const diff = avgSecond - avgFirst;
    if (diff > 1) return "improving";
    if (diff < -1) return "declining";
    return "stable";
  }

  private calculateStreak(entries: SessionEntry[]): number {
    let streak = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].targetMet) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
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
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw err;
    }

    const entries: SessionEntry[] = [];
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (this.isValidEntry(parsed)) {
          // Backfill optional fields for old entries
          const entry = parsed as SessionEntry;
          if (!entry.sessionId) entry.sessionId = entry.date;
          if (!entry.project) entry.project = "unknown";
          entries.push(entry);
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
