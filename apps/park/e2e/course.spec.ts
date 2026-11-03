import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark, state } from './helpers';

/**
 * The parkour courses (OP-224), in the test course's first act on the local transport: the dash
 * (Shift on a computer, the pad's Dash above Jump on a phone) in the air only, once a jump, back on
 * landing; a fall into a pit back to the act's way in; and the objective strip counting as the owl
 * goes. The room server's side (where the owl stands, the rewards) is in apps/edge's tests.
 */

const DASH = 162;

/** Walk to a point and wait until the owl stands there. */
async function walkTo(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(([x, y]) => window.owlPark.walkTo(x, y), [x, y] as const);
  await expect.poll(async () => (await state(page)).walking, { timeout: 10_000 }).toBe(false);
}

/** Dash as this device does: Shift on a computer, the pad's Dash on a phone. */
async function dash(page: Page, phone: boolean): Promise<void> {
  if (phone) await page.locator('[data-pad-dash]').dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true });
  else await page.keyboard.press('Shift');
}

/** Jump, and once the owl is up, dash. */
async function jumpAndDash(page: Page, phone: boolean): Promise<void> {
  expect(await page.evaluate(() => window.owlPark.jump(400))).toBe(true);
  await expect.poll(async () => (await state(page)).air.s, { timeout: 5_000, intervals: [20] }).not.toBe(0);
  await dash(page, phone);
}

/** Down on the ground again. */
const landed = (page: Page) => expect.poll(async () => (await state(page)).air.s, { timeout: 5_000, intervals: [50] }).toBe(0);

test.describe('the parkour courses (OP-224)', () => {
  test('the dash: in the air only, once a jump, back on landing; and a fall into a pit is back at the way in', async ({ page, isMobile }) => {
    await openPark(page, { room: 'trail-1' });
    // In the first act at its way in: a run starts.
    await expect.poll(async () => (await state(page)).course?.run ?? null, { timeout: 10_000 }).not.toBeNull();
    const first = await state(page);
    expect(first.dash).toEqual({ holds: true, spent: false, dashes: 0 });
    if (isMobile) await expect(page.locator('[data-pad-dash]')).toBeVisible();
    await walkTo(page, 500, 600);
    // On the ground: no dash.
    await dash(page, isMobile);
    expect((await state(page)).dash.dashes).toBe(0);
    // Up in the air: a dash the way the owl faces (east, the way it walked), and one only.
    const from = (await state(page)).pos;
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await jumpAndDash(page, isMobile);
    const seen = async () => { const s = await state(page); return JSON.stringify({ pos: s.pos, air: s.air, dash: s.dash, walking: s.walking, errors }); };
    await expect.poll(async () => (await state(page)).dash.dashes, { timeout: 2_000, message: `no dash: ${await seen()}` }).toBe(1);
    // Spent until it lands. A slow phone runner can step past the landing before this read, and
    // landing gives the dash back, so the read only holds the owl to "spent" while it is still up
    // (the exact rule, once a jump, is pinned frame by frame in dash.test.ts).
    const mid = await state(page);
    expect(mid.dash.spent || mid.air.s === 0).toBe(true);
    await dash(page, isMobile);
    await expect.poll(async () => (await state(page)).walking, { timeout: 2_000 }).toBe(false);
    const to = (await state(page)).pos;
    expect(to.x - from.x).toBeGreaterThan(DASH - 4);
    expect(to.x - from.x).toBeLessThan(DASH + 4);
    expect(Math.abs(to.y - from.y)).toBeLessThan(2);
    expect((await state(page)).dash.dashes).toBe(1);
    // Landed: it is back.
    await landed(page);
    expect((await state(page)).dash.spent).toBe(false);
    // Another jump and dash from here comes down in the pit (700 to 900 across): a fall, back at the way in.
    await jumpAndDash(page, isMobile);
    await expect.poll(async () => (await state(page)).course?.falls, { timeout: 8_000 }).toBe(1);
    const back = await state(page);
    expect(back.dash.dashes).toBe(2);
    expect(Math.hypot(back.pos.x - 220, back.pos.y - 580)).toBeLessThan(2);
  });

  test('the objective strip counts the bells and the lost feathers; the dash is a course’s alone', async ({ page, isMobile }) => {
    await openPark(page, { room: 'trail-1' });
    const strip = page.locator('[data-objective]');
    await expect(strip).toContainText('Bells rung 0/3');
    await expect(strip).toContainText('Lost feathers 0/5');
    await expect(strip.locator('.pip')).toHaveCount(3);
    await expect.poll(async () => (await state(page)).course !== null, { timeout: 10_000 }).toBe(true);
    // The lost feather by the pit's near lip: found, for good.
    await walkTo(page, 640, 720);
    await expect(strip).toContainText('Lost feathers 1/5');
    await expect.poll(async () => (await state(page)).course?.feathers, { timeout: 5_000 }).toEqual(['f1']);
    // Out of the course (the hub): no strip, no dash, and on a phone no Dash on the pad.
    await openPark(page);
    await expect(page.locator('[data-objective]')).toHaveCount(0);
    expect((await state(page)).dash).toEqual({ holds: false, spent: false, dashes: 0 });
    if (isMobile) await expect(page.locator('[data-pad-dash]')).toBeHidden();
    await page.keyboard.press('Shift');
    expect((await state(page)).dash.dashes).toBe(0);
  });
});
