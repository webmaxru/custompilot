import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

const layouts = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'tablet', width: 900, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'narrow', width: 320, height: 800 },
];
const pages = ['index.html', 'dashboard.html'];

async function ready(page, route) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(route);
  await expect(page.locator('[data-theme-control]')).toBeEnabled();
  await expect(page.locator(route.startsWith('dashboard') ? '#metric-cards' : '#compare-named')).not.toBeEmpty();
  return errors;
}

for (const route of pages) {
  for (const layout of layouts) {
    for (const theme of ['light', 'dark']) {
      test(`${route} ${layout.name} ${theme}: layout and accessibility`, async ({ page }, testInfo) => {
        await page.setViewportSize(layout);
        const errors = await ready(page, route);
        await page.locator('[data-theme-control]').selectOption(theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(page.getByRole('navigation', { name: 'Pages', exact: true }).getByRole('link', { name: route === 'index.html' ? 'Dashboard' : 'Demo', exact: true })).toBeVisible();
        for (const link of await page.locator('[data-section-nav] a').all()) {
          await expect(link).toBeVisible();
          const box = await link.boundingBox();
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
        const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        expect(result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => ({ target: node.target, reason: node.failureSummary })) }))).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  }
}

test('demo controls, keyboard access and contextual dashboard links', async ({ page }) => {
  const errors = await ready(page, 'index.html');
  const category = page.locator('#compare-tabs button').nth(1);
  await category.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#compare-tabs button').nth(1)).toBeFocused();
  await expect(page.locator('#compare-tabs button').nth(1)).toHaveAttribute('aria-pressed', 'true');
  expect(await page.locator('#compare-named').evaluate((element) =>
    getComputedStyle(element.querySelector('.builtin .bar i')).backgroundColor
      !== getComputedStyle(element.querySelector('.custom .bar i')).backgroundColor)).toBe(true);
  const originalDay = await page.locator('#compare-day').inputValue();
  await page.locator('#compare-day-prev').click();
  expect(await page.locator('#compare-day').inputValue()).not.toBe(originalDay);
  await page.locator('#compare-day-next').click();
  await expect(page.locator('#compare-day')).toHaveValue(originalDay);
  await expect(page.locator('#compare-day-next')).toBeDisabled();
  await page.locator('#dash-tabs [data-cat="mcp"]').click();
  await expect(page.locator('#dashboard-inventory-link')).toHaveAttribute('href', 'dashboard.html?category=mcp#inventory');
  await page.locator('#adopt-item').selectOption('custom_agent:release-reviewer');
  await expect(page.locator('#dashboard-adoption-link')).toHaveAttribute('href', 'dashboard.html?category=custom_agent#rhythm');
  const developer = page.locator('.record-button').nth(1);
  const login = await developer.textContent();
  await developer.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.record-button').nth(1)).toBeFocused();
  await expect(page.locator('#dev-json-title')).toContainText(login);
  await page.locator('#dev-search').fill('no-such-developer');
  await expect(page.locator('#dev-table')).toContainText('No developers match');
  await page.locator('#names-input').fill('./private/agent.md');
  await expect(page.locator('#names-result .result-name')).toHaveClass(/grouped/);
  await page.locator('#dash-timeline summary').click();
  await expect(page.locator('#dash-timeline details table')).toBeVisible();
  await page.locator('#api-analyze').click();
  await expect(page.locator('#an-out')).toContainText('record');
  const download = page.waitForEvent('download');
  await page.locator('#api-download').click();
  expect((await download).suggestedFilename()).toMatch(/\.ndjson$/);
  await page.locator('#dashboard-inventory-link').click();
  await expect(page.locator('#dashboard-category')).toHaveValue('mcp');
  await expect(page).toHaveURL(/category=mcp#inventory$/);
  await page.getByRole('navigation', { name: 'Pages', exact: true }).getByRole('link', { name: 'Demo', exact: true }).click();
  await expect(page.locator('#compare-named')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('dashboard filters, chart values, inventory, details, and section navigation', async ({ page }) => {
  const errors = await ready(page, 'dashboard.html');
  await page.locator('#window-preset').selectOption('7');
  await expect(page.locator('#view-context')).toContainText('7 days');
  await page.locator('[data-chart-mode="attribution"]').click();
  await expect(page.locator('#activity-legend')).toContainText('Grouped');
  await page.locator('#activity-chart summary').click();
  await expect(page.locator('#activity-chart details tbody tr')).toHaveCount(7);
  await page.locator('#reset-filters').click();
  await page.locator('#inventory-search').fill('release-reviewer');
  await page.locator('#inventory-body .item-name').click();
  await expect(page.locator('#item-dialog')).toBeVisible();
  await expect(page.locator('#item-title')).toHaveText('release-reviewer');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#item-dialog')).not.toBeVisible();
  await expect(page.locator('#inventory-body .item-name')).toBeFocused();
  await page.locator('#inventory-search').fill('not-a-real-customization');
  await expect(page.locator('#inventory-body')).toContainText('No customizations match');
  await page.locator('#clear-inventory').click();
  await page.locator('#inventory-next').click();
  await expect(page.locator('#inventory-page-label')).toContainText('13');
  await page.locator('[data-sort="name"]').click();
  await expect(page.locator('[data-sort-column="name"]')).toHaveAttribute('aria-sort', 'ascending');
  await page.locator('#date-from').fill('2026-11-04');
  await page.locator('#date-to').fill('2026-10-22');
  await page.locator('#dashboard-filters button[type="submit"]').click();
  await expect(page.locator('#filter-error')).toBeVisible();
  await expect(page.locator('#view-context')).toContainText('14 days');
  await page.locator('#reset-filters').click();
  await page.locator('.workspace-nav [href="#data-quality"]').click();
  await expect(page.locator('.workspace-nav [href="#data-quality"]')).toHaveAttribute('aria-current', 'location');
  expect(errors).toEqual([]);
});

test('local report import, error recovery, period-only and missing-day states', async ({ page }) => {
  const errors = await ready(page, 'dashboard.html#import');
  await expect(page.locator('#import-dialog')).toBeVisible();
  await page.locator('#report-files').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"download_links":[]}') });
  await expect(page.locator('#import-error')).toBeVisible();
  await expect(page.locator('#source-banner')).toContainText('contoso-eng');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
  await page.locator('#report-files').setInputFiles(path.resolve('sample-data', 'organization-28-day.ndjson'));
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  await expect(page.locator('#source-banner')).toContainText('LOCAL FILES');
  await expect(page.locator('#metric-cards')).toContainText('Per-user reports required');
  await page.locator('.insights-actions [data-open-import]').click();
  const period = {
    organization_id: 123, user_id: 1, user_login: 'test-user',
    report_start_day: '2026-10-22', report_end_day: '2026-11-04',
    totals_by_skill: [{ skill: 'review', interaction_count: 10 }],
  };
  await page.locator('#report-files').setInputFiles({ name: 'period.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([period])) });
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  await expect(page.locator('#activity-chart')).toContainText('Period totals, not daily history');
  await expect(page.locator('#date-from')).toBeDisabled();
  await page.locator('.insights-actions [data-open-import]').click();
  const daily = ['2026-10-22', '2026-10-24'].map((day) => ({
    organization_id: 123, day, totals_by_skill: [{ skill: 'review', interaction_count: 10 }],
  }));
  await page.locator('#report-files').setInputFiles({ name: 'daily.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(daily)) });
  await expect(page.locator('#import-dialog')).not.toBeVisible();
  await expect(page.locator('#activity-context')).toContainText('missing reports');
  await page.locator('#activity-chart summary').click();
  await expect(page.locator('#activity-chart details tbody')).toContainText('No data');
  await page.locator('#load-demo').click();
  await expect(page.locator('#source-banner')).toContainText('SIMULATION');
  expect(errors).toEqual([]);
});

test('theme follows system, persists across pages, and invalid links are explained', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await ready(page, 'index.html');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(20, 25, 28)');
  await page.locator('[data-theme-control]').selectOption('light');
  await page.getByRole('navigation', { name: 'Pages', exact: true }).getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.locator('[data-theme-control]')).toHaveValue('light');
  await page.goto('dashboard.html?category=unknown');
  await expect(page.locator('#filter-error')).toContainText('not recognized');
  await expect(page.locator('#dashboard-category')).toHaveValue('all');
});
