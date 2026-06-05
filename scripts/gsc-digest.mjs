```javascript
#!/usr/bin/env node
/**
 * GSC Digest Script
 * Fetches Google Search Console data and generates an editorial planning digest.
 * Usage: node scripts/gsc-digest.mjs [--site sc-domain:example.com] [--days 7] [--output-dir .gsc-digest]
 */

import { google } from 'googleapis';
import { writeFile, mkdir, access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ============ CLI Argument Parsing ============

const DEFAULT_SITE = 'sc-domain:teamtaiwan.jp';
const DEFAULT_DAYS = 7;
const DEFAULT_OUTPUT_DIR = '.gsc-digest';

function parseArgs() {
  const args = {
    site: DEFAULT_SITE,
    days: DEFAULT_DAYS,
    outputDir: DEFAULT_OUTPUT_DIR,
    help: false,
  };

  const argv = process.argv.slice(2);
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
      i++;
    } else if (arg === '--site' && i + 1 < argv.length) {
      args.site = argv[++i];
      i++;
    } else if (arg === '--days' && i + 1 < argv.length) {
      args.days = parseInt(argv[++i], 10);
      i++;
    } else if (arg === '--output-dir' && i + 1 < argv.length) {
      args.outputDir = argv[++i];
      i++;
    } else {
      console.error(`Unknown argument: ${arg}`);
      args.help = true;
      break;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
GSC Digest - Editorial Planning Helper

Usage:
  node scripts/gsc-digest.mjs [options]

Options:
  --site <url>        GSC site URL (default: ${DEFAULT_SITE})
  --days <n>          Number of days to analyze (default: ${DEFAULT_DAYS})
  --output-dir <dir>  Output directory (default: ${DEFAULT_OUTPUT_DIR})
  --help, -h          Show this help message

Example:
  node scripts/gsc-digest.mjs --days 14
`);
}

// ============ Date Utilities ============

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function getDateRange(days) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - days + 1);
  const prevStart = new Date(start);
  prevStart.setDate(prevStart.getDate() - days);
  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  return { start, end, prevStart, prevEnd };
}

// ============ GSC Data Fetching ============

async function authenticate() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  });
  return google.searchconsole({ version: 'v1', auth });
}

async function fetchSearchAnalytics(client, siteUrl, startDate, endDate, dimensions, rowLimit = 1000) {
  const response = await client.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
      dimensions,
      rowLimit,
      aggregationType: 'byPage',
    },
  });
  return response.data.rows || [];
}

async function fetchAllData(client, siteUrl, range) {
  console.error('📡 Fetching GSC data...');

  const [thisWeekRows, prevWeekRows, pageRows] = await Promise.all([
    fetchSearchAnalytics(client, siteUrl, range.start, range.end, ['query']),
    fetchSearchAnalytics(client, siteUrl, range.prevStart, range.prevEnd, ['query']),
    fetchSearchAnalytics(client, siteUrl, range.start, range.end, ['page']),
  ]);

  console.error(`   This week: ${thisWeekRows.length} query rows`);
  console.error(`   Previous week: ${prevWeekRows.length} query rows`);
  console.error(`   Pages: ${pageRows.length} page rows`);

  return { thisWeekRows, prevWeekRows, pageRows };
}

function rowsToMap(rows, keyExtractor) {
  const map = new Map();
  for (const row of rows) {
    const key = keyExtractor(row);
    if (key) map.set(key, row);
  }
  return map;
}

// ============ Analysis Functions ============

function calculateTotals(rows) {
  let clicks = 0, impressions = 0, positionWeighted = 0;
  for (const row of rows) {
    clicks += row.clicks || 0;
    impressions += row.impressions || 0;
    positionWeighted += (row.position || 0) * (row.impressions || 0);
  }
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const avgPosition = impressions > 0 ? positionWeighted / impressions : 0;
  return { clicks, impressions, ctr, avgPosition };
}

function analyzeOpportunities(thisWeekRows, prevWeekMap) {
  const rewriteTitles = [];
  const pushToTop3 = [];
  const newQueries = [];

  const thisWeekSet = new Set();

  for (const row of thisWeekRows) {
    const query = row.keys[0];
    const impressions = row.impressions || 0;
    const ctr = row.ctr || 0;
    const position = row.position || 0;

    thisWeekSet.add(query);
    const prevRow = prevWeekMap.get(query);

    // Category a: High impressions, low CTR
    if (impressions >= 50 && ctr < 0.02) {
      rewriteTitles.push({ query, impressions, clicks: row.clicks, ctr, position });
    }

    // Category b: Position 5-15, decent impressions
    if (position >= 5 && position <= 15 && impressions >= 30) {
      pushToTop3.push({ query, impressions, position });
    }

    // Category c: New this week (not in previous week)
    if (!prevRow && impressions >= 10) {
      newQueries.push({ query, impressions, position });
    }
  }

  // Sort each category
  rewriteTitles.sort((a, b) => b.impressions - a.impressions);
  pushToTop3.sort((a, b) => a.position - b.position);
  newQueries.sort((a, b) => b.impressions - a.impressions);

  return {
    rewriteTitles: rewriteTitles.slice(0, 15),
    pushToTop3: pushToTop3.slice(0, 15),
    newQueries: newQueries.slice(0, 10),
  };
}

function analyzeDeclines(thisWeekRows, prevWeekMap) {
  const declines = [];

  for (const row of thisWeekRows) {
    const query = row.keys[0];
    const currentImpressions = row.impressions || 0;
    const prevRow = prevWeekMap.get(query);

    if (currentImpressions >= 30 && prevRow) {
      const prevImpressions = prevRow.impressions || 0;
      if (prevImpressions > 0) {
        const delta = (currentImpressions - prevImpressions) / prevImpressions;
        if (delta <= -0.3) {
          declines.push({
            query,
            current: currentImpressions,
            previous: prevImpressions,
            delta,
          });
        }
      }
    }
  }

  declines.sort((a, b) => a.delta - b.delta);
  return declines.slice(0, 10);
}

// ============ Output Formatting ============

function formatPercent(value) {
  return (value * 100).toFixed(2) + '%';
}

function formatDelta(value, isPercent = true) {
  const sign = value >= 0 ? '+' : '';
  if (isPercent) {
    return sign + (value * 100).toFixed(1) + '%';
  }
  return sign + value.toFixed(2);
}

function formatMarkdown(data) {
  const {
    range, site, summary, opportunities,
    topPages, topQueries, declines
  } = data;

  const fmt = (v) => v === 0 || v === '0' ? '—' : v.toString();

  let md = `# GSC Digest — ${formatDate(range.end)}\n\n`;
  md += `**資料區間**：${formatDate(range.start)} ~ ${formatDate(range.end)}（近 ${range.days} 天）\n`;
  md += `**Property**：${site}\n\n`;

  // Summary section
  md += `## 📊 本週總覽\n\n`;
  md += `| 指標 | 本週 | 前週 | 變化 |\n`;
  md += `|------|------|------|------|\n`;
  md += `| 點擊 | ${summary.current.clicks.toLocaleString()} | ${summary.previous.clicks.toLocaleString()} | ${formatDelta(summary.delta.clicks)} |\n`;
  md += `| 曝光 | ${summary.current.impressions.toLocaleString()} | ${summary.previous.impressions.toLocaleString()} | ${formatDelta(summary.delta.impressions)} |\n`;
  md += `| CTR | ${formatPercent(summary.current.ctr)} | ${formatPercent(summary.previous.ctr)} | ${formatDelta(summary.delta.ctrPp, false)}pp |\n`;
  md += `| 平均排名 | ${summary.current.avgPosition.toFixed(1)} | ${summary.previous.avgPosition.toFixed(1)} | ${formatDelta(summary.delta.position)} |\n\n`;

  // Opportunities section
  md += `## 🎯 編輯會議選題建議\n\n`;

  // Subcategory 1
  md += `### 1. 改標題候選（高曝光、低 CTR）\n\n`;
  if (opportunities.rewriteTitles.length > 0) {
    md += `| 關鍵字 | 曝光 | CTR | 排名 | 建議 |\n`;
    md += `|--------|------|-----|------|------|\n`;
    for (const item of opportunities.rewriteTitles) {
      md += `| ${item.query} | ${item.impressions.toLocaleString()} | ${formatPercent(item.ctr)} | ${item.position.toFixed(1)} | 標題重寫、加入此關鍵字 |\n`;
    }
  } else {
    md += `無符合條件的關鍵字（需曝光 ≥ 50 且 CTR < 2%）\n`;
  }
  md += `\n`;

  // Subcategory 2
  md += `### 2. 推到 Top 3 候選（排名 5-15）\n\n`;
  if (opportunities.pushToTop3.length > 0) {
    md += `| 關鍵字 | 曝光 | 排名 | 建議 |\n`;
    md += `|--------|------|------|------|\n`;
    for (const item of opportunities.pushToTop3) {
      md += `| ${item.query} | ${item.impressions.toLocaleString()} | ${item.position.toFixed(1)} | 強化內容、增加內部連結 |\n`;
    }
  } else {
    md += `無符合條件的關鍵字（需排名 5-15 且曝光 ≥ 30）\n`;
  }
  md += `\n`;

  // Subcategory 3
  md += `### 3. 新冒出關鍵字（本週新進）\n\n`;
  if (opportunities.newQueries.length > 0) {
    md += `| 關鍵字 | 曝光 | 排名 | 建議 |\n`;
    md += `|--------|------|------|------|\n`;
    for (const item of opportunities.newQueries) {
      md += `| ${item.query} | ${item.impressions.toLocaleString()} | ${item.position.toFixed(1)} | 評估是否值得寫專題 |\n`;
    }
  } else {
    md += `本週無新關鍵字（需本週曝光 ≥ 10 且前週不存在）\n`;
  }
  md += `\n`;

  // Top pages
  md += `## 📄 Top 10 頁面（按點擊）\n\n`;
  if (topPages.length > 0) {
    md += `| 頁面 | 點擊 | 曝光 | CTR | 排名 |\n`;
    md += `|------|------|------|-----|------|\n`;
    for (const page of topPages) {
      md += `| ${page.page} | ${page.clicks.toLocaleString()} | ${page.impressions.toLocaleString()} | ${formatPercent(page.ctr)} | ${page.position.toFixed(1)} |\n`;
    }
  } else {
    md += `本週無任何曝光資料\n`;
  }
  md += `\n`;

  // Top queries
  md += `## 🔍 Top 20 關鍵字（按曝光）\n\n`;
  if (topQueries.length > 0) {
    md += `| 關鍵字 | 點擊 | 曝光 | CTR | 排名 | WoW 曝光變化 |\n`;
    md += `|--------|------|------|-----|------|-------------|\n`;
    for (const q of topQueries) {
      md += `| ${q.query} | ${q.clicks.toLocaleString()} | ${q.impressions.toLocaleString()} | ${formatPercent(q.ctr)} | ${q.position.toFixed(1)} | ${formatDelta(q.wowImpressions)} |\n`;
    }
  } else {
    md += `本週無任何曝光資料\n`;
  }
  md += `\n`;

  // Decline warnings
  md += `## ⚠️ 警示：曝光下滑關鍵字\n\n`;
  if (declines.length > 0) {
    md += `| 關鍵字 | 本週曝光 | 前週曝光 | 變化 |\n`;
    md += `|--------|----------|----------|------|\n`;
    for (const d of declines) {
      md += `| ${d.query} | ${d.current.toLocaleString()} | ${d.previous.toLocaleString()} | ${formatDelta(d.delta)} |\n`;
    }
  } else {
    md += `未偵測到大幅下滑的關鍵字\n`;
  }

  return md;
}

function formatJSON(data) {
  return JSON.stringify(data, null, 2);
}

// ============ File Operations ============

async function ensureDir(dirPath) {
  try {
    await mkdir(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function updateGitignore(dir) {
  const gitignorePath = join(dir, '.gitignore');
  const entry = '.gsc-digest/';

  let existing = false;
  try {
    const content = await readFile(gitignorePath, 'utf8');
    existing = content.split('\n').some(line => line.trim() === entry);
  } catch {
    // File doesn't exist, will be created
  }

  if (!existing) {
    await appendFile(gitignorePath, (existing ? '\n' : '') + entry + '\n');
    console.error(`   Added ${entry} to .gitignore`);
  }
}

// ============ Error Handling ============

function handleAuthError(err) {
  console.error('\n❌ 認證失敗！');
  console.error('\n請執行以下命令設定 ADC：');
  console.error('\n  gcloud auth application-default login \\');
  console.error('    --scopes=https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform');
  console.error('\n或啟用 Search Console API：');
  console.error('  https://console.cloud.google.com/apis/library/searchconsole.googleapis.com');
  console.error('\n詳細錯誤：', err.message);
}

async function handleSiteError(client, err, requestedSite) {
  if (err.status === 404 || err.message?.includes('site not found')) {
    console.error('\n❌ 找不到指定的 GSC 網站資源！');
    console.error(`   您請求的：${requestedSite}`);

    try {
      const response = await client.sites.list();
      const sites = response.data.siteEntry || [];

      if (sites.length > 0) {
        console.error('\n   您有權限的網站：');
        for (const site of sites) {
          console.error(`   - ${site.siteUrl}`);
        }
      } else {
        console.error('\n   您的帳號目前沒有任何 GSC 網站資源。');
        console.error('   請前往 https://search.google.com/search-console 新增網站。');
      }
    } catch (listErr) {
      console.error('\n   無法取得網站列表。');
    }

    return true;
  }
  return false;
}

// ============ Main ============

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    return;
  }

  console.error('🔍 GSC Digest - 開始分析 Google Search Console 資料\n');

  // Setup
  let client;
  try {
    client = await authenticate();
    console.error('✓ 認證成功');
  } catch (err) {
    handleAuthError(err);
    process.exit(1);
  }

  // Get date ranges
  const range = getDateRange(args.days);
  console.error(`✓ 資料區間：本週 ${formatDate(range.start)} ~ ${formatDate(range.end)}`);
  console.error(`            前週 ${formatDate(range.prevStart)} ~ ${formatDate(range.prevEnd)}`);

  // Fetch data
  let rows;
  try {
    rows = await fetchAllData(client, args.site, range);
  } catch (err) {
    const handled = await handleSiteError(client, err, args.site);
    if (handled) {
      process.exit(1);
    }
    throw err;
  }

  // Analyze
  console.error('\n📊 分析資料中...');

  const thisWeekMap = rowsToMap(rows.thisWeekRows, (r) => r.keys[0]);
  const prevWeekMap = rowsToMap(rows.prevWeekRows, (r) => r.keys[0]);

  const thisWeekSummary = calculateTotals(rows.thisWeekRows);
  const prevWeekSummary = calculateTotals(rows.prevWeekRows);

  const summary = {
    current: thisWeekSummary,
    previous: prevWeekSummary,
    delta: {
      clicks: prevWeekSummary.clicks > 0 ? (thisWeekSummary.clicks - prevWeekSummary.clicks) / prevWeekSummary.clicks : 0,
      impressions: prevWeekSummary.impressions > 0 ? (thisWeekSummary.impressions - prevWeekSummary.impressions) / prevWeekSummary.impressions : 0,
      ctrPp: (thisWeekSummary.ctr - prevWeekSummary.ctr) * 100,
      position: thisWeekSummary.avgPosition - prevWeekSummary.avgPosition,
    },
  };

  const opportunities = analyzeOpportunities(rows.thisWeekRows, prevWeekMap);
  const declines = analyzeDeclines(rows.thisWeekRows, prevWeekMap);

  // Build top queries with WoW delta
  const topQueries = rows.thisWeekRows
    .map((row) => {
      const query = row.keys[0];
      const prevRow = prevWeekMap.get(query);
      const prevImpressions = prevRow?.impressions || 0;
      const wowDelta = prevImpressions > 0 ? (row.impressions - prevImpressions) / prevImpressions : (prevImpressions === 0 && row.impressions > 0 ? 1 : 0);
      return {
        query,
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0,
        wowImpressions: wowDelta,
      };
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 20);

  // Build top pages
  const topPages = rows.pageRows
    .map((row) => ({
      page: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  console.error('✓ 分析完成');

  // Prepare output data
  const outputData = {
    generatedAt: new Date().toISOString(),
    site: args.site,
    range: {
      start: formatDate(range.start),
      end: formatDate(range.end),
      days: args.days,
    },
    summary,
    opportunities,
    topPages,
    topQueries,
    declines,
  };

  // Write files
  console.error('\n💾 寫入檔案中...');
  await ensureDir(args.outputDir);

  const dateStr = formatDate(range.end);
  const mdPath = join(args.outputDir, `${dateStr}.md`);
  const jsonPath = join(args.outputDir, `${dateStr}.json`);
  const latestPath = join(args.outputDir, 'latest.json');

  await writeFile(mdPath, formatMarkdown(outputData), 'utf8');
  await writeFile(jsonPath, formatJSON(outputData), 'utf8');
  await writeFile(latestPath, formatJSON(outputData), 'utf8');

  console.error(`   ${mdPath}`);
  console.error(`   ${jsonPath}`);
  console.error(`   ${latestPath}`);

  // Update .gitignore
  const parentDir = process.cwd();
  await updateGitignore(parentDir);

  console.error('\n✅ 完成！');
  console.log(mdPath);
}

main().catch((err) => {
  console.error('\n❌ 發生未預期錯誤：', err.message);
  process.exit(1);
});
```