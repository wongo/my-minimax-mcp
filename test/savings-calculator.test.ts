import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  calculateSavings,
  calculateCumulativeReport,
  computeAvgTokensPerCall,
} from "../src/utils/savings-calculator.js";

function makeEntry(overrides: Partial<{
  timestamp: string;
  tool: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}> = {}) {
  return {
    timestamp: overrides.timestamp ?? "2026-04-12T10:00:00.000Z",
    tool: overrides.tool ?? "generate_code",
    model: overrides.model ?? "MiniMax-M2.7",
    tokensUsed: {
      inputTokens: overrides.inputTokens ?? 2000,
      outputTokens: overrides.outputTokens ?? 1000,
    },
    cost: overrides.cost ?? 0.0018,
  };
}

function makeUnmeteredEntry(tool = "web_search", timestamp = "2026-04-12T10:00:00.000Z") {
  return {
    timestamp,
    tool,
    model: "coding-plan",
    tokensUsed: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
  };
}

describe("savings-calculator", () => {
  describe("calculateSavings", () => {
    it("calculates metered token offload correctly", () => {
      const entries = [makeEntry({ inputTokens: 5000, outputTokens: 3000, cost: 0.005 })];
      const result = calculateSavings(entries);

      assert.strictEqual(result.tokensOffloaded.input, 5000);
      assert.strictEqual(result.tokensOffloaded.output, 3000);
      assert.strictEqual(result.tokensOffloaded.total, 8000);
      assert.strictEqual(result.meteredCalls, 1);
      assert.strictEqual(result.unmeteredCalls, 0);
      assert.strictEqual(result.totalCalls, 1);
      assert.strictEqual(result.minimaxCost, 0.005);
    });

    it("estimates tokens for unmetered calls", () => {
      const entries = [makeUnmeteredEntry()];
      const result = calculateSavings(entries);

      assert.strictEqual(result.tokensOffloaded.input, 2000);
      assert.strictEqual(result.tokensOffloaded.output, 1000);
      assert.strictEqual(result.tokensOffloaded.total, 3000);
      assert.strictEqual(result.meteredCalls, 0);
      assert.strictEqual(result.unmeteredCalls, 1);
      assert.strictEqual(result.minimaxCost, 0);
    });

    it("combines metered and unmetered correctly", () => {
      const entries = [
        makeEntry({ inputTokens: 4000, outputTokens: 2000, cost: 0.003 }),
        makeUnmeteredEntry(),
      ];
      const result = calculateSavings(entries);

      assert.strictEqual(result.tokensOffloaded.input, 4000 + 2000);
      assert.strictEqual(result.tokensOffloaded.output, 2000 + 1000);
      assert.strictEqual(result.tokensOffloaded.total, 9000);
      assert.strictEqual(result.meteredCalls, 1);
      assert.strictEqual(result.unmeteredCalls, 1);
      assert.strictEqual(result.minimaxCost, 0.003);
    });

    it("returns zeros for empty entries", () => {
      const result = calculateSavings([]);

      assert.strictEqual(result.tokensOffloaded.total, 0);
      assert.strictEqual(result.equivalentSonnetCalls, 0);
      assert.strictEqual(result.totalCalls, 0);
      assert.strictEqual(result.minimaxCost, 0);
    });

    it("uses allHistoricalEntries for avgTokensPerCall when provided", () => {
      // 15 historical entries to exceed the 10-entry threshold
      const historical = Array.from({ length: 15 }, () =>
        makeEntry({ inputTokens: 10000, outputTokens: 5000 }),
      );
      // avg = (10000 + 5000) = 15000 tokens/call

      const current = [makeEntry({ inputTokens: 30000, outputTokens: 15000 })];
      const result = calculateSavings(current, historical);

      assert.strictEqual(result.avgTokensPerCall, 15000);
      assert.strictEqual(result.equivalentSonnetCalls, 3.0); // 45000 / 15000
      assert.strictEqual(result.dataPointsUsed, 15);
    });
  });

  describe("computeAvgTokensPerCall", () => {
    it("returns default 8000 when fewer than 10 entries", () => {
      const entries = Array.from({ length: 5 }, () => makeEntry());
      assert.strictEqual(computeAvgTokensPerCall(entries), 8000);
    });

    it("returns actual average when 10+ entries", () => {
      const entries = Array.from({ length: 10 }, () =>
        makeEntry({ inputTokens: 6000, outputTokens: 4000 }),
      );
      // avg = 10000 per call
      assert.strictEqual(computeAvgTokensPerCall(entries), 10000);
    });

    it("uses rolling window for 100+ entries", () => {
      // First 80 entries: 2000 tokens each
      const old = Array.from({ length: 80 }, () =>
        makeEntry({ inputTokens: 1000, outputTokens: 1000 }),
      );
      // Last 100 entries: 20000 tokens each
      const recent = Array.from({ length: 100 }, () =>
        makeEntry({ inputTokens: 15000, outputTokens: 5000 }),
      );
      const entries = [...old, ...recent];

      // Should use last 100 entries → avg = 20000
      assert.strictEqual(computeAvgTokensPerCall(entries), 20000);
    });

    it("ignores unmetered entries", () => {
      const entries = [
        ...Array.from({ length: 10 }, () => makeEntry({ inputTokens: 5000, outputTokens: 5000 })),
        makeUnmeteredEntry(),
        makeUnmeteredEntry(),
      ];
      // Only metered entries count: avg = 10000
      assert.strictEqual(computeAvgTokensPerCall(entries), 10000);
    });

    it("returns default when all entries are unmetered", () => {
      const entries = [makeUnmeteredEntry(), makeUnmeteredEntry()];
      assert.strictEqual(computeAvgTokensPerCall(entries), 8000);
    });
  });

  describe("calculateCumulativeReport", () => {
    it("groups entries by day, week, and month", () => {
      const entries = [
        makeEntry({ timestamp: "2026-04-10T10:00:00Z", inputTokens: 1000, outputTokens: 500 }),
        makeEntry({ timestamp: "2026-04-10T14:00:00Z", inputTokens: 2000, outputTokens: 1000 }),
        makeEntry({ timestamp: "2026-04-11T10:00:00Z", inputTokens: 3000, outputTokens: 1500 }),
      ];
      const report = calculateCumulativeReport(entries);

      assert.ok(report.daily["2026-04-10"]);
      assert.ok(report.daily["2026-04-11"]);
      assert.strictEqual(report.daily["2026-04-10"].totalCalls, 2);
      assert.strictEqual(report.daily["2026-04-11"].totalCalls, 1);

      assert.ok(report.monthly["2026-04"]);
      assert.strictEqual(report.monthly["2026-04"].totalCalls, 3);

      assert.strictEqual(report.allTime.totalCalls, 3);
      assert.strictEqual(report.allTime.tokensOffloaded.total, 1500 + 3000 + 4500);
    });

    it("computes tool breakdown with percentages", () => {
      const entries = [
        makeEntry({ tool: "agent_task", inputTokens: 8000, outputTokens: 2000 }),
        makeEntry({ tool: "generate_code", inputTokens: 1000, outputTokens: 1000 }),
      ];
      const report = calculateCumulativeReport(entries);

      assert.strictEqual(report.toolBreakdown["agent_task"].calls, 1);
      assert.strictEqual(report.toolBreakdown["agent_task"].tokens, 10000);
      assert.strictEqual(report.toolBreakdown["generate_code"].tokens, 2000);

      // 10000/12000 = 83.3%, 2000/12000 = 16.7%
      assert.strictEqual(report.toolBreakdown["agent_task"].percentage, 83.3);
      assert.strictEqual(report.toolBreakdown["generate_code"].percentage, 16.7);
    });

    it("handles empty entries", () => {
      const report = calculateCumulativeReport([]);

      assert.strictEqual(report.allTime.totalCalls, 0);
      assert.deepStrictEqual(report.toolBreakdown, {});
      assert.deepStrictEqual(report.daily, {});
    });
  });
});
