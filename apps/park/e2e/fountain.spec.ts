import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { actionButton, openGround, openPark, state, toScreen } from './helpers';

/**
 * OP-436: a visitor at the front gate couldn't splash in the fountain. The fountain is the painting's own
 * (plazaFloor.ts, PAINTED_THINGS), and only a small spot on the floor in front of it took a tap: a tap on
 * the fountain itself walked the owl to the floor's edge and did nothing. The owl gets there the way a
 * player does (clicks on a computer, taps on a phone; no walk hook, FP-008), then a tap on the painted basin
 * splashes, and so does E or the action button by the fountain.
 */
const SPLASHED = /^(Splash! You shake the water off every feather\.|The water is cold and sparkly\. Very refreshing\.|You splash so hard the moon wobbles in the water\.)$/;
const BASIN = { x: 665, y: 635 };

async function press(page: Page, isMobile: boolean, p: { x: number; y: number }): Promise<void> {
  const s = await toScreen(page, p.x, p.y);
  if (isMobile) await page.touchscreen.tap(s.x, s.y);
  else await page.mouse.click(s.x, s.y);
}

async function stood(page: Page): Promise<void> {
  await page.waitForTimeout(120);
  await expect.poll(async () => (await state(page)).walking, { timeout: 15_000, intervals: [50] }).toBe(false);
}

async function onCanvas(page: Page, p: { x: number; y: number }): Promise<boolean> {
  const s = await toScreen(page, p.x, p.y);
  const size = page.viewportSize()!;
  if (s.x < 24 || s.y < 90 || s.x > size.width - 24 || s.y > size.height - 160) return false;
  return page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName === 'CANVAS', [s.x, s.y]);
}

/** West along the plaza by clicks or taps until the painted basin is on screen. */
async function untilBasinShows(page: Page, isMobile: boolean): Promise<void> {
  for (let i = 0; i < 12; i++) {
    if (await onCanvas(page, BASIN)) return;
    const at = (await state(page)).pos;
    const aim = { x: 700, y: 800 };
    const way: Array<{ x: number; y: number }> = [];
    for (let k = 20; k >= 1; k--) way.push({ x: at.x + ((aim.x - at.x) * k) / 20, y: at.y + ((aim.y - at.y) * k) / 20 });
    const shown: Array<{ x: number; y: number }> = [];
    for (const p of way) if (await onCanvas(page, p)) shown.push(p);
    await press(page, isMobile, await openGround(page, shown));
    await stood(page);
  }
  throw new Error('the fountain never came on screen');
}

test.describe('the front gate’s fountain (OP-436)', () => {
  test('a click or tap on the painted fountain walks the owl over and splashes, and so does E or the action button by it', async ({ page, isMobile }) => {
    test.slow(); // the walk along the plaza
    await openPark(page, { room: 'lobby', collector: 'e2e-fountain' });
    await untilBasinShows(page, isMobile);
    // On the fountain itself, not the floor in front of it: the owl walks over and splashes.
    await press(page, isMobile, BASIN);
    await expect(page.getByText(SPLASHED)).toBeVisible({ timeout: 15_000 });
    const by = (await state(page)).pos;
    expect(Math.hypot(by.x - 665, by.y - 775)).toBeLessThan(110);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-fountain-splash.png` });
    // Standing by it, the way a player is told: E on a computer, the action button on a phone.
    await expect(page.getByText(SPLASHED)).toBeHidden({ timeout: 10_000 });
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000, intervals: [50] }).toContain('use:lobby-fountain');
    if (isMobile) await actionButton(page, 'use:lobby-fountain').first().tap();
    else await page.keyboard.press('e');
    await expect(page.getByText(SPLASHED)).toBeVisible({ timeout: 10_000 });
  });
});
