# Custompilot

**Live demo: https://webmaxru.github.io/custompilot/**

An interactive, simulated demo of the Copilot usage metrics API change announced on
[Oct 22, 2026: *Custom skills, agents and MCP servers in usage metrics API*](https://github.blog/changelog/2026-10-22-custom-skills-agents-and-mcp-servers-in-usage-metrics-api/).

> [!NOTE]
> Every number in the demo comes from a deterministic simulator that runs in your browser.
> It models a fictional organization (`contoso-eng`, 64 developers in 5 teams) from Oct 8 to Nov 4, 2026.
> The demo never calls the real API. It is not an official GitHub product.

## What changed

| | Before (Sep 17 format) | After (Oct 22) |
|---|---|---|
| Your skills, custom agents, MCP servers, plugins | grouped under `other` | reported by their **configured name** |
| Your custom slash commands | grouped under `custom` | reported by their **configured name** |
| Entries per `totals_by_*` list | top 5 | up to **25**, plus a trailing `other` (`custom` for slash commands) |
| `interaction_count`, `distinct_*_use_count` | | unchanged |

This affects `totals_by_skill`, `totals_by_custom_agent`, `totals_by_mcp`, `totals_by_slash_cmd` and `totals_by_plugin`
in the organization, enterprise and per-user reports.

## What's in the demo

1. **Before / after**: the same simulated day rendered in the Sep 17 format and the Oct 22 format, with the customizations that were hidden inside `other`.
2. **Organization dashboard**: an `organization-28-day` report. Shows the share of activity attributed by name, a daily timeline that crosses the Oct 22 cutover, and a leaderboard per category.
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

Example output (simulated data, `--top 2`):

```text
Report: aggregate 28-day report · 1 record(s) · 28 day(s)

Custom agents — 76% named · 14 named entries · 2,532 agent starts · max distinct_custom_agent_use_count 15
    1  general-purpose                                    466   18.4%
    2  explore                                            368   14.5%
       (+12 more named)                                 1,096
       other (grouped)                                    602   23.8%
```

In a 28-day report that spans the release, days before Oct 22 still show `other` / `custom`. That is why "named" is below 100% here.

## Run locally

No build step. The site is plain HTML, CSS and ES modules.

```sh
npm start        # http://localhost:8080 (set PORT to change)
npm test         # node:test suite for the simulator, report reader and CLI
npm run samples  # regenerate sample-data/*.ndjson from the simulator
```

## Project layout

```text
index.html, css/, js/app.js   the demo page
js/sim.js                     deterministic simulator: org, users, catalog, both report formats, simulated API
js/report.js                  report reader shared by the page and the CLI (NDJSON parsing, totals)
scripts/summarize.mjs         CLI for real reports
scripts/generate-samples.mjs  writes sample-data/
scripts/serve.mjs             tiny static server for local development
tests/                        node --test
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
