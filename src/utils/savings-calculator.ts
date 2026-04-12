import type { TokenUsage } from "../client/types.js";
import { UNMETERED_CALL_ESTIMATE } from "../client/types.js";

const DEFAULT_AVG_TOKENS_PER_CALL = 8000;
const ROLLING_WINDOW = 100;

interface CostEntryLike {
  timestamp: string;
  tool: string;
  model: string;
  tokensUsed: TokenUsage;
  cost: number;
}

export interface SavingsReport {
  tokensOffloaded: {
    input: number;
    output: number;
    total: number;
  };
  equivalentSonnetCalls: number;
  avgTokensPerCall: number;
  meteredCalls: number;
  unmeteredCalls: number;
  totalCalls: number;
  minimaxCost: number;
  dataPointsUsed: number;
}

export interface ToolStats {
  calls: number;
  tokens: number;
  percentage: number;
}

export interface CumulativeReport {
  allTime: SavingsReport;
  daily: Record<string, SavingsReport>;
  weekly: Record<string, SavingsReport>;
  monthly: Record<string, SavingsReport>;
  toolBreakdown: Record<string, ToolStats>;
}

function isMetered(entry: CostEntryLike): boolean {
  return entry.tokensUsed.inputTokens + entry.tokensUsed.outputTokens > 0;
}

export function computeAvgTokensPerCall(entries: readonly CostEntryLike[]): number {
  const metered = entries.filter(isMetered);
  if (metered.length < 10) return DEFAULT_AVG_TOKENS_PER_CALL;

  // Use rolling window for large datasets
  const window = metered.length > ROLLING_WINDOW ? metered.slice(-ROLLING_WINDOW) : metered;
  const total = window.reduce(
    (sum, e) => sum + e.tokensUsed.inputTokens + e.tokensUsed.outputTokens,
    0,
  );
  return Math.round(total / window.length);
}

export function calculateSavings(
  entries: readonly CostEntryLike[],
  allHistoricalEntries?: readonly CostEntryLike[],
): SavingsReport {
  let inputTokens = 0;
  let outputTokens = 0;
  let minimaxCost = 0;
  let meteredCalls = 0;
  let unmeteredCalls = 0;

  for (const entry of entries) {
    if (isMetered(entry)) {
      inputTokens += entry.tokensUsed.inputTokens;
      outputTokens += entry.tokensUsed.outputTokens;
      minimaxCost += entry.cost;
      meteredCalls++;
    } else {
      inputTokens += UNMETERED_CALL_ESTIMATE.inputTokens;
      outputTokens += UNMETERED_CALL_ESTIMATE.outputTokens;
      unmeteredCalls++;
    }
  }

  const total = inputTokens + outputTokens;
  const avgSource = allHistoricalEntries ?? entries;
  const avgTokensPerCall = computeAvgTokensPerCall(avgSource);
  const dataPointsUsed = avgSource.filter(isMetered).length;

  return {
    tokensOffloaded: { input: inputTokens, output: outputTokens, total },
    equivalentSonnetCalls: avgTokensPerCall > 0
      ? Math.round((total / avgTokensPerCall) * 10) / 10
      : 0,
    avgTokensPerCall,
    meteredCalls,
    unmeteredCalls,
    totalCalls: meteredCalls + unmeteredCalls,
    minimaxCost: Math.round(minimaxCost * 1_000_000) / 1_000_000,
    dataPointsUsed,
  };
}

export function calculateCumulativeReport(entries: readonly CostEntryLike[]): CumulativeReport {
  const daily: Record<string, CostEntryLike[]> = {};
  const weekly: Record<string, CostEntryLike[]> = {};
  const monthly: Record<string, CostEntryLike[]> = {};
  const toolTokens: Record<string, { calls: number; tokens: number }> = {};

  let totalTokensAll = 0;

  for (const entry of entries) {
    const dayKey = entry.timestamp.slice(0, 10);
    const monthKey = entry.timestamp.slice(0, 7);
    const weekKey = getISOWeekKey(new Date(entry.timestamp));

    (daily[dayKey] ??= []).push(entry);
    (weekly[weekKey] ??= []).push(entry);
    (monthly[monthKey] ??= []).push(entry);

    const tokens = isMetered(entry)
      ? entry.tokensUsed.inputTokens + entry.tokensUsed.outputTokens
      : UNMETERED_CALL_ESTIMATE.inputTokens + UNMETERED_CALL_ESTIMATE.outputTokens;

    const tool = entry.tool;
    const existing = toolTokens[tool] ?? { calls: 0, tokens: 0 };
    toolTokens[tool] = { calls: existing.calls + 1, tokens: existing.tokens + tokens };
    totalTokensAll += tokens;
  }

  const toolBreakdown: Record<string, ToolStats> = {};
  for (const [tool, stats] of Object.entries(toolTokens)) {
    toolBreakdown[tool] = {
      ...stats,
      percentage: totalTokensAll > 0
        ? Math.round((stats.tokens / totalTokensAll) * 1000) / 10
        : 0,
    };
  }

  const mapToSavings = (group: Record<string, CostEntryLike[]>): Record<string, SavingsReport> => {
    const result: Record<string, SavingsReport> = {};
    for (const [key, groupEntries] of Object.entries(group)) {
      result[key] = calculateSavings(groupEntries, entries);
    }
    return result;
  };

  return {
    allTime: calculateSavings(entries),
    daily: mapToSavings(daily),
    weekly: mapToSavings(weekly),
    monthly: mapToSavings(monthly),
    toolBreakdown,
  };
}

function getISOWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
