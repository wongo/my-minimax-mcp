import { appendFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type { TokenUsage, ModelId } from "../client/types.js";
import { calculateCost } from "../client/types.js";

interface CostEntry {
  timestamp: string;
  tool: string;
  model: ModelId;
  tokensUsed: TokenUsage;
  cost: number;
}

export class CostTracker {
  private entries: CostEntry[] = [];
  private logPath: string;

  constructor(logPath?: string) {
    this.logPath = logPath ?? resolve(homedir(), ".claude", "minimax-costs.log");
  }

  async record(tool: string, model: ModelId, usage: TokenUsage): Promise<void> {
    const cost = calculateCost(usage, model);
    const entry: CostEntry = {
      timestamp: new Date().toISOString(),
      tool,
      model,
      tokensUsed: usage,
      cost,
    };
    this.entries = [...this.entries, entry];

    // Append to log file (fire and forget, don't block on write errors)
    const line = JSON.stringify(entry) + "\n";
    appendFile(this.logPath, line, "utf-8").catch(() => {});
  }

  getReport(): {
    totalCost: number;
    totalTokens: TokenUsage;
    callCount: number;
    breakdown: CostEntry[];
  } {
    const totalTokens: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let totalCost = 0;

    for (const entry of this.entries) {
      totalTokens.inputTokens += entry.tokensUsed.inputTokens;
      totalTokens.outputTokens += entry.tokensUsed.outputTokens;
      totalCost += entry.cost;
    }

    return {
      totalCost: Math.round(totalCost * 1_000_000) / 1_000_000, // 6 decimal places
      totalTokens,
      callCount: this.entries.length,
      breakdown: [...this.entries],
    };
  }

  reset(): void {
    this.entries = [];
  }
}
