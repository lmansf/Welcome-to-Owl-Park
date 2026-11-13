import { defineConfig, devices } from '@playwright/test';

const target = process.env['PARK_FRESH_VISITOR_URL'];
if (!target) throw new Error('Set PARK_FRESH_VISITOR_URL to the park to check.');
const url = new URL(target);
const local = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('Use the root HTTPS park address or a local HTTP test server.');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'freshVisitor.spec.ts',
  timeout: 100_000,
  workers: 1,
  retries: 0,
  use: { baseURL: url.origin },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'], browserName: 'chromium' } },
  ],
});
