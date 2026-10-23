// Deterministic simulation of a fictional organization's Copilot usage metrics reports.
// Works in the browser and in Node (no dependencies).
import { CATEGORIES, CATEGORY_BY_KEY } from './report.js';

export const ORG = { login: 'contoso-eng', organization_id: '86753090', enterprise: 'contoso', enterprise_id: '4242' };
export const WINDOW_START = '2026-10-08';
export const WINDOW_DAYS = 28;
export const NAMES_START_DAY = '2026-10-22'; // first report day with configured names
export const SEPT_RELEASE_DAY = '2026-09-17';
export const MIN_CLI_FOR_NAMES = '1.0.97';
export const LEGACY_CAP = 5;
export const NAMED_CAP = 25;
export const MAX_NAME_LENGTH = 128;
export const API_VERSION = '2026-03-10';

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const DAYS = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(WINDOW_START, i));
export const WINDOW_END = DAYS[DAYS.length - 1];
export const NAMES_START_INDEX = DAYS.indexOf(NAMES_START_DAY);

export function reportMode(day) {
  return day >= NAMES_START_DAY ? 'named' : 'legacy';
}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export const TEAMS = [
  { slug: 'platform', name: 'Platform', size: 14 },
  { slug: 'payments', name: 'Payments', size: 12 },
  { slug: 'mobile', name: 'Mobile', size: 11 },
  { slug: 'data', name: 'Data', size: 12 },
  { slug: 'web', name: 'Web', size: 15 },
];

const ALL = ['all'];

// w = popularity weight, teams = where it is popular, launch = rollout day inside the window.
export const CATALOG = {
  skill: [
    { name: 'github-pr-media', builtin: true, w: 1.0, teams: ALL },
    { name: 'customize-cloud-agent', builtin: true, w: 0.6, teams: ALL },
    { name: 'code-review', w: 5, teams: ALL, plugin: 'engineering-tools' },
    { name: 'pr-description', w: 4, teams: ALL, plugin: 'engineering-tools' },
    { name: 'changelog-writer', w: 1.5, teams: ALL, plugin: 'engineering-tools' },
    { name: 'release-checks', w: 3, teams: ['platform', 'mobile'] },
    { name: 'incident-runbook', w: 2.5, teams: ['platform', 'payments'] },
    { name: 'db-migration-guide', w: 2, teams: ['data', 'payments'] },
    { name: 'api-style-guide', w: 2.5, teams: ['web', 'payments'] },
    { name: 'terraform-lint', w: 3, teams: ['platform'], plugin: 'platform-kit' },
    { name: 'k8s-manifest-check', w: 2.5, teams: ['platform'], plugin: 'platform-kit' },
    { name: 'cost-estimator', w: 1, teams: ['platform', 'data'], plugin: 'platform-kit' },
    { name: 'security-triage', w: 2, teams: ['payments', 'platform'], plugin: 'security-pack' },
    { name: 'dependency-bump', w: 2.5, teams: ALL, plugin: 'security-pack' },
    { name: 'sql-explain', w: 3, teams: ['data'], plugin: 'data-toolkit' },
    { name: 'log-query-helper', w: 2, teams: ['data', 'platform'], plugin: 'data-toolkit' },
    { name: 'a11y-audit', w: 2, teams: ['web', 'mobile'], plugin: 'frontend-essentials' },
    { name: 'design-tokens', w: 1.5, teams: ['web'], plugin: 'frontend-essentials' },
    { name: 'i18n-strings', w: 1.5, teams: ['web', 'mobile'], plugin: 'frontend-essentials' },
    { name: 'perf-profiling', w: 1.5, teams: ['mobile', 'web'] },
    { name: 'feature-flag-cleanup', w: 1.2, teams: ALL },
    { name: 'test-data-factory', w: 2, teams: ['payments', 'data'] },
    { name: 'oncall-handoff', w: 1, teams: ['platform'] },
    { name: 'graphql-schema-lint', w: 1, teams: ['web'] },
    { name: 'mobile-release-notes', w: 1.5, teams: ['mobile'] },
    { name: 'adr-writer', w: 0.8, teams: ALL },
    { name: 'docs-linter', w: 1, teams: ALL },
    { name: 'error-budget-report', w: 0.7, teams: ['platform'] },
    { name: 'pci-scope-check', w: 1.5, teams: ['payments'] },
    { name: 'flaky-test-hunter', w: 4, teams: ALL, launch: '2026-10-26', story: 'New skill rolled out org-wide on Oct 26.' },
    { name: 'onboarding-buddy', w: 0.5, teams: ALL },
    { name: './skills/legacy-deploy/SKILL.md', w: 1, teams: ['platform'] },
  ],
  custom_agent: [
    { name: 'general-purpose', builtin: true, w: 5, teams: ALL },
    { name: 'explore', builtin: true, w: 4, teams: ALL },
    { name: 'task', builtin: true, w: 3, teams: ALL },
    { name: 'code-review', builtin: true, w: 2.5, teams: ALL },
    { name: 'rubber-duck', builtin: true, w: 1.5, teams: ALL },
    { name: 'security-sentinel', w: 3.5, teams: ['payments', 'platform'], launch: '2026-10-13', story: 'Rolled out Oct 13 - before names were reported, so its first week is hidden in "other".' },
    { name: 'release-reviewer', w: 6, teams: ALL, launch: '2026-10-27', story: 'Rolled out org-wide on Oct 27, after names started appearing.' },
    { name: 'migration-pilot', w: 1.5, teams: ['data', 'payments'] },
    { name: 'docs-gardener', w: 1.2, teams: ALL },
    { name: 'test-writer', w: 2.5, teams: ALL },
    { name: 'infra-whisperer', w: 2, teams: ['platform'] },
    { name: 'api-contract-guard', w: 1.5, teams: ['web', 'payments'] },
    { name: 'frontend-polisher', w: 1.5, teams: ['web', 'mobile'] },
    { name: 'data-pipeline-doctor', w: 1.5, teams: ['data'] },
    { name: '~/.copilot/agents/scratchpad.agent.md', w: 0.8, teams: ALL },
  ],
  mcp: [
    { name: 'github-mcp-server', builtin: true, w: 9, teams: ALL },
    { name: 'contoso-jira', w: 5, teams: ALL },
    { name: 'docs-search', w: 4, teams: ALL },
    { name: 'datadog-observability', w: 3, teams: ['platform', 'payments'] },
    { name: 'confluence-wiki', w: 2, teams: ALL },
    { name: 'postgres-readonly', w: 2.5, teams: ['data', 'payments'] },
    { name: 'internal-feature-flags', w: 2, teams: ['web', 'mobile'] },
    { name: 'sentry-errors', w: 2, teams: ['web', 'mobile'] },
    { name: 'snowflake-analytics', w: 2, teams: ['data'] },
    { name: 'pagerduty-incidents', w: 1.5, teams: ['platform'] },
    { name: 'design-system-figma', w: 1.2, teams: ['web'] },
    { name: 'vault-secrets-readonly', w: 3, teams: ['platform', 'payments'], launch: '2026-10-29', story: 'Platform team published this MCP server on Oct 29.' },
    { name: 'C:\\dev\\mcp\\local-notes\\server.js', w: 0.6, teams: ALL },
  ],
  slash_cmd: [
    { name: '/plan', builtin: true, w: 6, teams: ALL },
    { name: '/model', builtin: true, w: 4, teams: ALL },
    { name: '/clear', builtin: true, w: 4, teams: ALL },
    { name: '/compact', builtin: true, w: 3, teams: ALL },
    { name: '/review', builtin: true, w: 3, teams: ALL },
    { name: '/diff', builtin: true, w: 2.5, teams: ALL },
    { name: '/resume', builtin: true, w: 2, teams: ALL },
    { name: '/mcp', builtin: true, w: 2, teams: ALL },
    { name: '/agent', builtin: true, w: 2, teams: ALL },
    { name: '/skills', builtin: true, w: 1.5, teams: ALL },
    { name: '/delegate', builtin: true, w: 1.2, teams: ALL },
    { name: '/usage', builtin: true, w: 1, teams: ALL },
    { name: '/standup', w: 2.5, teams: ALL },
    { name: '/release-check', w: 2, teams: ['platform', 'mobile'] },
    { name: '/triage', w: 2, teams: ['payments', 'platform'] },
    { name: '/deploy-preview', w: 1.5, teams: ['web'] },
    { name: '/rollback-plan', w: 1, teams: ['platform'] },
    { name: '/perf-report', w: 1, teams: ['mobile', 'web'] },
    { name: '/schema-diff', w: 1, teams: ['data'] },
    { name: '/.github/prompts/hotfix.prompt.md', w: 0.8, teams: ALL },
  ],
  plugin: [
    { name: 'engineering-tools', install: { default: 0.75 } },
    { name: 'platform-kit', install: { platform: 0.9, data: 0.3, default: 0.08 } },
    { name: 'security-pack', install: { payments: 0.85, platform: 0.5, default: 0.15 } },
    { name: 'data-toolkit', install: { data: 0.9, payments: 0.25, default: 0.05 } },
    { name: 'frontend-essentials', install: { web: 0.9, mobile: 0.7, default: 0.05 } },
  ],
};

const ITEM_INDEX = Object.fromEntries(
  Object.entries(CATALOG).map(([k, items]) => [k, new Map(items.map((it) => [it.name, it]))]),
);

export function catalogItem(catKey, name) {
  return ITEM_INDEX[catKey]?.get(name);
}

export function isBuiltin(catKey, name) {
  return Boolean(catalogItem(catKey, name)?.builtin);
}

// ---------------------------------------------------------------------------
// Name rules (simulated: the exact path-detection rule is not published).
// ---------------------------------------------------------------------------
const FILE_EXT = /\.(md|markdown|json|jsonc|ya?ml|toml|js|mjs|cjs|ts|py|sh|ps1|exe|dll)$/i;

export function pathLikeReason(name, catKey) {
  const s = catKey === 'slash_cmd' && name.startsWith('/') ? name.slice(1) : name;
  if (/^[A-Za-z]:[\\/]/.test(s)) return 'starts with a drive letter';
  if (s.startsWith('~')) return 'starts with a home-directory shortcut (~)';
  if (/^\.{1,2}([\\/]|$)/.test(s)) return 'is a relative path (./ or ../)';
  if (/[\\/]/.test(s)) return 'contains a path separator';
  if (FILE_EXT.test(s)) return 'ends with a file extension';
  return null;
}

/** Explains how a configured name ends up in the report. */
export function explainName(raw, catKey) {
  const cat = CATEGORY_BY_KEY[catKey];
  const steps = [];
  let name = String(raw ?? '');
  const trimmed = name.trim();
  if (trimmed !== name) steps.push({ ok: true, text: 'Trimmed surrounding whitespace.' });
  name = trimmed;
  if (!name) {
    steps.push({ ok: false, text: `No usable name, so activity stays grouped under "${cat.bucket}".` });
    return { reported: cat.bucket, named: false, steps };
  }
  const reason = pathLikeReason(name, catKey);
  if (reason) {
    steps.push({ ok: false, text: `Looks like a file path (${reason}), so it stays grouped under "${cat.bucket}".` });
    return { reported: cat.bucket, named: false, steps };
  }
  if (name.length > MAX_NAME_LENGTH) {
    steps.push({ ok: true, text: `Limited to ${MAX_NAME_LENGTH} characters (was ${name.length}).` });
    name = name.slice(0, MAX_NAME_LENGTH).trimEnd();
  }
  steps.push({ ok: true, text: 'Reported by its configured name.' });
  return { reported: name, named: true, steps };
}

export function normalizeName(raw, catKey) {
  const r = explainName(raw, catKey);
  return r.named ? r.reported : null;
}

// ---------------------------------------------------------------------------
// Formatting: legacy (Sep 17) vs named (Oct 22) totals_by_* arrays.
// usageMap: Map<rawName, { n: interactions, u: interactions whose name was not reported }>
// ---------------------------------------------------------------------------
function byCountThenName(field) {
  return (a, b) => b.interaction_count - a.interaction_count || String(a[field]).localeCompare(String(b[field]));
}

export function formatTotals(catKey, usageMap, mode) {
  const cat = CATEGORY_BY_KEY[catKey];
  const field = cat.field;
  const named = new Map();
  let bucket = 0;
  for (const [raw, { n, u }] of usageMap) {
    if (!n) continue;
    if (mode === 'legacy') {
      if (isBuiltin(catKey, raw)) named.set(raw, (named.get(raw) ?? 0) + n);
      else bucket += n;
      continue;
    }
    const reported = normalizeName(raw, catKey);
    if (reported === null) {
      bucket += n;
      continue;
    }
    const visible = isBuiltin(catKey, raw) ? n : n - u;
    if (visible > 0) named.set(reported, (named.get(reported) ?? 0) + visible);
    bucket += n - visible;
  }
  const entries = [...named].map(([name, count]) => ({ [field]: name, interaction_count: count })).sort(byCountThenName(field));
  if (mode === 'legacy') {
    if (bucket) entries.push({ [field]: cat.bucket, interaction_count: bucket });
    return entries.sort(byCountThenName(field)).slice(0, LEGACY_CAP);
  }
  const top = entries.slice(0, NAMED_CAP);
  const overflow = entries.slice(NAMED_CAP).reduce((s, e) => s + e.interaction_count, 0);
  if (cat.bucket === 'custom') {
    if (bucket) top.push({ [field]: 'custom', interaction_count: bucket });
    if (overflow) top.push({ [field]: 'other', interaction_count: overflow });
  } else if (bucket + overflow) {
    top.push({ [field]: 'other', interaction_count: bucket + overflow });
  }
  return top;
}

export function distinctCount(usageMap) {
  let c = 0;
  for (const { n } of usageMap.values()) if (n > 0) c++;
  return c;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ADJ = ['quiet', 'brave', 'swift', 'lucky', 'clever', 'sunny', 'misty', 'bold', 'calm', 'eager', 'fuzzy', 'gentle', 'happy', 'jolly', 'keen', 'lively', 'merry', 'nimble', 'proud', 'rapid', 'tidy', 'witty', 'zesty', 'cosmic'];
const ANIMALS = ['otter', 'falcon', 'panda', 'lynx', 'koala', 'heron', 'badger', 'gecko', 'marmot', 'puffin', 'quokka', 'raven', 'salmon', 'tapir', 'walrus', 'yak', 'bison', 'coyote', 'ferret', 'ibex', 'lemur', 'narwhal', 'okapi', 'manatee'];
const CLI_VERSIONS = [
  ['1.0.103', 0.38], ['1.0.102', 0.14], ['1.0.101', 0.12], ['1.0.99', 0.1], ['1.0.97', 0.08], ['1.0.95', 0.1], ['1.0.91', 0.08],
];
const OUTDATED_UNNAMED_SHARE = 0.35; // simulated share of prompt-mode/app/ACP activity on outdated clients

function affinity(item, team) {
  if (item.teams.includes('all')) return 1;
  return item.teams.includes(team) ? 1.8 : 0.3;
}

function poisson(rng, lambda) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

function weightedPick(rng, pool) {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= pool[i].weight;
    if (r <= 0) return i;
  }
  return pool.length - 1;
}

function makeUsers(rng) {
  const users = [];
  const used = new Set();
  let id = 0;
  for (const team of TEAMS) {
    for (let i = 0; i < team.size; i++) {
      let login;
      do {
        login = `${ADJ[Math.floor(rng() * ADJ.length)]}-${ANIMALS[Math.floor(rng() * ANIMALS.length)]}`;
      } while (used.has(login));
      used.add(login);
      let r = rng();
      let cli = CLI_VERSIONS[CLI_VERSIONS.length - 1][0];
      for (const [v, p] of CLI_VERSIONS) {
        if ((r -= p) <= 0) { cli = v; break; }
      }
      const user = {
        index: users.length,
        user_id: 58000 + id++ * 37,
        user_login: login,
        team: team.slug,
        cli,
        outdated: compareVersions(cli, MIN_CLI_FOR_NAMES) < 0,
        activity: 0.5 + rng() * 0.45,
        intensity: 0.6 + rng() * 1.1,
        breadth: 0.7 + rng() * 0.8,
        pref: new Map(),
        adopt: new Map(),
        plugins: new Set(),
        mcp: new Set(),
      };
      for (const p of CATALOG.plugin) {
        if (rng() < (p.install[team.slug] ?? p.install.default)) user.plugins.add(p.name);
      }
      for (const catKey of ['skill', 'custom_agent', 'mcp', 'slash_cmd']) {
        for (const item of CATALOG[catKey]) {
          const key = `${catKey}:${item.name}`;
          user.pref.set(key, 0.25 + rng() * 1.5);
          if (item.launch) {
            const launchIdx = DAYS.indexOf(item.launch);
            const adopts = rng() < Math.min(0.92, 0.6 * affinity(item, team.slug) + 0.15);
            const lag = Math.floor(-Math.log(1 - rng()) * 4);
            user.adopt.set(key, adopts ? launchIdx + lag : Infinity);
          }
        }
      }
      for (const item of CATALOG.mcp) {
        const p = Math.min(0.97, (item.w / 9) * affinity(item, team.slug) * user.pref.get(`mcp:${item.name}`));
        if (rng() < p) user.mcp.add(item.name);
      }
      users.push(user);
    }
  }
  return users;
}

function available(user, catKey, item, dayIdx) {
  const adoptDay = user.adopt.get(`${catKey}:${item.name}`);
  return adoptDay === undefined || dayIdx >= adoptDay;
}

function addUse(map, name, n, u) {
  const cur = map.get(name) ?? { n: 0, u: 0 };
  cur.n += n;
  cur.u += u;
  map.set(name, cur);
}

function binomial(rng, n, p) {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < p) k++;
  return k;
}

function simulateDay(rng, user, dayIdx) {
  const dow = new Date(`${DAYS[dayIdx]}T00:00:00Z`).getUTCDay();
  const weekend = dow === 0 || dow === 6;
  if (rng() > (weekend ? user.activity * 0.12 : user.activity)) return null;

  const sessions = 1 + Math.floor(rng() * 3 * user.intensity);
  const prompts = sessions * (2 + Math.floor(rng() * 6));
  const requests = Math.round(prompts * (1.4 + rng() * 1.6));
  const day = {
    sessions,
    prompts,
    requests,
    promptTokens: requests * (800 + Math.floor(rng() * 800)),
    outputTokens: requests * (300 + Math.floor(rng() * 600)),
    app: rng() < 0.2,
    sampledAt: `${DAYS[dayIdx]}T${String(8 + Math.floor(rng() * 10)).padStart(2, '0')}:${String(Math.floor(rng() * 60)).padStart(2, '0')}:00.000Z`,
    cats: Object.fromEntries(CATEGORIES.map((c) => [c.key, new Map()])),
  };
  const unnamedPart = (catKey, name, n) => (user.outdated && !isBuiltin(catKey, name) ? binomial(rng, n, OUTDATED_UNNAMED_SHARE) : 0);

  const invocationCats = [
    { catKey: 'skill', lambda: 1.6, countMean: 1.8 },
    { catKey: 'custom_agent', lambda: 1.1, countMean: 1.5 },
    { catKey: 'slash_cmd', lambda: 2.6, countMean: 1.6 },
  ];
  for (const { catKey, lambda, countMean } of invocationCats) {
    const pool = CATALOG[catKey]
      .filter((item) => available(user, catKey, item, dayIdx))
      .filter((item) => !item.plugin || user.plugins.has(item.plugin))
      .map((item) => ({ item, weight: item.w * affinity(item, user.team) * user.pref.get(`${catKey}:${item.name}`) }));
    const k = Math.min(pool.length, poisson(rng, lambda * user.breadth));
    for (let i = 0; i < k; i++) {
      const [{ item }] = pool.splice(weightedPick(rng, pool), 1);
      const n = 1 + Math.floor(-Math.log(1 - rng()) * countMean * user.intensity * Math.sqrt(item.w / 3));
      const u = unnamedPart(catKey, item.name, n);
      addUse(day.cats[catKey], item.name, n, u);
      if (catKey === 'skill' && item.plugin) addUse(day.cats.plugin, item.plugin, n, u);
    }
  }
  for (const item of CATALOG.mcp) {
    if (!user.mcp.has(item.name) && !(item.launch && Number.isFinite(user.adopt.get(`mcp:${item.name}`)))) continue;
    if (!available(user, 'mcp', item, dayIdx)) continue;
    const n = sessions + (rng() < 0.15 ? 1 : 0);
    addUse(day.cats.mcp, item.name, n, unnamedPart('mcp', item.name, n));
  }
  return day;
}

function buildSimulation(seed = 20261028) {
  const rng = mulberry32(seed);
  const users = makeUsers(rng);
  const usage = users.map((u) => DAYS.map((_, di) => simulateDay(rng, u, di)));
  return { users, usage };
}

let SIM;
export function getSim() {
  SIM ??= buildSimulation();
  return SIM;
}

// ---------------------------------------------------------------------------
// Report builders (simplified records: non-customization fields trimmed)
// ---------------------------------------------------------------------------
function scopeIds(scope) {
  return scope === 'enterprise'
    ? { enterprise_id: ORG.enterprise_id }
    : { enterprise_id: ORG.enterprise_id, organization_id: ORG.organization_id };
}

function mergeMaps(maps, catKey, forceUnnamedCustomer = false) {
  const out = new Map();
  for (const m of maps) {
    for (const [name, { n, u }] of m) {
      addUse(out, name, n, forceUnnamedCustomer && !isBuiltin(catKey, name) ? n : u);
    }
  }
  return out;
}

function customizationFields(cats, mode) {
  const out = {};
  for (const c of CATEGORIES) out[c.distinct] = distinctCount(cats[c.key]);
  for (const c of CATEGORIES) out[c.array] = formatTotals(c.key, cats[c.key], mode);
  return out;
}

function tokenUsage(promptTokens, outputTokens, requests) {
  return {
    avg_tokens_per_request: requests ? Math.round(((promptTokens + outputTokens) / requests) * 100) / 100 : 0,
    output_tokens_sum: outputTokens,
    prompt_tokens_sum: promptTokens,
  };
}

export function buildUserDayRecord(userIdx, dayIdx, { scope = 'organization', mode } = {}) {
  const { users, usage } = getSim();
  const u = users[userIdx];
  const d = usage[userIdx][dayIdx];
  if (!d) return null;
  const day = DAYS[dayIdx];
  return {
    day,
    ...scopeIds(scope),
    user_id: u.user_id,
    user_login: u.user_login,
    ai_credits_used: Math.round(d.requests * 0.35 * 10) / 10,
    used_cli: true,
    used_copilot_app: d.app,
    user_initiated_interaction_count: d.prompts,
    totals_by_cli: {
      last_known_cli_version: { cli_version: u.cli, sampled_at: d.sampledAt },
      prompt_count: d.prompts,
      request_count: d.requests,
      session_count: d.sessions,
      token_usage: tokenUsage(d.promptTokens, d.outputTokens, d.requests),
    },
    ...customizationFields(d.cats, mode ?? reportMode(day)),
  };
}

export function buildUsersDayReport(dayIdx, opts = {}) {
  return getSim().users.map((_, i) => buildUserDayRecord(i, dayIdx, opts)).filter(Boolean);
}

export function buildAggregateDayRecord(dayIdx, { scope = 'organization', mode } = {}) {
  const { usage } = getSim();
  const day = DAYS[dayIdx];
  const active = usage.map((u) => u[dayIdx]).filter(Boolean);
  const cats = Object.fromEntries(CATEGORIES.map((c) => [c.key, mergeMaps(active.map((a) => a.cats[c.key]), c.key)]));
  const sum = (f) => active.reduce((s, a) => s + a[f], 0);
  return {
    day,
    ...scopeIds(scope),
    daily_active_users: active.length,
    daily_active_cli_users: active.length,
    daily_active_copilot_app_users: active.filter((a) => a.app).length,
    user_initiated_interaction_count: sum('prompts'),
    totals_by_cli: {
      prompt_count: sum('prompts'),
      request_count: sum('requests'),
      session_count: sum('sessions'),
      token_usage: tokenUsage(sum('promptTokens'), sum('outputTokens'), sum('requests')),
    },
    ...customizationFields(cats, mode ?? reportMode(day)),
  };
}

export function buildAggregate28DayReport({ scope = 'organization', mode } = {}) {
  return [{
    ...scopeIds(scope),
    report_start_day: DAYS[0],
    report_end_day: WINDOW_END,
    day_totals: DAYS.map((_, i) => buildAggregateDayRecord(i, { scope, mode })),
  }];
}

export function buildUser28DayRecord(userIdx, { scope = 'organization' } = {}) {
  const { users, usage } = getSim();
  const u = users[userIdx];
  const activeDays = usage[userIdx].map((d, i) => (d ? { d, i } : null)).filter(Boolean);
  if (!activeDays.length) return null;
  const cats = {};
  for (const c of CATEGORIES) {
    const before = mergeMaps(activeDays.filter(({ i }) => i < NAMES_START_INDEX).map(({ d }) => d.cats[c.key]), c.key, true);
    const after = mergeMaps(activeDays.filter(({ i }) => i >= NAMES_START_INDEX).map(({ d }) => d.cats[c.key]), c.key);
    cats[c.key] = mergeMaps([before, after], c.key);
  }
  const sum = (f) => activeDays.reduce((s, { d }) => s + d[f], 0);
  const last = activeDays[activeDays.length - 1].d;
  return {
    report_start_day: DAYS[0],
    report_end_day: WINDOW_END,
    ...scopeIds(scope),
    user_id: u.user_id,
    user_login: u.user_login,
    ai_credits_used: Math.round(sum('requests') * 0.35 * 10) / 10,
    used_cli: true,
    used_copilot_app: activeDays.some(({ d }) => d.app),
    user_initiated_interaction_count: sum('prompts'),
    totals_by_cli: {
      last_known_cli_version: { cli_version: u.cli, sampled_at: last.sampledAt },
      prompt_count: sum('prompts'),
      request_count: sum('requests'),
      session_count: sum('sessions'),
      token_usage: tokenUsage(sum('promptTokens'), sum('outputTokens'), sum('requests')),
    },
    ...customizationFields(cats, 'named'),
  };
}

export function buildUsers28DayReport(opts = {}) {
  return getSim().users.map((_, i) => buildUser28DayRecord(i, opts)).filter(Boolean);
}

/** Raw (ground-truth) merged usage for the whole org on one day. */
export function orgDayUsage(dayIdx, catKey) {
  const { usage } = getSim();
  return mergeMaps(usage.map((u) => u[dayIdx]).filter(Boolean).map((d) => d.cats[catKey]), catKey);
}

// ---------------------------------------------------------------------------
// Simulated REST API
// ---------------------------------------------------------------------------
export const ENDPOINTS = [
  { id: 'org-1-day', scope: 'organization', path: '/orgs/{org}/copilot/metrics/reports/organization-1-day', day: true, title: 'Organization usage metrics for a specific day' },
  { id: 'org-28-day', scope: 'organization', path: '/orgs/{org}/copilot/metrics/reports/organization-28-day/latest', day: false, title: 'Organization usage metrics (latest 28 days)' },
  { id: 'org-users-1-day', scope: 'organization', path: '/orgs/{org}/copilot/metrics/reports/users-1-day', day: true, title: 'Organization users usage metrics for a specific day' },
  { id: 'org-users-28-day', scope: 'organization', path: '/orgs/{org}/copilot/metrics/reports/users-28-day/latest', day: false, title: 'Organization users usage metrics (latest 28 days)' },
  { id: 'ent-1-day', scope: 'enterprise', path: '/enterprises/{enterprise}/copilot/metrics/reports/enterprise-1-day', day: true, title: 'Enterprise usage metrics for a specific day' },
  { id: 'ent-28-day', scope: 'enterprise', path: '/enterprises/{enterprise}/copilot/metrics/reports/enterprise-28-day/latest', day: false, title: 'Enterprise usage metrics (latest 28 days)' },
  { id: 'ent-users-1-day', scope: 'enterprise', path: '/enterprises/{enterprise}/copilot/metrics/reports/users-1-day', day: true, title: 'Enterprise users usage metrics for a specific day' },
  { id: 'ent-users-28-day', scope: 'enterprise', path: '/enterprises/{enterprise}/copilot/metrics/reports/users-28-day/latest', day: false, title: 'Enterprise users usage metrics (latest 28 days)' },
];

export function simulateRequest(endpointId, day = WINDOW_END) {
  const ep = ENDPOINTS.find((e) => e.id === endpointId);
  if (!ep) throw new Error(`Unknown endpoint ${endpointId}`);
  const path = ep.path.replace('{org}', ORG.login).replace('{enterprise}', ORG.enterprise);
  const url = `https://api.github.com${path}${ep.day ? `?day=${day}` : ''}`;
  const dayIdx = DAYS.indexOf(day);
  if (ep.day && dayIdx < 0) {
    return { ep, url, status: 404, body: { message: 'Not Found', documentation_url: 'https://docs.github.com/rest/copilot/copilot-usage-metrics' }, records: [] };
  }
  const users = ep.id.includes('users');
  let records;
  if (ep.day) records = users ? buildUsersDayReport(dayIdx, { scope: ep.scope }) : [buildAggregateDayRecord(dayIdx, { scope: ep.scope })];
  else records = users ? buildUsers28DayReport({ scope: ep.scope }) : buildAggregate28DayReport({ scope: ep.scope });
  const file = `${ep.id}_${ep.day ? day : `${DAYS[0]}_${WINDOW_END}`}.ndjson`;
  const link = `https://copilot-reports.example.invalid/${ep.scope}/${ep.scope === 'enterprise' ? ORG.enterprise : ORG.login}/${file}?sig=SIMULATED&se=${addDays(WINDOW_END, 1)}T12%3A00%3A00Z`;
  const body = ep.day
    ? { download_links: [link], report_day: day }
    : { download_links: [link], report_start_day: DAYS[0], report_end_day: WINDOW_END };
  return { ep, url, status: 200, body, records, file };
}

export function toNdjson(records) {
  return `${records.map((r) => JSON.stringify(r)).join('\n')}\n`;
}
