import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  fullyParallel: true,
  workers: 2,
  timeout: 60000,
  use: {
    baseURL: process.env.UI_BASE_URL || 'http://localhost:8087',
    browserName: 'chromium',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: process.env.UI_BASE_URL ? undefined : {
    command: 'npm start',
    env: { PORT: '8087' },
    url: 'http://localhost:8087',
    reuseExistingServer: !process.env.CI,
  },
});
