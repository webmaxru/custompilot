import * as S from './sim.js';
import { CATEGORIES, CATEGORY_BY_KEY, collectTotals, parseReport, isBucket, pct } from './report.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = new Intl.NumberFormat('en-US');
const num = (v) => nf.format(v);
const pctf = (v) => `${Math.round(v)}%`;
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;
const utc = (iso) => new Date(`${iso}T00:00:00Z`);
const dayShort = (iso) => utc(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dayLong = (iso) => utc(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

const SIM = S.getSim();
const USER_BY_LOGIN = new Map(SIM.users.map((u) => [u.user_login, u]));
const CUT = S.NAMES_START_INDEX;
const SINGULAR = { skill: 'skill', custom_agent: 'custom agent', mcp: 'MCP server', slash_cmd: 'slash command', plugin: 'plugin' };

const state = {
  compareCat: 'skill',
  compareDay: S.WINDOW_END,
  dashCat: 'custom_agent',
  adoptItem: 'custom_agent:release-reviewer',
  devDay: S.WINDOW_END,
  devTeam: 'all',
  devQuery: '',
  devSelected: null,
  endpoint: 'org-28-day',
  apiDay: S.WINDOW_END,
  apiResult: null,
  nameCat: 'custom_agent',
  nameInput: '  release-reviewer  ',
};

const cache = { agg: null, users: new Map() };
const aggDays = () => (cache.agg ??= S.DAYS.map((_, i) => S.buildAggregateDayRecord(i)));
function usersOn(di) {
  if (!cache.users.has(di)) cache.users.set(di, S.buildUsersDayReport(di));
  return cache.users.get(di);
}

// ---------------------------------------------------------------------------
// Shared rendering helpers
// ---------------------------------------------------------------------------
function dayOptions(selected, showHistory = true) {
  return S.DAYS.map((d) => `<option value="${d}"${d === selected ? ' selected' : ''}>${dayLong(d)}${showHistory && d < S.NAMES_START_DAY ? ' · before names' : ''}</option>`).join('');
}

function syncDayNavigation(id) {
  const select = $(id);
  $(`${id}-prev`).disabled = select.disabled || select.selectedIndex <= 0;
  $(`${id}-next`).disabled = select.disabled || select.selectedIndex >= select.options.length - 1;
}

function wireDayNavigation(id) {
  const select = $(id);
  select.addEventListener('change', () => syncDayNavigation(id));
  for (const [direction, step] of [['prev', -1], ['next', 1]]) {
    $(`${id}-${direction}`).onclick = () => {
      select.selectedIndex += step;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };
  }
  syncDayNavigation(id);
}

function renderTabs(el, current, onPick) {
  el.innerHTML = CATEGORIES.map((c) => `<button type="button" role="tab" data-cat="${c.key}" aria-selected="${c.key === current}">${c.label}</button>`).join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-cat]');
    if (b) onPick(b.dataset.cat);
  };
}

function entryKind(catKey, name, simTags = true) {
  if (isBucket(name)) return 'bucket';
  if (!simTags) return 'custom';
  return S.isBuiltin(catKey, name) ? 'builtin' : 'custom';
}

function barList(catKey, entries, { simTags = true, ranks = false } = {}) {
  if (!entries.length) return '<p class="muted small">No activity.</p>';
  const max = Math.max(1, ...entries.map((e) => e.count));
  let rank = 0;
  const rows = entries.map((e) => {
    const kind = entryKind(catKey, e.name, simTags);
    if (kind !== 'bucket') rank++;
    let tag = '<span class="tag">grouped</span>';
    if (kind === 'custom') tag = simTags ? '<span class="tag yours">yours</span>' : '';
    if (kind === 'builtin') tag = '<span class="tag gh">GitHub</span>';
    const r = ranks ? `<span class="rank">${kind === 'bucket' ? '' : rank}</span>` : '';
    return `<li class="${kind}" title="${esc(e.name)} · ${num(e.count)}">
      <span class="bar-name">${r}<span class="nm">${esc(e.name)}</span>${tag}</span>
      <span class="bar"><i style="width:${((e.count / max) * 100).toFixed(1)}%"></i></span>
      <span class="bar-val">${num(e.count)}</span></li>`;
  });
  return `<ol class="bars">${rows.join('')}</ol>`;
}

const toEntries = (cat, arr) => arr.map((e) => ({ name: e[cat.field], count: e.interaction_count }));

function highlightJson(json) {
  return esc(json).replace(
    /(&quot;(?:[^&\\]|\\.|&(?!quot;))*?&quot;)(\s*:)?|(-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|\b(true|false|null)\b/g,
    (m, str, colon, n, lit) => {
      if (str) return colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`;
      if (n) return `<span class="n">${n}</span>`;
      return `<span class="l">${lit}</span>`;
    },
  );
}

function totalsJson(cat, distinct, arr, highlightYours) {
  const lines = arr.map((e, i) => {
    const name = e[cat.field];
    const line = `    { <span class="k">"${cat.field}"</span>: <span class="s">${esc(JSON.stringify(name))}</span>, <span class="k">"interaction_count"</span>: <span class="n">${e.interaction_count}</span> }${i < arr.length - 1 ? ',' : ''}`;
    return highlightYours && entryKind(cat.key, name) === 'custom' ? `<span class="hl">${line}</span>` : line;
  });
  return `{\n  <span class="k">"${cat.distinct}"</span>: <span class="n">${distinct}</span>,\n  <span class="k">"${cat.array}"</span>: [\n${lines.join('\n')}\n  ]\n}`;
}

// Axis max split into 4 integer steps (0, s, 2s, 3s, 4s).
function niceMax(v) {
  const raw = Math.max(1, v) / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((s) => s >= raw && Number.isInteger(s)) ?? 10 * p;
  return step * 4;
}

let svgSeq = 0;
/**
 * series: [{ day, named, bucket }]; ghost: per-day dashed outline values; line: per-day values on a right axis.
 */
function timelineSvg(series, { ghost = null, line = null, lineLabel = '', launchIdx = null, launchLabel = '' } = {}) {
  const id = `hatch${++svgSeq}`;
  const W = 760;
  const H = 250;
  const L = 44;
  const R = line ? 40 : 14;
  const T = 30;
  const B = 28;
  const iw = W - L - R;
  const ih = H - T - B;
  const slot = iw / series.length;
  const bw = Math.max(4, slot * 0.68);
  const maxY = niceMax(Math.max(1, ...series.map((s) => s.named + s.bucket), ...(ghost ?? []).map((v) => v ?? 0)));
  const y = (v) => T + ih - (v / maxY) * ih;
  const out = [];
  out.push(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily chart"><defs><pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#484f58"/><rect width="3" height="6" fill="#6e7681"/></pattern></defs>`);
  out.push(`<rect class="pre" x="${L}" y="${T}" width="${CUT * slot}" height="${ih}"/>`);
  for (let i = 0; i <= 4; i++) {
    const v = (maxY / 4) * i;
    out.push(`<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${num(Math.round(v))}</text>`);
  }
  series.forEach((s, i) => {
    const x = L + i * slot + (slot - bw) / 2;
    const parts = [`<title>${dayLong(s.day)}${s.named || s.bucket ? `: ${num(s.named)} named` : ''}${s.bucket ? `, ${num(s.bucket)} grouped` : ''}${ghost?.[i] ? `${s.named || s.bucket ? '' : ':'} ${num(ghost[i])} hidden in other (simulated)` : ''}${line?.[i] != null ? ` · ${line[i]} ${lineLabel}` : ''}</title>`];
    parts.push(`<rect fill="transparent" x="${L + i * slot}" y="${T}" width="${slot}" height="${ih}"/>`);
    if (ghost?.[i]) parts.push(`<rect class="ghost" x="${x + 0.5}" y="${y(ghost[i])}" width="${bw - 1}" height="${Math.max(0, y(0) - y(ghost[i]))}" rx="2"/>`);
    if (s.named) parts.push(`<rect class="named" x="${x}" y="${y(s.named)}" width="${bw}" height="${y(0) - y(s.named)}" rx="2"/>`);
    if (s.bucket) parts.push(`<rect fill="url(#${id})" x="${x}" y="${y(s.named + s.bucket)}" width="${bw}" height="${y(0) - y(s.bucket)}" rx="2"/>`);
    out.push(`<g>${parts.join('')}</g>`);
    if (i % 7 === 0 || i === series.length - 1) out.push(`<text x="${L + i * slot + slot / 2}" y="${H - 8}" text-anchor="middle">${dayShort(s.day)}</text>`);
  });
  out.push(`<line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`);
  const cx = L + CUT * slot;
  out.push(`<line class="cut" x1="${cx}" x2="${cx}" y1="${T - 18}" y2="${y(0)}"/><text class="cut-label" x="${cx + 6}" y="${T - 8}">Oct 22 · names reported →</text>`);
  out.push(`<text x="${cx - 6}" y="${T - 8}" text-anchor="end">← Sep 17 format</text>`);
  if (launchIdx != null && launchIdx >= 0) {
    const lx = L + launchIdx * slot + slot / 2;
    out.push(`<line class="launch" x1="${lx}" x2="${lx}" y1="${T + 4}" y2="${y(0)}"/><text class="launch-label" x="${lx + 5}" y="${T + 16}">${esc(launchLabel)}</text>`);
  }
  if (line) {
    const lmax = niceMax(Math.max(1, ...line.map((v) => v ?? 0)));
    const ly = (v) => T + ih - (v / lmax) * ih;
    const pts = line.map((v, i) => (v == null ? null : [L + i * slot + slot / 2, ly(v)])).filter(Boolean);
    if (pts.length) {
      out.push(`<polyline class="line" points="${pts.map((p) => p.join(',')).join(' ')}"/>`);
      pts.forEach(([px, py]) => out.push(`<circle class="dot" cx="${px}" cy="${py}" r="2.6"/>`));
    }
    for (let i = 0; i <= 4; i += 2) {
      const v = (lmax / 4) * i;
      out.push(`<text x="${W - R + 6}" y="${ly(v) + 4}" fill="#a371f7">${num(Math.round(v))}</text>`);
    }
  }
  out.push('</svg>');
  return out.join('');
}

// ---------------------------------------------------------------------------
// 1. Before / after
// ---------------------------------------------------------------------------
function bucketBreakdown(catKey, usage) {
  const pathLike = [];
  let unattributed = 0;
  const visible = new Map();
  for (const [name, { n, u }] of usage) {
    if (!n) continue;
    const reported = S.normalizeName(name, catKey);
    if (reported === null) {
      pathLike.push({ name, count: n });
      continue;
    }
    const v = S.isBuiltin(catKey, name) ? n : n - u;
    unattributed += n - v;
    if (v > 0) visible.set(reported, (visible.get(reported) ?? 0) + v);
  }
  const sorted = [...visible.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const overflow = sorted.slice(S.NAMED_CAP).map(([name, count]) => ({ name, count }));
  return { pathLike, unattributed, overflow };
}

function renderCompare() {
  const cat = CATEGORY_BY_KEY[state.compareCat];
  const di = S.DAYS.indexOf(state.compareDay);
  const usage = S.orgDayUsage(di, cat.key);
  const legacy = S.formatTotals(cat.key, usage, 'legacy');
  const named = S.formatTotals(cat.key, usage, 'named');
  const distinct = S.distinctCount(usage);
  const total = sum([...usage.values()], (v) => v.n);
  const legacyBucket = sum(legacy.filter((e) => isBucket(e[cat.field])), (e) => e.interaction_count);
  const namedNamed = sum(named.filter((e) => !isBucket(e[cat.field])), (e) => e.interaction_count);
  const customItems = [...usage].filter(([nm, v]) => v.n && !S.isBuiltin(cat.key, nm)).sort((a, b) => b[1].n - a[1].n);
  const builtinsUsed = [...usage].filter(([nm, v]) => v.n && S.isBuiltin(cat.key, nm)).length;
  const legacyDropped = Math.max(0, builtinsUsed + (customItems.length ? 1 : 0) - S.LEGACY_CAP);
  const bd = bucketBreakdown(cat.key, usage);

  $('legacy-bucket').textContent = cat.bucket;
  $('compare-summary').innerHTML = `
    <div class="stat"><b>${num(total)}</b><span>${cat.unit} on ${dayShort(state.compareDay)}</span></div>
    <div class="stat"><b>${distinct}</b><span><code>${cat.distinct}</code>, identical in both formats</span></div>
    <div class="stat bad"><b>${pctf(pct(legacyBucket, total))}</b><span>grouped under <code>${cat.bucket}</code> in the Sep 17 format</span></div>
    <div class="stat good"><b>${pctf(pct(namedNamed, total))}</b><span>attributed by name in the Oct 22 format</span></div>`;

  const hidden = customItems.length
    ? `<div class="hidden-list"><p>Inside <code>${cat.bucket}</code>: ${customItems.length} of your ${cat.label.toLowerCase()}, invisible in this format</p><div class="chips">${customItems.map(([nm, v]) => `<span class="chip">${esc(nm)} · ${v.n}</span>`).join('')}</div></div>`
    : '';
  const dropped = legacyDropped ? `<p class="note">${legacyDropped} more GitHub-provided ${legacyDropped === 1 ? 'entry was' : 'entries were'} cut by the top-5 limit.</p>` : '';
  $('compare-legacy').innerHTML = `${barList(cat.key, toEntries(cat, legacy))}${dropped}${hidden}<pre class="code">${totalsJson(cat, distinct, legacy, false)}</pre>`;

  const notes = [];
  if (bd.overflow.length) notes.push(`${bd.overflow.length} named ${bd.overflow.length === 1 ? 'item' : 'items'} beyond the 25-entry cap (${bd.overflow.map((o) => esc(o.name)).join(', ')}) folded into the trailing <code>other</code>.`);
  if (bd.pathLike.length) notes.push(`Path-like names stay grouped under <code>${cat.bucket}</code>: ${bd.pathLike.map((p) => `<code>${esc(p.name)}</code>`).join(', ')}.`);
  if (bd.unattributed) notes.push(`${bd.unattributed} ${cat.unit} came from clients older than CLI ${S.MIN_CLI_FOR_NAMES} (prompt mode / app / ACP), so they can't be named.`);
  $('compare-named').innerHTML = `${barList(cat.key, toEntries(cat, named), { ranks: true })}${notes.map((t) => `<p class="note">${t}</p>`).join('')}<pre class="code">${totalsJson(cat, distinct, named, true)}</pre>`;
}

// ---------------------------------------------------------------------------
// 2. Dashboard
// ---------------------------------------------------------------------------
function splitTotals(cat, record) {
  const arr = record[cat.array] ?? [];
  const bucket = sum(arr.filter((e) => isBucket(e[cat.field])), (e) => e.interaction_count);
  const named = sum(arr.filter((e) => !isBucket(e[cat.field])), (e) => e.interaction_count);
  return { named, bucket };
}

function renderDashboard() {
  const days = aggDays();
  $('dash-sub').innerHTML = `${dayShort(S.DAYS[0])} – ${dayShort(S.WINDOW_END)} 2026 · ${days.length} <code>day_totals</code> · names reported from ${dayShort(S.NAMES_START_DAY)}`;
  $('dash-kpis').innerHTML = CATEGORIES.map((cat) => {
    const pre = days.slice(0, CUT).map((d) => splitTotals(cat, d));
    const post = days.slice(CUT).map((d) => splitTotals(cat, d));
    const postTotal = sum(post, (p) => p.named + p.bucket);
    const share = pct(sum(post, (p) => p.named), postTotal);
    const preShare = pct(sum(pre, (p) => p.named), sum(pre, (p) => p.named + p.bucket));
    return `<button type="button" class="kpi" data-cat="${cat.key}" aria-pressed="${cat.key === state.dashCat}">
      <div class="label">${cat.label}</div>
      <div class="value">${pctf(share)}</div>
      <div class="meter"><i style="width:${share.toFixed(1)}%"></i></div>
      <div class="sub">named since Oct 22 (was ${pctf(preShare)})</div></button>`;
  }).join('');

  const cat = CATEGORY_BY_KEY[state.dashCat];
  const series = days.map((d) => ({ day: d.day, ...splitTotals(cat, d) }));
  $('dash-timeline').innerHTML = timelineSvg(series);
  const post = collectTotals(days.slice(CUT)).categories[cat.key];
  $('dash-board-title').innerHTML = `${cat.label} leaderboard · ${dayShort(S.NAMES_START_DAY)} – ${dayShort(S.WINDOW_END)}`;
  $('dash-board').innerHTML = `${barList(cat.key, post.entries, { ranks: true })}
    <p class="note">${plural(post.namedCount, 'named entry', 'named entries')} across ${days.length - CUT} days of <code>day_totals</code>. <code>${cat.distinct}</code> on ${dayShort(S.WINDOW_END)}: ${days.at(-1)[cat.distinct]}.${cat.key === 'plugin' ? ' Plugin totals are a subset of skill totals.' : ''}${cat.key === 'mcp' ? ' MCP counts are connection attempts, not tool calls.' : ''}</p>`;
}

// ---------------------------------------------------------------------------
// 3. Adoption
// ---------------------------------------------------------------------------
function renderAdoptionOptions() {
  $('adopt-item').innerHTML = CATEGORIES.map((cat) => {
    const items = S.CATALOG[cat.key]
      .filter((it) => !it.builtin && S.normalizeName(it.name, cat.key) !== null)
      .sort((a, b) => Boolean(b.launch) - Boolean(a.launch) || a.name.localeCompare(b.name));
    return `<optgroup label="${cat.label}">${items.map((it) => {
      const v = `${cat.key}:${it.name}`;
      return `<option value="${esc(v)}"${v === state.adoptItem ? ' selected' : ''}>${esc(it.name)}${it.launch ? ` ★ rolled out ${dayShort(it.launch)}` : ''}</option>`;
    }).join('')}</optgroup>`;
  }).join('');
}

function renderAdoption() {
  const sep = state.adoptItem.indexOf(':');
  const catKey = state.adoptItem.slice(0, sep);
  const name = state.adoptItem.slice(sep + 1);
  const cat = CATEGORY_BY_KEY[catKey];
  const item = S.catalogItem(catKey, name) ?? {};
  const days = aggDays();
  const has = (r) => (r[cat.array] ?? []).some((e) => e[cat.field] === name);

  const reported = days.map((d, i) => (i >= CUT ? (d[cat.array].find((e) => e[cat.field] === name)?.interaction_count ?? 0) : null));
  const ghost = S.DAYS.map((_, i) => (i < CUT ? (S.orgDayUsage(i, catKey).get(name)?.n ?? 0) : null));
  const devs = S.DAYS.map((_, i) => (i >= CUT ? usersOn(i).filter(has).length : null));
  const series = S.DAYS.map((day, i) => ({ day, named: reported[i] ?? 0, bucket: 0 }));
  const launchIdx = item.launch ? S.DAYS.indexOf(item.launch) : null;

  const story = [item.story ? esc(item.story) : `<code>${esc(name)}</code> is a ${SINGULAR[catKey]} your organization configured.`];
  if (item.plugin) story.push(`Ships in the <code>${esc(item.plugin)}</code> plugin.`);
  if (catKey === 'plugin') story.push('Plugin interactions count invocations of skills shipped in this plugin, so they are a subset of skill totals.');
  if (catKey === 'mcp') story.push('For MCP servers, <code>interaction_count</code> counts connection attempts, not tool calls.');
  $('adopt-story').innerHTML = story.join(' ');

  const postUsers = new Map();
  const activeByTeam = new Map(S.TEAMS.map((t) => [t.slug, new Set()]));
  for (let i = CUT; i < S.DAYS.length; i++) {
    for (const r of usersOn(i)) {
      const team = USER_BY_LOGIN.get(r.user_login).team;
      activeByTeam.get(team).add(r.user_login);
      if (has(r)) {
        const e = r[cat.array].find((x) => x[cat.field] === name);
        postUsers.set(r.user_login, (postUsers.get(r.user_login) ?? 0) + e.interaction_count);
      }
    }
  }
  const totalReported = sum(reported.filter((v) => v != null));
  const peakIdx = reported.reduce((best, v, i) => (v != null && v > (reported[best] ?? -1) ? i : best), CUT);
  const hiddenTruth = sum(ghost.filter((v) => v != null));
  const adopters = postUsers.size;
  const activeTotal = sum([...activeByTeam.values()], (s) => s.size);

  $('adopt-kpis').className = 'kpis k4';
  $('adopt-kpis').innerHTML = `
    <div class="kpi"><div class="label">Reported since Oct 22</div><div class="value">${num(totalReported)}</div><div class="sub">${cat.unit}</div></div>
    <div class="kpi"><div class="label">Developers using it</div><div class="value">${adopters}</div><div class="sub">of ${activeTotal} active (${pctf(pct(adopters, activeTotal))})</div></div>
    <div class="kpi"><div class="label">Peak day</div><div class="value">${totalReported ? num(reported[peakIdx]) : '–'}</div><div class="sub">${totalReported ? dayLong(S.DAYS[peakIdx]) : 'no reported activity'}</div></div>
    <div class="kpi"><div class="label">Hidden before Oct 22</div><div class="value">${hiddenTruth ? num(hiddenTruth) : '0'}</div><div class="sub">${hiddenTruth ? 'inside <code>other</code> (simulated truth)' : 'no earlier activity'}</div></div>`;

  $('adopt-chart').innerHTML = timelineSvg(series, {
    ghost,
    line: devs,
    lineLabel: 'developers',
    launchIdx,
    launchLabel: launchIdx != null ? `rolled out ${dayShort(item.launch)}` : '',
  });

  const rows = S.TEAMS.map((t) => {
    const active = activeByTeam.get(t.slug);
    const used = [...active].filter((l) => postUsers.has(l)).length;
    return { team: t, active: active.size, used, share: pct(used, active.size) };
  });
  const sorted = [...rows].sort((a, b) => b.share - a.share);
  const best = sorted[0];
  const worst = sorted.at(-1);
  $('adopt-teams').innerHTML = rows.map((r) => `
    <div class="team-row${r === worst && worst.share < best.share ? ' low' : ''}"><span>${r.team.name}</span><span class="bar"><i style="width:${r.share.toFixed(1)}%"></i></span><span class="val">${r.used}/${r.active} · ${pctf(r.share)}</span></div>`).join('')
    + (adopters
      ? `<div class="insight">Strongest in <b>${best.team.name}</b> (${pctf(best.share)}). Weakest in <b>${worst.team.name}</b> (${pctf(worst.share)}), so that is where enablement will pay off most.</div>`
      : '<div class="insight">No named activity reported yet.</div>');
}

// ---------------------------------------------------------------------------
// 4. Developers
// ---------------------------------------------------------------------------
function topName(cat, record, onlyYours) {
  const arr = record[cat.array] ?? [];
  const hit = arr.find((e) => !isBucket(e[cat.field]) && (!onlyYours || !S.isBuiltin(cat.key, e[cat.field])));
  if (hit) return `<span class="mono" title="${esc(hit[cat.field])}">${esc(hit[cat.field])}</span>`;
  const b = arr.find((e) => isBucket(e[cat.field]));
  return b ? `<span class="grouped mono">${b[cat.field]}</span>` : '<span class="muted">–</span>';
}

function renderDevelopers() {
  const di = S.DAYS.indexOf(state.devDay);
  const recs = usersOn(di);
  const q = state.devQuery.trim().toLowerCase();
  const rows = recs.filter((r) => (state.devTeam === 'all' || USER_BY_LOGIN.get(r.user_login).team === state.devTeam) && (!q || r.user_login.includes(q)));
  const outdated = recs.filter((r) => USER_BY_LOGIN.get(r.user_login).outdated).length;
  const legacy = state.devDay < S.NAMES_START_DAY;
  $('dev-sub').innerHTML = `${recs.length} developers active on ${dayLong(state.devDay)}${legacy ? ' · <span class="badge badge-warn">before names: Sep 17 format</span>' : ''} · ${outdated} on Copilot CLI older than ${S.MIN_CLI_FOR_NAMES}, where prompt-mode, app and ACP activity can't be named.`;
  if (!rows.some((r) => r.user_login === state.devSelected)) state.devSelected = rows[0]?.user_login ?? null;

  const C = CATEGORY_BY_KEY;
  $('dev-table').innerHTML = `<thead><tr><th>Developer</th><th>CLI</th><th class="num" title="distinct_skill_use_count">Skills</th><th class="num" title="distinct_custom_agent_use_count">Agents</th><th class="num" title="distinct_mcp_use_count">MCP</th><th>Top agent (yours)</th><th>Top skill</th></tr></thead>
    <tbody>${rows.map((r) => {
      const u = USER_BY_LOGIN.get(r.user_login);
      return `<tr data-login="${r.user_login}" aria-selected="${r.user_login === state.devSelected}">
        <td><span class="mono">${r.user_login}</span><span class="team-chip">${u.team}</span></td>
        <td>${u.outdated ? `<span class="badge badge-warn" title="Older than ${S.MIN_CLI_FOR_NAMES}">${u.cli}</span>` : `<span class="mono">${u.cli}</span>`}</td>
        <td class="num">${r.distinct_skill_use_count}</td>
        <td class="num">${r.distinct_custom_agent_use_count}</td>
        <td class="num">${r.distinct_mcp_use_count}</td>
        <td class="clip">${topName(C.custom_agent, r, true)}</td>
        <td class="clip">${topName(C.skill, r, false)}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="muted">No developers match.</td></tr>'}</tbody>`;

  const sel = rows.find((r) => r.user_login === state.devSelected);
  $('dev-json-title').innerHTML = sel ? `Raw record · <code>${sel.user_login}</code>` : 'Raw record';
  $('dev-json').innerHTML = sel ? highlightJson(JSON.stringify(sel, null, 2)) : '';
}

// ---------------------------------------------------------------------------
// 5. API explorer
// ---------------------------------------------------------------------------
function renderApiForm() {
  const groups = [['organization', 'Organization'], ['enterprise', 'Enterprise']];
  $('api-endpoints').innerHTML = groups.map(([scope, label]) => `<h4>${label}</h4>${S.ENDPOINTS.filter((e) => e.scope === scope).map((e) => `
    <label><input type="radio" name="ep" value="${e.id}"${e.id === state.endpoint ? ' checked' : ''}><span>${e.title}<code>GET ${e.path}${e.day ? '?day=' : ''}</code></span></label>`).join('')}`).join('');
  $('api-day').innerHTML = dayOptions(state.apiDay);
  syncApiDay();
}

function syncApiDay() {
  const ep = S.ENDPOINTS.find((e) => e.id === state.endpoint);
  $('api-day').disabled = !ep.day;
  syncDayNavigation('api-day');
}

function previewRecord(rec) {
  if (Array.isArray(rec.day_totals) && rec.day_totals.length > 1) return { ...rec, day_totals: [rec.day_totals.at(-1)] };
  return rec;
}

function runApi() {
  const res = S.simulateRequest(state.endpoint, state.apiDay);
  state.apiResult = res;
  $('api-request').innerHTML = `<span class="c"># ${esc(res.ep.title)}</span>\ncurl -L \\\n  -H "Accept: application/vnd.github+json" \\\n  -H "Authorization: Bearer &lt;YOUR-TOKEN&gt;" \\\n  -H "X-GitHub-Api-Version: ${S.API_VERSION}" \\\n  "${esc(res.url)}"`;
  $('api-response').innerHTML = `<span class="c">HTTP/2 ${res.status}</span>\n${highlightJson(JSON.stringify(res.body, null, 2))}`;
  if (res.status !== 200) {
    $('api-file-meta').textContent = 'No report file.';
    $('api-file').innerHTML = '';
    return;
  }
  const text = S.toNdjson(res.records);
  const first = res.records[0];
  const truncated = Array.isArray(first?.day_totals) && first.day_totals.length > 1;
  $('api-file-meta').innerHTML = `<code>${esc(res.file)}</code> · ${res.records.length} NDJSON line${res.records.length === 1 ? '' : 's'} · ${(text.length / 1024).toFixed(1)} KB · showing line 1${truncated ? `, <code>day_totals</code> trimmed to the latest of ${first.day_totals.length} days` : ''}`;
  $('api-file').innerHTML = `<span class="c"># curl -L "${esc(res.body.download_links[0])}" -o ${esc(res.file)}</span>\n${first ? highlightJson(JSON.stringify(previewRecord(first), null, 2)) : '<span class="c">(empty report)</span>'}${res.records.length > 1 ? `\n<span class="c">… ${res.records.length - 1} more line${res.records.length === 2 ? '' : 's'}</span>` : ''}`;
}

function downloadApiFile() {
  const res = state.apiResult;
  if (!res?.records?.length) return;
  const blob = new Blob([S.toNdjson(res.records)], { type: 'application/x-ndjson' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = res.file;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// 6. Name rules
// ---------------------------------------------------------------------------
const NAME_EXAMPLES = [
  ['custom_agent', '  release-reviewer  '],
  ['skill', './skills/legacy-deploy/SKILL.md'],
  ['mcp', 'C:\\dev\\mcp\\local-notes\\server.js'],
  ['slash_cmd', '/standup'],
  ['slash_cmd', '/.github/prompts/hotfix.prompt.md'],
  ['custom_agent', '~/.copilot/agents/scratchpad.agent.md'],
  ['mcp', 'vault-secrets-readonly'],
  ['skill', `platform-${'very-long-descriptive-skill-name-'.repeat(5)}v2`],
];

function renderNames() {
  const cat = CATEGORY_BY_KEY[state.nameCat];
  const r = S.explainName(state.nameInput, cat.key);
  const builtin = S.isBuiltin(cat.key, state.nameInput.trim());
  const entry = `{ <span class="k">"${cat.field}"</span>: <span class="s">${esc(JSON.stringify(r.reported))}</span>, <span class="k">"interaction_count"</span>: <span class="n">1</span> }`;
  $('names-result').innerHTML = `
    <span class="result-name ${r.named ? 'ok' : 'grouped'}">${esc(r.reported)}</span>
    <ul class="steps">${r.steps.map((s) => `<li class="${s.ok ? '' : 'bad'}">${esc(s.text)}</li>`).join('')}</ul>
    <pre class="code">${entry}</pre>
    <p class="note">In the Sep 17 format this would have been reported as <code>${builtin ? esc(state.nameInput.trim()) : cat.bucket}</code>${builtin ? ' (GitHub-provided names were already shown)' : ''}.</p>`;
}

// ---------------------------------------------------------------------------
// 7. Analyzer
// ---------------------------------------------------------------------------
const KIND_LABEL = {
  'aggregate-1-day': 'aggregate 1-day report',
  'aggregate-28-day': 'aggregate 28-day report',
  'users-1-day': 'per-user 1-day report',
  'users-28-day': 'per-user 28-day report',
  empty: 'empty report',
};

function renderAnalysis(records, label) {
  const t = collectTotals(records);
  const cards = CATEGORIES.map((cat) => {
    const c = t.categories[cat.key];
    if (!c.present) return `<article class="card"><header class="card-head"><h3>${cat.label}</h3></header><p class="muted small"><code>${cat.array}</code> not present in this report.</p></article>`;
    const share = pct(c.namedTotal, c.total);
    return `<article class="card"><header class="card-head"><h3>${cat.label}</h3><span class="badge ${share > 50 ? 'badge-green' : 'badge-muted'}">${pctf(share)} named</span></header>
      <div class="kpi" style="margin-bottom:10px"><div class="meter"><i style="width:${share.toFixed(1)}%"></i></div><div class="sub">${plural(c.namedCount, 'named entry', 'named entries')} · ${num(c.total)} ${cat.unit}${c.distinctMax != null ? ` · max <code>${cat.distinct}</code> ${c.distinctMax}` : ''}</div></div>
      <div class="scroll">${barList(cat.key, c.entries, { simTags: false, ranks: true })}</div></article>`;
  }).join('');
  const anyPresent = CATEGORIES.some((cat) => t.categories[cat.key].present);
  $('an-out').innerHTML = `<p class="note"><b>${esc(label)}</b> · ${KIND_LABEL[t.kind] ?? t.kind} · ${t.recordCount} record${t.recordCount === 1 ? '' : 's'}${t.dayCount ? ` · ${t.dayCount} day${t.dayCount === 1 ? '' : 's'}` : ''}${t.userCount ? ` · ${t.userCount} users` : ''}</p>
    ${anyPresent ? '' : '<p class="error">No <code>totals_by_*</code> customization arrays found. Is this a Copilot usage metrics report?</p>'}
    <div class="an-grid">${cards}</div>`;
}

async function loadFile(file) {
  try {
    const records = parseReport(await file.text());
    renderAnalysis(records, file.name);
  } catch (err) {
    $('an-out').innerHTML = `<p class="error">Could not read ${esc(file.name)}: ${esc(err.message)}</p>`;
  }
}

function loadSample(kind) {
  if (kind === 'org-28-day') renderAnalysis(S.buildAggregate28DayReport(), 'Simulated organization-28-day (Oct 8 – Nov 4)');
  else if (kind === 'org-users-1-day') renderAnalysis(S.buildUsersDayReport(S.DAYS.length - 1), `Simulated users-1-day (${S.WINDOW_END})`);
  else renderAnalysis([S.buildAggregateDayRecord(CUT - 1)], `Simulated organization-1-day (${S.DAYS[CUT - 1]}, before names)`);
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------
function init() {
  const pickCompare = (k) => { state.compareCat = k; renderTabs($('compare-tabs'), k, pickCompare); renderCompare(); };
  renderTabs($('compare-tabs'), state.compareCat, pickCompare);
  $('compare-day').innerHTML = dayOptions(state.compareDay, false);
  $('compare-day').onchange = (e) => { state.compareDay = e.target.value; renderCompare(); };

  const pickDash = (k) => { state.dashCat = k; renderTabs($('dash-tabs'), k, pickDash); renderDashboard(); };
  renderTabs($('dash-tabs'), state.dashCat, pickDash);
  $('dash-kpis').onclick = (e) => { const b = e.target.closest('[data-cat]'); if (b) pickDash(b.dataset.cat); };

  renderAdoptionOptions();
  $('adopt-item').onchange = (e) => { state.adoptItem = e.target.value; renderAdoption(); };

  $('dev-day').innerHTML = dayOptions(state.devDay);
  $('dev-day').onchange = (e) => { state.devDay = e.target.value; renderDevelopers(); };
  $('dev-team').innerHTML = `<option value="all">All teams</option>${S.TEAMS.map((t) => `<option value="${t.slug}">${t.name}</option>`).join('')}`;
  $('dev-team').onchange = (e) => { state.devTeam = e.target.value; renderDevelopers(); };
  $('dev-search').oninput = (e) => { state.devQuery = e.target.value; renderDevelopers(); };
  $('dev-table').onclick = (e) => {
    const tr = e.target.closest('tr[data-login]');
    if (tr) { state.devSelected = tr.dataset.login; renderDevelopers(); }
  };

  renderApiForm();
  $('api-endpoints').onchange = (e) => { state.endpoint = e.target.value; syncApiDay(); runApi(); };
  $('api-day').onchange = (e) => { state.apiDay = e.target.value; };
  $('api-form').onsubmit = (e) => { e.preventDefault(); runApi(); };
  $('api-download').onclick = downloadApiFile;
  $('api-analyze').onclick = () => {
    if (!state.apiResult?.records?.length) return;
    renderAnalysis(state.apiResult.records, state.apiResult.file);
    $('analyze').scrollIntoView();
  };

  $('names-cat').innerHTML = CATEGORIES.map((c) => `<option value="${c.key}"${c.key === state.nameCat ? ' selected' : ''}>${c.label}</option>`).join('');
  $('names-cat').onchange = (e) => { state.nameCat = e.target.value; renderNames(); };
  $('names-input').value = state.nameInput;
  $('names-input').oninput = (e) => { state.nameInput = e.target.value; renderNames(); };
  $('names-form').onsubmit = (e) => e.preventDefault();
  $('names-examples').innerHTML = NAME_EXAMPLES.map(([c, v], i) => `<button type="button" class="chip" data-i="${i}" title="${esc(CATEGORY_BY_KEY[c].label)}">${esc(v.length > 40 ? `${v.slice(0, 37)}…` : v.replaceAll(' ', '·'))}</button>`).join('');
  $('names-examples').onclick = (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    [state.nameCat, state.nameInput] = NAME_EXAMPLES[Number(b.dataset.i)];
    $('names-cat').value = state.nameCat;
    $('names-input').value = state.nameInput;
    renderNames();
  };

  const drop = $('an-drop');
  $('an-file').onchange = (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); };
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  };
  document.querySelectorAll('[data-sample]').forEach((b) => { b.onclick = () => loadSample(b.dataset.sample); });
  ['compare-day', 'dev-day', 'api-day'].forEach(wireDayNavigation);

  renderCompare();
  renderDashboard();
  renderAdoption();
  renderDevelopers();
  runApi();
  renderNames();
  loadSample('org-28-day');
}

init();
