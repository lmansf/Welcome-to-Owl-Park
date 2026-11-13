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

/**
 * Jump, and once the owl is up, dash: pressed in the page itself on the first frame the owl is off the
 * ground (Shift on a computer, the pad's Dash on a phone), since a press sent from the test comes a
 * round trip late and on a slow runner can land after the owl does.
 */
async function jumpAndDash(page: Page, phone: boolean): Promise<void> {
  expect(await page.evaluate(() => window.owlPark.jump(400))).toBe(true);
  await page.evaluate(
    (phone) =>
      new Promise<void>((done) => {
        const look = () => {
          if ((window.owlPark?.state()?.air.s ?? 0) === 0) return void requestAnimationFrame(look);
          if (phone) document.querySelector('[data-pad-dash]')?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: true, bubbles: true }));
          else window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft', key: 'Shift' }));
          done();
        };
        look();
      }),
    phone,
  );
  if (!phone) await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft', key: 'Shift' })));
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

  test("the hut at the canopy's end keeps its doorway shut until every bell is rung, and says how many are (OP-343)", async ({ page, isMobile }) => {
    // A run, started at the trail gate's way into the first act.
    await openPark(page, { room: 'canopy-1', spawn: 'from-gate', kit: '1' });
    await expect.poll(async () => (await state(page)).course?.run ?? null, { timeout: 10_000 }).not.toBeNull();
    // On the lookout's deck in the last act with no bell rung: the hut's doorway says what is missing, and the owl stays.
    await openPark(page, { room: 'canopy-3', spawn: 'on-deck', kit: '1' });
    await expect.poll(async () => (await state(page)).course?.run ?? null, { timeout: 10_000 }).not.toBeNull();
    await walkTo(page, 6200, 770);
    await expect(page.locator('[data-toasts]')).toContainText('Ring every bell to open this door (0 of 5 rung)');
    // Up pressed standing in it is no way through either (a phone held upright is asked to turn first, so the key is a computer's).
    if (!isMobile) await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(1200);
    expect((await state(page)).room).toBe('canopy-3');
    // With no run there is nothing to lose: the doorway takes the owl, as it always has.
    await page.evaluate(() => localStorage.removeItem('owl-park:courses'));
    await openPark(page, { room: 'canopy-3', spawn: 'on-deck', kit: '1' });
    await page.evaluate(() => window.owlPark.walkTo(6200, 770));
    await expect.poll(async () => (await state(page)).room, { timeout: 15_000 }).toBe('canopy-hut');
  });

  test('a course says what it asks and how it is played, where the owl is, and shows the run its clock (OP-344)', async ({ page }) => {
    await openPark(page, { room: 'canopy-1', spawn: 'from-gate', kit: '1' });
    // At the way in from the trail gate: what the course asks, and the moves by what this device plays with.
    const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    await expect.poll(async () => (await state(page)).tipShown, { timeout: 10_000 }).toContain('Ring all 5 bells, then reach the finish.');
    expect((await state(page)).tipShown).toContain(touch ? 'Tap Jump to jump' : 'Space to jump');
    // The strip shows the run's clock, and the gold time it can still beat.
    await expect(page.locator('[data-objective-clock]')).toContainText(/^0:0\d · Gold under 1:45$/);
    // At the bank where the walk first ends: what a fall does. One tip at a time.
    await walkTo(page, 660, 770);
    await expect.poll(async () => (await state(page)).tipShown, { timeout: 10_000 }).toBe('Bramble sends you back to your checkpoint. Cross on the leaves.');
    // The ink course's own first things: its stones.
    await openPark(page, { room: 'brush-1', spawn: 'from-gate', kit: '1' });
    await expect.poll(async () => (await state(page)).tipShown, { timeout: 10_000 }).toContain('Find all 4 seals, then reach the finish.');
    await walkTo(page, 540, 770);
    await expect.poll(async () => (await state(page)).tipShown, { timeout: 10_000 }).toBe('Land on an ink stone and it paints a bridge. Cross before it fades.');
    // A room that is no course has no tip.
    await openPark(page);
    expect((await state(page)).tipShown).toBeNull();
  });

  test('the chips at the screen\'s edge say where a course\'s doorways lead (OP-346)', async ({ page }) => {
    // At the way in: the way on is off screen to the east, and its chip says so; the side room's chip is an arrow alone.
    await openPark(page, { room: 'canopy-1', spawn: 'from-gate', kit: '1' });
    await expect(page.locator('[data-hint="to-trunk"]')).toHaveText('Next part');
    await expect(page.locator('[data-hint="to-trunk"]')).toHaveAttribute('aria-label', 'Next part, off screen: walk there');
    await expect(page.locator('[data-hint="roots"]')).toHaveText('');
    // In the last room the finish is named.
    await openPark(page, { room: 'canopy-3', spawn: 'from-below', kit: '1' });
    await expect(page.locator('[data-hint="hut"]')).toHaveText('Finish');
    // Come in at the far end of the first room, the way out to the hall is off screen to the west: named by where it leads.
    await openPark(page, { room: 'canopy-1', spawn: 'from-trunk', kit: '1', keeper: '1', newmap: '1' });
    await expect(page.locator('[data-hint="to-commons"]')).toHaveText('To the Great Hollow');
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
