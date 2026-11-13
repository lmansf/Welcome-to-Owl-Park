import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { HELD_FRAME_MS, cameraView, heldStandingAt, heldUntil, holdTheClock, openHeld, openPark, settleCamera, state, stateNow } from './helpers';

/**
 * The town view (OP-336, on for every visitor since OP-356): a room seen from above shows more of
 * itself, and through the turnstiles the Great Hollow opens on its whole oval and eases in on the owl.
 */
/**
 * How wide the Great Hollow is, from the page: the knothole up stands at the middle of its back wall
 * (hollowOval.ts), so the room is twice as wide as the knothole is across it.
 */
async function hallWidth(page: Page): Promise<number> {
  const up = (await state(page)).doors.find((d) => d.id === 'up');
  if (!up) throw new Error('not in the Great Hollow');
  return up.x * 2;
}

type HallSeen = { width: number; widest: number; first: number | null; drewIn: number | null; walkedAt: number | null };

/**
 * In the page: the widest the camera has shown of the Great Hollow, when it first showed it, when it
 * first drew in to under half the room across, and when the owl first walked. With `tapAtFirst`, the
 * player's first move is made the moment the room is in: a walk out onto the floor below the knothole.
 */
async function watchHall(page: Page, tapAtFirst = false): Promise<void> {
  await page.evaluate((tapAtFirst) => {
    const w = window as unknown as { __hall: { width: number; widest: number; first: number | null; drewIn: number | null; walkedAt: number | null } };
    w.__hall = { width: 0, widest: 0, first: null, drewIn: null, walkedAt: null };
    const tick = () => {
      const s = window.owlPark.state();
      const c = s?.room === 'm3-hall' ? window.owlPark.camera() : null;
      const up = s?.doors.find((d) => d.id === 'up');
      if (c && up) {
        const now = performance.now();
        if (w.__hall.first === null) {
          w.__hall.first = now;
          w.__hall.width = up.x * 2;
          if (tapAtFirst) window.owlPark.walkTo(up.x, up.y + 560);
        }
        w.__hall.widest = Math.max(w.__hall.widest, c.viewW);
        if (w.__hall.walkedAt === null && s?.walking) w.__hall.walkedAt = now;
        if (w.__hall.drewIn === null && c.viewW < up.x) w.__hall.drewIn = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, tapAtFirst);
}

const hallSeen = (page: Page) => page.evaluate(() => (window as unknown as { __hall: HallSeen }).__hall);

/** From before the turnstiles, up through them into the Great Hollow, up held all the way as a player holds it. */
async function throughTheTurnstiles(page: Page): Promise<void> {
  await page.evaluate(() => window.owlPark.walkTo(2595, 800));
  await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('m3-hall');
}

test.describe('the town view (OP-336)', () => {
  test('a screen shows well over one screen of the Great Hollow’s depth, its owls no smaller than a phone held sideways drew them', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', newmap: '1' });
    const town = await settleCamera(page);
    // Before the town view every screen showed 900 px of a room's depth, and as much across as its shape gave it.
    expect(town.viewH).toBeGreaterThan(900 * 1.4);
    expect(town.zoom / town.dpr).toBeGreaterThanOrEqual(0.42 - 1e-6);
    // Nothing past the room's sides or its back wall, and the owl is in view.
    expect(town.viewX).toBeGreaterThanOrEqual(-0.5);
    expect(town.viewX + town.viewW).toBeLessThanOrEqual((await hallWidth(page)) + 0.5);
    expect(town.viewY).toBeGreaterThanOrEqual(-0.5);
    const me = (await state(page)).pos;
    expect(me.x).toBeGreaterThan(town.viewX);
    expect(me.x).toBeLessThan(town.viewX + town.viewW);
    expect(me.y).toBeGreaterThan(town.viewY);
    expect(me.y).toBeLessThan(town.viewY + town.viewH);
  });

  test('a room whose whole depth fits the screen fills it from its back wall down', async ({ page }) => {
    await openPark(page, { room: 'lobby', newmap: '1' });
    const town = await settleCamera(page);
    // The Treetop Commons is 1,350 deep: all of it on a computer, and on a phone held upright too.
    expect(town.viewH).toBeCloseTo(1350, 0);
    expect(town.viewY).toBeCloseTo(0, 0);
  });

  test('through the turnstiles the Great Hollow opens on its whole oval, then eases in on the owl', async ({ page }) => {
    await openPark(page, { room: 'lobby', keeper: '1', newmap: '1' });
    await watchHall(page);
    await throughTheTurnstiles(page);
    // Up is still held, as it was through the turnstiles: that is no move, and the look runs its course.
    await expect.poll(async () => (await hallSeen(page)).drewIn, { timeout: 10_000 }).not.toBeNull();
    const seen = await hallSeen(page);
    expect(seen.widest).toBeGreaterThanOrEqual(seen.width - 1);
    // It held on the oval long enough to be read before drawing in: over two and a half seconds from the room coming in.
    expect(seen.drewIn! - seen.first!).toBeGreaterThan(2600);
    await page.keyboard.up('ArrowUp');
    // Drawn in, the camera is the owl's own again: the owl in view, the room to its edges and no further.
    const settled = await settleCamera(page);
    const me = (await state(page)).pos;
    expect(settled.viewW).toBeLessThan(seen.width / 2);
    expect(me.x).toBeGreaterThan(settled.viewX);
    expect(me.x).toBeLessThan(settled.viewX + settled.viewW);
    expect(me.y).toBeGreaterThan(settled.viewY);
    expect(me.y).toBeLessThan(settled.viewY + settled.viewH);
    expect(settled.viewY).toBeGreaterThanOrEqual(-0.5);
  });

  test("the player's first move sets the owl walking at once, and brings the camera in once the whole oval has shown", async ({ page }) => {
    await openPark(page, { room: 'lobby', keeper: '1', newmap: '1' });
    // A tap out on the floor the moment the room is in.
    await watchHall(page, true);
    await throughTheTurnstiles(page);
    await page.keyboard.up('ArrowUp');
    await expect.poll(async () => (await hallSeen(page)).drewIn, { timeout: 10_000 }).not.toBeNull();
    const seen = await hallSeen(page);
    expect(seen.widest).toBeGreaterThanOrEqual(seen.width - 1);
    // The owl walks before the camera has come in: the look never holds the owl back.
    expect(seen.walkedAt).not.toBeNull();
    expect(seen.walkedAt!).toBeLessThan(seen.drewIn!);
    // The whole oval showed for a real look first (it was gone in under 0.7 s before), and the camera
    // was in well before the look would have drawn in left to itself (close on four seconds).
    expect(seen.drewIn! - seen.first!).toBeGreaterThan(1300);
    expect(seen.drewIn! - seen.first!).toBeLessThan(3000);
  });
});

/**
 * The Great Hollow's camera is the same however the owl came by it (OP-396). Whatever has the camera
 * to itself for a while (the opening look, a ride on the rising air) hands it back resting where it
 * rests on a plain address: on the owl, with no lead toward the back wall (hudInset.ts, followLead:
 * the hall is an oval with ways all round it). Before, a plain address had the plazas' lead (the
 * camera a fifth of the view above the owl) and the hall lost it after either, until the window was
 * resized, so one visit saw the hall two ways. On a held clock (helpers.ts), so the frame the camera
 * is handed back on is the frame looked at.
 */
test.describe('the Great Hollow’s camera rests the same however the owl came by it (OP-396)', () => {
  /** A spot on the hall's floor well down from its back wall, where a view with a lead and one without are far apart on any screen. */
  const SPOT = { x: 2720, y: 1620 };

  test('after the opening look the owl stands where it stands on a plain address: at the middle of the view', async ({ page }) => {
    await holdTheClock(page);
    // A plain address has no opening look.
    await openHeld(page, { room: 'm3-hall', newmap: '1' });
    const plain = await heldStandingAt(page, SPOT);
    // On the owl: as much of the hall ahead of it as behind, whichever way it walks.
    expect(plain.down).toBeGreaterThan(0.47);
    expect(plain.down).toBeLessThan(0.53);

    // In by the knothole, as through the turnstiles: the whole oval, then in on the owl.
    await openHeld(page, { room: 'm3-hall', newmap: '1', spawn: 'from-lobby' });
    const hallW = (await stateNow(page)).doors.find((d) => d.id === 'up')!.x * 2;
    await heldUntil(page, 'the whole oval in view', async () => (await cameraView(page)).viewW >= hallW - 1);
    await heldUntil(page, 'the camera in on the owl again', async () => (await cameraView(page)).viewW <= plain.view.viewW + 1);
    const after = await heldStandingAt(page, SPOT);
    expect(after.view.viewW).toBe(plain.view.viewW);
    expect(Math.abs(after.view.viewY - plain.view.viewY)).toBeLessThanOrEqual(4);
    expect(after.down).toBeCloseTo(plain.down, 2);
  });

  test('after a ride on the rising air the camera is back where it rested before it, at once', async ({ page }) => {
    test.slow(); // two walks, a rise and the way down
    await holdTheClock(page);
    await openHeld(page, { room: 'm3-hall', newmap: '1' });
    const before = await heldStandingAt(page, SPOT);
    const beam = (await stateNow(page)).objects.find((o) => o.id === 'm3-hall-moonbeam-heart')!;
    const atHeart = await heldStandingAt(page, { x: beam.x, y: beam.y });

    // Jump held in the rising air and let go on the way up: the camera draws back, and the owl comes down where it rose.
    expect(await page.evaluate(() => window.owlPark.jump(2_500))).toBe(true);
    await heldUntil(page, 'the owl lifted', async () => (await stateNow(page)).air.s === 3);
    await heldUntil(page, 'the camera drawn back', async () => (await cameraView(page)).viewW > atHeart.view.viewW * 1.15);
    await heldUntil(page, 'the owl down', async () => (await stateNow(page)).air.s === 0);
    // The frame after it lands the camera is where it rested before the ride, with no drop and no slide.
    await page.clock.fastForward(HELD_FRAME_MS);
    const down = await cameraView(page);
    const landed = (await stateNow(page)).pos;
    expect(down.viewW).toBe(atHeart.view.viewW);
    expect(Math.abs(down.viewY - atHeart.view.viewY)).toBeLessThanOrEqual(Math.abs(landed.y - atHeart.pos.y) + 3);

    // And back at the spot the camera rests where it did before the ride.
    const after = await heldStandingAt(page, SPOT);
    expect(Math.abs(after.view.viewY - before.view.viewY)).toBeLessThanOrEqual(4);
    expect(after.down).toBeCloseTo(before.down, 2);
  });
});
