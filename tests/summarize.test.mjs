import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import * as S from '../js/sim.js';
import { fetchReport, main } from '../scripts/summarize.mjs';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'scripts', 'summarize.mjs');

function mockApi() {
  const seen = [];
  const ndjson = S.toNdjson(S.buildAggregate28DayReport());
  const server = createServer((req, res) => {
    seen.push({ url: req.url, auth: req.headers.authorization, version: req.headers['x-github-api-version'] });
    const base = `http://127.0.0.1:${server.address().port}`;
    if (req.url === '/orgs/contoso-eng/copilot/metrics/reports/organization-28-day/latest') {
      if (req.headers.authorization !== 'Bearer test-token') return res.writeHead(403).end('{"message":"Forbidden"}');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ download_links: [`${base}/download/report.ndjson?sig=x`], report_start_day: S.DAYS[0], report_end_day: S.WINDOW_END }));
    }
    if (req.url === '/download/report.ndjson?sig=x') {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      return res.end(ndjson);
    }
    res.writeHead(404).end('{"message":"Not Found"}');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, base: `http://127.0.0.1:${server.address().port}` })));
}

test('fetchReport calls the API with auth, then downloads without it', async () => {
  const { server, seen, base } = await mockApi();
  try {
    const { meta, records } = await fetchReport({ scope: 'org', owner: 'contoso-eng', report: 'organization-28-day', token: 'test-token', apiBase: base });
    assert.equal(meta.report_end_day, S.WINDOW_END);
    assert.equal(records[0].day_totals.length, 28);
    assert.equal(seen[0].auth, 'Bearer test-token');
    assert.equal(seen[0].version, '2026-03-10');
    assert.equal(seen[1].auth, undefined);
    await assert.rejects(
      fetchReport({ scope: 'org', owner: 'contoso-eng', report: 'organization-28-day', token: 'bad', apiBase: base }),
      /403/,
    );
  } finally {
    server.close();
  }
});

test('fetchReport validates arguments', async () => {
  await assert.rejects(fetchReport({ scope: 'org', owner: 'x', report: 'nope', token: 't' }), /Unknown report/);
  await assert.rejects(fetchReport({ scope: 'org', owner: 'x', report: 'users-1-day', token: 't' }), /--day/);
  await assert.rejects(fetchReport({ scope: 'org', owner: 'x', report: 'organization-28-day' }), /GITHUB_TOKEN/);
});

test('main() in API mode prints a summary and saves the report', async () => {
  const { server, base } = await mockApi();
  const dir = await mkdtemp(path.join(os.tmpdir(), 'custompilot-'));
  const logs = [];
  try {
    const save = path.join(dir, 'saved.ndjson');
    const code = await main(['--org', 'contoso-eng', '--report', 'organization-28-day', '--api-base', base, '--save', save, '--top', '5'], { GITHUB_TOKEN: 'test-token' }, { log: (s) => logs.push(s) });
    assert.equal(code, 0);
    assert.match(logs.join('\n'), /Custom agents — \d+% named/);
    assert.match(logs.join('\n'), /general-purpose/);
    assert.match(logs.join('\n'), /\(\+\d+ more named\)/);
    assert.equal((await readFile(save, 'utf8')).trim().split('\n').length, 1);
  } finally {
    server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI summarizes an NDJSON file end to end', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'custompilot-'));
  try {
    const file = path.join(dir, 'users.ndjson');
    await writeFile(file, S.toNdjson(S.buildUsersDayReport(S.DAYS.length - 1)));
    const { stdout } = await run(process.execPath, [script, '--file', file, '--top', '3']);
    assert.match(stdout, /Report: per-user 1-day report/);
    for (const label of ['Skills', 'Custom agents', 'MCP servers', 'Slash commands', 'Plugins']) assert.match(stdout, new RegExp(label));
    assert.match(stdout, /\(\+\d+ more named\)/);

    const json = JSON.parse((await run(process.execPath, [script, '--file', file, '--json'])).stdout);
    assert.equal(json.kind, 'users-1-day');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('CLI prints help and fails cleanly on bad input', async () => {
  const help = await run(process.execPath, [script, '--help']);
  assert.match(help.stdout, /Usage:/);
  await assert.rejects(run(process.execPath, [script, '--org', 'x', '--report', 'organization-28-day'], { env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' } }), (err) => /GITHUB_TOKEN/.test(err.stderr));
});
