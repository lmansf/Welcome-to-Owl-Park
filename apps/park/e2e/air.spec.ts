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
 *
 * And the drops: a step off a ledge's end over a pit is no fall (the owl drops from there), and off a
 * high ledge before hanging thorns it lands on the low ledge under it (the course as eased for a 10
 * year old; the layout's rules are in packages/shared/rooms/updraftCanopy.test.ts).
 */

const LIFTED = 3;
const U11_TOP = 600;
const C3_TOP = 540;
const CROWN_LIFT = 5180;
const CROWN_LIFT_TOP = 740;
const WIND_Z = 660;
const WIND_END = 5640;
const C13 = { x0: 5460, x1: 5700, top: 520 };
const C12 = { x1: 5100, top: 180 };
/**
 * The drops under hanging thorns the course was eased with (a 10 year old's course): the high ledge's
 * spawn and height, and the low ledge under its end with the spot on it a walk east ends at.
 */
const DROPS = [
  { what: 'the high bough of the fern floor', room: 'canopy-1', spawn: 'on-l5', from: 500, to: { x: 2660, x0: 2540, x1: 2780, top: 120 } },
  { what: 'the high shelf under the crown', room: 'canopy-2c', spawn: 'on-v2', from: 480, to: { x: 930, x0: 780, x1: 1020, top: 100 } },
] as const;

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

  test('a step off the end of a bough over the drop is no fall: the owl is in the air, and falls from there', async ({ page }) => {
    test.slow(); // the park opened twice, every frame stepped by hand
    // On the low bough c12, the crown's drop under it. Walking off its east end used to count as a fall on
    // the spot, the owl still at the bough's height: it never got to drop, flap or glide.
    // On a clock only the test moves (OP-353), at fifty frames a second and at ten. The drop takes 0.37 s
    // and the flight catches up with however long a frame was, so a runner drawing fewer than three
    // frames a second never drew the owl in it: watched on the page's own frames, this test failed
    // there with nothing wrong in the park (CI, Nov 12: twice in a row on one slow runner).
    await holdTheClock(page);
    for (const frameMs of [20, 100]) {
      await openOnTheHeldClock(page, { room: 'canopy-3', spawn: 'on-c12', kit: '1' });
      await until(page, 'the owl standing on the bough, the course counting its falls', async () => { const s = await now(page); return s.air.z === C12.top && s.air.s === 0 && s.course?.falls === 0; });
      await page.evaluate((x) => window.owlPark.walkTo(x, window.owlPark.state()!.pos.y, true), C12.x1 + 120);
      // Frame by frame: off the bough, the owl is seen in the air below the bough's height before any
      // fall is counted.
      let air: { z: number; falls: number } | null = null;
      for (let t = 0; t < 4000 && !air; t += frameMs) {
        await page.clock.fastForward(frameMs);
        const s = await now(page);
        if ((s.course?.falls ?? 0) > 0) break;
        if (s.air.s !== 0 && s.air.z < C12.top - 5) air = { z: s.air.z, falls: s.course?.falls ?? 0 };
      }
      expect(air, `at ${frameMs} ms a frame, off the bough the owl was never in the air: ${await seen(page)}`).not.toBeNull();
      expect(air!.falls).toBe(0);
      // Nothing pressed: it comes down in the drop, and that is the fall.
      await until(page, 'the fall in the drop', async () => ((await now(page)).course?.falls ?? 0) === 1);
    }
  });

  for (const drop of DROPS) {
    test(`walking off ${drop.what} lands the owl on the ledge under it, under the hanging thorns, with no fall`, async ({ page }) => {
      await openPark(page, { room: drop.room, spawn: drop.spawn, kit: '1' });
      await expect.poll(async () => (await state(page)).air.z, { timeout: 10_000 }).toBe(drop.from);
      // East past the high ledge's end, as held keys walk: off it, down under the thorns, onto the low ledge.
      await page.evaluate((x) => window.owlPark.walkTo(x, window.owlPark.state()!.pos.y, true), drop.to.x);
      await expect
        .poll(async () => { const s = await state(page); return [s.air.s, s.air.z]; }, { timeout: 10_000, intervals: [50], message: `not down on the low ledge: ${await seen(page)}` })
        .toEqual([0, drop.to.top]);
      const landed = await state(page);
      expect(landed.pos.x).toBeGreaterThanOrEqual(drop.to.x0);
      expect(landed.pos.x).toBeLessThanOrEqual(drop.to.x1);
      expect(landed.course?.falls ?? 0).toBe(0);
      expect(landed.flown.n).toBeGreaterThanOrEqual(1);
      await shot(page, `drop-${drop.room}`);
    });
  }
});

/**
 * A clock only the test moves, from before the park is opened (OP-353): the page's own clock never
 * runs, so a frame is exactly as long as the test makes it and a slow runner changes nothing. Held
 * before the first page, not stopped once the park is up: stopping a clock that is running races the
 * frame the game is in the middle of, and the stop can be undone (the game then draws no frame at all).
 */
async function holdTheClock(page: Page): Promise<void> {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1_000));
}

/** Time moved on a tenth of a second at a go, its frames a sixtieth apart as a quick device draws them, until `done` says so (or the test fails: `what` did not come about). */
async function until(page: Page, what: string, done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 600; i++) {
    if (await done()) return;
    await page.clock.runFor(100);
  }
  throw new Error(`on the held clock: ${what} did not come about`);
}

/** The park opened on the held clock, as openPark opens it (the local transport, the painted rooms). */
async function openOnTheHeldClock(page: Page, params: Record<string, string>): Promise<void> {
  const q = new URLSearchParams({ transport: 'local', kit: '0', art: 'old', ...params });
  await page.goto(`/?${q.toString()}`);
  await until(page, 'the room coming up', () => page.evaluate(() => window.owlPark?.state()?.connected === true));
}

/** What the page says of its owl now (the clock is held: nothing waits). */
const now = (page: Page) => page.evaluate(() => window.owlPark.state()!) as Promise<Awaited<ReturnType<typeof state>>>;

/**
 * One hop at `frameMs` a frame: from 110 on the fern floor a walk east, and Jump 200 ms in. The owl
 * comes down 3 px inside the near end of the first step (300 to 460, 90 up). Returns how it stands a
 * quarter of a second after it should have landed.
 */
async function hopOntoTheFirstStep(page: Page, frameMs: number): Promise<{ z: number; s: number; x: number }> {
  await openOnTheHeldClock(page, { room: 'canopy-1' });
  await page.evaluate(() => window.owlPark.walkTo(110, window.owlPark.state()!.pos.y));
  await until(page, 'the owl standing at 110', async () => { const s = await now(page); return !s.walking && Math.abs(s.pos.x - 110) < 1; });
  await page.evaluate(() => window.owlPark.walkTo(690, window.owlPark.state()!.pos.y));
  for (let t = 0; t < 1000; t += frameMs) {
    if (t === 200) expect(await page.evaluate(() => window.owlPark.jump(300))).toBe(true);
    await page.clock.fastForward(frameMs);
  }
  const s = await now(page);
  return { z: s.air.z, s: s.air.s, x: s.pos.x };
}

/**
 * One dash at `frameMs` a frame: off the high shelf of the trunk's top storey (v2, 480 up) a jump
 * east, and 700 ms in, 18 px short of the hanging thorns (960 to 990, from 280 up), a dash through
 * them. Returns the falls the course counts 300 ms later, and where the owl is.
 */
async function dashThroughTheHangingThorns(page: Page, frameMs: number): Promise<{ falls: number; dashes: number; x: number }> {
  await openOnTheHeldClock(page, { room: 'canopy-2c', spawn: 'on-v2' });
  await until(page, 'the owl standing on the shelf, the course counting its falls', async () => { const s = await now(page); return s.air.z === 480 && s.air.s === 0 && s.course?.falls === 0; });
  await page.evaluate(() => window.owlPark.walkTo(1100, window.owlPark.state()!.pos.y));
  for (let t = 0; t < 1000; t += frameMs) {
    if (t === 200) expect(await page.evaluate(() => window.owlPark.jump(300))).toBe(true);
    if (t === 700) await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift', bubbles: true })));
    await page.clock.fastForward(frameMs);
  }
  const s = await now(page);
  return { falls: s.course?.falls ?? -1, dashes: s.dash.dashes, x: s.pos.x };
}

test.describe('the owl’s flight at any frame rate (OP-353)', () => {
  test('a hop that comes down just inside a ledge’s end lands on it at ten frames a second as at fifty', async ({ page }) => {
    test.slow(); // the park opened twice, every frame stepped by hand
    await holdTheClock(page);
    // The flight goes in steps of its own, many to a frame, and asks at each what is under the owl. Asked of
    // where the last frame drew the owl, that was a frame's walk behind it (26 px at ten frames a second):
    // the step's end was not yet under an owl coming down onto it, and it fell past it to the floor.
    const quick = await hopOntoTheFirstStep(page, 20);
    const slow = await hopOntoTheFirstStep(page, 100);
    expect(quick).toMatchObject({ z: 90, s: 0 });
    expect(slow).toMatchObject({ z: 90, s: 0 });
    // The same hop, the same place: a frame's length is not part of the game.
    expect(Math.abs(slow.x - quick.x), JSON.stringify({ quick, slow })).toBeLessThan(1);
  });

  test('a dash through thorns is a fall at ten frames a second as at fifty: no frame steps over them', async ({ page }) => {
    test.slow(); // the park opened twice, every frame stepped by hand
    await holdTheClock(page);
    // A dash goes 90 px in a tenth of a second and these thorns are 30 px thick. The course looked for
    // them where the owl was each frame, so at ten frames a second it was before them, then past them.
    const quick = await dashThroughTheHangingThorns(page, 20);
    const slow = await dashThroughTheHangingThorns(page, 100);
    // Both dashed, both fell, and both are back on the shelf they left.
    expect(quick).toEqual({ falls: 1, dashes: 1, x: 760 });
    expect(slow).toEqual({ falls: 1, dashes: 1, x: 760 });
  });
});

/** The ink course's first screen (packages/shared/rooms/brushstrokeBridges.ts): where the pond's water lies, and the door. */
const POND = { x0: 580, x1: 3540 };

test.describe('the ink course’s first screen, played the plain ways (OP-360)', () => {
  test('from the door, one jump before the water and the walking key held east take the owl across the pond with no fall', async ({ page }) => {
    test.slow(); // three screens walked, every frame stepped by hand
    // The play log's first phone runs of this screen (Nov 12) fell at every crossing. As it is laid
    // now, the jump onto the first stone is the only press the way across asks for: each bridge runs
    // onto ground at its own height, and each stone starts where the walk before it ends. On a clock
    // the test moves, at twenty frames a second.
    await holdTheClock(page);
    await openOnTheHeldClock(page, { room: 'brush-1', spawn: 'from-gate', kit: '1' });
    await until(page, 'the owl at the door, the course counting its falls', async () => { const s = await now(page); return s.air.s === 0 && s.course?.falls === 0; });
    await page.keyboard.down('ArrowRight');
    let jumped = false;
    let across = false;
    for (let t = 0; t < 30_000 && !across; t += 50) {
      await page.clock.fastForward(50);
      const s = await now(page);
      expect(s.course?.falls ?? 0, `a fall on the way across: ${JSON.stringify({ pos: s.pos, air: s.air })}`).toBe(0);
      // From the bank's floor, a few strides short of the water: the jump passes over the first stone, which paints its bridge.
      if (!jumped && s.pos.x >= POND.x0 - 140) {
        expect(await page.evaluate(() => window.owlPark.jump(250))).toBe(true);
        jumped = true;
      }
      across = s.pos.x >= POND.x1 + 60 && s.air.s === 0 && s.air.z === 0;
    }
    await page.keyboard.up('ArrowRight');
    expect(across, `not across the pond: ${await seen(page)}`).toBe(true);
    expect((await now(page)).course?.falls ?? 0).toBe(0);
    await shot(page, 'ink-across');
  });

  test('a walking key held through a fall does not walk the owl off again: it stands where it is put until the key is pushed afresh', async ({ page }) => {
    test.slow(); // every frame stepped by hand
    await holdTheClock(page);
    await openOnTheHeldClock(page, { room: 'brush-1', spawn: 'from-gate', kit: '1' });
    await until(page, 'the owl at the door, the course counting its falls', async () => { const s = await now(page); return s.air.s === 0 && s.course?.falls === 0; });
    const door = (await now(page)).pos;
    // East along the bank with the walking key alone: into the water, the one mistake the screen leaves a walker.
    await page.keyboard.down('ArrowRight');
    await until(page, 'the fall in the pond', async () => ((await now(page)).course?.falls ?? 0) === 1);
    await until(page, 'the owl put back at the door', async () => Math.abs((await now(page)).pos.x - door.x) < 2);
    // The key is still down. A second and a half of frames: the owl has not moved, and has not fallen again.
    for (let t = 0; t < 1500; t += 50) {
      await page.clock.fastForward(50);
      const s = await now(page);
      expect(Math.abs(s.pos.x - door.x), `walked off with the key held since the fall: ${JSON.stringify(s.pos)}`).toBeLessThan(2);
      expect(s.course?.falls).toBe(1);
    }
    // Let go and pushed again, it walks.
    await page.keyboard.up('ArrowRight');
    await page.clock.fastForward(50);
    await page.keyboard.down('ArrowRight');
    await until(page, 'the owl walking east again', async () => (await now(page)).pos.x > door.x + 40);
    await page.keyboard.up('ArrowRight');
  });
});
