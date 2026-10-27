import { expect, test, type Page } from '@playwright/test';
import { flightOf, holdSpace, jumpFlapGlide, openPark, state } from './helpers';

/**
 * Flight (OP-084): Jump (the space bar, the pad's Jump on a phone) jumps the climb's jump, pressed
 * again in the air flaps once more, and held on the way down glides. These run on the local
 * transport, tab to tab; the room server's side is in edge.spec.ts.
 */

/** Press the pad's Jump with a thumb and keep it down for `ms`, as a hold. */
async function holdPadJump(page: Page, ms: number): Promise<void> {
  const jump = page.locator('[data-pad-jump]');
  await jump.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  await page.waitForTimeout(ms);
  await jump.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true });
}

test.describe('flight (OP-084)', () => {
  test('the space bar: held, a jump of about an owl and a quarter; a quick tap, less; pressed again in the air, higher; and the owl lands where it stood', async ({ page }) => {
    await openPark(page);
    const stood = (await state(page)).pos;
    // Held to the top: about 150 px up (a park owl is 120 tall), and back down.
    let seen = flightOf(page, 'own');
    await holdSpace(page, 300);
    const held = await seen;
    expect(held.peak).toBeGreaterThan(120);
    expect(held.peak).toBeLessThan(175);
    // A quick tap (60 ms, set in the page so a slow runner cannot stretch it): let go on the way up and the rise is cut short.
    seen = flightOf(page, 'own');
    expect(await page.evaluate(() => window.owlPark.jump(60))).toBe(true);
    const tap = await seen;
    expect(tap.peak).toBeGreaterThan(0);
    expect(tap.peak).toBeLessThan(held.peak - 10);
    // Pressed again near the top: the one flap more, higher than the jump alone.
    seen = flightOf(page, 'own');
    await jumpFlapGlide(page, 200);
    const flapped = await seen;
    expect(flapped.peak).toBeGreaterThan(held.peak + 60);
    // Flight is a height over the floor: the owl never left its spot, and stands on the floor again.
    const now = await state(page);
    expect(now.pos).toEqual(stood);
    expect(now.height).toBe(0);
    expect(now.air.s).toBe(0);
  });

  test('held on the way down it glides, longer in the air than a fall, falling at a third of the walk; let go and it drops', async ({ page }) => {
    await openPark(page);
    let seen = flightOf(page, 'own');
    await holdSpace(page, 300);
    const jumped = await seen;
    seen = flightOf(page, 'own');
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 5_000, intervals: [50] }).toBe(2);
    // Gliding: falling slowly, at a third of the walk's pace.
    const mid = (await state(page)).air;
    expect(mid.vz).toBeLessThan(0);
    expect(mid.vz).toBeGreaterThan(-120);
    await page.waitForTimeout(400);
    await page.keyboard.up('Space');
    const glided = await seen;
    expect(glided.glided).toBe(true);
    expect(glided.airMs).toBeGreaterThan(jumped.airMs + 300);
  });

  test('on a phone the pad’s Jump does it: a tap jumps, a hold glides', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the pad is for touch screens');
    await openPark(page);
    let seen = flightOf(page, 'own');
    await page.locator('[data-pad-jump]').tap();
    const tapped = await seen;
    expect(tapped.peak).toBeGreaterThan(0);
    expect(tapped.glided).toBe(false);
    seen = flightOf(page, 'own');
    await holdPadJump(page, 1_400);
    const held = await seen;
    expect(held.peak).toBeGreaterThan(120);
    expect(held.glided).toBe(true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-flight-pad.png` });
  });

  test('another tab sees the owl jump, flap and glide from the same states, and come down where it stood', async ({ context }) => {
    test.slow(); // two live parks in one browser
    const a = await context.newPage();
    const b = await context.newPage();
    await openPark(a, { id: 'owl-a' });
    await openPark(b, { id: 'owl-b' });
    await expect.poll(async () => (await state(a)).peers.map((p) => p.id)).toEqual(['owl-b']);
    await expect.poll(async () => (await state(b)).peers.map((p) => p.id)).toEqual(['owl-a']);
    const stood = (await state(a)).pos;
    const seen = flightOf(b, 'peer', 12_000);
    const own = flightOf(a, 'own', 12_000);
    await jumpFlapGlide(a, 1_200);
    const [there, here] = await Promise.all([seen, own]);
    // The same states, so the same flight, give or take a frame on each page (runners draw few frames a second).
    expect(here.peak).toBeGreaterThan(200);
    expect(there.peak).toBeGreaterThan(here.peak - 25);
    expect(there.peak).toBeLessThan(here.peak + 25);
    expect(there.glided).toBe(true);
    expect(Math.abs(there.airMs - here.airMs)).toBeLessThan(700);
    expect((await state(b)).peers[0]?.pos).toEqual(stood);
    await a.screenshot({ path: `e2e-screenshots/${test.info().project.name}-flight.png` });
  });
});
