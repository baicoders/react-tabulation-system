import { defineConfig } from '@playwright/test';

// Runs against a stack that is already up (docker compose, port 8090 by default) with the demo event seeded.
// See e2e/README.md.
export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // One event moves through its rounds, so the steps run in order on one worker.
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8090',
    // Uses the installed Chrome, so no browser download is needed.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
});
