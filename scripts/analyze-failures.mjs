#!/usr/bin/env node
/**
 * analyze-failures.mjs — MiniMax failure + telemetry digest tool
 *
 * Reads logs/failures-YYYY-MM.jsonl, logs/success-YYYY-MM.jsonl,
 * logs/retries-YYYY-MM.jsonl and produces a human-readable report.
 *
 * Usage:
 *   node scripts/analyze-failures.mjs [--month YYYY-MM] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--json]
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── CLI parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    if (eq !== -1) {
      flags[a.slice(2, eq)] = a.slice(eq + 1);
    } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
      flags[a.slice(2)] = args[++i];
    } else {
      flags[a.slice(2)] = true;
    }
  }
}

if (flags.help || flags.h) {
  console.log(`Usage: node analyze-failures.mjs [options]

Options:
  --month YYYY-MM     Read only the given month's logs (default: current + last month)
  --from YYYY-MM-DD   Start date filter (inclusive)
  --to   YYYY-MM-DD   End date filter (inclusive)
  --json              Output machine-readable JSON
  --help              Show this message`);
  process.exit(0);
}

const OUTPUT_JSON = flags.json === true || flags.json === 'true';
const MONTH_FILTER = typeof flags.month === 'string' ? flags.month : null;
const FROM_DATE = typeof flags.from === 'string' ? flags.from : null;
const TO_DATE = typeof flags.to === 'string' ? flags.to : null;

// ─── Path helpers ─────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'logs');

function getMonthKeys() {
  if (MONTH_FILTER) return [MONTH_FILTER];
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth() + 1;
  const lastMonth = thisMonth === 1 ? 12 : thisMonth - 1;
  const lastYear = thisMonth === 1 ? thisYear - 1 : thisYear;
  return [
    `${thisYear}-${String(thisMonth).padStart(2, '0')}`,
    `${lastYear}-${String(lastMonth).padStart(2, '0')}`,
  ];
}

// ─── JSONL reading ────────────────────────────────────────────────────────────

function readJsonl(prefix) {
  const records = [];
  for (const monthKey of getMonthKeys()) {
    const filePath = join(LOGS_DIR, `${prefix}-${monthKey}.jsonl`);
    if (!existsSync(filePath)) continue;
    let content;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        records.push(JSON.parse(trimmed));
      } catch {
        // skip malformed
      }
    }
  }
  return records;
}

// ─── Date filtering ───────────────────────────────────────────────────────────

function inRange(timestamp) {
  if (!FROM_DATE && !TO_DATE) return true;
  const ts = new Date(timestamp).getTime();
  if (FROM_DATE && ts < new Date(FROM_DATE + 'T00:00:00Z').getTime()) return false;
  if (TO_DATE && ts > new Date(TO_DATE + 'T23:59:59Z').getTime()) return false;
  return true;
}

// ─── Core computation ─────────────────────────────────────────────────────────

function compute() {
  const failures = readJsonl('failures').filter(r => inRange(r.timestamp));
  const successes = readJsonl('success').filter(r => inRange(r.timestamp));
  const retries = readJsonl('retries').filter(r => inRange(r.timestamp));

  // ─ 1. Summary ────────────────────────────────────────────────────────────
  const totalFailures = failures.length;
  const totalSuccesses = successes.length;
  const total = totalFailures + totalSuccesses;
  const successRate = total > 0 ? (totalSuccesses / total) * 100 : null;

  // ─ 2. Top categories ─────────────────────────────────────────────────────
  const categoryCounts = {};
  for (const r of failures) {
    const cat = r.category ?? 'unknown';
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      category,
      count,
      pct: totalFailures > 0 ? (count / totalFailures) * 100 : 0,
    }));

  // ─ 3. Top fingerprints ───────────────────────────────────────────────────
  const fingerprintMap = {};
  for (const r of failures) {
    const fp = r.fingerprint ?? 'unknown';
    if (!fingerprintMap[fp]) {
      fingerprintMap[fp] = { count: 0, exampleMessage: r.errorMessage ?? '' };
    }
    fingerprintMap[fp].count++;
  }
  const topFingerprints = Object.entries(fingerprintMap)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([fingerprint, v]) => ({
      fingerprint,
      count: v.count,
      exampleMessage: v.exampleMessage.slice(0, 120),
    }));

  // ─ 4. Per-tool breakdown ─────────────────────────────────────────────────
  const toolStats = {};
  function ensureTool(tool) {
    if (!toolStats[tool]) toolStats[tool] = { successes: 0, failures: 0 };
  }
  for (const r of successes) { ensureTool(r.tool); toolStats[r.tool].successes++; }
  for (const r of failures) { ensureTool(r.tool); toolStats[r.tool].failures++; }
  const perTool = Object.entries(toolStats)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tool, s]) => {
      const t = s.successes + s.failures;
      return { tool, successes: s.successes, failures: s.failures, successRate: t > 0 ? (s.successes / t) * 100 : null };
    });

  // ─ 5. Per-caller breakdown ───────────────────────────────────────────────
  const callerStats = {};
  function ensureCaller(caller) {
    if (!callerStats[caller]) callerStats[caller] = { successes: 0, failures: 0 };
  }
  for (const r of successes) {
    const c = r.callerProject ?? '(unknown)';
    ensureCaller(c); callerStats[c].successes++;
  }
  for (const r of failures) {
    const c = r.callerProject ?? '(unknown)';
    ensureCaller(c); callerStats[c].failures++;
  }
  const perCaller = Object.entries(callerStats)
    .sort((a, b) => (b[1].successes + b[1].failures) - (a[1].successes + a[1].failures))
    .map(([caller, s]) => {
      const t = s.successes + s.failures;
      return { caller, successes: s.successes, failures: s.failures, successRate: t > 0 ? (s.successes / t) * 100 : null };
    });

  // ─ 6. Retry effectiveness ────────────────────────────────────────────────
  const totalRetries = retries.length;
  const retrySuccesses = retries.filter(r => r.succeeded).length;
  const retrySuccessRate = totalRetries > 0 ? (retrySuccesses / totalRetries) * 100 : null;

  const retryCategoryStats = {};
  for (const r of retries) {
    const cat = r.errorCategory ?? 'unknown';
    if (!retryCategoryStats[cat]) retryCategoryStats[cat] = { total: 0, succeeded: 0 };
    retryCategoryStats[cat].total++;
    if (r.succeeded) retryCategoryStats[cat].succeeded++;
  }
  const retryCategoryBreakdown = Object.entries(retryCategoryStats)
    .sort((a, b) => b[1].total - a[1].total)
    .map(([category, s]) => ({
      category,
      total: s.total,
      succeeded: s.succeeded,
      successRate: s.total > 0 ? (s.succeeded / s.total) * 100 : null,
    }));

  // ─ 7. Quick wins ─────────────────────────────────────────────────────────
  const toolCategoryStats = {};
  for (const r of failures) {
    const key = `${r.tool}|${r.category ?? 'unknown'}`;
    if (!toolCategoryStats[key]) toolCategoryStats[key] = { tool: r.tool, category: r.category ?? 'unknown', failures: 0, successes: 0 };
    toolCategoryStats[key].failures++;
  }
  for (const r of successes) {
    for (const cat of Object.keys(categoryCounts)) {
      const key = `${r.tool}|${cat}`;
      if (toolCategoryStats[key]) {
        toolCategoryStats[key].successes++;
      }
    }
  }
  const quickWins = Object.values(toolCategoryStats)
    .map(s => {
      const t = s.successes + s.failures;
      return { tool: s.tool, category: s.category, failures: s.failures, successRate: t > 0 ? (s.successes / t) * 100 : 0 };
    })
    .filter(s => s.successRate < 80 && s.failures >= 2)
    .sort((a, b) => a.successRate - b.successRate)
    .slice(0, 10);

  return {
    summary: { totalFailures, totalSuccesses, total, successRate },
    topCategories,
    topFingerprints,
    perTool,
    perCaller,
    retry: { totalRetries, retrySuccesses, retrySuccessRate, categoryBreakdown: retryCategoryBreakdown },
    quickWins,
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function pct(n) {
  if (n === null) return 'n/a';
  return n.toFixed(1) + '%';
}

function pad(s, n, right = false) {
  const str = String(s ?? '');
  if (right) return str.padStart(n);
  return str.padEnd(n);
}

// ─── Renderers ────────────────────────────────────────────────────────────────

function renderMarkdown(data) {
  const lines = [];
  const { summary, topCategories, topFingerprints, perTool, perCaller, retry, quickWins } = data;

  const noData = summary.total === 0 && retry.totalRetries === 0;
  if (noData) {
    lines.push('# MiniMax Failure & Telemetry Digest');
    lines.push('');
    lines.push('No log data found. Run some MiniMax tools to generate telemetry.');
    lines.push('');
    lines.push(`Logs directory: ${LOGS_DIR}`);
    return lines.join('\n');
  }

  lines.push('# MiniMax Failure & Telemetry Digest');
  lines.push('');

  // 1. Summary
  lines.push('## 1. Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total calls | ${summary.total} |`);
  lines.push(`| Successes | ${summary.totalSuccesses} |`);
  lines.push(`| Failures | ${summary.totalFailures} |`);
  lines.push(`| Overall success rate | ${pct(summary.successRate)} |`);
  lines.push('');

  // 2. Top categories
  lines.push('## 2. Top Failure Categories');
  lines.push('');
  if (topCategories.length === 0) {
    lines.push('No failures recorded.');
  } else {
    lines.push('| Category | Count | % of failures |');
    lines.push('|----------|------:|--------------:|');
    for (const r of topCategories) {
      lines.push(`| ${pad(r.category, 22)} | ${pad(r.count, 5, true)} | ${pad(pct(r.pct), 13, true)} |`);
    }
  }
  lines.push('');

  // 3. Top fingerprints
  lines.push('## 3. Top Error Fingerprints');
  lines.push('');
  if (topFingerprints.length === 0) {
    lines.push('No failures recorded.');
  } else {
    lines.push('| Fingerprint | Count | Example message |');
    lines.push('|-------------|------:|-----------------|');
    for (const r of topFingerprints) {
      lines.push(`| \`${r.fingerprint}\` | ${r.count} | ${r.exampleMessage.replace(/\|/g, '/')} |`);
    }
  }
  lines.push('');

  // 4. Per-tool breakdown
  lines.push('## 4. Per-Tool Breakdown');
  lines.push('');
  if (perTool.length === 0) {
    lines.push('No data.');
  } else {
    lines.push('| Tool | Successes | Failures | Success rate |');
    lines.push('|------|----------:|---------:|-------------:|');
    for (const r of perTool) {
      lines.push(`| ${pad(r.tool, 30)} | ${pad(r.successes, 9, true)} | ${pad(r.failures, 8, true)} | ${pad(pct(r.successRate), 12, true)} |`);
    }
  }
  lines.push('');

  // 5. Per-caller breakdown
  lines.push('## 5. Per-Caller Breakdown');
  lines.push('');
  if (perCaller.length === 0) {
    lines.push('No data.');
  } else {
    lines.push('| Caller project | Successes | Failures | Success rate |');
    lines.push('|----------------|----------:|---------:|-------------:|');
    for (const r of perCaller) {
      lines.push(`| ${pad(r.caller, 20)} | ${pad(r.successes, 9, true)} | ${pad(r.failures, 8, true)} | ${pad(pct(r.successRate), 12, true)} |`);
    }
  }
  lines.push('');

  // 6. Retry effectiveness
  lines.push('## 6. Retry Effectiveness');
  lines.push('');
  lines.push(`- Total retry attempts: ${retry.totalRetries}`);
  lines.push(`- Final success rate of retried calls: ${pct(retry.retrySuccessRate)}`);
  if (retry.categoryBreakdown.length > 0) {
    lines.push('');
    lines.push('| Category | Retries | Succeeded | Success rate |');
    lines.push('|----------|--------:|----------:|-------------:|');
    for (const r of retry.categoryBreakdown) {
      lines.push(`| ${pad(r.category, 22)} | ${pad(r.total, 7, true)} | ${pad(r.succeeded, 9, true)} | ${pad(pct(r.successRate), 12, true)} |`);
    }
  }
  lines.push('');

  // 7. Quick wins
  lines.push('## 7. Quick Wins (success rate < 80%, ≥2 failures)');
  lines.push('');
  if (quickWins.length === 0) {
    lines.push('No actionable patterns found. All (tool, category) combos are above 80% success rate.');
  } else {
    lines.push('| Tool | Category | Failures | Success rate |');
    lines.push('|------|----------|----------:|-------------|');
    for (const r of quickWins) {
      lines.push(`| ${pad(r.tool, 30)} | ${pad(r.category, 22)} | ${pad(r.failures, 9, true)} | ${pad(pct(r.successRate), 12, true)} |`);
    }
  }
  lines.push('');

  return lines.join('\n');
}

function renderJson(data) {
  return JSON.stringify(data, null, 2);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const data = compute();
  if (OUTPUT_JSON) {
    console.log(renderJson(data));
  } else {
    console.log(renderMarkdown(data));
  }
}

main();
