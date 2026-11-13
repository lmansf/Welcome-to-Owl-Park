import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { cameraView, openPark, settleCamera, state } from './helpers';

/**
 * The thermal at the Great Hollow's heart (OP-340, on for every visitor since OP-356): an owl that
 * jumps and keeps holding Jump in the heart's moonbeam is carried up on warm air, the camera drawing
 * back to the whole oval as it rises, and a glide held from the top carries it to the rim.
 */
/** Walks the owl to the heart's moonbeam, where the thermal rises, and says where that is and how wide the room. */
async function toTheHeart(page: Page): Promise<{ heart: { x: number; y: number }; hallW: number }> {
  const s = await state(page);
  const beam = s.objects.find((o) => o.id === 'm3-hall-moonbeam-heart');
  // The knothole up stands at the middle of the back wall: the room is twice as wide as it is across.
  const up = s.doors.find((d) => d.id === 'up');
  if (!beam || !up) throw new Error('not in the Great Hollow');
  const heart = { x: beam.x, y: beam.y };
  await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), heart);
  await expect.poll(async () => { const at = await state(page); return !at.walking && Math.hypot(at.pos.x - heart.x, at.pos.y - heart.y) < 30; }, { timeout: 20_000 }).toBe(true);
  return { heart, hallW: up.x * 2 };
}

test.describe('the thermal at the heart of the Great Hollow (OP-340)', () => {
  test('Jump held in the heart’s moonbeam carries an owl up to the top, the whole oval in view, and a held glide from there reaches the rim', async ({ page }) => {
    test.slow(); // a rise of four seconds and a glide of eleven
    await openPark(page, { room: 'm3-hall', newmap: '1' });
    const near = await settleCamera(page);
    const { heart, hallW } = await toTheHeart(page);
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
    expect(far.viewW).toBeGreaterThanOrEqual(hallW - 1);

    // Out of the column with Jump still held: a glide (2), east, a long way, down to the floor.
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(2);
    await expect.poll(async () => (await state(page)).air.s, { timeout: 30_000 }).toBe(0);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('Space');
    const landed = await state(page);
    // Three along for one down from the top: three quarters of the way to the east end and more, nowhere near where a jump lands.
    expect(landed.pos.x - heart.x).toBeGreaterThan((hallW / 2) * 0.75);
    expect(landed.height).toBe(0);
    // Down, the camera is the owl's own again: as near as before, the owl in it.
    const back = await settleCamera(page);
    expect(back.viewW).toBeCloseTo(near.viewW, 0);
    expect(landed.pos.x).toBeGreaterThan(back.viewX);
    expect(landed.pos.x).toBeLessThan(back.viewX + back.viewW);
  });

  test('let go on the way up, the owl comes down where it is, and the camera comes back in', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', newmap: '1' });
    const near = await settleCamera(page);
    const { heart } = await toTheHeart(page);
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.z, { timeout: 15_000 }).toBeGreaterThan(450);
    await page.keyboard.up('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 15_000 }).toBe(0);
    const s = await state(page);
    expect(Math.hypot(s.pos.x - heart.x, s.pos.y - heart.y)).toBeLessThan(40);
    expect((await settleCamera(page)).viewW).toBeCloseTo(near.viewW, 0);
  });
});
