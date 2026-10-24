import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardView, calendarDays, loadDashboardReports } from '../js/dashboard-data.js';
import * as S from '../js/sim.js';

const day = (date, count = 10, extra = {}) => ({
  day: date, organization_id: '1', enterprise_id: '2',
  totals_by_skill: [{ skill: 'review', interaction_count: count }],
  ...extra,
});
const user = (date, id, count = 5, extra = {}) => day(date, count, { user_id: id, user_login: `user-${id}`, ...extra });
const period = (id, count = 10, extra = {}) => ({
  organization_id: '1', enterprise_id: '2', user_id: id, user_login: `user-${id}`,
  report_start_day: '2026-10-22', report_end_day: '2026-11-04',
  totals_by_skill: [{ skill: 'review', interaction_count: count }],
  ...extra,
});
const source = (records, name = 'test.ndjson') => ({ records, name });
const load = (records) => loadDashboardReports([source(records)]);

test('dashboard accepts NDJSON and aggregate day_totals with inherited scope', () => {
  const data = loadDashboardReports([{ name: 'organization.ndjson', text: JSON.stringify({
    organization_id: 1, enterprise_id: 2, report_start_day: '2026-10-22', report_end_day: '2026-10-23',
    day_totals: [
      { day: '2026-10-22', totals_by_skill: [{ skill: 'a', interaction_count: 3 }] },
      { day: '2026-10-23', totals_by_skill: [{ skill: 'a', interaction_count: 7 }] },
    ],
  }) }]);
  const view = buildDashboardView(data);
  assert.equal(data.scope, 'organization:1');
  assert.equal(view.activity, 10);
  assert.equal(view.namedItems.length, 1);
  assert.deepEqual(view.series.map((point) => point.total), [3, 7]);
  assert.equal(view.reach.available, false);
});

test('aggregate activity takes precedence over user reports without double counting', () => {
  const view = buildDashboardView(load([day('2026-10-22', 20), user('2026-10-22', 1, 3), user('2026-10-22', 2, 4)]));
  assert.equal(view.activity, 20);
  assert.equal(view.items[0].count, 20);
  assert.equal(view.reach.users, 2);
  assert.equal(view.reach.population, 2);
  assert.equal(view.items[0].users.length, 2);
  assert.equal(view.quality.source, 'Aggregate daily reports');
});

test('duplicate records are ignored, conflicting overlaps are rejected', () => {
  const record = day('2026-10-22', 10);
  const data = load([record, record]);
  assert.equal(data.duplicates, 1);
  assert.equal(buildDashboardView(data).activity, 10);
  assert.throws(() => load([record, day('2026-10-22', 11)]), /Conflicting reports/);
  assert.throws(() => load([user('2026-10-22', 1, 1), user('2026-10-22', 1, 2)]), /Conflicting reports/);
  assert.equal(load([period(1), period(1)]).duplicates, 1);
});

test('duplicate name ordering does not affect record identity', () => {
  const entries = [{ skill: 'a', interaction_count: 3 }, { skill: 'b', interaction_count: 3 }];
  const data = load([day('2026-10-22', 0, { totals_by_skill: entries }), day('2026-10-22', 0, { totals_by_skill: [...entries].reverse() })]);
  assert.equal(data.duplicates, 1);
});

test('reports for different organizations and enterprise scopes cannot be mixed', () => {
  assert.throws(() => load([day('2026-10-22'), day('2026-10-23', 1, { organization_id: '3' })]), /different organizations/);
  assert.throws(() => load([day('2026-10-22'), day('2026-10-23', 1, { organization_id: undefined })]), /different organizations/);
  assert.throws(() => load([day('2026-10-22'), day('2026-10-23', 1, { enterprise_id: '99' })]), /different organizations/);
  assert.throws(() => load([{ organization_id: '1', day_totals: [day('2026-10-22', 1, { organization_id: '3' })] }]), /Conflicting organization_id/);
});

test('invalid imports fail explicitly instead of yielding success-shaped empty dashboards', () => {
  assert.throws(() => loadDashboardReports([]), /Choose at least one/);
  assert.throws(() => loadDashboardReports([{ name: 'empty.ndjson', text: '' }]), /empty.ndjson.*no report records/);
  assert.throws(() => load([{ download_links: ['https://example.invalid/report'] }]), /download-links response/);
  assert.throws(() => load([{ hello: 'world' }]), /No customization metrics/);
  assert.throws(() => load([null]), /JSON object/);
  assert.throws(() => load([{ day_totals: [] }]), /day_totals must contain/);
  assert.throws(() => load([day('2026-02-30')]), /Invalid report date/);
  assert.throws(() => load([day('2026-10-22', -1)]), /nonnegative integer/);
  assert.throws(() => load([day('2026-10-22', '4')]), /nonnegative integer/);
  assert.throws(() => load([day('2026-10-22', NaN)]), /nonnegative integer/);
  assert.throws(() => load([day('2026-10-22', 0, { totals_by_skill: 'wrong' })]), /must be an array/);
  assert.throws(() => load([day('2026-10-22', 0, { totals_by_skill: [{ skill: '', interaction_count: 1 }] })]), /nonempty/);
});

test('missing days stay null and block unsupported period comparisons', () => {
  const data = load([day('2026-10-22', 10), day('2026-10-24', 20)]);
  const view = buildDashboardView(data);
  assert.deepEqual(view.series.map((point) => point.total), [10, null, 20]);
  assert.equal(view.items[0].points[1], null);
  assert.equal(view.trend, null);
  assert.equal(view.quality.missingDays, 1);
  assert.ok(view.insights.some((insight) => insight.id === 'history'));
});

test('empty arrays mean zero activity; unavailable arrays do not', () => {
  const available = buildDashboardView(load([day('2026-10-22', 0, { totals_by_skill: [] })]));
  assert.equal(available.hasActivityData, true);
  assert.equal(available.series[0].total, 0);
  const unavailable = buildDashboardView(load([day('2026-10-22', 0, { totals_by_skill: null })]));
  assert.equal(unavailable.hasActivityData, false);
  assert.equal(unavailable.series[0].total, null);
  assert.equal(unavailable.namedShare, null);
  const absent = buildDashboardView(load([{ day: '2026-10-22', organization_id: '1', daily_active_users: 5 }]));
  assert.equal(absent.hasActivityData, false);
  assert.equal(absent.activity, 0);
  assert.equal(absent.series[0].total, null);
  assert.equal(absent.quality.source, 'No customization activity data');
});

test('per-user period reports provide totals and reach, but never invented daily history', () => {
  const data = load([period(1, 10), period(2, 20)]);
  const view = buildDashboardView(data);
  assert.equal(data.periodOnly, true);
  assert.equal(view.activity, 30);
  assert.equal(view.reach.users, 2);
  assert.equal(view.reach.mode, 'period');
  assert.deepEqual(view.series, []);
  assert.deepEqual(view.items[0].points, []);
  assert.equal(view.trend, null);
  assert.equal(view.items[0].firstObserved, null);
  assert.ok(view.insights.some((insight) => insight.id === 'daily'));
  assert.throws(() => buildDashboardView(data, { from: '2026-10-25' }), /cannot be split/);
  assert.throws(() => load([period(1), period(2, 10, { report_end_day: '2026-11-05' })]), /share one reporting window/);
  const stamped = load([period(1, 10, { day: '2026-11-04' })]);
  assert.equal(stamped.periodOnly, true);
  assert.equal(buildDashboardView(stamped).days.length, 14);
});

test('period user reach is only used for its exact matching date window', () => {
  const days = calendarDays('2026-10-22', '2026-11-04');
  const data = load([...days.map((d) => day(d, 1)), period(1, 14), period(2, 7)]);
  const full = buildDashboardView(data);
  assert.equal(full.activity, 14);
  assert.equal(full.reach.users, 2);
  assert.equal(full.reach.mode, 'period');
  const subset = buildDashboardView(data, { from: '2026-10-29' });
  assert.equal(subset.activity, 7);
  assert.equal(subset.reach.available, false);
  assert.equal(subset.items[0].users, null);
});

test('daily user reach is a unique observed-user count, with partial coverage disclosed', () => {
  const data = load([
    day('2026-10-22'), day('2026-10-23'), day('2026-10-24'),
    user('2026-10-22', 1, 3), user('2026-10-23', '1', 5), user('2026-10-23', 2, 0),
  ]);
  const view = buildDashboardView(data);
  assert.equal(view.reach.users, 1);
  assert.equal(view.reach.population, 2);
  assert.equal(view.reach.coveredDays, 2);
  assert.equal(view.reach.complete, false);
  assert.equal(view.items[0].users[0].count, 8);
});

test('plugin activity is excluded from combined totals but remains independently selectable', () => {
  const data = load([day('2026-10-22', 10, {
    totals_by_plugin: [{ plugin: 'tools', interaction_count: 7 }],
    totals_by_mcp: [{ mcp: 'server', interaction_count: 20 }],
  })]);
  assert.equal(buildDashboardView(data).activity, 30);
  assert.equal(buildDashboardView(data).namedItems.length, 3);
  const plugin = buildDashboardView(data, { category: 'plugin' });
  assert.equal(plugin.activity, 7);
  assert.equal(plugin.items.length, 1);
});

test('named share preserves grouped buckets and explicit activity units', () => {
  const view = buildDashboardView(load([day('2026-10-22', 0, {
    totals_by_skill: [{ skill: 'a', interaction_count: 70 }, { skill: 'other', interaction_count: 30 }],
  })]));
  assert.equal(view.namedShare, 70);
  assert.equal(view.grouped, 30);
  assert.equal(view.namedItems.length, 1);
  assert.equal(view.items.length, 2);
  assert.ok(view.insights.some((insight) => insight.id === 'coverage'));
});

test('comparisons use equal recent periods, with no Infinity for newly observed items', () => {
  const days = calendarDays('2026-10-22', '2026-11-04');
  const data = load(days.map((d, i) => day(d, i < 7 ? 10 : 20, {
    totals_by_custom_agent: i < 7 ? [] : [{ custom_agent: 'new-agent', interaction_count: 5 }],
  })));
  const view = buildDashboardView(data, { category: 'skill' });
  assert.equal(view.trend.size, 7);
  assert.equal(view.trend.previous, 70);
  assert.equal(view.trend.recent, 140);
  assert.equal(view.trend.percent, 100);
  assert.ok(view.insights.some((insight) => insight.id === 'growth'));
  const agent = buildDashboardView(data, { category: 'custom_agent' }).items[0];
  assert.equal(agent.trend.status, 'new');
  assert.equal(agent.trend.percent, null);
  assert.equal(agent.firstObserved, '2026-10-29');
});

test('changes in activity source or missing categories do not produce misleading trends', () => {
  const data = load([day('2026-10-22', 10), user('2026-10-23', 1, 2)]);
  const view = buildDashboardView(data);
  assert.equal(view.trend, null);
  assert.equal(view.items[0].trend, null);
  assert.equal(view.quality.mixedSources, true);
  const changing = buildDashboardView(load([
    day('2026-10-22', 10),
    day('2026-10-23', 10, { totals_by_mcp: [{ mcp: 'server', interaction_count: 10 }] }),
  ]));
  assert.equal(changing.trend, null);
  assert.equal(changing.quality.partialDays, 1);
  assert.ok(changing.insights.some((insight) => insight.id === 'history'));
});

test('per-user record unions do not falsely imply a capped source record', () => {
  const records = Array.from({ length: 30 }, (_, i) => user('2026-10-22', i + 1, 0, {
    totals_by_skill: [{ skill: `skill-${i}`, interaction_count: 1 }],
  }));
  const view = buildDashboardView(load(records));
  assert.equal(view.namedItems.length, 30);
  assert.equal(view.quality.capRecords, false);
});

test('date filters validate bounds and keep calendar dates stable', () => {
  assert.deepEqual(calendarDays('2026-10-24', '2026-10-26'), ['2026-10-24', '2026-10-25', '2026-10-26']);
  assert.throws(() => calendarDays('2026-10-25', '2026-10-24'), /start date/);
  const data = load([day('2026-10-22'), day('2026-10-23')]);
  assert.throws(() => buildDashboardView(data, { from: '2026-10-21' }), /inside the loaded/);
  assert.throws(() => buildDashboardView(data, { category: 'unknown' }), /valid customization category/);
});

test('the post-release simulation supports real dashboard trends, inventory and reach', () => {
  const indices = S.DAYS.map((_, i) => i).filter((i) => i >= S.NAMES_START_INDEX);
  const data = loadDashboardReports([
    source(indices.map((i) => S.buildAggregateDayRecord(i)), 'Simulated aggregate'),
    source(indices.flatMap((i) => S.buildUsersDayReport(i)), 'Simulated users'),
  ], { label: S.ORG.login, simulated: true });
  const view = buildDashboardView(data);
  assert.equal(view.days.length, 14);
  assert.equal(view.quality.missingDays, 0);
  assert.equal(view.reach.complete, true);
  assert.ok(view.reach.users > 40);
  assert.ok(view.namedItems.length > 50);
  assert.ok(view.insights.some((insight) => insight.type === 'opportunity'));
  assert.ok(view.items.some((item) => item.name === 'release-reviewer'));
});
