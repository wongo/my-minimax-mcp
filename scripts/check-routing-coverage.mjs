#!/usr/bin/env node
// Scan ~/Projects for all git repos and report which have CLAUDE.md with MiniMax
// routing rules. Helps detect "new project without routing" leaks that pull
// Claude token spend without offloading to MiniMax.
//
// Usage: node scripts/check-routing-coverage.mjs [--json]

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const json = args.includes('--json');

// ─── Discover git repos under ~/Projects ─────────────────────────────────────

const projectsRoot = join(homedir(), 'Projects');
if (!existsSync(projectsRoot)) {
  console.error(`No ${projectsRoot} directory.`);
  process.exit(1);
}

const repos = readdirSync(projectsRoot).filter(name => {
  const full = join(projectsRoot, name);
  return statSync(full).isDirectory() && existsSync(join(full, '.git'));
});

// ─── Inspect each repo's CLAUDE.md ──────────────────────────────────────────

const SHARED_RULE_HOME = join(homedir(), '.claude/rules/minimax-routing.md');

function inspect(name) {
  const root = join(projectsRoot, name);
  const claudeMd = join(root, 'CLAUDE.md');

  if (!existsSync(claudeMd)) {
    return { repo: name, status: 'no-claude-md' };
  }

  const text = readFileSync(claudeMd, 'utf8');
  // Detect any reference to the shared rule file (home-relative OR absolute).
  const referencesShared =
    text.includes('minimax-routing.md') ||
    text.includes('rules/minimax-routing');
  // Detect an inline routing table — a markdown table row with both a "work
  // type" column header and at least one minimax tool name in the body. This
  // is the fallback path used by projects that pre-date the shared-rule
  // refactor.
  const hasInlineRouting =
    /minimax_(web_search|generate_code|agent_task|chat|plan|understand_image)/.test(text) &&
    /work\s*type|工作類型|作業類型/i.test(text);

  if (referencesShared) {
    return {
      repo: name,
      status: 'shared-rule',
      path: '@~/.claude/rules/minimax-routing.md',
    };
  }
  if (hasInlineRouting) {
    return { repo: name, status: 'inline-routing' };
  }
  return { repo: name, status: 'claude-md-no-routing' };
}

const report = repos.map(inspect);

// ─── Output ──────────────────────────────────────────────────────────────────

if (json) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const total = report.length;
const covered = report.filter(r => r.status === 'shared-rule' || r.status === 'inline-routing').length;
const missing = report.filter(r => r.status !== 'shared-rule' && r.status !== 'inline-routing');
const coverage = total === 0 ? 0 : ((covered / total) * 100).toFixed(1);

console.log(`# MiniMax Routing Coverage Report\n`);
console.log(`Scan root: ${projectsRoot}`);
console.log(`Repos found: ${total}`);
console.log(`With MiniMax routing: ${covered} (${coverage}%)\n`);

if (missing.length > 0) {
  console.log(`## ⚠ Repos missing MiniMax routing\n`);
  for (const r of missing) {
    console.log(`- **${r.repo}** — ${r.status}`);
  }
  console.log(``);
  console.log(`To fix a no-claude-md repo, run /gsd-new-project or manually add:\n`);
  console.log('```');
  console.log('# <project name>');
  console.log('');
  console.log('@~/.claude/rules/minimax-routing.md');
  console.log('');
  console.log('## Project notes');
  console.log('- <stack, build, deploy, etc.>');
  console.log('```');
} else {
  console.log(`✅ All repos have MiniMax routing.`);
}
