import { defineConfig } from '@playwright/test';

/**
 * Local:  PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test
 *         (points at an already-running dev server; uses installed Chrome)
 * CI:     builds first, then `npm start` is spawned automatically.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    // Locally reuse the system Chrome so no browser download is needed;
    // CI installs the pinned chromium via `playwright install`.
    channel: process.env.CI ? undefined : 'chrome',
    viewport: { width: 1280, height: 800 },
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm start',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
