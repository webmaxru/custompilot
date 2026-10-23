import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';
import { CATEGORIES, collectTotals, parseReport, isBucket } from '../js/report.js';

const customerNames = (catKey) => S.CATALOG[catKey].filter((i) => !i.builtin).map((i) => i.name);

test('window spans the Oct 22 release with 28 days', () => {
  assert.equal(S.DAYS.length, 28);
  assert.equal(S.DAYS[0], '2026-10-08');
  assert.equal(S.WINDOW_END, '2026-11-04');
  assert.equal(S.DAYS[S.NAMES_START_INDEX], '2026-10-22');
});

test('legacy format: top 5, customer-defined names grouped', () => {
  for (const cat of CATEGORIES) {
    const custom = new Set(customerNames(cat.key));
    for (let i = 0; i < S.DAYS.length; i++) {
      const arr = S.formatTotals(cat.key, S.orgDayUsage(i, cat.key), 'legacy');
      assert.ok(arr.length <= 5, `${cat.key} day ${i} has ${arr.length} entries`);
      for (const e of arr) assert.ok(!custom.has(e[cat.field]), `${e[cat.field]} leaked in legacy format`);
    }
  }
});

test('named format: up to 25 named entries, trailing buckets, totals conserved', () => {
  let sawOverflow = false;
  for (const cat of CATEGORIES) {
    for (let i = 0; i < S.DAYS.length; i++) {
      const usage = S.orgDayUsage(i, cat.key);
      const arr = S.formatTotals(cat.key, usage, 'named');
      const named = arr.filter((e) => !isBucket(e[cat.field]));
      assert.ok(named.length <= 25);
      const firstBucket = arr.findIndex((e) => isBucket(e[cat.field]));
      if (firstBucket >= 0) assert.ok(arr.slice(firstBucket).every((e) => isBucket(e[cat.field])), 'buckets must be trailing');
      for (const e of named) {
        assert.ok(S.normalizeName(e[cat.field], cat.key) !== null, `path-like name reported: ${e[cat.field]}`);
        assert.ok(e[cat.field].length <= 128);
      }
      const total = [...usage.values()].reduce((s, v) => s + v.n, 0);
      assert.equal(arr.reduce((s, e) => s + e.interaction_count, 0), total);
      if (named.length === 25 && arr.some((e) => e[cat.field] === 'other')) sawOverflow = true;
    }
  }
  assert.ok(sawOverflow, 'simulation should exercise the 25-entry cap');
});

test('aggregate reports switch format on Oct 22 and keep distinct counts', () => {
  const before = S.buildAggregateDayRecord(S.NAMES_START_INDEX - 1);
  const after = S.buildAggregateDayRecord(S.NAMES_START_INDEX);
  assert.ok(before.totals_by_custom_agent.every((e) => S.isBuiltin('custom_agent', e.custom_agent) || e.custom_agent === 'other'));
  assert.ok(after.totals_by_custom_agent.some((e) => !S.isBuiltin('custom_agent', e.custom_agent) && e.custom_agent !== 'other'));
  for (const i of [S.NAMES_START_INDEX - 1, S.NAMES_START_INDEX]) {
    const auto = S.buildAggregateDayRecord(i);
    const legacy = S.buildAggregateDayRecord(i, { mode: 'legacy' });
    const named = S.buildAggregateDayRecord(i, { mode: 'named' });
    for (const cat of CATEGORIES) {
      assert.equal(legacy[cat.distinct], named[cat.distinct]);
      assert.equal(auto[cat.distinct], S.distinctCount(S.orgDayUsage(i, cat.key)));
    }
  }
});

test('plugin totals are a subset of skill totals for every user-day', () => {
  for (let i = 0; i < S.DAYS.length; i++) {
    for (const r of S.buildUsersDayReport(i, { mode: 'named' })) {
      const sumOf = (arr) => arr.reduce((s, e) => s + e.interaction_count, 0);
      assert.ok(sumOf(r.totals_by_plugin) <= sumOf(r.totals_by_skill), `${r.user_login} on ${r.day}`);
    }
  }
});

test('rollouts: release-reviewer appears by name only after launch', () => {
  const launch = S.DAYS.indexOf('2026-10-27');
  const has = (i) => S.buildAggregateDayRecord(i).totals_by_custom_agent.some((e) => e.custom_agent === 'release-reviewer');
  for (let i = 0; i < launch; i++) assert.equal(has(i), false);
  assert.ok(S.DAYS.slice(launch).some((_, k) => has(launch + k)));
});

test('explainName: trim, path-like, 128-char limit, slash commands', () => {
  assert.equal(S.explainName('  release-reviewer  ', 'custom_agent').reported, 'release-reviewer');
  assert.equal(S.explainName('./skills/x/SKILL.md', 'skill').reported, 'other');
  assert.equal(S.explainName('C:\\mcp\\server.js', 'mcp').reported, 'other');
  assert.equal(S.explainName('~/.copilot/agents/a.agent.md', 'custom_agent').reported, 'other');
  assert.equal(S.explainName('/standup', 'slash_cmd').reported, '/standup');
  assert.equal(S.explainName('/.github/prompts/fix.prompt.md', 'slash_cmd').reported, 'custom');
  assert.equal(S.explainName('   ', 'skill').reported, 'other');
  const long = S.explainName('x'.repeat(200), 'skill');
  assert.equal(long.named, true);
  assert.equal(long.reported.length, 128);
});

test('simulated API responses mirror the documented shapes', () => {
  const day = S.simulateRequest('org-1-day', '2026-10-30');
  assert.equal(day.status, 200);
  assert.deepEqual(Object.keys(day.body).sort(), ['download_links', 'report_day']);
  assert.equal(day.records.length, 1);
  assert.equal(day.records[0].organization_id, S.ORG.organization_id);

  const month = S.simulateRequest('ent-28-day');
  assert.deepEqual(Object.keys(month.body).sort(), ['download_links', 'report_end_day', 'report_start_day']);
  assert.equal(month.records[0].day_totals.length, 28);
  assert.equal('organization_id' in month.records[0], false);

  const users = S.simulateRequest('org-users-28-day');
  assert.ok(users.records.length > 0);
  assert.ok(users.records.every((r) => r.report_start_day === S.DAYS[0] && r.user_login));

  assert.equal(S.simulateRequest('org-1-day', '2025-01-01').status, 404);
});

test('NDJSON round-trips through the shared report reader', () => {
  const text = S.toNdjson(S.buildUsersDayReport(S.DAYS.length - 1));
  const records = parseReport(text);
  const totals = collectTotals(records);
  assert.equal(totals.kind, 'users-1-day');
  assert.equal(totals.userCount, records.length);
  assert.ok(totals.categories.custom_agent.namedCount > 5);
});

test('simulation is deterministic', async () => {
  const a = S.toNdjson(S.buildAggregate28DayReport());
  const fresh = await import(`../js/sim.js?again=${Date.now()}`);
  assert.equal(fresh.toNdjson(fresh.buildAggregate28DayReport()), a);
});
