import { CATEGORIES, CATEGORY_BY_KEY, collectTotals, isBucket, parseReport } from './report.js';

const DAY_MS = 86400000;
const ACTIVITY_KEYS = CATEGORIES.filter((c) => c.key !== 'plugin').map((c) => c.key);
const total = (values) => values.reduce((sum, value) => sum + value, 0);
const itemId = (category, name) => JSON.stringify([category, name]);

export function calendarDays(from, to) {
  const start = validateDay(from);
  const end = validateDay(to);
  if (start > end) throw new Error('The start date must be on or before the end date.');
  const length = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
  if (length > 3660) throw new Error('The selected dates span more than ten years. Choose a shorter reporting window.');
  return Array.from({ length }, (_, i) => new Date(Date.parse(start) + i * DAY_MS).toISOString().slice(0, 10));
}

function validateDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid report date: ${String(value)}. Expected YYYY-MM-DD.`);
  }
  return value;
}

function identifier(value, field) {
  if (value == null) return null;
  if (!['string', 'number'].includes(typeof value) || !String(value).trim()
    || (typeof value === 'number' && !Number.isSafeInteger(value))) {
    throw new Error(`Invalid ${field}. Expected a string or integer identifier.`);
  }
  return String(value);
}

function normalizeRecord(raw, parent = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each report record must be a JSON object.');
  if ('download_links' in raw) throw new Error('This is a download-links response, not a report. Download the NDJSON file from those links first.');
  const metrics = {};
  let recognized = false;
  for (const cat of CATEGORIES) {
    if (cat.array in raw || cat.distinct in raw) recognized = true;
    const entries = raw[cat.array];
    if (entries != null && !Array.isArray(entries)) throw new Error(`${cat.array} must be an array or null.`);
    if (Array.isArray(entries)) {
      metrics[cat.array] = entries.map((entry) => {
        if (!entry || typeof entry[cat.field] !== 'string' || !entry[cat.field].trim()) {
          throw new Error(`Each ${cat.array} entry needs a nonempty ${cat.field} name.`);
        }
        if (!Number.isSafeInteger(entry.interaction_count) || entry.interaction_count < 0) {
          throw new Error(`Invalid interaction_count for "${entry[cat.field]}". Expected a nonnegative integer.`);
        }
        return { [cat.field]: entry[cat.field], interaction_count: entry.interaction_count };
      });
    }
    if (raw[cat.distinct] != null) {
      if (!Number.isSafeInteger(raw[cat.distinct]) || raw[cat.distinct] < 0) throw new Error(`Invalid ${cat.distinct}.`);
      metrics[cat.distinct] = raw[cat.distinct];
    }
  }
  const usageRecord = ['totals_by_cli', 'daily_active_users', 'user_initiated_interaction_count', 'used_cli'].some((field) => field in raw);
  if (!recognized && !usageRecord) throw new Error('No customization metrics found. Use an aggregate or per-user usage report, not a repository or team-membership report.');
  const scope = {};
  for (const field of ['organization_id', 'enterprise_id']) {
    const own = identifier(raw[field], field);
    const inherited = identifier(parent[field], field);
    if (own && inherited && own !== inherited) throw new Error(`Conflicting ${field} values in a report.`);
    scope[field] = own ?? inherited;
  }
  const userId = identifier(raw.user_id, 'user_id');
  const login = identifier(raw.user_login, 'user_login');
  const user = userId ?? login;
  const stampedDay = raw.day != null ? validateDay(raw.day) : null;
  const hasUserPeriod = user && (raw.report_start_day != null || raw.report_end_day != null);
  const day = hasUserPeriod ? null : stampedDay;
  const from = day ?? validateDay(raw.report_start_day);
  const to = day ?? validateDay(raw.report_end_day);
  if (from > to) throw new Error('A report starts after its end date.');
  if (!day && !user) throw new Error('Aggregate period reports must contain day_totals. A period total cannot be expanded into daily activity.');
  const categories = collectTotals([metrics]).categories;
  const fingerprint = JSON.stringify(CATEGORIES.map((cat) => {
    const value = categories[cat.key];
    return [cat.key, value.present, value.distinctMax, [...value.entries].sort((a, b) => a.name.localeCompare(b.name))];
  }));
  return { day, from, to, user, login: login ?? (user ? `User ${user}` : null), scope, metrics, categories, fingerprint };
}

export function loadDashboardReports(sources, { label, simulated = false } = {}) {
  if (!sources.length) throw new Error('Choose at least one report file.');
  const aggregate = new Map();
  const userDays = new Map();
  const userPeriods = new Map();
  const scopes = new Set();
  const enterpriseIds = new Set();
  const bounds = [];
  const files = [];
  let periodWindow = null;
  let duplicates = 0;

  function insert(map, key, record) {
    const existing = map.get(key);
    if (existing) {
      if (existing.fingerprint !== record.fingerprint) {
        throw new Error(`Conflicting reports for ${record.day ?? `${record.from} to ${record.to}`}${record.user ? `, user ${record.login}` : ''}. Load only one snapshot of overlapping data.`);
      }
      duplicates++;
    } else map.set(key, record);
  }

  for (const source of sources) {
    try {
      const records = source.records ?? parseReport(source.text);
      if (!Array.isArray(records) || !records.length) throw new Error('The file contains no report records.');
      const kinds = new Set();
      let recordCount = 0;
      for (const raw of records) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each report record must be a JSON object.');
        let rows = [raw];
        if ('day_totals' in raw) {
          if (!Array.isArray(raw.day_totals) || !raw.day_totals.length) throw new Error('day_totals must contain daily report records.');
          rows = raw.day_totals;
          if (raw.report_start_day != null || raw.report_end_day != null) {
            const from = validateDay(raw.report_start_day);
            const to = validateDay(raw.report_end_day);
            if (from > to) throw new Error('A report starts after its end date.');
            bounds.push(from, to);
          }
        }
        for (const row of rows) {
          const record = normalizeRecord(row, raw);
          if ('day_totals' in raw) {
            if (!record.day || record.user) throw new Error('day_totals must contain aggregate daily records.');
            if (raw.report_start_day && (record.day < raw.report_start_day || record.day > raw.report_end_day)) {
              throw new Error('A day_totals record is outside its reporting window.');
            }
          }
          const scope = record.scope.organization_id
            ? `organization:${record.scope.organization_id}`
            : record.scope.enterprise_id ? `enterprise:${record.scope.enterprise_id}` : 'unidentified';
          scopes.add(scope);
          if (record.scope.enterprise_id) enterpriseIds.add(record.scope.enterprise_id);
          if (record.day) {
            bounds.push(record.day);
            if (record.user) {
              if (!userDays.has(record.day)) userDays.set(record.day, new Map());
              insert(userDays.get(record.day), record.user, record);
              kinds.add('Per-user daily');
            } else {
              insert(aggregate, record.day, record);
              kinds.add('Aggregate daily');
            }
          } else {
            const window = `${record.from}/${record.to}`;
            if (periodWindow && periodWindow !== window) throw new Error('Per-user period reports must share one reporting window. Use daily reports to combine different windows.');
            periodWindow = window;
            insert(userPeriods, record.user, record);
            kinds.add('Per-user period totals');
          }
          recordCount++;
        }
      }
      files.push({ name: source.name ?? 'Report', kinds: [...kinds], recordCount });
    } catch (error) {
      throw new Error(`${source.name ?? 'Report'}: ${error.message}`, { cause: error });
    }
  }
  if (scopes.size > 1 || enterpriseIds.size > 1) throw new Error('These files cover different organizations or enterprise scopes. Load reports for one scope at a time.');
  const daily = new Map();
  for (const day of new Set([...aggregate.keys(), ...userDays.keys()])) {
    const users = [...(userDays.get(day)?.values() ?? [])];
    const userTotals = users.length ? collectTotals(users.map((u) => u.metrics)).categories : null;
    const categories = {};
    for (const cat of CATEGORIES) {
      const org = aggregate.get(day)?.categories[cat.key];
      const people = userTotals?.[cat.key];
      categories[cat.key] = org?.present ? { ...org, source: 'aggregate' }
        : people?.present ? { ...people, source: 'per-user' } : null;
    }
    daily.set(day, categories);
  }
  const period = periodWindow ? { from: periodWindow.split('/')[0], to: periodWindow.split('/')[1] } : null;
  const sorted = bounds.sort();
  const from = sorted[0] ?? period?.from;
  const to = sorted.at(-1) ?? period?.to;
  if (!from || !to) throw new Error('No dated customization records found.');
  calendarDays(from, to);
  const scope = [...scopes][0];
  const hasCappedRecords = [...aggregate.values(), ...[...userDays.values()].flatMap((users) => [...users.values()]), ...userPeriods.values()]
    .some((record) => CATEGORIES.some((cat) => record.categories[cat.key].namedCount >= 25));
  return {
    label: label ?? (scope === 'unidentified' ? 'Imported reports' : scope.replace(':', ' ')),
    simulated, files, duplicates, scope, from, to, daily, userDays, userPeriods, period,
    periodOnly: daily.size === 0, hasCappedRecords,
  };
}

function sumCategory(parts, cat) {
  return collectTotals(parts.filter(Boolean).map((part) => ({
    [cat.array]: part.entries.map((e) => ({ [cat.field]: e.name, interaction_count: e.count })),
  }))).categories[cat.key];
}

function comparisonFor(days, values, signatures) {
  const size = Math.min(7, Math.floor(days.length / 2));
  if (!size) return null;
  const offset = days.length - size * 2;
  const recentValues = values.slice(-size);
  const previousValues = values.slice(offset, offset + size);
  if ([...recentValues, ...previousValues].some((value) => value == null)
    || new Set(signatures.slice(offset)).size !== 1) return null;
  const recent = total(recentValues);
  const previous = total(previousValues);
  return {
    size, recent, previous, change: recent - previous,
    percent: previous > 0 ? ((recent - previous) / previous) * 100 : recent > 0 ? null : 0,
    status: previous === 0 && recent > 0 ? 'new' : recent > previous ? 'up' : recent < previous ? 'down' : 'flat',
    recentFrom: days.at(-size), recentTo: days.at(-1),
    previousFrom: days[offset], previousTo: days[offset + size - 1],
  };
}

function reachRecords(data, days, from, to) {
  const covered = days.filter((day) => data.userDays.has(day));
  const periodMatches = data.period?.from === from && data.period?.to === to;
  if (periodMatches && covered.length < days.length && data.userPeriods.size) {
    return { records: [...data.userPeriods.values()], mode: 'period', coveredDays: days.length, complete: true };
  }
  if (covered.length) {
    return {
      records: covered.flatMap((day) => [...data.userDays.get(day).values()]),
      mode: 'daily', coveredDays: covered.length, complete: covered.length === days.length,
    };
  }
  return { records: [], mode: 'unavailable', coveredDays: 0, complete: false };
}

export function buildDashboardView(data, { from = data.from, to = data.to, category = 'all' } = {}) {
  if (category !== 'all' && !CATEGORY_BY_KEY[category]) throw new Error('Choose a valid customization category.');
  if (from < data.from || to > data.to) throw new Error('Choose dates inside the loaded reporting window.');
  const days = calendarDays(from, to);
  if (data.periodOnly && (from !== data.from || to !== data.to)) {
    throw new Error('Per-user period totals cannot be split into a shorter date range. Load daily reports to filter dates.');
  }
  const keys = category === 'all' ? ACTIVITY_KEYS : [category];
  const listedCategories = category === 'all' ? CATEGORIES : [CATEGORY_BY_KEY[category]];
  const reach = reachRecords(data, days, from, to);
  const allUsers = new Set(reach.records.map((record) => record.user));
  const reachedUsers = new Set();
  const byItemUser = new Map();
  const reachCategories = new Set();
  for (const record of reach.records) {
    for (const cat of CATEGORIES) {
      if (record.categories[cat.key].present) reachCategories.add(cat.key);
      for (const entry of record.categories[cat.key].entries) {
        if (entry.bucket || entry.count <= 0) continue;
        if (keys.includes(cat.key)) reachedUsers.add(record.user);
        const id = itemId(cat.key, entry.name);
        if (!byItemUser.has(id)) byItemUser.set(id, new Map());
        const users = byItemUser.get(id);
        const previous = users.get(record.user);
        users.set(record.user, { login: record.login, count: (previous?.count ?? 0) + entry.count });
      }
    }
  }
  const categories = {};
  const seriesByCategory = {};
  const signaturesByCategory = {};
  const periodTotals = data.periodOnly ? collectTotals(reach.records.map((r) => r.metrics)).categories : null;
  for (const cat of CATEGORIES) {
    const parts = days.map((day) => data.daily.get(day)?.[cat.key] ?? null);
    categories[cat.key] = periodTotals?.[cat.key] ?? sumCategory(parts, cat);
    seriesByCategory[cat.key] = data.periodOnly ? [] : parts;
    signaturesByCategory[cat.key] = parts.map((part) => part?.source ?? 'missing');
  }
  const series = data.periodOnly ? [] : days.map((day, i) => {
    const parts = keys.map((key) => seriesByCategory[key][i]);
    const present = parts.filter(Boolean);
    return {
      day,
      total: present.length ? total(present.map((p) => p.total)) : null,
      named: present.length ? total(present.map((p) => p.namedTotal)) : null,
      grouped: present.length ? total(present.map((p) => p.bucketTotal)) : null,
      categories: Object.fromEntries(keys.map((key, k) => [key, parts[k]?.total ?? null])),
      signature: keys.map((key, k) => `${key}:${parts[k]?.source ?? 'missing'}`).join('|'),
    };
  });
  const available = keys.filter((key) => categories[key].present);
  const activity = total(available.map((key) => categories[key].total));
  const named = total(available.map((key) => categories[key].namedTotal));
  const trend = data.periodOnly ? null : comparisonFor(days, series.map((point) => point.total), series.map((point) => point.signature));
  const items = listedCategories.flatMap((cat) => categories[cat.key].entries.map((entry) => {
    const id = itemId(cat.key, entry.name);
    const points = seriesByCategory[cat.key].map((part) => part ? (part.entries.find((e) => e.name === entry.name)?.count ?? 0) : null);
    const users = byItemUser.get(id);
    return {
      id, name: entry.name, category: cat.key, count: entry.count, bucket: entry.bucket,
      share: categories[cat.key].total ? entry.count / categories[cat.key].total * 100 : 0,
      points,
      trend: data.periodOnly ? null : comparisonFor(days, points, signaturesByCategory[cat.key]),
      users: !entry.bucket && reachCategories.has(cat.key) ? [...(users?.values() ?? [])].sort((a, b) => b.count - a.count || a.login.localeCompare(b.login)) : null,
      firstObserved: points.some((value) => value > 0) ? days[points.findIndex((value) => value > 0)] : null,
      observedDays: points.filter((value) => value > 0).length,
    };
  })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name) || a.category.localeCompare(b.category));
  const namedItems = items.filter((item) => !item.bucket && item.count > 0);
  const presentDays = series.filter((point) => point.total != null).length;
  const partialDays = series.filter((point) => point.total != null && available.some((key) => point.categories[key] == null)).length;
  const mixedSources = keys.some((key) => new Set(signaturesByCategory[key].filter((source) => source !== 'missing')).size > 1);
  const view = {
    from, to, days, category, keys, categories, series, items, namedItems, activity, named,
    grouped: activity - named, namedShare: activity ? named / activity * 100 : null,
    hasActivityData: available.length > 0,
    trend, periodOnly: data.periodOnly,
    reach: {
      available: keys.some((key) => reachCategories.has(key)), mode: reach.mode,
      users: reachedUsers.size, population: allUsers.size, coveredDays: reach.coveredDays,
      complete: reach.complete,
    },
    quality: {
      presentDays, partialDays, missingDays: data.periodOnly ? 0 : days.length - presentDays,
      categories: CATEGORIES.filter((cat) => categories[cat.key].present).map((cat) => cat.key),
      mixedSources, capRecords: data.hasCappedRecords,
      source: !available.length ? 'No customization activity data' : data.periodOnly ? 'Per-user period totals'
        : mixedSources ? 'Mixed aggregate and per-user daily reports'
          : series.some((point) => point.signature.includes(':aggregate')) ? 'Aggregate daily reports' : 'Uploaded per-user daily reports',
    },
  };
  view.insights = buildInsights(view);
  return view;
}

function buildInsights(view) {
  const insights = [];
  const ranked = view.namedItems.filter((item) => item.category !== 'plugin' || view.category === 'plugin');
  const add = (id, type, title, evidence, action, item = null) => insights.push({ id, type, title, evidence, action, itemId: item?.id ?? null });
  if (!view.hasActivityData || !view.activity) {
    add('empty', 'coverage', 'No recorded activity in this view', 'The loaded reports do not contain positive activity for this selection.', 'Choose another category or load a longer reporting window.');
    return insights;
  }
  if (view.quality.missingDays || view.quality.partialDays || view.quality.mixedSources) {
    add('history', 'coverage', 'Make the reporting window comparable',
      view.quality.missingDays ? `${view.quality.missingDays} of ${view.days.length} selected days have no activity report. Gaps are not zero usage.`
        : view.quality.partialDays ? `${view.quality.partialDays} selected days are missing data for categories present on other days. Combined totals have different coverage.`
        : 'Some dates use aggregate totals and others sum uploaded user records. Their coverage can differ.',
      'Load a consistent aggregate report for the full period before judging growth.');
  } else if (view.periodOnly) {
    add('daily', 'coverage', 'Add daily history to reveal momentum', 'This file contains per-user period totals, not daily observations.', 'Add the matching aggregate 28-day report for daily charts and period comparisons.');
  }
  if (view.namedShare < 90) {
    add('coverage', 'coverage', 'Recover visibility into grouped activity',
      `${Math.round(100 - view.namedShare)}% of recorded activity is grouped under other or custom.`,
      'Review configured names and client telemetry coverage; the per-record cap can also hide names.');
  }
  const growing = ranked.filter((item) => item.trend?.previous >= 5 && item.trend.recent >= 10 && item.trend.percent >= 25)
    .sort((a, b) => b.trend.change - a.trend.change)[0];
  if (growing) {
    add('growth', 'opportunity', `${growing.name} is gaining traction`,
      `${growing.trend.recent} reported ${CATEGORY_BY_KEY[growing.category].unit} in the latest ${growing.trend.size} days, versus ${growing.trend.previous} in the prior ${growing.trend.size} (+${Math.round(growing.trend.percent)}%).`,
      'Inspect the pattern, capture a useful workflow, and share it with other teams.', growing);
  }
  const newlyObserved = ranked.filter((item) => item.trend?.status === 'new' && item.trend.recent >= 5)[0];
  if (newlyObserved) {
    add('new', 'opportunity', `${newlyObserved.name} is newly observed`,
      `${newlyObserved.trend.recent} reported ${CATEGORY_BY_KEY[newlyObserved.category].unit} in the latest ${newlyObserved.trend.size} days; it was not listed in the prior period.`,
      'Check whether this follows a rollout, then gather early feedback. An absent entry can also reflect the reporting cap.', newlyObserved);
  }
  const declining = ranked.filter((item) => item.trend?.previous >= 10 && item.trend.percent <= -25)
    .sort((a, b) => a.trend.change - b.trend.change)[0];
  if (declining) {
    add('decline', 'watch', `Check the change in ${declining.name}`,
      `${declining.trend.recent} reported ${CATEGORY_BY_KEY[declining.category].unit}, down from ${declining.trend.previous} over equal ${declining.trend.size}-day periods.`,
      'Check recent workflow changes and telemetry coverage before interpreting this as lower adoption.', declining);
  }
  const narrow = view.reach.complete && view.reach.population >= 10
    ? ranked.find((item) => item.category !== 'mcp' && item.count >= 20 && item.users?.length > 0 && item.users.length <= view.reach.population * 0.2) : null;
  if (narrow) {
    add('reach', 'opportunity', `Broaden the reach of ${narrow.name}`,
      `${narrow.count} reported ${CATEGORY_BY_KEY[narrow.category].unit} from ${narrow.users.length} of ${view.reach.population} users in the uploaded reports.`,
      'Ask current users for an example workflow and offer a focused enablement session.', narrow);
  }
  if (!view.reach.available) {
    add('users', 'coverage', 'Connect activity to developer reach', 'Aggregate counts cannot tell you how many distinct people used each customization.', 'Add per-user reports for the selected dates, or a per-user summary matching the full window.');
  }
  if (!insights.length) {
    add('steady', 'opportunity', 'Keep watching the portfolio', 'No item meets the growth or decline thresholds: at least 25% change and sufficient recorded activity in comparable periods.', 'Use the inventory to inspect individual trends and revisit after your next rollout.');
  }
  return insights.slice(0, 5);
}
