import { defineConfig, devices } from '@playwright/test';
import { E2E_ACCOUNTS, E2E_ADMIN_KEY, E2E_STORE } from './e2e/helpers';

/**
 * The room server's test settings: the admin key, a store that is the stand-in on this machine, and
 * accounts on (OP-139), their mail kept by the same stand-in.
 */
const EDGE_VARS = {
  ADMIN_KEY: E2E_ADMIN_KEY,
  SHOPIFY_SHOP: E2E_STORE.shop,
  SHOPIFY_ADMIN_TOKEN: E2E_STORE.token,
  SHOPIFY_WEBHOOK_SECRET: E2E_STORE.webhookKey,
  SHOPIFY_TEST_ORIGIN: E2E_STORE.origin,
  OPENING_PASS_CODE: E2E_STORE.passCode,
  ACCOUNTS: 'on',
  ACCOUNT_SECRET: E2E_ACCOUNTS.secret,
  MAIL_FROM: E2E_ACCOUNTS.from,
  MAIL_TEST_ORIGIN: E2E_STORE.origin,
};

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // One test at a time on a machine. In CI the suite is split across runners one test at a time, not
  // a file at a time, so the slow files (the climb, the arcade, the room server) spread out (OP-123).
  fullyParallel: !!process.env['CI'],
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  // A shard's report is a blob, merged with the others' into one HTML report by the CI's report job.
  reporter: process.env['CI'] ? [['list'], process.env['PW_BLOB'] ? ['blob'] : ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Collectibles run on the desktop project only: the phone project repeats the park suite's layout checks.
    { name: 'desktop', testMatch: /(park|collect|lobby|activities|nests|arcade|climb|chat|leave|home|pad|mirror|sleep|flight|loader|travel)\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    // Zooming by touch (OP-104) is checked on the phone only.
    { name: 'phone', testMatch: /(park|lobby|nests|arcade|climb|chat|leave|home|pad|mirror|zoom|sleep|flight|loader|travel)\.spec\.ts/, use: { ...devices['Pixel 7'], browserName: 'chromium' } },
    // The room server suite: the built client served by the Worker (wrangler dev), real WebSockets.
    // Two browser contexts, real sockets, two walks and a room change per test: on a loaded CI runner
    // that chain runs close to a minute, so this project gets a longer per-test budget.
    { name: 'edge', testMatch: /(edge|opening|gate|overflow|climb|accounts|travel|policy)\.spec\.ts/, timeout: 90_000, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, baseURL: 'http://localhost:8787' } },
  ],
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // The store the room server reaches in these tests: a stand-in on this machine.
      command: `node e2e/standInStore.mjs ${E2E_STORE.port}`,
      url: `${E2E_STORE.origin}/health`,
      reuseExistingServer: true,
      timeout: 10_000,
    },
    {
      // The admin key lets the ticket tests issue tickets without a store, and the store is the
      // stand-in above; these settings exist only on this test server. The client is built with the
      // store's ticket page, which the booth offers while the gate takes tickets.
      // Each run starts the room server empty, as CI does: in a storage folder of its own, so what an
      // earlier run (or `pnpm dev:edge`) left behind, such as the day's best scores, never decides a test.
      command: `VITE_TICKETS_URL=${E2E_STORE.ticketsUrl} pnpm build && rm -rf ../edge/.wrangler/e2e && pnpm --filter @owl-park/edge dev --persist-to .wrangler/e2e ${Object.entries(EDGE_VARS).map(([k, v]) => `--var ${k}:${v}`).join(' ')}`,
      url: 'http://localhost:8787/api/counts',
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
});
