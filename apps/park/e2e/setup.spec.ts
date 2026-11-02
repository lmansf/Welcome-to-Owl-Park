import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY } from './helpers';

/**
 * Closed for setup (OP-205) through the room server, as the keepers will use it before a launch: the
 * capacity page's card closes the whole park, every owl goes to the home screen with the closed card's
 * words over Play, Play lets no one back in while it is closed, and the same card opens it again.
 * Every test ends with the park open, as deployed, so the other suites find it as before.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const LOOK = { body: '#3E6B48', belly: '#F6F1E3', accent: '#C9A227' };
const WORDS = 'Closed for a test. Back at 5:15.';

/** In a room and welcomed by the room server. */
const inPark = (page: Page) =>
  page.waitForFunction(() => window.owlPark?.state()?.connected === true && document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout: 30_000 });

test.afterEach(async ({ request }) => {
  const r = await request.post('/api/admin/capacity', { headers: ADMIN, data: { setup: { on: false, words: null } } });
  expect(r.status(), await r.text()).toBe(200);
});

test('the keepers close the park for setup: every owl goes home with the card’s words, Play stays shut, and opening it lets Play back in (OP-205)', async ({ browser, request }) => {
  test.slow(); // a keeper's page and a visit through the room server, drawn with software WebGL
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((look) => localStorage.setItem('owl-park:look', JSON.stringify(look)), LOOK);
  const page = await context.newPage();
  await page.goto('/?transport=edge');
  const play = page.locator('[data-home-btn="play"]');
  await expect(play).toBeVisible({ timeout: 20_000 });
  await play.click();
  await inPark(page);

  // Only the keepers close the park.
  expect((await request.post('/api/admin/capacity', { data: { setup: { on: true } } })).status()).toBe(403);

  const keeper = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  keeper.on('dialog', (d) => void d.accept());
  await keeper.goto('/admin/capacity');
  await keeper.getByLabel('Admin key').fill(E2E_ADMIN_KEY);
  await keeper.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(keeper.locator('#setup-state')).toHaveText('Open: the park takes owls as usual.');
  await keeper.locator('#setup-words').fill(WORDS);
  await keeper.locator('#setup-words-save').click();
  await expect(keeper.locator('#say')).toHaveText('Saved.');
  await keeper.getByRole('button', { name: 'Close the park' }).click();
  await expect(keeper.locator('#setup-state')).toContainText('Closed for setup');

  // The owl is sent home, with the words over Play and no reconnect loop.
  await expect(play).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-home-note]')).toHaveText(WORDS);
  await expect(page.locator('.toast').filter({ hasText: 'could not connect' })).toHaveCount(0);

  // Play while closed: the room sends it back home with the same words.
  await play.click();
  await expect(play).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-home-note]')).toHaveText(WORDS);

  // Open again: Play walks in.
  await keeper.getByRole('button', { name: 'Open the park' }).click();
  await expect(keeper.locator('#setup-state')).toHaveText('Open: the park takes owls as usual.');
  await play.click();
  await inPark(page);
  await keeper.context().close();
  await context.close();
});
