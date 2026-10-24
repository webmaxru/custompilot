import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const script = await readFile(new URL('../js/theme.js', import.meta.url), 'utf8');
const key = 'custompilot-theme';

test('every page loads the theme before styles and exposes all three choices', async () => {
  const root = new URL('../', import.meta.url);
  const pages = (await readdir(root)).filter((file) => file.endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const file of pages) {
    const html = await readFile(new URL(file, root), 'utf8');
    const bootstrap = html.indexOf('<script src="js/theme.js"></script>');
    assert.ok(bootstrap > 0 && bootstrap < html.indexOf('<link rel="stylesheet"'), file);
    assert.match(html, /<meta name="color-scheme" content="light dark">/);
    assert.equal(html.match(/data-theme-control\b/g)?.length, 1, file);
    assert.match(html, /<select data-theme-control[^>]+autocomplete="off"/);
    for (const mode of ['light', 'dark', 'system']) assert.ok(html.includes(`<option value="${mode}"`), file);
  }
});

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) ?? []) listener(event);
    },
  };
}

function browser({ value = null, inaccessible = false, readError = false, writeError = false } = {}) {
  const values = new Map(value == null ? [] : [[key, value]]);
  const writes = [];
  const warnings = [];
  const controls = [];
  const storage = {
    getItem(name) {
      if (readError) throw new Error('Reading storage is blocked');
      return values.get(name) ?? null;
    },
    setItem(name, next) {
      if (writeError) throw new Error('Writing storage is blocked');
      values.set(name, next);
      writes.push([name, next]);
    },
  };
  const document = {
    ...eventTarget(),
    documentElement: { dataset: {} },
    querySelectorAll(selector) {
      assert.equal(selector, '[data-theme-control]');
      return controls;
    },
  };
  const window = eventTarget();
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (inaccessible) throw new Error('Storage is unavailable');
      return storage;
    },
  });
  runInNewContext(script, { document, window, console: { warn: (...args) => warnings.push(args) } });
  return {
    document, window, storage, values, writes, warnings, controls,
    ready() {
      controls.push({ ...eventTarget(), value: 'system', disabled: true });
      document.dispatch('DOMContentLoaded');
      return controls[0];
    },
    select(value) {
      controls[0].value = value;
      controls[0].dispatch('change');
    },
    get theme() { return document.documentElement.dataset.theme; },
  };
}

test('theme defaults to system without writing a preference', () => {
  const page = browser();
  assert.equal(page.theme, 'system');
  assert.equal(page.ready().value, 'system');
  assert.equal(page.controls[0].disabled, false);
  assert.equal(page.writes.length, 0);
  assert.equal(page.warnings.length, 0);
});

test('saved themes apply before controls or page content are ready', () => {
  for (const value of ['light', 'dark', 'system']) {
    const page = browser({ value });
    assert.equal(page.controls.length, 0);
    assert.equal(page.theme, value);
    assert.equal(page.ready().value, value);
  }
});

test('all three choices update the page and persist for the next page', () => {
  const page = browser();
  page.ready();
  for (const mode of ['light', 'dark', 'system']) {
    page.select(mode);
    assert.equal(page.theme, mode);
    assert.equal(page.controls[0].value, mode);
    assert.equal(page.values.get(key), mode);
    assert.equal(browser({ value: page.values.get(key) }).ready().value, mode);
  }
  assert.deepEqual(page.writes, [[key, 'light'], [key, 'dark'], [key, 'system']]);
});

test('cross-tab theme changes and cleared preferences synchronize without feedback writes', () => {
  const page = browser({ value: 'dark' });
  page.ready();
  page.window.dispatch('storage', { storageArea: page.storage, key, newValue: 'light' });
  assert.equal(page.theme, 'light');
  assert.equal(page.controls[0].value, 'light');
  page.window.dispatch('storage', { storageArea: page.storage, key, newValue: null });
  assert.equal(page.theme, 'system');
  page.window.dispatch('storage', { storageArea: page.storage, key, newValue: 'dark' });
  page.window.dispatch('storage', { storageArea: page.storage, key: null, newValue: null });
  assert.equal(page.theme, 'system');
  assert.equal(page.writes.length, 0);
});

test('unrelated local storage and session storage events do not change the theme', () => {
  const page = browser({ value: 'dark' });
  page.ready();
  page.window.dispatch('storage', { storageArea: page.storage, key: 'another-setting', newValue: 'light' });
  page.window.dispatch('storage', { storageArea: {}, key, newValue: 'light' });
  assert.equal(page.theme, 'dark');
  assert.equal(page.controls[0].value, 'dark');
});

test('history restoration refreshes a stale saved theme', () => {
  const page = browser({ value: 'dark' });
  page.ready();
  page.values.set(key, 'light');
  page.window.dispatch('pageshow', { persisted: false });
  assert.equal(page.theme, 'dark');
  page.window.dispatch('pageshow', { persisted: true });
  assert.equal(page.theme, 'light');
  assert.equal(page.controls[0].value, 'light');
});

test('page display reconciles a browser-restored control with the active theme', () => {
  const page = browser({ value: 'light' });
  const control = page.ready();
  control.value = 'dark';
  page.window.dispatch('pageshow', { persisted: false });
  assert.equal(page.theme, 'light');
  assert.equal(control.value, 'light');
  assert.equal(page.writes.length, 0);
});

test('invalid saved preferences are reported and fall back to system', () => {
  const page = browser({ value: 'not-a-theme' });
  assert.equal(page.theme, 'system');
  assert.equal(page.ready().value, 'system');
  assert.match(page.warnings[0][0], /unsupported saved theme/);
});

test('unavailable or unreadable storage is reported without disabling theme changes', () => {
  for (const failure of [{ inaccessible: true }, { readError: true }]) {
    const page = browser(failure);
    assert.equal(page.theme, 'system');
    assert.equal(page.warnings.length, 1);
    page.ready();
    page.select('light');
    assert.equal(page.theme, 'light');
    page.select('dark');
    assert.equal(page.theme, 'dark');
  }
});

test('a failed preference write is reported without rolling back the selected theme', () => {
  const page = browser({ writeError: true });
  page.ready();
  page.select('dark');
  assert.equal(page.theme, 'dark');
  assert.equal(page.controls[0].value, 'dark');
  assert.equal(page.values.has(key), false);
  assert.match(page.warnings[0][0], /could not be saved/);
});
