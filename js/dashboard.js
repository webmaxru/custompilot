import * as S from './sim.js';
import { CATEGORIES, CATEGORY_BY_KEY } from './report.js';
import { buildDashboardView, loadDashboardReports } from './dashboard-data.js';

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = new Intl.NumberFormat('en-US');
const compactNumber = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const num = (value) => number.format(value);
const shortDate = (day) => dateFormatter.format(new Date(`${day}T00:00:00Z`));
const rangeLabel = (from, to) => from === to ? shortDate(from) : `${shortDate(from)} \u2013 ${shortDate(to)}`;
const DASH = '\u2014';
const COLORS = { skill: '#5ce0b2', custom_agent: '#b39aff', mcp: '#6eb8ff', slash_cmd: '#edc36d', plugin: '#ed9dc5' };
const PAGE_SIZE = 12;
const state = { data: null, view: null, category: 'all', from: '', to: '', chartMode: 'category', query: '', momentum: 'all', sort: 'count', direction: -1, page: 0, grouped: false };
let importSequence = 0;
let chartSequence = 0;

function demoSources() {
  const indices = S.DAYS.map((_, i) => i).filter((i) => i >= S.NAMES_START_INDEX);
  return [
    { name: 'simulation-organization.ndjson', records: [{
      organization_id: S.ORG.organization_id, enterprise_id: S.ORG.enterprise_id,
      report_start_day: S.NAMES_START_DAY, report_end_day: S.WINDOW_END,
      day_totals: indices.map((i) => S.buildAggregateDayRecord(i)),
    }] },
    { name: 'simulation-users-daily.ndjson', records: indices.flatMap((i) => S.buildUsersDayReport(i)) },
  ];
}

function emptyVisual(title, description, canImport = false) {
  return `<div class="empty-visual"><strong>${esc(title)}</strong><p>${esc(description)}</p>${canImport ? '<button class="text-button" type="button" data-open-import>Load report files &rarr;</button>' : ''}</div>`;
}

function trendBadge(trend) {
  if (!trend) return '<span class="muted-dash" title="No comparable daily periods">Not available</span>';
  const label = trend.status === 'new' ? 'Newly observed'
    : `${trend.change > 0 ? '+' : ''}${Math.round(trend.percent)}%`;
  return `<span class="trend-badge ${trend.status}" title="${esc(`${rangeLabel(trend.recentFrom, trend.recentTo)}: ${num(trend.recent)}; ${rangeLabel(trend.previousFrom, trend.previousTo)}: ${num(trend.previous)}`)}">${esc(label)}</span>`;
}

function sparkline(values, color) {
  if (!values.length || values.every((value) => value == null)) return `<span class="muted-dash">${DASH}</span>`;
  const max = Math.max(1, ...values.filter((v) => v != null));
  const segments = [];
  let segment = [];
  values.forEach((value, i) => {
    if (value == null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push(`${values.length === 1 ? 58 : 2 + i / (values.length - 1) * 112},${28 - value / max * 24}`);
  });
  if (segment.length) segments.push(segment);
  return `<svg class="sparkline" viewBox="0 0 116 32" aria-hidden="true"><path d="M2 28H114" stroke="#27384e" fill="none"/>${segments.map((points) => points.length === 1
    ? `<circle cx="${points[0].split(',')[0]}" cy="${points[0].split(',')[1]}" r="2" fill="${color}"/>`
    : `<polyline points="${points.join(' ')}" stroke="${color}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
}

function barsSvg(points, segments, label) {
  const width = 800;
  const height = 256;
  const left = 45;
  const right = 12;
  const top = 16;
  const bottom = 34;
  const plotHeight = height - top - bottom;
  const max = Math.max(4, Math.ceil(Math.max(0, ...points.map((p) => p.total ?? 0)) / 4) * 4);
  const step = (width - left - right) / points.length;
  const barWidth = Math.max(0.25, Math.min(35, step * 0.68));
  const pattern = `missing-day-${++chartSequence}`;
  const grid = Array.from({ length: 5 }, (_, i) => {
    const value = max * i / 4;
    const y = top + plotHeight - i / 4 * plotHeight;
    return `<line class="gridline" x1="${left}" y1="${y}" x2="${width - right}" y2="${y}"/><text class="axis-label" x="${left - 9}" y="${y + 4}" text-anchor="end">${compactNumber.format(value)}</text>`;
  }).join('');
  const columns = points.map((point, i) => {
    const x = left + step * (i + 0.5) - barWidth / 2;
    if (point.total == null) return `<rect x="${x}" y="${top}" width="${barWidth}" height="${plotHeight}" fill="url(#${pattern})"><title>${esc(point.day)}: no report data</title></rect>`;
    let y = top + plotHeight;
    return `<g class="chart-column"><title>${esc(`${point.day}: ${num(point.total)} reported activity`)}${segments.map((part) => `\n${esc(part.label)}: ${point.values[part.key] == null ? 'unavailable' : num(point.values[part.key])}`).join('')}</title>${segments.map((part) => {
      const value = point.values[part.key] ?? 0;
      const barHeight = value / max * plotHeight;
      y -= barHeight;
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${part.color}" rx="1.5" opacity="0.85"/>`;
    }).join('')}</g>`;
  }).join('');
  const ticks = points.map((point, i) => i === 0 || i === points.length - 1 || i % Math.ceil(points.length / 6) === 0
    ? `<text class="axis-label" x="${left + step * (i + 0.5)}" y="${height - 10}" text-anchor="middle">${esc(shortDate(point.day))}</text>` : '').join('');
  const table = `<div class="sr-only"><table><caption>${esc(label)}</caption><thead><tr><th>Date</th>${segments.map((part) => `<th>${esc(part.label)}</th>`).join('')}</tr></thead><tbody>${points.map((point) => `<tr><th>${point.day}</th>${segments.map((part) => `<td>${point.values[part.key] == null ? 'No data' : num(point.values[part.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><defs><pattern id="${pattern}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" x2="0" y1="0" y2="7" stroke="#526680" stroke-width="2" opacity="0.4"/></pattern></defs>${grid}${columns}${ticks}</svg>${table}`;
}

function renderSource() {
  const data = state.data;
  $('workspace-name').textContent = data.label;
  $('workspace-kind').textContent = data.simulated ? 'Simulated workspace' : 'Local report files';
  $('workspace-kind').className = `source-pill${data.simulated ? '' : ' local'}`;
  $('load-demo').setAttribute('aria-pressed', String(data.simulated));
  $('source-banner').innerHTML = `<span class="source-pill${data.simulated ? '' : ' local'}">${data.simulated ? 'SIMULATION' : 'LOCAL FILES'}</span>
    <span><strong>${esc(data.label)}</strong> &middot; ${esc(rangeLabel(data.from, data.to))}, ${data.to.slice(0, 4)}</span>
    <span>${data.simulated ? 'Generated data for a fictional organization. No live API requests.' : `${data.files.length} file${data.files.length === 1 ? '' : 's'} analyzed locally; nothing uploaded.`}</span>
    <button class="text-button source-action" type="button" data-open-import>${data.simulated ? 'Use your own reports' : 'Replace reports'} &rarr;</button>`;
  $('date-from').min = $('date-to').min = data.from;
  $('date-from').max = $('date-to').max = data.to;
  $('date-from').disabled = $('date-to').disabled = $('window-preset').disabled = data.periodOnly;
}

function renderMetrics() {
  const view = state.view;
  const observed = view.reach.available;
  const metrics = [
    {
      label: 'Reported activity', color: COLORS.skill,
      value: view.hasActivityData ? num(view.activity) : DASH,
      note: state.category === 'all' ? 'Activity signals; plugins excluded' : CATEGORY_BY_KEY[state.category].unit,
      bottom: `${trendBadge(view.trend)}${view.trend ? `<span class="metric-detail">latest ${view.trend.size}d vs prior ${view.trend.size}d</span>` : ''}`,
    },
    {
      label: 'Named customizations', color: COLORS.custom_agent,
      value: num(view.namedItems.length),
      note: state.category === 'all' ? 'Across all five categories, including plugins' : 'Names with reported activity in this view',
      bottom: '<span class="metric-detail">Visible names, not a full installed inventory</span>',
    },
    {
      label: 'Developers reached', color: COLORS.mcp,
      value: observed ? `${num(view.reach.users)} <small>/ ${num(view.reach.population)}</small>` : DASH,
      note: observed ? 'Named activity / users in uploaded reports' : 'Per-user reports required',
      bottom: observed ? `<span class="metric-detail">${view.reach.mode === 'period' ? 'Exact full-window user summary' : `${view.reach.coveredDays}/${view.days.length} days with per-user records`}${view.reach.complete ? '' : ' \u00b7 partial coverage'}</span>`
        : '<button class="text-button" type="button" data-open-import>Add developer reach &rarr;</button>',
    },
    {
      label: 'Activity attributed by name', color: COLORS.plugin,
      value: view.namedShare == null ? DASH : `${Math.round(view.namedShare)}<small>%</small>`,
      note: view.hasActivityData ? `${num(view.grouped)} activity signals grouped or unnamed` : 'Attribution data is unavailable',
      bottom: `<span class="metric-detail">${view.namedShare == null ? 'No activity denominator available' : 'Reporting visibility, not telemetry completeness'}</span>`,
    },
  ];
  $('metric-cards').innerHTML = metrics.map((metric) => `<article class="metric-card" style="--metric-color:${metric.color}"><div class="metric-label">${metric.label}<span class="color-dot" style="--series-color:${metric.color}"></span></div><div class="metric-value">${metric.value}</div><div class="metric-note">${metric.note}</div><div class="metric-bottom">${metric.bottom}</div></article>`).join('');
}

function renderActivity() {
  const view = state.view;
  document.querySelectorAll('[data-chart-mode]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.chartMode === state.chartMode)));
  const parts = state.chartMode === 'attribution'
    ? [{ key: 'named', label: 'Named activity', color: COLORS.skill }, { key: 'grouped', label: 'Grouped / unnamed', color: '#586a83' }]
    : view.keys.filter((key) => view.categories[key].present).map((key) => ({ key, label: CATEGORY_BY_KEY[key].label, color: COLORS[key] }));
  if (view.periodOnly) $('activity-chart').innerHTML = emptyVisual('Period totals, not daily history', 'Add the matching aggregate 28-day report or daily files to see a real activity timeline.', true);
  else if (!view.hasActivityData) $('activity-chart').innerHTML = emptyVisual('No daily data for this category', 'Choose another category or load reports containing its customization arrays.', true);
  else $('activity-chart').innerHTML = barsSvg(view.series.map((point) => ({
    ...point, values: state.chartMode === 'attribution' ? { named: point.named, grouped: point.grouped } : point.categories,
  })), parts, 'Daily reported customization activity');
  $('activity-legend').innerHTML = parts.map((part) => `<span class="legend-item"><i class="color-dot" style="--series-color:${part.color}"></i>${esc(part.label)}</span>`).join('');
  const comparison = view.trend
    ? `Recent change compares ${rangeLabel(view.trend.recentFrom, view.trend.recentTo)} with ${rangeLabel(view.trend.previousFrom, view.trend.previousTo)}.`
    : 'A recent-change comparison requires daily observations over two comparable periods.';
  $('activity-context').textContent = `${comparison}${view.quality.missingDays ? ' Hatched columns are missing reports, not zero activity.' : ''}${view.quality.partialDays ? ' Some columns have incomplete category coverage.' : ''}`;
}

function renderMix() {
  const view = state.view;
  const all = state.category === 'all';
  const parts = all ? view.keys.filter((key) => view.categories[key].present).map((key) => ({
    key, label: CATEGORY_BY_KEY[key].label, color: COLORS[key], count: view.categories[key].total,
  })) : [
    { key: 'named', label: 'Reported by name', color: COLORS[state.category], count: view.named },
    { key: 'grouped', label: 'Grouped / unnamed', color: '#465a74', count: view.grouped },
  ];
  $('mix-title').textContent = all ? 'Activity mix' : 'Name coverage';
  const circumference = 2 * Math.PI * 78;
  let offset = 0;
  const arcs = parts.map((part) => {
    const length = view.activity ? part.count / view.activity * circumference : 0;
    const arc = `<circle cx="110" cy="110" r="78" fill="none" stroke="${part.color}" stroke-width="21" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}" transform="rotate(-90 110 110)"><title>${esc(part.label)}: ${num(part.count)}</title></circle>`;
    offset += length;
    return arc;
  }).join('');
  const value = !view.hasActivityData ? DASH : all ? compactNumber.format(view.activity) : view.namedShare == null ? DASH : `${Math.round(view.namedShare)}%`;
  $('mix-chart').innerHTML = `<svg class="donut" viewBox="0 0 220 220" role="img" aria-label="${all ? 'Activity distribution by category' : 'Named versus grouped activity'}"><circle cx="110" cy="110" r="78" fill="none" stroke="#203048" stroke-width="21"/>${arcs}<text x="110" y="110" text-anchor="middle" class="donut-value">${esc(value)}</text><text x="110" y="130" text-anchor="middle" class="donut-label">${all ? 'activity signals' : 'attributed by name'}</text></svg>`;
  $('mix-legend').innerHTML = parts.map((part) => `<${all ? 'button type="button"' : 'div'} class="mix-row"${all ? ` data-category="${part.key}"` : ''}><i class="color-dot" style="--series-color:${part.color}"></i>${esc(part.label)}<strong>${num(part.count)}</strong><span class="mix-share">${view.activity ? Math.round(part.count / view.activity * 100) : 0}%</span></${all ? 'button' : 'div'}>`).join('')
    + `<p class="chart-footnote">${all ? 'Select a category to focus the dashboard. Plugin activity is already included in skills.' : 'Grouped activity can include unavailable names, path-like names, and overflow beyond the report cap.'}</p>`;
}

function renderInsights() {
  $('insight-cards').innerHTML = state.view.insights.map((insight) => {
    const label = insight.itemId ? 'Inspect customization' : insight.id === 'coverage' ? 'Review coverage'
      : insight.id === 'steady' ? 'Explore inventory' : 'Load supporting reports';
    return `<article class="insight-card ${insight.type}"><p class="signal-type">${insight.type === 'opportunity' ? 'Opportunity' : insight.type === 'watch' ? 'Worth investigating' : 'Data coverage'}</p><h3>${esc(insight.title)}</h3><p class="evidence">${esc(insight.evidence)}</p><p class="recommendation">${esc(insight.action)}</p><button class="text-button" type="button" data-insight="${insight.id}">${label} &rarr;</button></article>`;
  }).join('');
}

function renderHeatmap() {
  const view = state.view;
  $('rhythm-description').textContent = state.category === 'all'
    ? 'The two most-used reported names in each category. Discover steady workflows and newly visible patterns.'
    : `The ten most-used reported ${CATEGORY_BY_KEY[state.category].label.toLowerCase()} in this window.`;
  if (view.periodOnly) {
    $('adoption-heatmap').innerHTML = emptyVisual('Daily observations are needed for a heatmap', 'Period totals cannot show which days a customization was used. Add daily report data.', true);
    return;
  }
  const items = state.category === 'all'
    ? CATEGORIES.flatMap((cat) => view.namedItems.filter((item) => item.category === cat.key).slice(0, 2))
    : view.namedItems.slice(0, 10);
  if (!items.length) {
    $('adoption-heatmap').innerHTML = emptyVisual('No named activity to map', 'Choose another category or date range. Grouped buckets do not identify individual customizations.');
    return;
  }
  const headers = view.days.map((day, i) => `<th scope="col" title="${day}">${i === 0 || day.endsWith('-01') ? esc(shortDate(day)) : day.slice(-2)}</th>`).join('');
  const rows = items.map((item) => {
    const max = Math.max(1, ...item.points.filter((p) => p != null));
    const cells = item.points.map((count, i) => {
      const title = `${item.name}, ${view.days[i]}: ${count == null ? 'no report data' : count === 0 ? 'not listed; usage may be zero or outside the report cap' : `${num(count)} reported ${CATEGORY_BY_KEY[item.category].unit}`}`;
      const color = count > 0 ? `${COLORS[item.category]}${Math.round((0.18 + count / max * 0.82) * 255).toString(16).padStart(2, '0')}` : '';
      return `<td${count == null ? ' class="heat-missing"' : ''}${color ? ` style="background:${color}"` : ''}><button class="heat-cell" type="button" data-item="${esc(item.id)}" title="${esc(title)}" aria-label="${esc(title)}"></button></td>`;
    }).join('');
    return `<tr><th scope="row"><button class="heat-name" type="button" data-item="${esc(item.id)}" title="${esc(item.name)}"><i class="color-dot" style="--series-color:${COLORS[item.category]}"></i><span>${esc(item.name)}</span></button></th>${cells}</tr>`;
  }).join('');
  $('adoption-heatmap').innerHTML = `<table class="heatmap" style="min-width:${Math.max(580, 195 + view.days.length * 25)}px"><caption class="sr-only">Daily reported activity by customization</caption><thead><tr><th scope="col">Customization / day</th>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderInventory() {
  const view = state.view;
  const query = state.query.trim().toLowerCase();
  const rows = view.items.filter((item) => item.count > 0 && (state.grouped || !item.bucket)
    && (!query || item.name.toLowerCase().includes(query))
    && (state.momentum === 'all' || item.trend?.status === state.momentum));
  const sortValue = (item) => state.sort === 'name' ? item.name.toLowerCase()
    : state.sort === 'count' ? item.count
      : state.sort === 'users' ? item.users?.length ?? null
        : item.trend ? (item.trend.status === 'new' ? Number.MAX_SAFE_INTEGER : item.trend.percent) : null;
  rows.sort((a, b) => {
    const av = sortValue(a);
    const bv = sortValue(b);
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    const diff = av == null ? 0 : typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return state.direction * diff || a.name.localeCompare(b.name);
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages - 1);
  const page = rows.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  $('inventory-count').textContent = num(rows.length);
  $('inventory-body').innerHTML = page.map((item) => `<tr>
    <td><button class="item-name" type="button" data-item="${esc(item.id)}" title="${esc(item.name)}">${esc(item.name)}</button><span class="item-category"><i class="color-dot" style="--series-color:${COLORS[item.category]}"></i>${CATEGORY_BY_KEY[item.category].label}${item.bucket ? ' \u00b7 grouped bucket' : ''}</span></td>
    <td><span class="activity-value">${num(item.count)}</span><span class="activity-unit">${CATEGORY_BY_KEY[item.category].unit}</span></td>
    <td>${trendBadge(item.trend)}${item.trend ? `<span class="table-sub">${item.trend.size}d vs prior ${item.trend.size}d</span>` : ''}</td>
    <td>${item.users == null ? `<span class="muted-dash" title="${item.bucket ? 'Grouped activity has no named-user attribution' : 'Load matching per-user records'}">${DASH}</span>` : `<span class="activity-value">${num(item.users.length)}</span><span class="table-sub">${view.reach.complete ? 'in uploaded reports' : 'partial date coverage'}</span>`}</td>
    <td>${sparkline(item.points, COLORS[item.category])}</td>
  </tr>`).join('') || `<tr><td colspan="5">${emptyVisual('No customizations match these filters', 'Try another name, category, or momentum filter.')}<button class="text-button" type="button" id="clear-inventory">Clear inventory filters</button></td></tr>`;
  $('inventory-page-label').textContent = rows.length ? `Showing ${state.page * PAGE_SIZE + 1}\u2013${Math.min(rows.length, (state.page + 1) * PAGE_SIZE)} of ${num(rows.length)} items` : 'No matching items';
  $('inventory-prev').disabled = state.page === 0;
  $('inventory-next').disabled = state.page >= pages - 1;
  document.querySelectorAll('[data-sort-column]').forEach((heading) => {
    if (heading.dataset.sortColumn === state.sort) heading.setAttribute('aria-sort', state.direction === -1 ? 'descending' : 'ascending');
    else heading.removeAttribute('aria-sort');
  });
  $('inventory-context').textContent = `Reported counts are lower bounds when names are capped or unavailable.${state.category === 'all' ? ' Units differ by category; plugin counts overlap skills.' : ''}${view.periodOnly ? ' Daily pattern and recent change are unavailable for period-only data.' : ''}`;
}

function renderQuality() {
  const view = state.view;
  const rows = [
    ['Activity source', view.quality.source],
    ['Daily observations', view.periodOnly ? 'Unavailable in period totals' : `${view.quality.presentDays} of ${view.days.length} days${view.quality.partialDays ? ` (${view.quality.partialDays} partial)` : ''}`],
    ['Categories available', `${view.quality.categories.length} of 5`],
    ['Per-user coverage', view.reach.available ? view.reach.mode === 'period' ? 'Matching full-window summary' : `${view.reach.coveredDays} of ${view.days.length} days` : 'No matching user data'],
    ['Report cap boundary', view.quality.capRecords ? 'A source record has 25+ names' : 'No loaded record reaches 25 names'],
  ];
  $('coverage-summary').innerHTML = rows.map(([label, value]) => `<div class="coverage-row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')
    + `<p class="coverage-note">${view.reach.available && !view.reach.complete ? 'Reach covers only the uploaded user dates, not the entire selected window.' : 'Reported names and users can undercount actual activity. Missing data is never filled with simulated values.'}</p>`;
  $('loaded-reports').innerHTML = state.data.files.map((file) => `<div class="loaded-file"><strong>${esc(file.name)}</strong><span>${esc(file.kinds.join(' + '))} &middot; ${num(file.recordCount)} records</span></div>`).join('')
    + `<p class="coverage-note">${num(state.data.duplicates)} identical overlapping records ignored. ${state.data.simulated ? 'All figures are generated for demonstration.' : 'Local analysis only; no report content leaves your browser.'}</p>`;
}

function render() {
  const view = state.view;
  $('category-nav').innerHTML = [{ key: 'all', label: 'All customizations' }, ...CATEGORIES].map((cat) => {
    const count = cat.key === 'all' ? CATEGORIES.reduce((sum, c) => sum + view.categories[c.key].namedCount, 0) : view.categories[cat.key].namedCount;
    return `<button class="category-focus" type="button" data-category="${cat.key}" aria-pressed="${state.category === cat.key}"><i class="color-dot" style="--series-color:${COLORS[cat.key] ?? '#9daec5'}"></i>${cat.label}<span class="category-count">${num(count)}</span></button>`;
  }).join('');
  $('dashboard-category').value = state.category;
  $('view-context').textContent = `${rangeLabel(view.from, view.to)}, ${view.to.slice(0, 4)} \u00b7 ${view.days.length} day${view.days.length === 1 ? '' : 's'} \u00b7 ${state.category === 'all' ? 'All customization categories' : CATEGORY_BY_KEY[state.category].label}${view.periodOnly ? ' \u00b7 period totals only' : ''}`;
  renderMetrics();
  renderActivity();
  renderMix();
  renderInsights();
  renderHeatmap();
  renderInventory();
  renderQuality();
}

function resetInventory() {
  state.query = '';
  state.momentum = 'all';
  state.grouped = false;
  state.page = 0;
  $('inventory-search').value = '';
  $('inventory-momentum').value = 'all';
  $('include-grouped').checked = false;
}

function installDataset(data, view = buildDashboardView(data)) {
  state.data = data;
  state.view = view;
  state.category = 'all';
  state.from = data.from;
  state.to = data.to;
  state.sort = 'count';
  state.direction = -1;
  resetInventory();
  $('date-from').value = data.from;
  $('date-to').value = data.to;
  $('window-preset').value = 'all';
  $('filter-error').hidden = true;
  renderSource();
  render();
}

function applyFilters() {
  const from = $('date-from').value;
  const to = $('date-to').value;
  const category = $('dashboard-category').value;
  let view;
  try {
    view = buildDashboardView(state.data, { from, to, category });
  } catch (error) {
    $('filter-error').textContent = `${error.message} Charts still show the previous valid selection.`;
    $('filter-error').hidden = false;
    return;
  }
  state.from = from;
  state.to = to;
  state.category = category;
  state.view = view;
  state.page = 0;
  $('filter-error').hidden = true;
  render();
}

function openImport() {
  if ($('item-dialog').open) $('item-dialog').close();
  if (!$('import-dialog').open) $('import-dialog').showModal();
}

async function importFiles(files) {
  if (!files.length) return;
  const sequence = ++importSequence;
  $('import-error').hidden = true;
  $('import-status').textContent = `Reading ${files.length} report file${files.length === 1 ? '' : 's'} locally...`;
  $('choose-reports').disabled = true;
  $('report-drop').setAttribute('aria-busy', 'true');
  let data;
  let view;
  try {
    const sources = await Promise.all([...files].map(async (file) => ({ name: file.name, text: await file.text() })));
    if (sequence !== importSequence) return;
    data = loadDashboardReports(sources);
    view = buildDashboardView(data);
  } catch (error) {
    if (sequence !== importSequence) return;
    $('import-error').textContent = `${error.message} The previous dataset is still displayed.`;
    $('import-error').hidden = false;
    $('import-status').textContent = 'Report import failed.';
    return;
  } finally {
    if (sequence === importSequence) {
      $('choose-reports').disabled = false;
      $('report-drop').removeAttribute('aria-busy');
      $('report-files').value = '';
    }
  }
  if (sequence !== importSequence) return;
  installDataset(data, view);
  $('import-status').textContent = '';
  $('import-dialog').close();
}

function loadDemo() {
  importSequence++;
  $('choose-reports').disabled = false;
  $('report-drop').removeAttribute('aria-busy');
  $('report-files').value = '';
  $('import-error').hidden = true;
  $('import-status').textContent = '';
  if ($('item-dialog').open) $('item-dialog').close();
  if ($('import-dialog').open) $('import-dialog').close();
  installDataset(loadDashboardReports(demoSources(), { label: S.ORG.login, simulated: true }));
}

function openItem(id) {
  const item = state.view.items.find((candidate) => candidate.id === id);
  if (!item) throw new Error('The selected customization is not in the current view.');
  const view = state.view;
  const cat = CATEGORY_BY_KEY[item.category];
  $('item-category').textContent = `${cat.label} / ${item.bucket ? 'Grouped activity' : 'Named customization'}`;
  $('item-title').textContent = item.name;
  const chart = item.points.length
    ? barsSvg(view.days.map((day, i) => ({ day, total: item.points[i], values: { count: item.points[i] } })), [{ key: 'count', label: cat.unit, color: COLORS[cat.key] }], `Daily reported activity for ${item.name}`)
    : emptyVisual('Daily history is unavailable', 'This report contains period totals. Add daily data to inspect the pattern.', true);
  const insight = view.insights.find((entry) => entry.itemId === item.id);
  const people = item.users == null
    ? `<p>${item.bucket ? 'A grouped bucket cannot identify which named customization each person used.' : 'Load per-user reports for these dates, or a per-user summary matching the full window, to inspect observed reach.'}</p>${item.bucket ? '' : '<button class="text-button" type="button" data-open-import>Load per-user reports &rarr;</button>'}`
    : item.users.length ? `<table class="detail-people"><thead><tr><th>User in uploaded reports</th><th>Reported activity</th></tr></thead><tbody>${item.users.slice(0, 8).map((user) => `<tr><td>${esc(user.login)}</td><td>${num(user.count)}</td></tr>`).join('')}</tbody></table><p class="chart-footnote">Showing up to eight observed users. These counts are not individual productivity measures.${view.reach.complete ? '' : ' User records cover only part of the selected window.'}</p>`
      : '<p>No user is attributed to this name in the uploaded per-user records. This does not prove it was unused.</p>';
  $('item-detail').innerHTML = `<div class="detail-metrics">
    <div class="detail-metric"><span>Reported activity</span><strong>${num(item.count)}</strong><small>${cat.unit}</small></div>
    <div class="detail-metric"><span>Share of category activity</span><strong>${Math.round(item.share)}%</strong><small>within ${esc(cat.label.toLowerCase())}</small></div>
    <div class="detail-metric"><span>Observed users</span><strong>${item.users == null ? DASH : num(item.users.length)}</strong><small>${item.users == null ? 'no named-user attribution' : 'in uploaded user reports'}</small></div>
    <div class="detail-metric"><span>Days observed</span><strong>${view.periodOnly ? DASH : item.observedDays}</strong><small>${item.firstObserved ? `first listed ${esc(shortDate(item.firstObserved))}` : 'no daily history'}</small></div>
    </div><div class="detail-chart"><h3>Daily reported activity</h3><div class="insights-chart">${chart}</div><p class="chart-footnote">${trendBadge(item.trend)} ${item.trend ? `Latest ${item.trend.size}d versus previous ${item.trend.size}d. ` : ''}Unlisted days can reflect zero use or reporting limits; missing reports are hatched.</p></div>
    <div class="detail-lower"><div><h3>Suggested follow-up</h3><p>${esc(insight?.evidence ?? 'Use the observed pattern to form a question, rather than treating volume alone as success or failure.')}</p><p>${esc(insight?.action ?? 'Review the workflow with its users, document an effective example, and follow the same metrics after your next change.')}</p><p class="chart-footnote">${cat.key === 'mcp' ? 'MCP activity counts connection attempts, not tool calls.' : cat.key === 'plugin' ? 'Plugin activity is already included in skill totals.' : 'The first observed date is not necessarily the launch date.'}</p></div><div><h3>Observed reach</h3>${people}</div></div>`;
  if (!$('item-dialog').open) $('item-dialog').showModal();
}

function downloadDemo() {
  const records = demoSources().flatMap((source) => source.records);
  const url = URL.createObjectURL(new Blob([S.toNdjson(records)], { type: 'application/x-ndjson' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'custompilot-simulated-dashboard.ndjson';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function init() {
  $('dashboard-category').innerHTML = '<option value="all">All customizations</option>' + CATEGORIES.map((cat) => `<option value="${cat.key}">${cat.label}</option>`).join('');
  $('dashboard-filters').onsubmit = (event) => { event.preventDefault(); applyFilters(); };
  $('dashboard-category').onchange = applyFilters;
  $('date-from').onchange = $('date-to').onchange = () => { $('window-preset').value = 'custom'; };
  $('window-preset').onchange = () => {
    const preset = $('window-preset').value;
    if (preset === 'custom') return;
    $('date-to').value = state.data.to;
    $('date-from').value = preset === 'all' ? state.data.from : [state.data.from, S.addDays(state.data.to, 1 - Number(preset))].sort().at(-1);
    applyFilters();
  };
  $('reset-filters').onclick = () => {
    $('dashboard-category').value = 'all';
    $('date-from').value = state.data.from;
    $('date-to').value = state.data.to;
    $('window-preset').value = 'all';
    resetInventory();
    applyFilters();
  };
  $('load-demo').onclick = loadDemo;
  $('choose-reports').onclick = () => $('report-files').click();
  $('report-files').onchange = (event) => importFiles(event.target.files);
  $('download-demo').onclick = downloadDemo;
  $('report-drop').ondragover = (event) => { event.preventDefault(); $('report-drop').classList.add('over'); };
  $('report-drop').ondragleave = (event) => { if (!$('report-drop').contains(event.relatedTarget)) $('report-drop').classList.remove('over'); };
  $('report-drop').ondrop = (event) => { event.preventDefault(); $('report-drop').classList.remove('over'); importFiles(event.dataTransfer.files); };
  $('inventory-search').oninput = (event) => { state.query = event.target.value; state.page = 0; renderInventory(); };
  $('inventory-momentum').onchange = (event) => { state.momentum = event.target.value; state.page = 0; renderInventory(); };
  $('include-grouped').onchange = (event) => { state.grouped = event.target.checked; state.page = 0; renderInventory(); };
  $('inventory-prev').onclick = () => { state.page--; renderInventory(); };
  $('inventory-next').onclick = () => { state.page++; renderInventory(); };
  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-open-import')) openImport();
    else if (button.hasAttribute('data-close-dialog')) button.closest('dialog').close();
    else if (button.dataset.category) { $('dashboard-category').value = button.dataset.category; applyFilters(); }
    else if (button.dataset.item) openItem(button.dataset.item);
    else if (button.dataset.chartMode) { state.chartMode = button.dataset.chartMode; renderActivity(); }
    else if (button.dataset.sort) {
      state.direction = state.sort === button.dataset.sort ? -state.direction : button.dataset.sort === 'name' ? 1 : -1;
      state.sort = button.dataset.sort;
      state.page = 0;
      renderInventory();
    } else if (button.dataset.insight) {
      const insight = state.view.insights.find((entry) => entry.id === button.dataset.insight);
      if (insight.itemId) openItem(insight.itemId);
      else if (insight.id === 'coverage') $('data-quality').scrollIntoView();
      else if (insight.id === 'steady') $('inventory').scrollIntoView();
      else openImport();
    } else if (button.id === 'clear-inventory') { resetInventory(); renderInventory(); }
  });
  loadDemo();
}

init();
