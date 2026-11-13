import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { enterAsGuest, GATE_ASK, walkToDoor } from './helpers';

const LOAD_BUDGET_MS = 8_000;
const PARK_ROOMS = /^(hub|m3-hall|l1|m3-l1)$/;

const room = (page: Page) => page.evaluate(() => window.owlPark?.state()?.room ?? '');

test('a fresh visitor makes an owl, goes through the gate and says Hi (OP-267)', async ({ page }, info) => {
  let pageErrors = 0;
  page.on('pageerror', () => pageErrors++);
  try {
    const start = Date.now();
    await page.goto('/', { waitUntil: 'commit', timeout: LOAD_BUDGET_MS });
    const makeOwl = page.locator('[data-home-btn="login"]');
    await expect(makeOwl).toBeVisible({ timeout: LOAD_BUDGET_MS });
    const homeMs = Date.now() - start;
    console.log(`${info.project.name}: home ready in ${homeMs} ms`);
    expect(homeMs, 'first home screen within the load budget').toBeLessThanOrEqual(LOAD_BUDGET_MS);

    await makeOwl.click({ timeout: 10_000 });
    await page.locator('[data-wo-skip]').click();
    const builder = page.getByRole('dialog', { name: 'Your owl' });
    await expect(builder).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(builder).toBeHidden();

    const playStart = Date.now();
    await page.locator('[data-home-btn="play"]').click();
    await expect.poll(() => room(page), { timeout: LOAD_BUDGET_MS }).toMatch(/^nest-/);
    await expect(page.locator('[data-dot=""]')).toHaveAttribute('data-status', 'online');
    const playMs = Date.now() - playStart;
    console.log(`${info.project.name}: Play to connected nest in ${playMs} ms`);
    expect(playMs, 'connected nest within the load budget after Play').toBeLessThanOrEqual(LOAD_BUDGET_MS);
    await walkToDoor(page, 'to-street');
    await expect.poll(() => room(page), { timeout: 20_000 }).toBe('homes');
    await walkToDoor(page, 'to-lobby');
    await expect.poll(() => room(page), { timeout: 20_000 }).toBe('lobby');

    await walkToDoor(page, 'gate');
    const ask = page.locator(GATE_ASK);
    // An open gate walks the visitor in immediately. A ticket gate lets them enter as a guest.
    await expect.poll(async () => (await ask.isVisible()) || PARK_ROOMS.test(await room(page)), { timeout: 25_000 }).toBe(true);
    if (await ask.isVisible()) await enterAsGuest(page);
    await expect.poll(() => room(page), { timeout: 20_000 }).toMatch(PARK_ROOMS);
    await expect(page.locator('[data-dot=""]')).toHaveAttribute('data-status', 'online');

    await page.locator('[data-say-btn]').click();
    await page.getByRole('dialog', { name: 'Say' }).locator('[data-phrase]').filter({ hasText: /^Hi!/ }).click();
    await expect.poll(() => page.evaluate(() => window.owlPark.state()?.bubbles.some((bubble) => bubble.n === 1 && bubble.id === window.owlPark.playerId) ?? false)).toBe(true);
  } finally {
    expect(pageErrors, 'uncaught browser errors during a fresh visit').toBe(0);
  }
});
