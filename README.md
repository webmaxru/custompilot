# Custompilot

**Live demo: https://salnikov.no/custompilot/** (hosted on GitHub Pages; `webmaxru.github.io/custompilot/` redirects there)

**Insights dashboard: https://salnikov.no/custompilot/dashboard.html**

Both pages offer a **Light / Dark / System** theme selector. System follows your device's appearance; explicit choices are saved locally and synchronized across pages and open tabs.

The shared **Demo / Dashboard** navigation stays available on small screens. Contextual links from the demo's organization and adoption sections open the same category in the dashboard. Use `dashboard.html?category=skill#inventory` (or `custom_agent`, `mcp`, `slash_cmd`, `plugin`) to link to a filtered inventory; `dashboard.html#import` opens the local report loader. Report files are not transferred between pages.

Both interfaces use the same neutral light/dark surfaces, green action color, and system typography. Chart colors distinguish categories, not decorative accents. Daily charts have expandable data tables, heatmaps show values without hover, and developer records can be selected with the keyboard. All sections remain accessible on mobile; wide data tables and charts scroll within their own regions.

An interactive, simulated demo of the Copilot usage metrics API change announced on
[Oct 22, 2026: *Custom skills, agents and MCP servers in usage metrics API*](https://github.blog/changelog/2026-10-22-custom-skills-agents-and-mcp-servers-in-usage-metrics-api/).

> [!NOTE]
> Every number in the demo comes from a deterministic simulator that runs in your browser.
> It models a fictional organization (`contoso-eng`, 64 developers in 5 teams) from Oct 8 to Nov 4, 2026.
> The demo never calls the real API. It is not an official GitHub product.

## What changed

| | Legacy format | Current format |
|---|---|---|
| Your skills, custom agents, MCP servers, plugins | grouped under `other` | reported by their **configured name** |
| Your custom slash commands | grouped under `custom` | reported by their **configured name** |
| Entries per `totals_by_*` list | top 5 | up to **25**, plus a trailing `other` for remaining activity |
| `interaction_count`, `distinct_*_use_count` | | unchanged |

This affects `totals_by_skill`, `totals_by_custom_agent`, `totals_by_mcp`, `totals_by_slash_cmd` and `totals_by_plugin`
in the organization, enterprise and per-user reports.

## What's in the demo

The separate **[insights dashboard](https://salnikov.no/custompilot/dashboard.html)** focuses on what you can build with named customization reports, rather than comparing API versions:

- Portfolio activity, named coverage, observed developer reach, and recent-period comparisons.
- Category/date filters, activity charts, an adoption heatmap, and a searchable, sortable inventory with per-item drilldowns.
- Evidence-based suggestions for growing, newly observed, declining, and narrowly adopted customizations.
- A clearly labeled simulation covering Oct 22 - Nov 4, plus local multi-file import of real NDJSON/JSON reports.
- Downloadable simulated data, explicit coverage/error states, and no report uploads or browser-side authentication.

Aggregate 1-day and 28-day reports provide activity history. Per-user 1-day files can provide both activity and reach; per-user 28-day files provide period totals and reach only for their exact reporting window. Load matching aggregate and per-user files together for both perspectives. Aggregate activity takes precedence, identical overlaps are deduplicated, and conflicting snapshots or mixed organization/enterprise scopes are rejected. Missing dates remain missing, not zero or simulated activity. Combined activity excludes plugins because their counts already appear in skills.

The original explainer page includes:

1. **Before / after**: the same simulated day rendered in the legacy and current formats, with the customizations that were hidden inside `other`.
2. **Organization dashboard**: an `organization-28-day` report. Shows the share of activity attributed by name, a daily timeline across the format change, and a leaderboard per category.
3. **Adoption tracking**: follow one customization after its rollout, and see which teams use it. Includes one item that launched before the cutover, so its first week is invisible.
4. **Per-user report**: `users-1-day` records with each developer's top custom agent and skill, CLI version warnings, and the raw record.
5. **Simulated API explorer**: all 8 organization and enterprise report endpoints. Shows the request, the signed-download-link response and the NDJSON file, which you can download.
6. **Name rules**: how a configured name is reported. Names are trimmed, limited to 128 characters, and path-like names stay grouped. The demo's path heuristic is an approximation; the real rule isn't published.
7. **Analyze a report file**: drop a real NDJSON report from the API (or a simulated one). It is parsed locally and never uploaded.

## Try it on your real data

`scripts/summarize.mjs` is a zero-dependency Node.js (20+) script. It downloads a report and lists your named customizations.

```sh
# Organization (token needs read:org; you need access to Copilot usage metrics)
GITHUB_TOKEN=<token> node scripts/summarize.mjs --org YOUR_ORG --report organization-28-day

# A specific day, per user, top 10 per category, saving the raw report
GITHUB_TOKEN=<token> node scripts/summarize.mjs --org YOUR_ORG --report users-1-day --day 2026-11-04 --top 10 --save report.ndjson

# Enterprise
GITHUB_TOKEN=<token> node scripts/summarize.mjs --enterprise YOUR_ENTERPRISE --report enterprise-28-day

# A file you already downloaded (or one of the samples)
node scripts/summarize.mjs --file sample-data/organization-28-day.ndjson
```

On PowerShell, set the token with `$env:GITHUB_TOKEN = "<token>"` first. Use `--json` for machine-readable output and `--help` for all options.
The script sends your token only to the API. It does not send it to the signed download links.

To download files for the dashboard with an authenticated GitHub CLI, run these commands in PowerShell from the repository folder:

```powershell
$env:GITHUB_TOKEN = gh auth token
node .\scripts\summarize.mjs --org YOUR_ORG --report organization-28-day --save .\copilot-report.ndjson
node .\scripts\summarize.mjs --org YOUR_ORG --report users-28-day --save .\copilot-users.ndjson
```

Select both saved files using **Load report files** on the dashboard. They must cover the same organization and reporting window to provide full-window reach. Use `users-1-day` with `--day YYYY-MM-DD` for date-specific user reach. Upload the saved NDJSON reports, not the API's JSON response containing `download_links`. The same instructions are available on the [website](https://salnikov.no/custompilot/#real-report-help).

Example output (simulated data, `--top 2`):

```text
Report: aggregate 28-day report · 1 record(s) · 28 day(s)

Custom agents — 76% named · 14 named entries · 2,532 agent starts · max distinct_custom_agent_use_count 15
    1  general-purpose                                    466   18.4%
    2  explore                                            368   14.5%
       (+12 more named)                                 1,096
       other (grouped)                                    602   23.8%
```

In a 28-day report that spans the release, days before Oct 22 still show `other` / `custom`. That is why "named" is below 100% here. The current format first appears in reports dated October 22, 2026; earlier reports use the legacy format.

## Run locally

No build step. The site is plain HTML, CSS and ES modules.

```sh
npm start        # http://localhost:8080 (set PORT to change)
npm test         # node:test suite for the simulator, report reader and CLI
npm run test:ui  # Playwright browser flows, responsive layouts, themes and axe accessibility checks
npm run samples  # regenerate sample-data/*.ndjson from the simulator
```

For browser checks, first run `npm ci` and `npx playwright install chromium`. The UI suite starts its own local server on port 8087 (or reuses one already running there) and covers 320px, 390px, 900px and 1440px layouts in light and dark themes. Screenshots and failing traces are written to the ignored `test-results/` directory. To run the same suite against a deployed site, set `UI_BASE_URL` to its URL, including a trailing slash.

### Deployment

GitHub Pages publishes the repository root from `main`. There is no production build or bundled runtime dependency. After `npm test` and `npm run test:ui` pass, fast-forward the reviewed change onto `main`, wait for the Pages build/deployment, and verify both live URLs. Do not force-push over concurrent changes.

## Project layout

```text
index.html, css/, js/app.js   the demo page
js/sim.js                     deterministic simulator: org, users, catalog, both report formats, simulated API
js/report.js                  report reader shared by the page and the CLI (NDJSON parsing, totals)
dashboard.html                standalone insights dashboard
css/dashboard.css             dashboard-specific responsive styling
js/dashboard.js               charts, filters, imports, heatmap, inventory and item drilldowns
js/dashboard-data.js          validated report ingestion, coverage-aware metrics and actionable insights
scripts/summarize.mjs         CLI for real reports
scripts/generate-samples.mjs  writes sample-data/
scripts/serve.mjs             tiny static server for local development
tests/                        node --test
browser-tests/                browser interaction, accessibility and responsive checks
js/navigation.js              shared in-page location tracking
```

## Good to know (from the changelog and docs)

- **Coverage**: names come from Copilot CLI, the GitHub Copilot app, ACP integrations and the Copilot SDK. Prompt mode, the app and ACP need CLI 1.0.97+; the SDK needs v1.0.21+. Older clients can't be named, and the demo models that.
- **MCP** counts are connection attempts, not tool calls.
- **Plugin** totals count plugin skill invocations, so they are already included in skill totals.
- **Access** works as before. You need to be an enterprise owner, billing manager, organization owner, or have a custom role with "View Copilot Metrics", and the usage metrics policy must be enabled.
- **Review names before sharing** reports outside your organization; they are reported as configured.

See the [Copilot usage metrics REST API docs](https://docs.github.com/rest/copilot/copilot-usage-metrics) for the full schema.

## License

[MIT](LICENSE)
