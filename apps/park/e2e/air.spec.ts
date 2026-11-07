import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark, state } from './helpers';

/**
 * The air of the realms' courses (OP-275), in Updraft Canopy's third act on the local transport. First
 * an updraft: from the twig c2 a glide into the first column (U11) carries the owl up to its top, and
 * from there it glides down onto the long bough c3. Then a wind current: from the low bough c12 a glide
 * into the crown's column (crown-lift) carries it up, out of the top it glides down onto the wind along
 * the crown (crown-wind), which holds it at the current's height and carries it across the drop; let go
 * over c13 and it comes down there. Jump is held as this device holds it: Space on a computer, the pad's
 * Jump on a phone. The shapes of the air (no column or current reaches a ledge a course keeps for its
 * mechanic, nor runs into a course's thorns) are in packages/shared's tests.
 */

const LIFTED = 3;
const U11_TOP = 600;
const C3_TOP = 540;
const CROWN_LIFT = 5180;
const CROWN_LIFT_TOP = 740;
const WIND_Z = 660;
const WIND_END = 5640;
const C13 = { x0: 5460, x1: 5700, top: 520 };

/** Jump pressed and held as this device does, and a walk east to `x` asked for in the same frame (the owl is off the twig before it can walk off it). */
async function holdJumpAndWalk(page: Page, phone: boolean, x: number): Promise<void> {
  await page.evaluate(
    ({ phone, x }) => {
      if (phone) document.querySelector('[data-pad-jump]')?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true }));
      else window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
      const y = window.owlPark.state()!.pos.y;
      window.owlPark.walkTo(x, y);
    },
    { phone, x },
  );
}

/** Jump let go. */
async function letGo(page: Page, phone: boolean): Promise<void> {
  await page.evaluate((phone) => {
    if (phone) document.querySelector('[data-pad-jump]')?.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true }));
    else window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
  }, phone);
}

/** What the test reads of the owl, for the messages of a poll that fails. */
async function seen(page: Page): Promise<string> {
  const s = await state(page);
  return JSON.stringify({ pos: s.pos, air: s.air, walking: s.walking, wind: s.wind, falls: s.course?.falls });
}

const shot = (page: Page, name: string) => page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-air-${name}.png` });

test.describe('the courses’ air (OP-275)', () => {
  test('an updraft lifts a gliding owl up to a high bough, and a wind current carries it across a drop', async ({ page, isMobile }) => {
    test.slow(); // two flights and a crossing, on a slow phone runner too
    // A phone held upright at 390 wide, as most players hold one; the landscape view is the last shot.
    if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
    await openPark(page, { room: 'canopy-3', spawn: 'on-c2', kit: '1' });
    await expect.poll(async () => (await state(page)).air.z, { timeout: 10_000 }).toBe(160);
    expect((await state(page)).wind.currents).toBe(1);
    if (isMobile) await expect(page.locator('[data-pad-jump]')).toBeVisible();

    // Up: off the twig and into the column, held there rising to its top.
    await holdJumpAndWalk(page, isMobile, 1220);
    await expect
      .poll(async () => { const s = await state(page); return s.air.s === LIFTED && s.air.z >= U11_TOP - 1; }, { timeout: 10_000, intervals: [50], message: `not lifted to the top: ${await seen(page)}` })
      .toBe(true);
    await shot(page, 'updraft-top');

    // Out of the column, still gliding, down onto the long bough.
    await page.evaluate(() => window.owlPark.walkTo(1500, window.owlPark.state()!.pos.y));
    await expect
      .poll(async () => { const s = await state(page); return [s.air.s, s.air.z]; }, { timeout: 10_000, intervals: [50], message: `not down on the bough: ${await seen(page)}` })
      .toEqual([0, C3_TOP]);
    await letGo(page, isMobile);
    expect((await state(page)).course?.falls ?? 0).toBe(0);

    // The crown: on the low bough c12, past the last thorn curtain.
    await openPark(page, { room: 'canopy-3', spawn: 'on-c12', kit: '1' });
    await expect.poll(async () => (await state(page)).air.z, { timeout: 10_000 }).toBe(180);
    // Off the bough into the crown's column, up to its top.
    await holdJumpAndWalk(page, isMobile, CROWN_LIFT);
    await expect
      .poll(async () => { const s = await state(page); return s.air.s === LIFTED && s.air.z >= CROWN_LIFT_TOP - 1; }, { timeout: 10_000, intervals: [50], message: `not lifted up the crown's column: ${await seen(page)}` })
      .toBe(true);
    // Out of its top east, gliding down onto the wind: it catches the owl.
    await page.evaluate(() => window.owlPark.walkTo(5700, window.owlPark.state()!.pos.y));
    await expect.poll(async () => (await state(page)).wind.rides, { timeout: 10_000, intervals: [50], message: `no ride: ${await seen(page)}` }).toBeGreaterThanOrEqual(1);
    expect((await state(page)).air.s).toBe(LIFTED);
    await shot(page, 'wind-ride');
    // Carried to the current's far end, over c13, at the current's height.
    await expect
      .poll(async () => { const s = await state(page); return s.pos.x >= WIND_END - 4 && s.air.s === LIFTED && Math.abs(s.air.z - WIND_Z) < 1; }, { timeout: 10_000, intervals: [50], message: `not carried across: ${await seen(page)}` })
      .toBe(true);
    // Let go: down on c13, across the drop without a fall.
    await letGo(page, isMobile);
    await expect
      .poll(async () => { const s = await state(page); return [s.air.s, s.air.z]; }, { timeout: 5_000, intervals: [50], message: `not down on c13: ${await seen(page)}` })
      .toEqual([0, C13.top]);
    const landed = await state(page);
    expect(landed.pos.x).toBeGreaterThanOrEqual(C13.x0);
    expect(landed.pos.x).toBeLessThanOrEqual(C13.x1);
    expect(landed.course?.falls ?? 0).toBe(0);
    await shot(page, 'across');
    if (isMobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      await shot(page, 'across-landscape');
    }
  });
});
