import { expect, test, type Page } from '@playwright/test';
import { doAction, holdSpace, jumpFlapGlide, openPark, settleCamera, state, tapRoomPoint, walkAndStop } from './helpers';

/**
 * Perches (OP-084): what an owl can land on above the floor. The hub's west wing has the first two,
 * along its back wall: the root bench, a jump up from the floor, and the lantern beam above it; the
 * grove's east wing has the treetop walk (the ladder, the porch, the loft and the far treehouse).
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
 * A jump, and the flap near its top held `ms` (a glide from the flap's top on), pressed in the page as
 * the owl rises from where it stands, however high that is.
 */
async function flapAndGlide(page: Page, ms: number): Promise<void> {
  await page.evaluate(
    (ms) =>
      new Promise<void>((resolve) => {
        const from = window.owlPark.state()!.height;
        window.owlPark.jump(500);
        let rising = false;
        const tick = () => {
          const s = window.owlPark.state();
          if (s && s.air.vz > 300) rising = true;
          if (s && rising && s.height > from + 100 && s.air.vz < 150) {
            window.owlPark.jump(ms);
            resolve();
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

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

  test('a leaf pile up on the lantern beam is out of reach from the bench below it, and flopped into from the beam', async ({ page }) => {
    test.slow(); // the walk across the hub
    await openPark(page);
    await upOnBench(page);
    // Right under the beam's pile, standing on the bench: no flop on offer.
    await page.evaluate(() => window.owlPark.walkTo(930, 696));
    await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
    expect((await state(page)).actions).not.toContain('use:hub-leaves-beam');
    // A jump and the second flap at its top: up on the beam, and the pile is in reach.
    await jumpFlapGlide(page, 250);
    await expect.poll(async () => { const w = await where(page); return [w.s, w.z]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, 264]);
    await doAction(page, 'use:hub-leaves-beam');
    await expect.poll(async () => (await state(page)).objects.find((o) => o.id === 'hub-leaves-beam')?.here, { timeout: 15_000 }).toBe(false);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-leaves.png` });
  });

  test('the grove’s treetop walk: up the ladder by single jumps to the porch’s leaf pile and on to the loft, and a glide across to the far treehouse’s', async ({ page }) => {
    test.slow(); // the walk across the grove, and five flights
    await openPark(page, { room: 'grove' });
    // Along the floor (below the doorway to the hub) to the east wing, and right under the porch's
    // leaf pile: out of reach from the floor.
    await walkAndStop(page, 2950, 868);
    await walkAndStop(page, 3120, 720);
    await walkAndStop(page, 4200, 740);
    await walkAndStop(page, 4290, 712);
    expect((await state(page)).actions).not.toContain('use:grove-leaves-porch');
    // To the foot of the ladder up the middle tree.
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
    await doAction(page, 'use:grove-leaves-porch');
    await expect.poll(async () => (await state(page)).objects.find((o) => o.id === 'grove-leaves-porch')?.here, { timeout: 15_000 }).toBe(false);
    // A jump more from the porch's end by the trunk: on the loft's deck.
    await page.evaluate(() => window.owlPark.walkTo(4125, 705));
    await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
    await jump(page);
    await standsAt(page, 292);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-loft.png` });
    // From the loft's far end, a jump, the flap and a glide west over the rope bridge: down on the far treehouse.
    await page.evaluate(() => window.owlPark.walkTo(4000, 702));
    await expect.poll(async () => (await where(page)).walking, { intervals: [50] }).toBe(false);
    await flapAndGlide(page, 2_500);
    await page.evaluate(() => window.owlPark.walkTo(3645, 696));
    await standsAt(page, 345);
    await doAction(page, 'use:grove-leaves-hut');
    await expect.poll(async () => (await state(page)).objects.find((o) => o.id === 'grove-leaves-hut')?.here, { timeout: 15_000 }).toBe(false);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-perch-hut.png` });
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
