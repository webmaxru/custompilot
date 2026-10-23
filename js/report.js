// Shared helpers for reading Copilot usage metrics reports (browser + Node).

export const CATEGORIES = [
  { key: 'skill', array: 'totals_by_skill', field: 'skill', distinct: 'distinct_skill_use_count', label: 'Skills', bucket: 'other', unit: 'invocations' },
  { key: 'custom_agent', array: 'totals_by_custom_agent', field: 'custom_agent', distinct: 'distinct_custom_agent_use_count', label: 'Custom agents', bucket: 'other', unit: 'agent starts' },
  { key: 'mcp', array: 'totals_by_mcp', field: 'mcp', distinct: 'distinct_mcp_use_count', label: 'MCP servers', bucket: 'other', unit: 'connection attempts' },
  { key: 'slash_cmd', array: 'totals_by_slash_cmd', field: 'slash_cmd', distinct: 'distinct_slash_cmd_use_count', label: 'Slash commands', bucket: 'custom', unit: 'invocations' },
  { key: 'plugin', array: 'totals_by_plugin', field: 'plugin', distinct: 'distinct_plugin_use_count', label: 'Plugins', bucket: 'other', unit: 'plugin skill invocations' },
];

export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

export const BUCKET_NAMES = new Set(['other', 'custom']);

export function isBucket(name) {
  return BUCKET_NAMES.has(name);
}

/** Parses NDJSON (one JSON value per line). Also accepts a JSON array or a single JSON object. */
export function parseReport(text) {
  const trimmed = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];
  try {
    const whole = JSON.parse(trimmed);
    if (Array.isArray(whole)) return whole;
    if (whole && typeof whole === 'object') return [whole];
  } catch {
    // not a single JSON document: treat as NDJSON
  }
  const records = [];
  trimmed.split(/\r?\n/).forEach((line, i) => {
    const l = line.trim();
    if (!l) return;
    let value;
    try {
      value = JSON.parse(l);
    } catch (err) {
      throw new Error(`Line ${i + 1} is not valid JSON: ${err.message}`);
    }
    if (Array.isArray(value)) records.push(...value);
    else records.push(value);
  });
  return records;
}

/** Flattens 28-day aggregate records (day_totals) into day-level records. */
export function expandDayRecords(records) {
  const out = [];
  for (const r of records) {
    if (r && Array.isArray(r.day_totals)) out.push(...r.day_totals);
    else if (r) out.push(r);
  }
  return out;
}

export function detectReportKind(records) {
  if (!records.length) return 'empty';
  const first = records[0];
  if (Array.isArray(first.day_totals)) return 'aggregate-28-day';
  if ('user_login' in first || 'user_id' in first) {
    return 'report_start_day' in first ? 'users-28-day' : 'users-1-day';
  }
  return 'aggregate-1-day';
}

/**
 * Sums every totals_by_* array across records (aggregate 1-day, 28-day day_totals, or per-user).
 * Returns per category: sorted entries, named/bucket totals, and the max distinct count observed.
 */
export function collectTotals(records) {
  const days = expandDayRecords(records);
  const result = {
    kind: detectReportKind(records),
    recordCount: records.length,
    dayCount: new Set(days.map((d) => d.day).filter(Boolean)).size,
    userCount: new Set(days.map((d) => d.user_login).filter(Boolean)).size,
    categories: {},
  };
  for (const cat of CATEGORIES) {
    const counts = new Map();
    let distinctMax = null;
    let present = false;
    for (const d of days) {
      const arr = d[cat.array];
      if (Array.isArray(arr)) {
        present = true;
        for (const e of arr) {
          const name = e?.[cat.field];
          if (typeof name !== 'string') continue;
          counts.set(name, (counts.get(name) ?? 0) + (Number(e.interaction_count) || 0));
        }
      }
      const distinct = d[cat.distinct];
      if (typeof distinct === 'number') distinctMax = Math.max(distinctMax ?? 0, distinct);
    }
    const entries = [...counts.entries()]
      .map(([name, count]) => ({ name, count, bucket: isBucket(name) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    const total = entries.reduce((s, e) => s + e.count, 0);
    const bucketTotal = entries.filter((e) => e.bucket).reduce((s, e) => s + e.count, 0);
    result.categories[cat.key] = {
      present,
      entries,
      total,
      bucketTotal,
      namedTotal: total - bucketTotal,
      namedCount: entries.filter((e) => !e.bucket).length,
      distinctMax,
    };
  }
  return result;
}

export function pct(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}
