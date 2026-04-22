#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// ─── CLI parsing ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    const [k, v] = a.slice(2).split('=');
    flags[k] = v !== undefined ? v : true;
  } else if (a.startsWith('-')) {
    flags[a.slice(1)] = true;
  }
}

if (flags.help || flags.h) {
  console.log(`Usage: node analyze-savings.mjs [--period=7d|30d|all] [--format=markdown|json] [--project=<path>] [--diagnose] [--help|-h]

  --period   Period to analyze. 7d (default), 30d, all
  --format   Output format. markdown (default), json
  --project  Filter by project path (absolute)
  --diagnose Show leverage diagnosis section
  --help     Show this message`);
  process.exit(0);
}

const PERIOD = flags.period ?? '7d';
const FORMAT = flags.format ?? 'markdown';
const PROJECT_FILTER = flags.project ?? null;
const DIAGNOSE = flags.diagnose === true || flags.diagnose === 'true';
const VALID_PERIODS = ['7d', '30d', 'all'];
if (!VALID_PERIODS.includes(PERIOD)) {
  console.error(`Invalid --period "${PERIOD}". Use: ${VALID_PERIODS.join(', ')}`);
  process.exit(1);
}
if (!['markdown', 'json'].includes(FORMAT)) {
  console.error(`Invalid --format "${FORMAT}". Use: markdown, json`);
  process.exit(1);
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function toDateKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCHours(0, 0, 0, 0);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - jan1) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function periodRange() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let from;
  if (PERIOD === 'all') {
    from = new Date(0);
  } else if (PERIOD === '30d') {
    from = addDays(today, -29);
  } else {
    from = addDays(today, -6);
  }
  return { from, to: today };
}

// ─── Model bucket ────────────────────────────────────────────────────────────

function modelBucket(model) {
  if (!model) return 'other';
  const m = model.toLowerCase();
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'other';
}

// ─── JSONL reading ───────────────────────────────────────────────────────────

function readJsonLines(path) {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  const results = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {}
  }
  return results;
}

// ─── Read Claude transcripts ─────────────────────────────────────────────────

function readClaudeData() {
  const projectsDir = join(homedir(), '.claude', 'projects');
  if (!existsSync(projectsDir)) return [];

  let entries = [];
  let dirs;
  try {
    dirs = readdirSync(projectsDir);
  } catch {
    return [];
  }

  for (const dir of dirs) {
    const dirPath = join(projectsDir, dir);
    if (!existsSync(dirPath)) continue;
    let files;
    try {
      files = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = join(dirPath, file);
      const records = readJsonLines(filePath);
      entries.push(...records);
    }
  }
  return entries;
}

// ─── Read MiniMax log ────────────────────────────────────────────────────────

function readMinimaxData() {
  const path = join(homedir(), '.claude', 'minimax-usage.jsonl');
  if (!existsSync(path)) return [];
  return readJsonLines(path);
}

// ─── Per-model breakdown helpers (used for diagnosis) ─────────────────────────

function newModelBucket() {
  return { inputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, outputTokens: 0, total: 0 };
}

function addToBucket(bucket, input, cacheCreate, cacheRead, output) {
  bucket.inputTokens += input;
  bucket.cacheCreationTokens += cacheCreate;
  bucket.cacheReadTokens += cacheRead;
  bucket.outputTokens += output;
  bucket.total += input + cacheCreate + cacheRead + output;
}

// ─── Process Claude data ─────────────────────────────────────────────────────

function processClaude(rawEntries) {
  const { from, to } = periodRange();
  const fromTs = from.getTime();
  const toTs = to.getTime() + 86400000 - 1;

  const byDate = new Map();
  const byWeek = new Map();
  const byProject = new Map();

  // Per-model breakdowns (for diagnosis)
  const byModelDate = new Map();
  const byModelWeek = new Map();
  const byModelProject = new Map();

  for (const entry of rawEntries) {
    if (entry.type !== 'assistant') continue;
    const usage = entry.message?.usage;
    if (!usage) continue;
    const ts = entry.timestamp;
    if (!ts) continue;
    const date = new Date(ts);
    if (isNaN(date.getTime())) continue;
    const ms = date.getTime();
    if (ms < fromTs || ms > toTs) continue;

    const dateKey = toDateKey(date);
    const weekKey = isoWeekKey(date);
    const bucket = modelBucket(entry.message?.model);
    const cwd = entry.cwd ?? null;

    const inputTokens = usage.input_tokens ?? 0;
    const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
    const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    const totalTokens = inputTokens + cacheCreationTokens + cacheReadTokens + outputTokens;

    if (totalTokens === 0) continue;

    const includeEntry = !PROJECT_FILTER || cwd === PROJECT_FILTER;
    if (!includeEntry) continue;

    // Daily aggregates (existing, unchanged)
    if (!byDate.has(dateKey)) byDate.set(dateKey, { opus: 0, sonnet: 0, haiku: 0, other: 0, total: 0 });
    const dayEntry = byDate.get(dateKey);
    dayEntry[bucket] += totalTokens;
    dayEntry.total += totalTokens;

    // Weekly aggregates (existing, unchanged)
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, { opus: 0, sonnet: 0, haiku: 0, other: 0, total: 0 });
    const weekEntry = byWeek.get(weekKey);
    weekEntry[bucket] += totalTokens;
    weekEntry.total += totalTokens;

    // Project aggregates (existing, unchanged)
    if (cwd && !PROJECT_FILTER) {
      if (!byProject.has(cwd)) byProject.set(cwd, { opus: 0, sonnet: 0, haiku: 0, other: 0, total: 0 });
      const pEntry = byProject.get(cwd);
      pEntry[bucket] += totalTokens;
      pEntry.total += totalTokens;
    }

    // ─── Per-model breakdowns (diagnosis) ───────────────────────────────────
    // Daily breakdown by model
    if (!byModelDate.has(dateKey)) byModelDate.set(dateKey, { opus: newModelBucket(), sonnet: newModelBucket(), haiku: newModelBucket(), other: newModelBucket() });
    addToBucket(byModelDate.get(dateKey)[bucket], inputTokens, cacheCreationTokens, cacheReadTokens, outputTokens);

    // Weekly breakdown by model
    if (!byModelWeek.has(weekKey)) byModelWeek.set(weekKey, { opus: newModelBucket(), sonnet: newModelBucket(), haiku: newModelBucket(), other: newModelBucket() });
    addToBucket(byModelWeek.get(weekKey)[bucket], inputTokens, cacheCreationTokens, cacheReadTokens, outputTokens);

    // Project breakdown by model
    if (cwd && !PROJECT_FILTER) {
      if (!byModelProject.has(cwd)) byModelProject.set(cwd, { opus: newModelBucket(), sonnet: newModelBucket(), haiku: newModelBucket(), other: newModelBucket() });
      addToBucket(byModelProject.get(cwd)[bucket], inputTokens, cacheCreationTokens, cacheReadTokens, outputTokens);
    }
  }

  return { byDate, byWeek, byProject, byModelDate, byModelWeek, byModelProject };
}

// ─── Process MiniMax data ────────────────────────────────────────────────────

function processMinimax(rawEntries) {
  const { from, to } = periodRange();
  const fromTs = from.getTime();
  const toTs = to.getTime() + 86400000 - 1;

  // Dedup: sessionId -> best (prefer entries that have tokensOffloaded; tie-break by latest date)
  const sessionMap = new Map();
  for (const entry of rawEntries) {
    const sid = entry.sessionId;
    if (!sid) continue;
    const existing = sessionMap.get(sid);
    const entryTs = new Date(entry.date).getTime();
    const entryHasOffload = entry.tokensOffloaded !== undefined && entry.tokensOffloaded !== null;
    if (!existing) {
      sessionMap.set(sid, { ...entry, _ts: entryTs });
      continue;
    }
    const existingHasOffload = existing.tokensOffloaded !== undefined && existing.tokensOffloaded !== null;
    // Measured beats estimated regardless of date; among same class, latest wins
    if (entryHasOffload && !existingHasOffload) {
      sessionMap.set(sid, { ...entry, _ts: entryTs });
    } else if (entryHasOffload === existingHasOffload && entryTs > existing._ts) {
      sessionMap.set(sid, { ...entry, _ts: entryTs });
    }
  }

  const byDate = new Map();
  const byWeek = new Map();
  const byProject = new Map();
  let estimatedCount = 0;
  let measuredCount = 0;

  for (const entry of sessionMap.values()) {
    if (!entry.date) continue;
    const date = new Date(entry.date);
    if (isNaN(date.getTime())) continue;
    const ms = date.getTime();
    if (ms < fromTs || ms > toTs) continue;

    const dateKey = toDateKey(date);
    const weekKey = isoWeekKey(date);
    const project = entry.project ?? null;

    const includeEntry = !PROJECT_FILTER || project === PROJECT_FILTER;
    if (!includeEntry) continue;

    const hasOffloaded = entry.tokensOffloaded !== undefined && entry.tokensOffloaded !== null;
    const offloaded = hasOffloaded
      ? Number(entry.tokensOffloaded)
      : Number(entry.calls ?? 0) * 8000;

    if (hasOffloaded) measuredCount++;
    else estimatedCount++;

    const cost = Number(entry.cost ?? 0);
    const calls = Number(entry.calls ?? 0);

    // Daily
    if (!byDate.has(dateKey)) byDate.set(dateKey, { tokens: 0, cost: 0, calls: 0 });
    const dayEntry = byDate.get(dateKey);
    dayEntry.tokens += offloaded;
    dayEntry.cost += cost;
    dayEntry.calls += calls;

    // Weekly
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, { tokens: 0, cost: 0, calls: 0 });
    const weekEntry = byWeek.get(weekKey);
    weekEntry.tokens += offloaded;
    weekEntry.cost += cost;
    weekEntry.calls += calls;

    // Project
    if (project && !PROJECT_FILTER) {
      if (!byProject.has(project)) byProject.set(project, { tokens: 0, cost: 0, calls: 0 });
      const pEntry = byProject.get(project);
      pEntry.tokens += offloaded;
      pEntry.cost += cost;
      pEntry.calls += calls;
    }
  }

  return { byDate, byWeek, byProject, estimatedCount, measuredCount };
}

// ─── Diagnosis computation ───────────────────────────────────────────────────

const PRICING = {
  opus:   { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  sonnet: { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  haiku:  { input:  0.80, output:  4.00, cacheRead: 0.08,  cacheWrite:  1.00 },
  other:  { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
};

function spendFor(modelBucket, breakdown) {
  const p = PRICING[modelBucket] ?? PRICING.other;
  return (
    breakdown.inputTokens * p.input +
    breakdown.outputTokens * p.output +
    breakdown.cacheReadTokens * p.cacheRead +
    breakdown.cacheCreationTokens * p.cacheWrite
  ) / 1_000_000;
}

function buildDiagnosis(report, claudeData) {
  // Aggregate period-level per-model breakdowns
  const periodModelBreakdown = { opus: newModelBucket(), sonnet: newModelBucket(), haiku: newModelBucket(), other: newModelBucket() };
  for (const row of report.daily) {
    for (const model of ['opus', 'sonnet', 'haiku', 'other']) {
      const fromByModel = claudeData.byModelDate;
      // We need to accumulate from all daily byModelDate entries
    }
  }
  // Actually aggregate by summing all days' breakdowns
  const allDates = new Set([...claudeData.byModelDate.keys()]);
  for (const dateKey of allDates) {
    const models = claudeData.byModelDate.get(dateKey);
    if (!models) continue;
    for (const model of ['opus', 'sonnet', 'haiku', 'other']) {
      const src = models[model];
      const dst = periodModelBreakdown[model];
      addToBucket(dst, src.inputTokens, src.cacheCreationTokens, src.cacheReadTokens, src.outputTokens);
    }
  }

  // Compute total Claude spend and per-model spend
  const totalClaudeSpend = ['opus', 'sonnet', 'haiku', 'other'].reduce((sum, m) => sum + spendFor(m, periodModelBreakdown[m]), 0);
  const perModelSpend = {};
  for (const model of ['opus', 'sonnet', 'haiku', 'other']) {
    perModelSpend[model] = spendFor(model, periodModelBreakdown[model]);
  }

  // Per-project model dominance (top 10 by total tokens)
  const projectModelRows = [];
  const allProjects = [...claudeData.byModelProject.keys()];
  for (const proj of allProjects) {
    const models = claudeData.byModelProject.get(proj);
    if (!models) continue;
    const total = ['opus', 'sonnet', 'haiku', 'other'].reduce((s, m) => s + models[m].total, 0);
    if (total === 0) continue;
    // Compute cache_read tokens (sum across all models)
    const totalCacheRead = ['opus', 'sonnet', 'haiku', 'other'].reduce((s, m) => s + models[m].cacheReadTokens, 0);
    projectModelRows.push({
      project: proj,
      total,
      opusPct: (models.opus.total / total) * 100,
      sonnetPct: (models.sonnet.total / total) * 100,
      haikuPct: (models.haiku.total / total) * 100,
      cacheReadPct: (totalCacheRead / total) * 100,
    });
  }
  projectModelRows.sort((a, b) => b.total - a.total);
  const topProjects = projectModelRows.slice(0, 10);

  // ─── Scenario calculations ───────────────────────────────────────────────

  const opus = periodModelBreakdown.opus;
  const opusTotal = opus.total;
  const opusInputSide = opus.inputTokens + opus.cacheCreationTokens + opus.cacheReadTokens;

  // Scenario A: 30% Opus tokens → Sonnet
  const opusSpend = spendFor('opus', opus);
  const sonnetEquivSpend = spendFor('sonnet', opus);
  const scenarioA_Tokens = Math.round(opusTotal * 0.30);
  const scenarioA_Savings = (opusSpend - sonnetEquivSpend) * 0.30;

  // Scenario B: Opus cache_read ratio → 80%
  const opusCacheReadRatio = opusInputSide > 0 ? opus.cacheReadTokens / opusInputSide : 0;
  let scenarioB_Savings = 0;
  let scenarioB_Tokens = 0;
  let scenarioB_Description = `If cache_read ratio of Opus reaches 80% (currently ${(opusCacheReadRatio * 100).toFixed(1)}%)`;
  if (opusCacheReadRatio < 0.80 && opusInputSide > 0) {
    const targetCacheRead = opusInputSide * 0.80;
    const extraCacheRead = targetCacheRead - opus.cacheReadTokens;
    scenarioB_Tokens = Math.round(extraCacheRead);
    // Simulate new breakdown: shift extraCacheRead proportionally from input + cacheCreation
    const totalInputSideBefore = opusInputSide;
    const inputFrac = totalInputSideBefore > 0 ? opus.inputTokens / totalInputSideBefore : 0;
    const cacheCreateFrac = totalInputSideBefore > 0 ? opus.cacheCreationTokens / totalInputSideBefore : 0;
    const shiftFromInput = extraCacheRead * inputFrac;
    const shiftFromCacheCreate = extraCacheRead * cacheCreateFrac;
    const newBreakdown = {
      inputTokens: opus.inputTokens - shiftFromInput,
      cacheCreationTokens: opus.cacheCreationTokens - shiftFromCacheCreate,
      cacheReadTokens: opus.cacheReadTokens + extraCacheRead,
      outputTokens: opus.outputTokens,
    };
    const newSpend = spendFor('opus', newBreakdown);
    scenarioB_Savings = opusSpend - newSpend;
  }

  // Scenario C: MiniMax baseline
  const scenarioC_Tokens = report.summary.minimaxTokensOffloaded;
  // Conservative floor: Sonnen input rate × equivalent calls
  const scenarioC_Savings = report.summary.equivalentSonnetCalls * 8000 / 1_000_000 * PRICING.sonnet.input;

  const scenarioRows = [
    {
      label: 'A',
      description: `If 30% of Opus tokens → Sonnet`,
      tokenImpact: scenarioA_Tokens.toLocaleString('en-US'),
      savings: scenarioA_Savings,
      pctOfCurrentSpend: totalClaudeSpend > 0 ? (scenarioA_Savings / totalClaudeSpend) * 100 : 0,
    },
    {
      label: 'B',
      description: scenarioB_Description,
      tokenImpact: scenarioB_Tokens.toLocaleString('en-US'),
      savings: scenarioB_Savings,
      pctOfCurrentSpend: totalClaudeSpend > 0 ? (scenarioB_Savings / totalClaudeSpend) * 100 : 0,
    },
    {
      label: 'C',
      description: 'Current MiniMax offload (baseline)',
      tokenImpact: scenarioC_Tokens.toLocaleString('en-US'),
      savings: scenarioC_Savings,
      pctOfCurrentSpend: totalClaudeSpend > 0 ? (scenarioC_Savings / totalClaudeSpend) * 100 : 0,
    },
  ];

  // Sort scenarios by savings descending for recommendations
  const sortedScenarios = [...scenarioRows].sort((a, b) => b.savings - a.savings);

  return {
    totalClaudeSpend,
    perModelSpend,
    periodModelBreakdown,
    topProjects,
    scenarios: scenarioRows,
    sortedScenarios,
    opusCacheReadRatio,
    scenarioA_Tokens,
    scenarioB_Tokens,
  };
}

// ─── Aggregate ───────────────────────────────────────────────────────────────

function buildReport(claudeData, minimaxData) {
  const { from, to } = periodRange();
  const allDays = new Set([...claudeData.byDate.keys(), ...minimaxData.byDate.keys()]);
  const sortedDays = [...allDays].sort();

  const dailyRows = [];
  for (const dateKey of sortedDays) {
    const c = claudeData.byDate.get(dateKey) ?? { opus: 0, sonnet: 0, haiku: 0, other: 0, total: 0 };
    const m = minimaxData.byDate.get(dateKey) ?? { tokens: 0, cost: 0, calls: 0 };
    const totalClaude = c.total;
    const totalOffload = m.tokens;
    const ratio = totalClaude + totalOffload > 0
      ? (totalOffload / (totalOffload + totalClaude)) * 100
      : 0;
    dailyRows.push({ date: dateKey, claude: c, minimax: m, ratio });
  }

  const allWeeks = new Set([...claudeData.byWeek.keys(), ...minimaxData.byWeek.keys()]);
  const sortedWeeks = [...allWeeks].sort();
  const weeklyRows = [];
  for (const weekKey of sortedWeeks) {
    const c = claudeData.byWeek.get(weekKey) ?? { opus: 0, sonnet: 0, haiku: 0, other: 0, total: 0 };
    const m = minimaxData.byWeek.get(weekKey) ?? { tokens: 0, cost: 0, calls: 0 };
    const totalClaude = c.total;
    const totalOffload = m.tokens;
    const ratio = totalClaude + totalOffload > 0
      ? (totalOffload / (totalOffload + totalClaude)) * 100
      : 0;
    weeklyRows.push({ week: weekKey, claude: c, minimax: m, ratio });
  }

  // Summary
  let totalClaude = 0;
  let totalOpus = 0;
  let totalSonnet = 0;
  let totalHaiku = 0;
  let totalOther = 0;
  let totalMinimaxTokens = 0;
  let totalMinimaxCost = 0;
  let totalMinimaxCalls = 0;
  let totalSessions = 0;

  for (const r of dailyRows) {
    totalClaude += r.claude.total;
    totalOpus += r.claude.opus;
    totalSonnet += r.claude.sonnet;
    totalHaiku += r.claude.haiku;
    totalOther += r.claude.other;
    totalMinimaxTokens += r.minimax.tokens;
    totalMinimaxCost += r.minimax.cost;
    totalMinimaxCalls += r.minimax.calls;
  }

  // Count unique sessions
  const sessionSet = new Set();
  for (const r of dailyRows) {
    if (r.minimax.calls > 0) sessionSet.add(r.date);
  }
  // Sessions approximated by daily entries with minimax activity
  totalSessions = dailyRows.filter(r => r.minimax.calls > 0).length;

  const offloadRatio = totalClaude + totalMinimaxTokens > 0
    ? (totalMinimaxTokens / (totalMinimaxTokens + totalClaude)) * 100
    : 0;

  // Equivalent Sonnet calls avoided: use MiniMax savings-calculator convention (8000 tokens/call default)
  const AVG_TOKENS_PER_CALL = 8000;
  const equivSonnet = totalMinimaxTokens / AVG_TOKENS_PER_CALL;

  // Projects
  const projectEntries = [];
  for (const [proj, c] of claudeData.byProject) {
    const m = minimaxData.byProject.get(proj) ?? { tokens: 0, cost: 0, calls: 0 };
    projectEntries.push({ project: proj, claudeTokens: c.total, minimaxCalls: m.calls, minimaxCost: m.cost });
  }
  projectEntries.sort((a, b) => b.claudeTokens - a.claudeTokens);
  const topProjects = projectEntries.slice(0, 10);

  return {
    period: {
      label: PERIOD === 'all' ? 'all time' : `last ${PERIOD}`,
      from: toDateKey(from),
      to: toDateKey(to),
    },
    projectFilter: PROJECT_FILTER,
    summary: {
      claudeTokens: { opus: totalOpus, sonnet: totalSonnet, haiku: totalHaiku, other: totalOther, total: totalClaude },
      minimaxTokensOffloaded: totalMinimaxTokens,
      minimaxOffloadEstimatedCount: minimaxData.estimatedCount,
      minimaxOffloadMeasuredCount: minimaxData.measuredCount,
      offloadRatio,
      minimaxCost: totalMinimaxCost,
      equivalentSonnetCalls: equivSonnet,
      minimaxSessions: totalSessions,
    },
    daily: dailyRows.map(r => ({
      date: r.date,
      claudeTokens: r.claude,
      minimaxTokensOffloaded: r.minimax.tokens,
      minimaxCost: r.minimax.cost,
      offloadRatio: r.ratio,
    })),
    weekly: weeklyRows.map(r => ({
      week: r.week,
      claudeTokens: r.claude,
      minimaxTokensOffloaded: r.minimax.tokens,
      minimaxCost: r.minimax.cost,
      offloadRatio: r.ratio,
    })),
    projects: topProjects,
  };
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function fmt(n) {
  return n === 0 ? '0' : n.toLocaleString('en-US');
}
function fmtCost(n) {
  return n === 0 ? '$0' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
function fmtMoney(n) {
  return n === 0 ? '$0.00' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtRatio(n) {
  return n.toFixed(2) + '%';
}

function renderMarkdown(report) {
  const { period, projectFilter, summary } = report;
  const from = period.from;
  const to = period.to;
  const pLabel = period.label;

  let lines = [];
  lines.push('# MiniMax vs Claude Savings Report');
  lines.push('');
  lines.push(`Period: ${pLabel} (${from} → ${to})`);
  lines.push(`Project filter: ${projectFilter ? projectFilter : '(all)'}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Claude tokens consumed: ${fmt(summary.claudeTokens.total)}`);
  const t = summary.claudeTokens.total || 1;
  lines.push(`  - opus: ${fmt(summary.claudeTokens.opus)} (${((summary.claudeTokens.opus / t) * 100).toFixed(1)}%)`);
  lines.push(`  - sonnet: ${fmt(summary.claudeTokens.sonnet)} (${((summary.claudeTokens.sonnet / t) * 100).toFixed(1)}%)`);
  lines.push(`  - haiku: ${fmt(summary.claudeTokens.haiku)} (${((summary.claudeTokens.haiku / t) * 100).toFixed(1)}%)`);
  lines.push(`  - other: ${fmt(summary.claudeTokens.other)} (${((summary.claudeTokens.other / t) * 100).toFixed(1)}%)`);
  lines.push(`- MiniMax tokens offloaded: ${fmt(summary.minimaxTokensOffloaded)} (estimated ${summary.minimaxOffloadEstimatedCount} / measured ${summary.minimaxOffloadMeasuredCount})`);
  lines.push(`- Offload ratio: ${fmtRatio(summary.offloadRatio)}`);
  lines.push(`- MiniMax cost: ${fmtCost(summary.minimaxCost)}`);
  lines.push(`- Equivalent Sonnet calls avoided: ${summary.equivalentSonnetCalls.toFixed(1)}`);
  lines.push(`- MiniMax sessions in period: ${summary.minimaxSessions}`);
  lines.push('');
  lines.push('## Daily breakdown');
  lines.push('');
  lines.push('| Date       | Claude tokens | MiniMax offloaded | Ratio  | MiniMax $ |');
  lines.push('|------------|--------------:|------------------:|-------:|----------:|');
  for (const row of report.daily) {
    lines.push(`| ${row.date} | ${fmt(row.claudeTokens.total).padStart(13)} | ${fmt(row.minimaxTokensOffloaded).padStart(17)} | ${fmtRatio(row.offloadRatio).padStart(6)} | ${fmtCost(row.minimaxCost).padStart(9)} |`);
  }
  lines.push('');
  lines.push('## Weekly breakdown');
  lines.push('');
  lines.push('| Week      | Claude tokens | MiniMax offloaded | Ratio  | MiniMax $ |');
  lines.push('|-----------|--------------:|------------------:|-------:|----------:|');
  for (const row of report.weekly) {
    lines.push(`| ${row.week} | ${fmt(row.claudeTokens.total).padStart(13)} | ${fmt(row.minimaxTokensOffloaded).padStart(17)} | ${fmtRatio(row.offloadRatio).padStart(6)} | ${fmtCost(row.minimaxCost).padStart(9)} |`);
  }
  lines.push('');
  if (report.projects.length > 0) {
    lines.push('## Projects (top 10 by Claude tokens)');
    lines.push('');
    lines.push('| Project                       | Claude tokens | MiniMax calls | MiniMax $ |');
    lines.push('|-------------------------------|--------------:|--------------:|----------:|');
    for (const p of report.projects) {
      lines.push(`| ${(p.project || '(unknown)').substring(0, 28).padEnd(29)} | ${fmt(p.claudeTokens).padStart(13)} | ${fmt(p.minimaxCalls).padStart(13)} | ${fmtCost(p.minimaxCost).padStart(9)} |`);
    }
    lines.push('');
  }

  // Interpretation
  let interp;
  if (summary.offloadRatio > 5) interp = 'Offload ratio > 5%: 明顯節省，維持現行 rule #1';
  else if (summary.offloadRatio >= 1) interp = 'Offload ratio 1–5%: 中度利用，可檢視 rule #6 是否涵蓋更多場景';
  else interp = 'Offload ratio < 1%: MiniMax 未充分利用，考慮放寬 rule #1 門檻（降低 5+ files 限制）';

  lines.push('## 解讀');
  lines.push('');
  lines.push(`- ${interp}`);

  // ─── Diagnosis section (only when --diagnose) ──────────────────────────────
  if (DIAGNOSE && report._diagnosis) {
    const diag = report._diagnosis;
    lines.push('');
    lines.push('## 🔍 Leverage Diagnosis');
    lines.push('');
    lines.push('### Per-model token composition (period totals)');
    lines.push('');
    lines.push('| Model  | Total | Input | Cache create | Cache read | Output | Cache read % | Output % |');
    lines.push('|--------|------:|------:|-------------:|-----------:|-------:|-------------:|---------:|');
    const MODELS = ['opus', 'sonnet', 'haiku', 'other'];
    const modelLabels = { opus: 'opus', sonnet: 'sonnet', haiku: 'haiku', other: 'other' };
    for (const model of MODELS) {
      const b = diag.periodModelBreakdown[model];
      const total = b.total || 1;
      const cacheReadPct = (b.cacheReadTokens / total * 100).toFixed(1) + '%';
      const outputPct = (b.outputTokens / total * 100).toFixed(1) + '%';
      lines.push(`| ${model.padEnd(7)} | ${fmt(b.total).padStart(6)} | ${fmt(b.inputTokens).padStart(5)} | ${fmt(b.cacheCreationTokens).padStart(11)} | ${fmt(b.cacheReadTokens).padStart(9)} | ${fmt(b.outputTokens).padStart(6)} | ${cacheReadPct.padStart(11)} | ${outputPct.padStart(8)} |`);
    }
    lines.push('');
    lines.push('### Per-project model dominance (top 10 by total tokens)');
    lines.push('');
    lines.push('| Project | Total | Opus % | Sonnet % | Haiku % | Cache read % |');
    lines.push('|--------|------:|-------:|---------:|--------:|-------------:|');
    for (const p of diag.topProjects) {
      lines.push(`| ${(p.project || '(unknown)').substring(0, 50).padEnd(50)} | ${fmt(p.total).padStart(6)} | ${p.opusPct.toFixed(1).padStart(6)}% | ${p.sonnetPct.toFixed(1).padStart(8)}% | ${p.haikuPct.toFixed(1).padStart(7)}% | ${p.cacheReadPct.toFixed(1).padStart(11)}% |`);
    }
    lines.push('');
    lines.push('### Leverage scenarios (estimated USD savings vs current spend)');
    lines.push('');
    lines.push('Pricing assumptions (per million tokens, Claude API list price):');
    lines.push('- Opus 4.x:   input $15.00, output $75.00, cache_read $1.50,  cache_write $18.75');
    lines.push('- Sonnet 4.x: input $3.00,  output $15.00, cache_read $0.30,  cache_write $3.75');
    lines.push('- Haiku 4.x:  input $0.80,  output $4.00,  cache_read $0.08,  cache_write $1.00');
    lines.push('');
    const totalSpend = diag.totalClaudeSpend;
    lines.push(`Current Claude spend (estimated): ${fmtMoney(totalSpend)}`);
    for (const model of MODELS) {
      const s = diag.perModelSpend[model];
      const pct = totalSpend > 0 ? (s / totalSpend) * 100 : 0;
      lines.push(`- ${model.padEnd(7)} ${fmtMoney(s)} (${pct.toFixed(1)}%)`);
    }
    lines.push('');
    lines.push('| Scenario | Description | Token impact | $ saved | % of current spend |');
    lines.push('|----------|-------------|-------------:|--------:|-------------------:|');
    // Use A then B then C ordering as specified in the template
    const orderedScenarios = ['A', 'B', 'C'];
    const scenarioMap = {};
    for (const s of diag.scenarios) scenarioMap[s.label] = s;
    for (const label of orderedScenarios) {
      const s = scenarioMap[label];
      if (!s) continue;
      lines.push(`| ${label} | ${s.description} | ${s.tokenImpact.padStart(11)} | ${fmtMoney(s.savings).padStart(9)} | ${s.pctOfCurrentSpend.toFixed(1).padStart(15)}% |`);
    }
    lines.push('');
    lines.push('### 槓桿排序與建議');
    for (let i = 0; i < diag.sortedScenarios.length; i++) {
      const s = diag.sortedScenarios[i];
      const rec = s.label === 'A'
        ? 'Migrate non-reasoning Opus tasks (boilerplate, file reads, simple edits) to Sonnet — biggest single lever.'
        : s.label === 'B'
          ? (s.savings > 0
              ? 'Restructure prompts so cacheable context (system prompts, codebase summaries) sits at the top to lift cache_read ratio.'
              : 'Already at or above 80% cache_read — no action needed.')
          : 'Current MiniMax offload — keep observing v1.3.8 rule #1 calibration; expand scope only if A and B are exhausted.';
      const pct = s.pctOfCurrentSpend;
      lines.push(`${i + 1}. Scenario ${s.label} (${fmtMoney(s.savings)} saved, ${pct.toFixed(1)}% of spend) — ${rec}`);
    }
  }

  return lines.join('\n');
}

// ─── JSON renderer ───────────────────────────────────────────────────────────

function renderJson(report) {
  // Convert numbers to plain values (JSON.stringify handles it)
  const out = JSON.parse(JSON.stringify(report));
  // Round off some fields
  out.summary.equivalentSonnetCalls = Math.round(out.summary.equivalentSonnetCalls * 10) / 10;
  out.summary.offloadRatio = Math.round(out.summary.offloadRatio * 100) / 100;
  for (const row of out.daily) {
    row.offloadRatio = Math.round(row.offloadRatio * 100) / 100;
  }
  for (const row of out.weekly) {
    row.offloadRatio = Math.round(row.offloadRatio * 100) / 100;
  }
  // Include diagnosis in JSON when --diagnose
  if (DIAGNOSE && report._diagnosis) {
    const diag = report._diagnosis;
    out.diagnosis = {
      claudeSpend: {
        total: Math.round(diag.totalClaudeSpend * 100) / 100,
        opus: Math.round((diag.perModelSpend.opus ?? 0) * 100) / 100,
        sonnet: Math.round((diag.perModelSpend.sonnet ?? 0) * 100) / 100,
        haiku: Math.round((diag.perModelSpend.haiku ?? 0) * 100) / 100,
        other: Math.round((diag.perModelSpend.other ?? 0) * 100) / 100,
      },
      perModel: ['opus', 'sonnet', 'haiku', 'other'].map(model => {
        const b = diag.periodModelBreakdown[model];
        return {
          model,
          totalTokens: b.total,
          inputTokens: b.inputTokens,
          cacheCreationTokens: b.cacheCreationTokens,
          cacheReadTokens: b.cacheReadTokens,
          outputTokens: b.outputTokens,
        };
      }),
      perProject: diag.topProjects,
      scenarios: diag.scenarios.map(s => ({
        id: s.label,
        description: s.description,
        tokenImpact: s.tokenImpact,
        dollarsSaved: Math.round(s.savings * 100) / 100,
        pctOfSpend: Math.round(s.pctOfCurrentSpend * 10) / 10,
      })),
    };
  }
  return JSON.stringify(out, null, 2);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const claudeRaw = readClaudeData();
  const minimaxRaw = readMinimaxData();

  const claudeData = processClaude(claudeRaw);
  const minimaxData = processMinimax(minimaxRaw);

  const report = buildReport(claudeData, minimaxData);

  // Compute diagnosis data if --diagnose
  if (DIAGNOSE) {
    report._diagnosis = buildDiagnosis(report, claudeData);
  }

  if (FORMAT === 'json') {
    console.log(renderJson(report));
  } else {
    console.log(renderMarkdown(report));
  }
}

main();
