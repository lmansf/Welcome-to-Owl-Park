import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY } from './helpers';

/**
 * The park's nightly restart (OP-181) through the room server, as the keepers try it on staging:
 * the room's notice, then every owl on the home screen with a calm line, and Play brings it back in.
 * The gate stays as deployed (open), so the turnstiles are not asked here (the Worker's tests are).
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const LOOK = { body: '#3E6B48', belly: '#F6F1E3', accent: '#C9A227' };
/** RESTART_NOTICE and RESTART_HOME in packages/shared/src/edge.ts, as the page shows them. */
const RESTART_NOTICE = 'The park closes for the night in a moment. See you soon!';
const RESTART_HOME = 'The park closed for the night and is open again. Press Play to come back in.';

/** In a room and welcomed by the room server. */
const inPark = (page: Page) =>
  page.waitForFunction(() => window.owlPark?.state()?.connected === true && document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout: 30_000 });

test('the nightly restart sends every owl home after a short notice, and Play brings it back in (OP-181)', async ({ browser, request }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((look) => localStorage.setItem('owl-park:look', JSON.stringify(look)), LOOK);
  const page = await context.newPage();
  await page.goto('/?transport=edge');
  const play = page.locator('[data-home-btn="play"]');
  await expect(play).toBeVisible({ timeout: 20_000 });
  await play.click();
  await inPark(page);

  // Only the keepers restart the park.
  expect((await request.post('/api/admin/restart')).status()).toBe(403);
  const r = await request.post('/api/admin/restart', { headers: ADMIN });
  expect(r.status(), await r.text()).toBe(200);
  expect(((await r.json()) as { missed: number }).missed).toBe(0);

  await expect(page.locator('[data-toasts]')).toContainText(RESTART_NOTICE);
  // About ten seconds on, the room closes and the page goes home, saying so, with no reconnect loop.
  await expect(play).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-toasts]')).toContainText(RESTART_HOME);
  await expect(page.locator('.toast').filter({ hasText: 'could not connect' })).toHaveCount(0);

  await play.click();
  await inPark(page);
  await context.close();
});
