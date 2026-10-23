import { defineConfig, devices } from '@playwright/test';
import { E2E_ADMIN_KEY } from './e2e/helpers';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Collectibles run on the desktop project only: the phone project repeats the park suite's layout checks.
    { name: 'desktop', testMatch: /(park|collect|lobby|activities|nests|arcade|chat|leave)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', testMatch: /(park|lobby|nests|arcade|chat|leave)\.spec\.ts/, use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    // The room server suite: the built client served by the Worker (wrangler dev), real WebSockets.
    // Two browser contexts, real sockets, two walks and a room change per test: on a loaded CI runner
    // that chain runs close to a minute, so this project gets a longer per-test budget.
    { name: 'edge', testMatch: /edge\.spec\.ts/, timeout: 90_000, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: 'http://localhost:8787' } },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // The admin key lets the ticket test issue tickets without a store; it exists only on this test server.
      command: `pnpm build && pnpm --filter @owl-park/edge dev --var ADMIN_KEY:${E2E_ADMIN_KEY}`,
      url: 'http://localhost:8787/api/counts',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
