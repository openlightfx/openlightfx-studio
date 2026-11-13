import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

process.env.OLFX_OUTCOMES ??= path.join('test-results', 'outcomes-browser.jsonl');

const browserUse = {
  ...devices['Desktop Chrome'],
  viewport: { width: 1280, height: 720 },
  baseURL: process.env.OLFX_STUDIO_URL ?? 'http://127.0.0.1:4173',
  actionTimeout: 4_000,
  navigationTimeout: 10_000,
};

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results/playwright',
  timeout: 45_000,
  expect: { timeout: 4_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/playwright.json' }]],
  globalSetup: './tests/harness/reset-outcomes.ts',
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: 'chromium', testDir: 'e2e/browser', use: { ...browserUse, browserName: 'chromium' } },
    { name: 'firefox', testDir: 'e2e/browser', use: { ...browserUse, browserName: 'firefox' } },
    {
      name: 'fullstack',
      testDir: 'e2e/fullstack',
      // One Emby, one preview session, one set of bulbs: run in file order so tests do not
      // stop or take over each other's preview or playback.
      fullyParallel: false,
      use: { ...browserUse, browserName: 'chromium' },
    },
    {
      name: 'fullstack-firefox',
      testDir: 'e2e/fullstack',
      fullyParallel: false,
      use: { ...browserUse, browserName: 'firefox' },
    },
    {
      name: 'realmedia',
      testDir: 'e2e/realmedia',
      use: { ...browserUse, browserName: 'firefox' },
    },
  ],
});
