import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { cameraView, openPark, settleCamera, state } from './helpers';

/**
 * The thermal at the Great Hollow's heart (OP-340, flag-hidden behind `?thermal=1`): an owl that jumps
 * and keeps holding Jump in the heart's moonbeam is carried up on warm air, the camera drawing back to
 * the whole oval as it rises, and a glide held from the top carries it to the rim. On an address
 * without the flag a jump at the heart is only a jump.
 */
const HALL = { w: 6400, h: 2800 };
const HEART = { x: 3200, y: 1140 };

async function toTheHeart(page: Page): Promise<void> {
  await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), HEART);
  await expect.poll(async () => { const s = await state(page); return !s.walking && Math.hypot(s.pos.x - HEART.x, s.pos.y - HEART.y) < 30; }, { timeout: 20_000 }).toBe(true);
}

test.describe('the thermal at the heart of the Great Hollow (OP-340)', () => {
  test('Jump held in the heart’s moonbeam carries an owl up to the top, the whole oval in view, and a held glide from there reaches the rim', async ({ page }) => {
    test.slow(); // a rise of four seconds and a glide of eleven
    await openPark(page, { room: 'm3-hall', newmap: '1', thermal: '1' });
    const near = await settleCamera(page);
    await toTheHeart(page);
    // What the thermal is for, said once as the owl first stands in it.
    await expect(page.locator('[data-toasts]')).toContainText('Warm air rises here', { timeout: 10_000 });

    await page.keyboard.down('Space');
    // Lifted (3), up to well over what a jump and its flaps reach, and held at the top.
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(3);
    // It stops rising at the top and hovers there: the same height on two looks, well over a jump's reach.
    let top = 0;
    await expect
      .poll(
        async () => {
          const z = (await state(page)).air.z;
          const hovering = z > 700 && z === top;
          top = z;
          return hovering;
        },
        { timeout: 20_000, intervals: [400] },
      )
      .toBe(true);
    expect((await state(page)).air.s).toBe(3);
    // The camera has drawn back to the whole room, side to side.
    const far = await cameraView(page);
    expect(far.viewW).toBeGreaterThanOrEqual(HALL.w - 1);
    expect(far.viewH).toBeGreaterThanOrEqual(HALL.h - 1);

    // Out of the column with Jump still held: a glide (2), east, a long way, down to the floor.
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(2);
    await expect.poll(async () => (await state(page)).air.s, { timeout: 30_000 }).toBe(0);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Space');
    const landed = await state(page);
    // Three along for one down from the top: most of the way to the east end's doorway, nowhere near where a jump lands.
    expect(landed.pos.x - HEART.x).toBeGreaterThan(2400);
    expect(landed.height).toBe(0);
    // Down, the camera is the owl's own again: as near as before, the owl in it.
    const back = await settleCamera(page);
    expect(back.viewW).toBeCloseTo(near.viewW, 0);
    expect(landed.pos.x).toBeGreaterThan(back.viewX);
    expect(landed.pos.x).toBeLessThan(back.viewX + back.viewW);
  });

  test('let go on the way up, the owl comes down where it is, and the camera comes back in', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', newmap: '1', thermal: '1' });
    const near = await settleCamera(page);
    await toTheHeart(page);
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.z, { timeout: 15_000 }).toBeGreaterThan(450);
    await page.keyboard.up('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 15_000 }).toBe(0);
    const s = await state(page);
    expect(Math.hypot(s.pos.x - HEART.x, s.pos.y - HEART.y)).toBeLessThan(40);
    expect((await settleCamera(page)).viewW).toBeCloseTo(near.viewW, 0);
  });

  test('without the flag a jump at the heart is only a jump', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', newmap: '1' });
    const near = await settleCamera(page);
    await toTheHeart(page);
    await page.keyboard.down('Space');
    await page.waitForTimeout(1200);
    const up = await state(page);
    // A jump and a held glide down: never lifted, never higher than a jump and its flaps.
    expect(up.air.s).not.toBe(3);
    expect(up.flown.peak).toBeLessThan(400);
    expect((await cameraView(page)).viewW).toBeCloseTo(near.viewW, 0);
    await page.keyboard.up('Space');
    await expect(page.locator('[data-toasts]')).not.toContainText('Warm air rises here');
  });
});
