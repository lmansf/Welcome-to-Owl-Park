import type { APIRequestContext, Browser, BrowserContextOptions, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY } from './helpers';

/**
 * Closed for setup (OP-205) through the room server, as the keepers will use it before a launch: the
 * capacity page's card closes the whole park, every owl goes to the home screen, and the same card opens
 * it again. While it is closed the home screen shows the closed card with the keepers' words and their
 * reopen time in place of Play (OP-233), so nobody bounces in and out; Play comes back by itself once
 * the park opens, and a keeper's tab (OP-156's token) keeps its Play and walks in.
 * Every test ends with the park open, as deployed, so the other suites find it as before.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const LOOK = { body: '#3E6B48', belly: '#F6F1E3', accent: '#C9A227' };
const WORDS = 'Closed for a test. Back at 5:15.';
/**
 * The home screen asks every 15 s and the Worker lets the answer be kept 5 s; an owl the room has just
 * sent home trusts the room's word over an "open" for 35 s (a Worker that has not heard yet). Play is
 * back well within this.
 */
const REOPEN_MS = 60_000;

/** In a room and welcomed by the room server. */
const inPark = (page: Page) =>
  page.waitForFunction(() => window.owlPark?.state()?.connected === true && document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout: 30_000 });

/** The keepers' setup switch, changed through the capacity route. */
const setup = (request: APIRequestContext, body: Record<string, unknown>) => request.post('/api/admin/capacity', { headers: ADMIN, data: { setup: body } });

/** A visitor's page whose device holds an owl, on the home screen. */
async function visitor(browser: Browser, options: BrowserContextOptions = {}, query = '') {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  await context.addInitScript((look) => localStorage.setItem('owl-park:look', JSON.stringify(look)), LOOK);
  const page = await context.newPage();
  await page.goto(`/?transport=edge${query}`);
  return { context, page, play: page.locator('[data-home-btn="play"]'), card: page.locator('[data-home-closed]') };
}

test.afterEach(async ({ request }) => {
  const r = await setup(request, { on: false, words: null, reopenAt: null });
  expect(r.status(), await r.text()).toBe(200);
});

test('the keepers close the park for setup: every owl goes home to the closed card with no Play, and opening it brings Play back (OP-205, OP-233)', async ({ browser, request }) => {
  test.slow(); // a keeper's page and a visit through the room server, drawn with software WebGL
  const { context, page, play, card } = await visitor(browser);
  await expect(play).toBeVisible({ timeout: 20_000 });
  await expect(card).toBeHidden();
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

  // The owl is sent home to the closed card, with the words, no Play and no reconnect loop.
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-closed-words]')).toHaveText(WORDS);
  await expect(play).toBeHidden();
  await expect(page.locator('.toast').filter({ hasText: 'could not connect' })).toHaveCount(0);
  // Enter plays on the home screen as a rule: not while the park is closed.
  await page.keyboard.press('Enter');
  await expect(card).toBeVisible();
  expect(await page.evaluate(() => window.owlPark.home().shown)).toBe(true);

  // The keepers' reopen time, saved on the capacity page in the keeper's own time.
  const at = await keeper.evaluate(() => {
    const d = new Date(Date.now() + 3 * 3_600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  });
  await keeper.locator('#setup-reopen').fill(at);
  await keeper.locator('#setup-reopen-save').click();
  await expect(keeper.locator('#say')).toContainText('Saved.');
  await expect(keeper.locator('#setup-state')).toContainText('Back by');
  const sent = (await (await request.get('/api/closed')).json()) as { closed: boolean; reopenAt: number | null };
  expect(sent.closed).toBe(true);
  expect(sent.reopenAt).toBe(await keeper.evaluate((v) => new Date(v).getTime(), at));
  await expect(page.locator('[data-closed-back]')).toContainText('Back by', { timeout: REOPEN_MS });

  // Open again: Play comes back on its own, and walks in; the reopen time went with the closing.
  await keeper.getByRole('button', { name: 'Open the park' }).click();
  await expect(keeper.locator('#setup-state')).toHaveText('Open: the park takes owls as usual.');
  await expect(play).toBeVisible({ timeout: REOPEN_MS });
  await expect(card).toBeHidden();
  await play.click();
  await inPark(page);
  await keeper.context().close();
  await context.close();
});

test('a page opened while the park is closed shows no Play, its reopen time in the visitor’s own time zone, and Play back on reopening with no reload; a keeper still walks in (OP-233)', async ({ browser, request }) => {
  test.slow(); // three pages and a keeper's walk through the room server, drawn with software WebGL
  // The reopen time: two hours from now, on the minute.
  const reopenAt = Math.ceil((Date.now() + 2 * 3_600_000) / 60_000) * 60_000;
  expect((await setup(request, { on: true, words: WORDS, reopenAt })).status()).toBe(200);
  expect(await (await request.get('/api/closed')).json()).toEqual({ closed: true, words: WORDS, reopenAt });

  // A visitor far from the park's own time zone.
  const { context, page, play, card } = await visitor(browser, { locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-closed-words]')).toHaveText(WORDS);
  await expect(play).toBeHidden();
  await expect(page.locator('[data-home-btn="login"]')).toBeHidden();
  await expect(page.locator('[data-closed-keeper]')).toBeHidden();
  // The time as a clock in Tokyo reads it, and not the server's.
  const tokyo = await page.evaluate((ms) => new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit' }).format(ms), reopenAt);
  const back = page.locator('[data-closed-back]');
  await expect(back).toContainText('Back by');
  await expect(back).toContainText(tokyo);
  await expect(back).toContainText('GMT+9');

  // A first visit (no owl on this device) is not offered Make your owl, which would walk it in.
  const first = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await first.goto('/?transport=edge');
  await expect(first.locator('[data-home-closed]')).toBeVisible({ timeout: 20_000 });
  await expect(first.locator('[data-home-btn="login"]')).toBeHidden();
  await expect(first.locator('[data-home-btn="play"]')).toBeHidden();
  await first.context().close();

  // A keeper's tab (?keeper=1, OP-156) sees the card and keeps its Play, and its token walks it in.
  const k = await visitor(browser, {}, '&keeper=1');
  k.page.on('dialog', (d) => void d.accept(E2E_ADMIN_KEY));
  await expect(k.card).toBeVisible({ timeout: 20_000 });
  await expect(k.page.locator('[data-closed-keeper]')).toBeVisible();
  await expect(k.play).toBeVisible();
  await k.play.click();
  await inPark(k.page);
  await k.context.close();

  // The keepers open the park: Play comes back on the page as it stands, with no reload.
  await page.evaluate(() => ((window as unknown as { sameLoad: boolean }).sameLoad = true));
  expect((await setup(request, { on: false })).status()).toBe(200);
  expect(await (await request.get('/api/closed')).json()).toEqual({ closed: false, words: null, reopenAt: null });
  await expect(play).toBeVisible({ timeout: REOPEN_MS });
  await expect(card).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { sameLoad?: boolean }).sameLoad)).toBe(true);
  await play.click();
  await inPark(page);
  await context.close();
});
