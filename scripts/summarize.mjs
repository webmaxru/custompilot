#!/usr/bin/env node
// Summarize named customizations (skills, custom agents, MCP servers, slash commands, plugins)
// from Copilot usage metrics reports. Zero dependencies; Node 20+.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { CATEGORIES, collectTotals, parseReport, pct } from '../js/report.js';

export const API_VERSION = '2026-03-10';

export const REPORTS = {
  org: {
    'organization-1-day': { path: 'organization-1-day', day: true },
    'organization-28-day': { path: 'organization-28-day/latest' },
    'users-1-day': { path: 'users-1-day', day: true },
    'users-28-day': { path: 'users-28-day/latest' },
  },
  enterprise: {
    'enterprise-1-day': { path: 'enterprise-1-day', day: true },
    'enterprise-28-day': { path: 'enterprise-28-day/latest' },
    'users-1-day': { path: 'users-1-day', day: true },
    'users-28-day': { path: 'users-28-day/latest' },
  },
};

const HELP = `Summarize named customizations in Copilot usage metrics reports.

Usage:
  node scripts/summarize.mjs --file <report.ndjson> [--file <more.ndjson>] [options]
  node scripts/summarize.mjs --org <org> --report <name> [--day YYYY-MM-DD] [options]
  node scripts/summarize.mjs --enterprise <slug> --report <name> [--day YYYY-MM-DD] [options]

Reports:
  --org         organization-1-day (needs --day), organization-28-day, users-1-day (needs --day), users-28-day
  --enterprise  enterprise-1-day (needs --day), enterprise-28-day, users-1-day (needs --day), users-28-day

Options:
  --top <n>        Entries to print per category (default 25)
  --json           Print the summary as JSON
  --save <path>    Also save the downloaded report as NDJSON
  --api-base <url> API base URL (default https://api.github.com)
  -h, --help       Show this help

API mode reads a token from GITHUB_TOKEN or GH_TOKEN (needs read:org for orgs,
manage_billing:copilot or read:enterprise for enterprises).`;

export async function fetchReport({ scope, owner, report, day, token, apiBase = 'https://api.github.com', fetchImpl = fetch }) {
  const def = REPORTS[scope]?.[report];
  if (!def) throw new Error(`Unknown report "${report}". Use one of: ${Object.keys(REPORTS[scope] ?? {}).join(', ')}`);
  if (def.day && !/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) throw new Error(`--day YYYY-MM-DD is required for ${report}`);
  if (!token) throw new Error('Set GITHUB_TOKEN (or GH_TOKEN) to call the API.');
  const prefix = scope === 'org' ? `/orgs/${encodeURIComponent(owner)}` : `/enterprises/${encodeURIComponent(owner)}`;
  const url = `${apiBase.replace(/\/+$/, '')}${prefix}/copilot/metrics/reports/${def.path}${def.day ? `?day=${day}` : ''}`;
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'custompilot-summarize',
    },
  });
  if (res.status === 204) return { meta: null, records: [] };
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} ${body}`.trim());
  }
  const meta = await res.json();
  const records = [];
  for (const link of meta.download_links ?? []) {
    // Signed URLs carry their own auth; don't forward the GitHub token.
    const file = await fetchImpl(link);
    if (!file.ok) throw new Error(`Downloading a report file failed: ${file.status} ${file.statusText}`);
    records.push(...parseReport(await file.text()));
  }
  return { meta, records };
}

const KIND_LABEL = {
  'aggregate-1-day': 'aggregate 1-day report',
  'aggregate-28-day': 'aggregate 28-day report',
  'users-1-day': 'per-user 1-day report',
  'users-28-day': 'per-user 28-day report',
  empty: 'empty report',
};

const fmt = new Intl.NumberFormat('en-US');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function formatSummary(totals, { top = 25 } = {}) {
  const lines = [];
  const meta = [KIND_LABEL[totals.kind] ?? totals.kind, `${totals.recordCount} record(s)`];
  if (totals.dayCount) meta.push(`${totals.dayCount} day(s)`);
  if (totals.userCount) meta.push(`${totals.userCount} user(s)`);
  lines.push(`Report: ${meta.join(' · ')}`);
  for (const cat of CATEGORIES) {
    const c = totals.categories[cat.key];
    lines.push('');
    if (!c.present) {
      lines.push(`${cat.label}: ${cat.array} not present`);
      continue;
    }
    lines.push(`${cat.label} — ${Math.round(pct(c.namedTotal, c.total))}% named · ${c.namedCount} named ${c.namedCount === 1 ? 'entry' : 'entries'} · ${fmt.format(c.total)} ${cat.unit}${c.distinctMax != null ? ` · max ${cat.distinct} ${c.distinctMax}` : ''}`);
    const named = c.entries.filter((e) => !e.bucket);
    const buckets = c.entries.filter((e) => e.bucket);
    named.slice(0, top).forEach((e, i) => {
      lines.push(`  ${String(i + 1).padStart(3)}  ${clip(e.name, 44).padEnd(44)} ${fmt.format(e.count).padStart(9)}  ${pct(e.count, c.total).toFixed(1).padStart(5)}%`);
    });
    if (named.length > top) {
      const rest = named.slice(top);
      lines.push(`       ${`(+${rest.length} more named)`.padEnd(44)} ${fmt.format(rest.reduce((s, e) => s + e.count, 0)).padStart(9)}`);
    }
    for (const e of buckets) {
      lines.push(`       ${`${e.name} (grouped)`.padEnd(44)} ${fmt.format(e.count).padStart(9)}  ${pct(e.count, c.total).toFixed(1).padStart(5)}%`);
    }
    if (!c.entries.length) lines.push('       (no activity)');
  }
  return lines.join('\n');
}

export async function main(argv = process.argv.slice(2), env = process.env, out = console) {
  const { values } = parseArgs({
    args: argv,
    options: {
      file: { type: 'string', multiple: true },
      org: { type: 'string' },
      enterprise: { type: 'string' },
      report: { type: 'string' },
      day: { type: 'string' },
      top: { type: 'string', default: '25' },
      json: { type: 'boolean', default: false },
      save: { type: 'string' },
      'api-base': { type: 'string', default: 'https://api.github.com' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  if (values.help || (!values.file && !values.org && !values.enterprise)) {
    out.log(HELP);
    return values.help ? 0 : 1;
  }
  let records = [];
  if (values.file) {
    for (const f of values.file) records.push(...parseReport(await readFile(f, 'utf8')));
  } else {
    if (values.org && values.enterprise) throw new Error('Use either --org or --enterprise, not both.');
    if (!values.report) throw new Error('--report is required in API mode.');
    const scope = values.org ? 'org' : 'enterprise';
    ({ records } = await fetchReport({
      scope,
      owner: values.org ?? values.enterprise,
      report: values.report,
      day: values.day,
      token: env.GITHUB_TOKEN || env.GH_TOKEN,
      apiBase: values['api-base'],
    }));
    if (values.save) {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(values.save, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
    }
  }
  const totals = collectTotals(records);
  if (values.json) out.log(JSON.stringify(totals, null, 2));
  else out.log(formatSummary(totals, { top: Math.max(1, Number.parseInt(values.top, 10) || 25) }));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => { process.exitCode = code; },
    (err) => {
      console.error(`Error: ${err.message}`);
      process.exitCode = 1;
    },
  );
}
