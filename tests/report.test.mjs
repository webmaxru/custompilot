import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReport, collectTotals, expandDayRecords, detectReportKind } from '../js/report.js';

test('parseReport handles NDJSON, arrays, BOM and blank lines', () => {
  assert.deepEqual(parseReport('\uFEFF{"a":1}\n\n{"a":2}\r\n'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseReport('[{"a":1},{"a":2}]'), [{ a: 1 }, { a: 2 }]);
  assert.deepEqual(parseReport('{"a":1}'), [{ a: 1 }]);
  assert.deepEqual(parseReport('   '), []);
  assert.throws(() => parseReport('{"a":1}\nnot json'), /Line 2/);
});

test('collectTotals sums 28-day day_totals and separates buckets', () => {
  const records = [{
    report_start_day: '2026-10-08',
    report_end_day: '2026-11-04',
    day_totals: [
      { day: '2026-10-21', distinct_skill_use_count: 3, totals_by_skill: [{ skill: 'other', interaction_count: 9 }] },
      { day: '2026-10-22', distinct_skill_use_count: 4, totals_by_skill: [{ skill: 'code-review', interaction_count: 5 }, { skill: 'release-checks', interaction_count: 2 }, { skill: 'other', interaction_count: 1 }] },
      { day: '2026-10-23', totals_by_skill: [{ skill: 'code-review', interaction_count: 3 }] },
    ],
  }];
  assert.equal(detectReportKind(records), 'aggregate-28-day');
  assert.equal(expandDayRecords(records).length, 3);
  const t = collectTotals(records);
  const skill = t.categories.skill;
  assert.equal(t.dayCount, 3);
  assert.equal(skill.total, 20);
  assert.equal(skill.bucketTotal, 10);
  assert.equal(skill.namedTotal, 10);
  assert.equal(skill.namedCount, 2);
  assert.equal(skill.distinctMax, 4);
  assert.deepEqual(skill.entries[0], { name: 'other', count: 10, bucket: true });
  assert.deepEqual(skill.entries[1], { name: 'code-review', count: 8, bucket: false });
  assert.equal(t.categories.mcp.present, false);
});

test('collectTotals works on per-user records', () => {
  const records = [
    { day: '2026-10-30', user_login: 'a', totals_by_slash_cmd: [{ slash_cmd: '/plan', interaction_count: 2 }, { slash_cmd: 'custom', interaction_count: 1 }] },
    { day: '2026-10-30', user_login: 'b', totals_by_slash_cmd: [{ slash_cmd: '/standup', interaction_count: 4 }] },
  ];
  const t = collectTotals(records);
  assert.equal(t.kind, 'users-1-day');
  assert.equal(t.userCount, 2);
  assert.deepEqual(t.categories.slash_cmd.entries.map((e) => e.name), ['/standup', '/plan', 'custom']);
});
