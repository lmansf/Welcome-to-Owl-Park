import { defineConfig, devices } from '@playwright/test';

/**
 * The browser walk (bots/README.md): every room opened in the park as it runs on this machine (the dev
 * server, the local transport, no room server), at a desktop's width and at a phone's. It records what
 * it sees in out/browser for the report (report.mjs), which decides what fails; a test fails here only
 * when the page can't be walked at all. The phone is held sideways (844x390), as the park asks a phone to
 * be: upright, it covers the park with its turn-your-phone card.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /walk\.spec\.ts/,
  timeout: 120_000,
  fullyParallel: true,
  workers: process.env['CI'] ? 3 : 1,
  retries: 0,
  reporter: [['list']],
  outputDir: '../out/test-results',
  use: { baseURL: 'http://localhost:5173', trace: 'off', screenshot: 'off' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
  ],
  webServer: {
    command: 'pnpm dev',
    cwd: '../..',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
