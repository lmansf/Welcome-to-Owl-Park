import { expect, test, type Page } from '@playwright/test';
import { doAction, frames, holdSpace, jumpFlapGlide, openGround, openPark, settleCamera, state, steppedFlight, tapRoomPoint, toScreen, walkAndStop } from './helpers';

/**
 * Perches (OP-084): what an owl can land on above the floor. The hub's west wing has the first two,
 * along its back wall: the root bench, a jump up from the floor, and the lantern beam above it, with the
 * leaf pile blown off the beam down at the bench's foot since the Party Grove is seen from above (OP-414); the
 * grove's east wing has the treetop walk (the ladder, the porch, the loft and the far treehouse), with its
 * leaf piles down on the clearing's floor at the trees' feet since the clearing is seen from above (OP-423); the
 * market has its rooftops (the stall row and its signboards, the shop's roof, the plaza's stalls, the
 * big tent and the food stall).
 * These run on the local transport, tab to tab; the room server's side is in edge.spec.ts.
 */

const BENCH_TOP = 80;
/** A point on the bench's seat (on the floor plan), and in front of its face on the floor. */
const ON_BENCH = { x: 900, y: 696 };
const BEFORE_BENCH = { x: 900, y: 760 };

/** The owl's air and drawn height, and whether it walks. */
async function where(page: Page): Promise<{ s: number; z: number; height: number; walking: boolean; x: number; y: number }> {
  const s = await state(page);
  return { s: s.air.s, z: s.air.z, height: s.height, walking: s.walking, x: s.pos.x, y: s.pos.y };
}

/** A jump from where the owl stands, Jump held `ms` (in the page, so a slow runner holds it as long). */
const jump = (page: Page, ms = 400) => page.evaluate((ms) => window.owlPark.jump(ms), ms);

/** Standing still at `top`, its wings folded. */
const standsAt = (page: Page, top: number) =>
  expect.poll(async () => { const w = await where(page); return [w.s, w.z, w.height]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, top, top]);

/**
 * A jump held to its top and the flap pressed as it is let go (jumpFlapGlide's `jumpMs`): the rise
 * ends a third of a second after the press (the jump's speed over gravity, packages/shared jump.ts),
 * so the jump and the flap go as high as they can, about 250 px over where the owl stands. The roofs
 * they reach here stand 30 px and more under that, so 15 px of it may go to asking for the flap a
 * frame sooner on a slow runner (`spare`).
 */
const TO_THE_TOP = { jumpMs: 340, spare: 15 };

/** Up on the bench: walked to its face, then a jump, the walk carrying on over the top. */
async function upOnBench(page: Page): Promise<void> {
  await walkAndStop(page, BEFORE_BENCH.x, BEFORE_BENCH.y);
  await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), ON_BENCH);
  await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
  await holdSpace(page, 320);
  await expect.poll(async () => { const w = await where(page); return [w.s, w.z, w.height]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, BENCH_TOP, BENCH_TOP]);
}

test.describe('perches (OP-084)', () => {
  test('a tap on the bench walks the owl to its face; a jump takes it up onto the seat, drawn there; walked off the front, it comes down', async ({ page }) => {
    test.slow(); // the walk across the hub
    await openPark(page);
    await walkAndStop(page, BEFORE_BENCH.x, BEFORE_BENCH.y);
    // A tap where the seat is drawn asks for the seat: on the floor, the owl stops at the bench's face.
    // (The camera eases after the owl, so the tap waits for it to be still, as a visitor's would.)
    await settleCamera(page);
    await tapRoomPoint(page, ON_BENCH.x, ON_BENCH.y - BENCH_TOP);
    await expect.poll(async () => (await where(page)).y, { timeout: 5_000, intervals: [50] }).toBeLessThan(730);
    await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
    let w = await where(page);
    expect(w.y).toBeGreaterThan(712);
    expect(w.height).toBe(0);
    // Jump: up past the face, and on to what the tap asked for, standing on the seat.
    await holdSpace(page, 320);
    await expect.poll(async () => { const w = await where(page); return [w.s, w.z, w.height]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, BENCH_TOP, BENCH_TOP]);
    w = await where(page);
    expect(Math.abs(w.x - ON_BENCH.x), `${w.x},${w.y}`).toBeLessThan(4);
    expect(Math.abs(w.y - ON_BENCH.y), `${w.x},${w.y}`).toBeLessThan(4);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-bench.png` });
    // Walked off the front of the seat: down on the floor, where the walk was going.
    await page.evaluate(() => window.owlPark.walkTo(900, 800));
    await expect.poll(async () => { const w = await where(page); return [w.s, w.z, w.walking]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, 0, false]);
    expect((await where(page)).y).toBeCloseTo(800, 0);
  });

  test('the Party Grove’s leaf pile lies on the floor past the root bench’s east end: walked to, it shows its prompt at every width; up on the bench or the beam it is out of reach, and flopped into from the floor (OP-414)', async ({ page, isMobile }) => {
    test.slow(); // the walk across the hub, at each width
    const PILE = 'hub-leaves-beam';
    const AT_PILE = { x: 1440, y: 770 };
    // A computer at the QA walk's two widths; a phone at its own.
    const sizes = isMobile ? [null] : [{ width: 1440, height: 900 }, { width: 1024, height: 768 }];
    for (const [i, size] of sizes.entries()) {
      if (size) await page.setViewportSize(size);
      await openPark(page);
      const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      // Walked to across the floor, nothing to climb: the prompt says what Interact does here.
      await walkAndStop(page, AT_PILE.x, AT_PILE.y);
      expect((await where(page)).z).toBe(0);
      await expect.poll(async () => (await state(page)).actions, { timeout: 10_000 }).toContain(`use:${PILE}`);
      await expect.poll(async () => (await state(page)).promptShown, { timeout: 10_000 }).toBe(touch ? 'Flop into the leaves' : 'E: Flop into the leaves');
      await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-party-grove-pile-${size?.width ?? 'phone'}.png` });
      if (i < sizes.length - 1) continue;
      // Up on the bench beside it: not on offer from up there.
      await upOnBench(page);
      expect((await state(page)).actions).not.toContain(`use:${PILE}`);
      // A jump and the second flap at its top: up on the beam, as before, and still not on offer.
      await jumpFlapGlide(page, 250);
      await expect.poll(async () => { const w = await where(page); return [w.s, w.z]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, 264]);
      expect((await state(page)).actions).not.toContain(`use:${PILE}`);
      await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-beam.png` });
      // Walked off the front, down on the floor, and back to the pile: a flop.
      await page.evaluate(() => window.owlPark.walkTo(900, 800));
      await expect.poll(async () => { const w = await where(page); return [w.s, w.z, w.walking]; }, { timeout: 10_000, intervals: [50] }).toEqual([0, 0, false]);
      await walkAndStop(page, AT_PILE.x, AT_PILE.y);
      await doAction(page, `use:${PILE}`);
      await expect.poll(async () => (await state(page)).objects.find((o) => o.id === PILE)?.here, { timeout: 15_000 }).toBe(false);
    }
  });

  test('the grove’s treetop walk: up the ladder by single jumps to the porch and on to the loft, and a glide across to the far treehouse', async ({ page }) => {
    test.slow(); // the walk across the grove, and five flights
    await openPark(page, { room: 'grove' });
    // Along the floor (below the doorway to the hub) to the east wing, and to the foot of the ladder up the middle tree.
    await walkAndStop(page, 2950, 868);
    await walkAndStop(page, 3120, 720);
    await walkAndStop(page, 4200, 740);
    await walkAndStop(page, 4101, 711);
    // A jump: on a rung of the ladder, halfway up; a jump more, on the porch at its top.
    await jump(page);
    await standsAt(page, 110);
    await walkAndStop(page, 4119, 705);
    await jump(page);
    await standsAt(page, 218);
    await page.evaluate(() => window.owlPark.walkTo(4290, 708));
    await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
    expect((await where(page)).z).toBe(218);
    // A jump more from the porch's end by the trunk: on the loft's deck.
    await page.evaluate(() => window.owlPark.walkTo(4125, 705));
    await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
    await jump(page);
    await standsAt(page, 292);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-loft.png` });
    // From the loft's far end, a jump, the flap and a glide west over the rope bridge: down on the far treehouse.
    await page.evaluate(() => window.owlPark.walkTo(4000, 702));
    await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
    await jumpFlapGlide(page, 2_500, TO_THE_TOP);
    await page.evaluate(() => window.owlPark.walkTo(3645, 696));
    await standsAt(page, 345);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-hut.png` });
  });

  test('every leaf pile in the treehouse clearing is on its floor: walked to from the doorway, each shows its prompt and is flopped into, at every width (OP-423)', async ({ page, isMobile }) => {
    test.slow(); // the walk across the clearing, at each width
    // A computer at the QA walk's two widths; a phone at its own.
    const sizes = isMobile ? [null] : [{ width: 1440, height: 900 }, { width: 1024, height: 768 }];
    // The way along the floor, west to east (owls walk in straight lines): each pile, and the turns between.
    const way: Array<{ x: number; y: number; pile?: string }> = [
      { x: 2950, y: 868 },
      { x: 2890, y: 845, pile: 'grove-leaves-2' },
      { x: 3120, y: 720 },
      { x: 3645, y: 725, pile: 'grove-leaves-hut' },
      { x: 4200, y: 745 },
      { x: 4300, y: 740, pile: 'grove-leaves-porch' },
    ];
    for (const [i, size] of sizes.entries()) {
      if (size) await page.setViewportSize(size);
      await openPark(page, { room: 'grove' });
      const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
      const last = i === sizes.length - 1;
      for (const stop of way) {
        await walkAndStop(page, stop.x, stop.y);
        if (!stop.pile) continue;
        // Stood on the floor beside it, nothing to climb: the prompt says what Interact does here.
        expect((await where(page)).z, stop.pile).toBe(0);
        await expect.poll(async () => (await state(page)).actions, { timeout: 10_000 }).toContain(`use:${stop.pile}`);
        await expect.poll(async () => (await state(page)).promptShown, { timeout: 10_000 }).toBe(touch ? 'Flop into the leaves' : 'E: Flop into the leaves');
        if (!last) continue;
        await doAction(page, `use:${stop.pile}`);
        await expect.poll(async () => (await state(page)).objects.find((o) => o.id === stop.pile)?.here, { timeout: 15_000 }).toBe(false);
      }
      await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-clearing-piles-${size?.width ?? 'phone'}.png` });
    }
  });

  test('every treehouse leaf pile is reached the way a player gets there: taps on a phone, clicks on a computer at 1024 wide, no walk hook (OP-423, FP-008)', async ({ page, isMobile }) => {
    test.slow(); // the walk across the clearing
    if (!isMobile) await page.setViewportSize({ width: 1024, height: 768 });
    await openPark(page, { room: 'grove' });
    const press = (s: { x: number; y: number }) => (isMobile ? page.touchscreen.tap(s.x, s.y) : page.mouse.click(s.x, s.y));
    // The way along the floor from where the owl comes in (the one the hook test above walks), and the three piles on it.
    const start = (await state(page)).pos;
    const way = [start, { x: 2950, y: 868 }, { x: 2890, y: 845 }, { x: 3120, y: 720 }, { x: 3645, y: 725 }, { x: 4200, y: 745 }, { x: 4300, y: 740 }];
    const piles = [{ id: 'grove-leaves-2', at: 2 }, { id: 'grove-leaves-hut', at: 4 }, { id: 'grove-leaves-porch', at: 6 }];
    // Points every 20 px along the way up to a given stop, nearest the stop first.
    const along = (to: number) => {
      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 1; i <= to; i++) {
        const a = way[i - 1]!, b = way[i]!;
        const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 20));
        for (let k = 1; k <= n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
      }
      return pts.reverse();
    };
    const vp = page.viewportSize()!;
    const shown = async (p: { x: number; y: number }) => {
      const s = await toScreen(page, p.x, p.y);
      if (s.x < 24 || s.x > vp.width - 24 || s.y < 90 || s.y > vp.height - 160) return null;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName ?? '', [s.x, s.y]);
      return hit === 'CANVAS' ? s : null;
    };
    const stood = async () => {
      await frames(page, 5);
      await expect.poll(async () => (await state(page)).walking, { timeout: 15_000, intervals: [50] }).toBe(false);
      return (await state(page)).pos;
    };
    for (const pile of piles) {
      const pos = way[pile.at]!;
      let flopped = false;
      for (let tries = 0; tries < 12 && !flopped; tries++) {
        await settleCamera(page);
        const onPile = await shown(pos);
        if (onPile) {
          // In view: the player taps the pile itself, and the owl walks over and flops into it.
          await press(onPile);
          await expect.poll(async () => (await state(page)).objects.find((o) => o.id === pile.id)?.here, { timeout: 15_000, message: `${pile.id}: tapped, not flopped into, owl at ${JSON.stringify((await state(page)).pos)}` }).toBe(false);
          flopped = true;
          break;
        }
        // Out of view: a tap on the farthest open floor along the way toward it, as a player walks.
        const before = (await state(page)).pos;
        let step: { x: number; y: number } | null = null;
        for (const p of along(pile.at)) if (await shown(p)) { step = p; break; }
        expect(step, `${pile.id}: no floor toward it on screen, owl at ${JSON.stringify(before)}`).not.toBeNull();
        step = await openGround(page, [step!]);
        await press((await shown(step))!);
        const after = await stood();
        expect(Math.hypot(after.x - before.x, after.y - before.y), `${pile.id}: a tap toward it did not move the owl from ${JSON.stringify(before)}`).toBeGreaterThan(4);
      }
      expect(flopped, pile.id).toBe(true);
      await stood();
    }
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-clearing-piles-tapped.png` });
  });

  test('the market’s stall row: a jump up from the curb onto its roof, along it onto the signboards, and the feather shop’s roof at the robot owl’s feet', async ({ page }) => {
    test.slow(); // the walk along the street, and two jumps
    await openPark(page, { room: 'market' });
    // On the curb under the stall row's roof, a jump: the owl stands on the roof.
    await walkAndStop(page, 700, 697);
    await jump(page);
    await standsAt(page, 136);
    // Along the roof, which climbs to the right as the street comes nearer, and on, level, onto the
    // neon signboards at its east end, past where the roof ends.
    await page.evaluate(() => window.owlPark.walkTo(930, 682));
    await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
    await standsAt(page, 136);
    expect((await where(page)).x).toBeGreaterThan(900);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-boards.png` });
    // Off the front, down in the street; along to the curb right of the shop's doorway, and a jump.
    await page.evaluate(() => window.owlPark.walkTo(900, 780));
    await expect.poll(async () => { const w = await where(page); return [w.walking, w.z]; }, { intervals: [50] }).toEqual([false, 0]);
    await walkAndStop(page, 1300, 695);
    await jump(page);
    await standsAt(page, 126);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-shop.png` });
  });

  test('the market’s plaza: a jump up onto the stalls’ roofs, and a jump and the flap up onto the big tent and the food stall', async ({ page }) => {
    test.slow(); // the walk across the plaza, and five flights
    await openPark(page, { room: 'market', spawn: 'from-arcade' });
    await walkAndStop(page, 2700, 790);
    await walkAndStop(page, 2300, 760);
    await walkAndStop(page, 2300, 702);
    await jump(page);
    await standsAt(page, 130);
    // Down in front of the big tent's counter: a jump is not enough, the flap at its top is.
    await page.evaluate(() => window.owlPark.walkTo(2300, 780));
    await expect.poll(async () => { const w = await where(page); return [w.walking, w.z]; }, { intervals: [50] }).toEqual([false, 0]);
    await walkAndStop(page, 2700, 741);
    expect((await steppedFlight(page, () => jump(page))).takeoffs).toBe(1);
    expect((await where(page)).z).toBe(0);
    await jumpFlapGlide(page, 400, TO_THE_TOP);
    await standsAt(page, 209);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-tent.png` });
    // And in front of the food stall's counter, the same.
    await page.evaluate(() => window.owlPark.walkTo(2600, 800));
    await expect.poll(async () => { const w = await where(page); return [w.walking, w.z]; }, { intervals: [50] }).toEqual([false, 0]);
    await walkAndStop(page, 1900, 752);
    await jumpFlapGlide(page, 400, TO_THE_TOP);
    await standsAt(page, 220);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-food.png` });
  });

  test('another tab sees the owl stand on the bench, a newcomer finds it up there, and both see it come down', async ({ context }) => {
    test.slow(); // two live parks in one browser, and the walk across the hub
    const a = await context.newPage();
    await openPark(a, { id: 'owl-a' });
    const b = await context.newPage();
    await openPark(b, { id: 'owl-b' });
    await expect.poll(async () => (await state(b)).peers.map((p) => p.id)).toEqual(['owl-a']);
    await upOnBench(a);
    const seen = async (page: Page) => (await state(page)).peers.find((p) => p.id === 'owl-a') ?? null;
    await expect.poll(async () => (await seen(b))?.height ?? -1, { timeout: 5_000 }).toBe(BENCH_TOP);
    expect((await seen(b))?.air).toBe(0); // standing, its wings folded, up there
    // A tab opened now is told the owl stands up there, not on the floor in front of the wall.
    const c = await context.newPage();
    await openPark(c, { id: 'owl-c' });
    await expect.poll(async () => (await seen(c))?.height ?? -1, { timeout: 10_000 }).toBe(BENCH_TOP);
    // Off the front: every tab has it on the floor again.
    await a.evaluate(() => window.owlPark.walkTo(900, 800));
    for (const page of [b, c]) await expect.poll(async () => (await seen(page))?.height ?? -1, { timeout: 5_000 }).toBe(0);
  });
});
