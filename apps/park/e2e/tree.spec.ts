import { expect, test, type Page } from '@playwright/test';
import { doAction, frames, jumpFlapGlide, openPark, settleCamera, state, walkAndStop, walkToDoor } from './helpers';

/**
 * The tree (map 2, OP-156, OP-162): level 1, four screens seen from the side, west to east: the path to
 * a closed gate, the lobby at the trunk's foot, the market's square and its roof run. Its floor is the
 * ground line, its ledges are perches over that line, and each screen's art comes in four layers that
 * scroll at their own rates. On the local transport a gated room is open, so a page walks it with no
 * keeper's token; the room server's door (a keeper's token, or the realms switch) is apps/edge's to test.
 */

const GROUND = 770;
/** Where the lobby's screen starts: the level's second screen. */
const LOBBY = 1600;
/** A jump from where the owl stands, Jump held `ms` (in the page, so a slow runner holds it as long). */
const jump = (page: Page, ms = 400) => page.evaluate((ms) => window.owlPark.jump(ms), ms);
/** Standing still at `top` over the ground line. */
const standsAt = (page: Page, top: number) =>
  expect.poll(async () => { const s = await state(page); return [s.air.s, Math.round(s.air.z)]; }, { timeout: 5_000, intervals: [50] }).toEqual([0, top]);

/** The phone project's phone (a Pixel 7), held upright and on its side. */
const UPRIGHT = { width: 412, height: 839 };
const ON_ITS_SIDE = { width: 839, height: 412 };

test.describe('the tree, map 2 (OP-156, OP-162)', () => {
  // Phones play the tree on their side (OP-155 (d)), so the phone's walks here hold it that way; the
  // card that asks a phone held upright to turn has its own test below.
  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize(ON_ITS_SIDE);
  });

  test('opens in the lobby on the ground line, each screen in four layers at their own rates, its owl a quarter bigger', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    const s = await state(page);
    expect(s.room).toBe('l1');
    expect(Math.abs(s.pos.y - GROUND)).toBeLessThanOrEqual(4);
    expect(Math.abs(s.pos.x - (LOBBY + 800))).toBeLessThanOrEqual(4);
    expect(s.owlScale).toBeCloseTo(1.25);
    const screens = ['w1', '0', 'e1', 'e2'];
    // The skies (the lobby's on top, over both neighbours), the middle distance, then the overlays.
    expect(s.layers.map((l) => [l.key, l.rate])).toEqual([
      ...['e2', 'e1', 'w1', '0'].map((k) => [`tree-l1-${k}-bg`, 0.5]),
      ...screens.map((k) => [`tree-l1-${k}-mid`, 0.75]),
      ...screens.map((k) => [`tree-l1-${k}-fg`, 1.2]),
    ]);
    // A sky is drawn a tenth bigger than its screen, so its edge never shows while it lags; the lobby's
    // fades over its neighbours, and the overlays fade where they end partway across the view.
    const sky = s.layers.find((l) => l.key === 'tree-l1-0-bg')!;
    expect(sky.w).toBeGreaterThan(1600);
    expect(sky.fade).toEqual({ left: 220, right: 220 });
    for (const k of screens) expect(s.layers.find((l) => l.key === `tree-l1-${k}-fg`)!.fade).toEqual({ left: 120, right: 120 });
  });

  test('climbs the spiral stair to the balcony a jump a step, and comes down off the balcony’s end', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    await walkAndStop(page, LOBBY + 1042, GROUND);
    for (const top of [82, 153, 286]) {
      await jump(page);
      await standsAt(page, top);
    }
    await walkAndStop(page, LOBBY + 1300, GROUND);
    await standsAt(page, 0);
  });

  test('a jump and a flap up onto the lintel over the way down, and a jump on up to the shelf fungus', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    // East of the way down (a doorway to level 0 since OP-163, 610 to 700), still under the lintel's east end
    // (730): from the spawn at 800 the walk does not cross the doorway, which would take the owl down.
    await walkAndStop(page, LOBBY + 720, GROUND);
    await jumpFlapGlide(page, 200, { jumpMs: 340, spare: 15 });
    await standsAt(page, 196);
    await walkAndStop(page, LOBBY + 600, GROUND);
    await standsAt(page, 196);
    await jump(page);
    await standsAt(page, 282);
  });

  test('the camera follows the owl along the ground line across the lobby', async ({ page }) => {
    test.slow(); // a 1400 px walk drawn in software WebGL: 30 to 49 s on CI runners, against a 45 s limit
    await openPark(page, { room: 'l1' });
    await walkAndStop(page, LOBBY + 100, GROUND);
    const lobbyWest = await settleCamera(page);
    await walkAndStop(page, LOBBY + 1500, GROUND);
    const lobbyEast = await settleCamera(page);
    expect(lobbyEast.viewX).toBeGreaterThan(lobbyWest.viewX + 40);
  });

  // The level's ends, each from its own spawn: a walk the length of the level outlasts a test where
  // the game draws in software.
  for (const [spawn, screen] of [['west', 0], ['east', 3]] as const) {
    test(`the camera shows an owl at the ${spawn} spawn on the level's ${screen ? 'last' : 'first'} screen`, async ({ page }) => {
      await openPark(page, { room: 'l1', spawn });
      const at = (await state(page)).pos.x;
      expect(Math.floor(at / 1600)).toBe(screen);
      const view = await settleCamera(page);
      expect(view.viewX).toBeLessThanOrEqual(at);
      expect(view.viewX + view.viewW).toBeGreaterThanOrEqual(at);
      expect(Math.floor((view.viewX + view.viewW / 2) / 1600)).toBe(screen);
    });
  }

  test('reads at a glance: an edge on every ledge, the shapes in front and the shaded glows drawn, and the archway, the stair up and the way down to level 0 marked (OP-173, OP-163)', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    // The fronts: the west path's lamps, the square's post, the stair's banister (raised) and the tower's railing.
    // The way down to level 0 is a doorway now (OP-163), marked and no longer shaded.
    expect((await state(page)).tree).toEqual({ fronts: 23, raised: 8, shades: 5, lips: 25, marks: 3, behind: false });
  });

  test('the stair’s banister is in front of an owl climbing the stair, and behind one walking by on the floor (OP-173)', async ({ page }) => {
    test.slow(); // a climb up and down with a look at the drawing order at each step: 20 s here
    await openPark(page, { room: 'l1' });
    const behind = async () => (await state(page)).tree!.behind;
    // On the floor at the stair's foot, the owl is in front of the banister's post and rail.
    await walkAndStop(page, LOBBY + 962, GROUND);
    expect(await behind()).toBe(false);
    // Up the stair a step and another: behind the banister.
    await walkAndStop(page, LOBBY + 1042, GROUND);
    for (const top of [82, 153]) {
      await jump(page);
      await standsAt(page, top);
      expect(await behind()).toBe(true);
    }
    // Off the stair's far end and down onto the floor: in front again.
    await walkAndStop(page, LOBBY + 1300, GROUND);
    await standsAt(page, 0);
    expect(await behind()).toBe(false);
  });

  test('the west wall\'s top is a ledge: a hop up from the boulder', async ({ page }) => {
    await openPark(page, { room: 'l1', spawn: 'west' });
    await walkAndStop(page, 770, GROUND);
    await jump(page);
    await standsAt(page, 110);
    await jump(page);
    await standsAt(page, 190);
  });

  test('the square\'s plinth takes a jump and a flap, and a jump from it reaches the top of the steps beside it', async ({ page }) => {
    test.slow(); // a walk from the lobby into the square, drawn with software WebGL
    await openPark(page, { room: 'l1' });
    await walkAndStop(page, 2 * 1600 + 560, GROUND);
    await jumpFlapGlide(page, 200, { jumpMs: 340, spare: 15 });
    await standsAt(page, 152);
    await walkAndStop(page, 2 * 1600 + 452, GROUND);
    await standsAt(page, 152);
    await jump(page);
    await standsAt(page, 285);
  });

  test('a phone held upright sees a card asking to turn it, nothing under it takes a tap, and it goes once the phone is turned (OP-156)', async ({ page, isMobile }) => {
    const card = page.locator('[data-turn-phone]');
    if (!isMobile) {
      // A computer's window, however tall, plays as it is.
      await page.setViewportSize({ width: 700, height: 900 });
      await openPark(page, { room: 'l1' });
      await expect(card).toBeHidden();
      return;
    }
    await page.setViewportSize(UPRIGHT);
    await openPark(page, { room: 'l1', spawn: 'east' });
    await expect(card).toBeVisible();
    await expect(card).toHaveText('This part of the park plays with your phone on its side.');
    // A tap on the card walks no owl.
    const at = (await state(page)).pos;
    await page.touchscreen.tap(UPRIGHT.width / 2, UPRIGHT.height * 0.8);
    await frames(page, 20);
    const after = await state(page);
    expect(after.walking).toBe(false);
    expect(after.pos).toEqual(at);
    await page.setViewportSize(ON_ITS_SIDE);
    await expect(card).toBeHidden();
    await page.setViewportSize(UPRIGHT);
    await expect(card).toBeVisible();
    // Today's park plays upright: through the archway into the market, the card is gone.
    await walkToDoor(page, 'to-market');
    await expect.poll(async () => (await state(page)).room, { timeout: 15_000 }).toBe('market');
    await expect(card).toBeHidden();
  });

  test('the closed gate at the west end turns an owl back with its sign', async ({ page }) => {
    await openPark(page, { room: 'l1', spawn: 'west' });
    await walkToDoor(page, 'closed-west');
    await expect(page.locator('[data-toasts]')).toContainText('Not Yet Fledged', { timeout: 15_000 });
    expect((await state(page)).pos.x).toBeGreaterThanOrEqual(600);
  });

  test('the archway at the roof run’s east end goes into the market, whose way out leads back to the archway', async ({ page }) => {
    await openPark(page, { room: 'l1', spawn: 'east' });
    await walkToDoor(page, 'to-market');
    await expect.poll(async () => (await state(page)).room, { timeout: 15_000 }).toBe('market');
    // In the market, the way out leads this owl, walking the tree, back to the tree.
    expect((await state(page)).doors.find((d) => d.id === 'to-hub')?.to).toBe('l1');
    await walkToDoor(page, 'to-hub');
    await expect.poll(async () => (await state(page)).room, { timeout: 15_000 }).toBe('l1');
    const s = await state(page);
    expect(Math.abs(s.pos.x - (3 * 1600 + 1230))).toBeLessThan(60);
    expect(s.pos.y).toBe(GROUND);
  });

  test('climbs the roof run in the market, crates a jump a step, up to the high roof and on to the lantern tower’s balcony', async ({ page }) => {
    test.slow(); // seven ledges a walk and a jump apart, drawn with software WebGL
    await openPark(page, { room: 'l1', spawn: 'east' });
    const RUN = 3 * 1600;
    await walkAndStop(page, RUN + 200, GROUND);
    await jump(page);
    await standsAt(page, 95);
    await jump(page);
    await standsAt(page, 170);
    await walkAndStop(page, RUN + 330, GROUND);
    await standsAt(page, 170);
    await jump(page);
    await standsAt(page, 250);
    await walkAndStop(page, RUN + 418, GROUND);
    await jump(page);
    await standsAt(page, 310);
    // Up onto the barrel on the low roof, and on along the roof past it.
    await walkAndStop(page, RUN + 572, GROUND);
    await jump(page);
    await standsAt(page, 383);
    await walkAndStop(page, RUN + 960, GROUND);
    await standsAt(page, 310);
    await jump(page);
    await standsAt(page, 402);
    // Along the high roof to its end under the tower's balcony, a jump up, and off the balcony's far end.
    await walkAndStop(page, RUN + 1300, GROUND);
    await standsAt(page, 402);
    await jump(page);
    await standsAt(page, 530);
    await walkAndStop(page, RUN + 1560, GROUND);
    await standsAt(page, 0);
  });
});

/** The room this page is in, once it has one. */
const roomOf = async (page: Page) => (await state(page)).room;

test.describe('the tree’s doorways open on up (OP-212)', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    if (isMobile) await page.setViewportSize(ON_ITS_SIDE);
  });

  test('walking along the floor on the keys passes the way down to level 0 by', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    // From the spawn at 800, west across the way down (610 to 700) and on past it.
    await page.keyboard.down('ArrowLeft');
    await expect.poll(async () => (await state(page)).pos.x, { timeout: 15_000, intervals: [50] }).toBeLessThan(LOBBY + 540);
    await page.keyboard.up('ArrowLeft');
    await frames(page, 20);
    const s = await state(page);
    expect(s.room).toBe('l1');
    expect(s.doorway).toBeNull();
  });

  test('standing in the stair up’s doorway on the balcony stays on level 1, the up arrow over it; up goes up to level 2', async ({ page, isMobile }) => {
    await openPark(page, { room: 'l1' });
    // Up the spiral stair a jump a step, to the balcony at its top: the stair up to level 2's doorway.
    await walkAndStop(page, LOBBY + 1042, GROUND);
    for (const top of [82, 153, 286]) {
      await jump(page);
      await standsAt(page, top);
    }
    await frames(page, 30);
    const s = await state(page);
    expect(s.room).toBe('l1');
    expect(s.doorway).toBe('stair-l2-l1');
    expect(s.actions[0]).toBe('door:stair-l2-l1');
    await expect(page.locator('[data-action="door:stair-l2-l1"]')).toHaveText(/Go in/);
    // A phone goes in with the action (the pad's Interact does the same); a computer with the up arrow.
    if (isMobile) await doAction(page, 'door:stair-l2-l1');
    else await page.keyboard.press('ArrowUp');
    await expect.poll(() => roomOf(page), { timeout: 15_000 }).toBe('l2');
    expect(Math.abs((await state(page)).pos.x - (2 * 1600 + 1120))).toBeLessThan(60);
  });

  test('W held as the keys walk the owl into the way down goes down to level 0', async ({ page }) => {
    // From the spawn just west of the way down (610 to 700), east into it with W held as well.
    await openPark(page, { room: 'l1', spawn: 'from-l0' });
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => roomOf(page), { timeout: 15_000 }).toBe('l0');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('KeyW');
  });

  test('a tap on a doorway walks there and goes through', async ({ page }) => {
    await openPark(page, { room: 'l1' });
    await walkToDoor(page, 'stair-l1-l0');
    await expect.poll(() => roomOf(page), { timeout: 15_000 }).toBe('l0');
  });

  test('seen from above (the hub), the held keys still walk the owl into an arch and through it', async ({ page }) => {
    await openPark(page, { room: 'hub', spawn: 'from-market' });
    await page.keyboard.down('ArrowUp');
    await expect.poll(() => roomOf(page), { timeout: 15_000 }).toBe('market');
    await page.keyboard.up('ArrowUp');
    expect((await state(page)).doorway).toBeNull();
  });
});

test.describe('the tree’s minimap on a computer (OP-213)', () => {
  const map = (page: Page) => page.locator('[data-tree-map]');
  const level = (page: Page) => page.locator('[data-tree-map] [data-level]');

  test('shows at the top left in a tree room, under the top bar and clear of the feedback bug; never on a phone', async ({ page, isMobile }) => {
    if (isMobile) {
      await page.setViewportSize(ON_ITS_SIDE);
      await openPark(page, { room: 'l1' });
      await expect(map(page)).toBeHidden();
      return;
    }
    await openPark(page, { room: 'l1' });
    await expect(map(page)).toBeVisible();
    await expect(level(page)).toHaveText('Ground level');
    await expect(page.locator('[data-tree-map] [data-room="l1"]')).toHaveClass(/here/);
    const box = (await map(page).boundingBox())!;
    const bar = (await page.locator('#hud .bar').boundingBox())!;
    expect(box.x).toBeLessThan(40);
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    const bug = page.locator('[data-feedback-bug]');
    if (await bug.isVisible()) expect(box.y + box.height).toBeLessThan((await bug.boundingBox())!.y);
    // A window the size of a phone on its side: no room for it.
    await page.setViewportSize(ON_ITS_SIDE);
    await expect(map(page)).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(map(page)).toBeVisible();
    // The Menu over the room hides it.
    await page.keyboard.press('KeyM');
    await expect(map(page)).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(map(page)).toBeVisible();
  });

  test('its dot moves along the level as the owl walks, and seen from above (the hub) there is none', async ({ page, isMobile }) => {
    await openPark(page, { room: 'l1' });
    // The minimap is a computer's: a phone's tree room has none.
    if (isMobile) return expect(map(page)).toBeHidden();
    const dot = page.locator('[data-tree-map] [data-owl]');
    await expect(map(page)).toBeVisible();
    const before = Number(await dot.getAttribute('cx'));
    await walkAndStop(page, LOBBY + 1500, GROUND);
    await expect.poll(async () => Number(await dot.getAttribute('cx'))).toBeGreaterThan(before + 8);
    await openPark(page, { room: 'hub' });
    await expect(map(page)).toBeHidden();
  });

  test('names the level the owl is on, after up a stair and down another', async ({ page, isMobile }) => {
    test.slow(); // two room changes drawn with software WebGL
    // Up the spiral stair to the balcony, and up to level 2 at its doorway.
    await openPark(page, { room: 'l1' });
    // The minimap is a computer's: a phone's tree room has none.
    if (isMobile) return expect(map(page)).toBeHidden();
    await expect(level(page)).toHaveText('Ground level');
    await walkAndStop(page, LOBBY + 1042, GROUND);
    for (const top of [82, 153, 286]) {
      await jump(page);
      await standsAt(page, top);
    }
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => roomOf(page), { timeout: 15_000 }).toBe('l2');
    await expect(level(page)).toHaveText('Low branches');
    await expect(page.locator('[data-tree-map] [data-room="l2"]')).toHaveClass(/here/);
    // Down the steps behind the trunk to level 1 again: walked into with W held.
    const down = (await state(page)).doors.find((d) => d.id === 'stair-l2-l1')!;
    await walkAndStop(page, down.x - 120, GROUND);
    await page.keyboard.down('KeyW');
    await page.keyboard.down('ArrowRight');
    await expect.poll(() => roomOf(page), { timeout: 15_000 }).toBe('l1');
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('KeyW');
    await expect(level(page)).toHaveText('Ground level');
  });
});
