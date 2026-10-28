import { expect, test, type Page } from '@playwright/test';
import { CABINET, alongTheHall, clearLevel, flyThrough, knockByKeys, knockByPull, loseLives, paintedAsShipped, playAt, run, untilOver, type Game } from './arcadePlay';
import { doAction, openPark, state, walkToDoor } from './helpers';

async function inRoom(page: Page, room: string): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe(room);
}

/** The feathers this page knows of, once its collection has loaded. */
async function feathers(page: Page): Promise<number> {
  await expect.poll(() => page.evaluate(() => window.owlPark.collection() !== null), { timeout: 10_000 }).toBe(true);
  return page.evaluate(() => window.owlPark.collection()?.feathers ?? 0);
}

/** From the doorway at the neon street's east end into the arcade. */
async function intoArcade(page: Page, collector: string): Promise<number> {
  await openPark(page, { room: 'market', spawn: 'from-arcade', collector, tz: 'UTC' });
  const before = await feathers(page);
  await walkToDoor(page, 'to-arcade');
  await inRoom(page, 'arcade');
  return before;
}

/** The run's card: the line that ends it, what it paid, a new best; then back to the room and the wall. */
async function paidAndOnTheWall(page: Page, game: Game, line: RegExp, before: number): Promise<void> {
  const score = (await run(page))!.score;
  const card = page.locator('.arcade [data-result]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-line]')).toHaveText(line);
  await expect(card.locator('[data-paid]')).toHaveText(/^\+\d+ feathers?$/);
  await expect(card.locator('[data-new]')).toHaveText('New best!');
  await expect(card.locator('[data-best]')).toHaveText(`Your best ${score}`);
  await expect.poll(() => feathers(page)).toBeGreaterThan(before);
  await card.locator('[data-done]').click();
  await expect(page.locator('.arcade-layer')).toBeHidden();
  const wall = (await state(page)).wall!;
  expect(wall.mine[game]).toBe(score);
  expect(wall.walls.find((w) => w.game === game)!.top[0]!.score).toBe(score);
}

// Each test walks in and plays a whole run; on a slow runner a run plays at a third of its speed or
// less (the games step at most 100 ms a frame), so a run can take a few minutes.
test.describe.configure({ timeout: 240_000 });

test.describe('the arcade (this device)', () => {
  test('Hoot & Hop: up the street by the keys, a level cleared, three lives lost at last, paid and on the score wall (OP-137)', async ({ page }) => {
    const before = await intoArcade(page, `e2e-hop-${test.info().project.name}`);
    await playAt(page, 'crossing');
    await paintedAsShipped(page, 'crossing');
    await expect(page.locator('.arcade [data-hint]')).toHaveText(test.info().project.name === 'phone' ? 'Flick the stick to hop' : 'Arrow keys to hop');
    await expect(page.locator('.arcade [data-banner]')).toHaveText('Level 1 · 3 lives');
    // A course can offer no sure dash for a long while, or the owl can be bumped on the way: then end
    // that run and Play again, as a visitor would, up to three runs.
    for (let attempt = 1, outcome = await clearLevel(page); outcome !== 'cleared'; attempt++, outcome = await clearLevel(page)) {
      expect(attempt, `runs without a level cleared (the last: ${outcome})`).toBeLessThan(3);
      await loseLives(page);
      await untilOver(page);
      const seed = await page.evaluate(() => window.owlPark.arcade()?.seed);
      await page.locator('.arcade [data-result] [data-again]').click();
      await expect.poll(() => page.evaluate(() => window.owlPark.arcade()?.seed)).not.toBe(seed);
    }
    // Seven for a level: a point for each row and one for the top of the street; then the next level.
    expect((await run(page))!.score).toBe(7);
    await expect(page.locator('.arcade [data-banner]')).toHaveText(/^Level 2 · [1-3] li(fe|ves)$/, { timeout: 10_000 });
    await loseLives(page);
    await paidAndOnTheWall(page, 'crossing', /^(Bumped!|Splash!|Swept away!) [1-9]\d* levels? cleared\.$/, before);
  });

  test('Hoot & Hop on a phone: the stick over the game, a hop for each flick, and gone with the run (OP-137)', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'the stick is a touch screen’s');
    await intoArcade(page, 'e2e-hop-stick');
    await playAt(page, 'crossing');
    const stick = page.locator('#hud .stick');
    await expect(stick).toBeVisible();
    // The stick is on top of the game screen, where a thumb finds it.
    expect(
      await stick.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.stick') === el;
      }),
    ).toBe(true);
    const owl = () =>
      page.evaluate(() => {
        const sim = window.owlPark.arcade()!.sim as unknown as { row: number; x: number; hop: unknown };
        return { row: sim.row, x: sim.x, hopping: sim.hop !== null };
      });
    const s = (await stick.boundingBox())!;
    const c = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
    /** A flick: the thumb down on the stick, pushed `dx`, `dy`, held a moment, and lifted. */
    const flick = async (dx: number, dy: number) => {
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.move(c.x + dx, c.y + dy, { steps: 4 });
      await page.waitForTimeout(400);
      await page.mouse.up();
      await expect.poll(async () => (await owl()).hopping).toBe(false);
    };
    const start = await owl();
    expect(start.row).toBe(0);
    // Left along the kerb: one column, however long the thumb is held there.
    await flick(-45, 0);
    const left = await owl();
    expect(left.row).toBe(0);
    expect(start.x - left.x).toBeCloseTo(480 / 7, 0);
    // Right and back: one column each.
    await flick(45, 0);
    expect((await owl()).x).toBeCloseTo(start.x, 0);
    // The game goes on to its end, and the stick goes with the run.
    await loseLives(page);
    await untilOver(page);
    await expect(page.locator('.arcade [data-result]')).toBeVisible();
    await expect(stick).toBeHidden();
  });

  test('Moon Flap: through the gaps, down at last, paid; Play goes again at the same cabinet', async ({ page }) => {
    const before = await intoArcade(page, `e2e-flap-${test.info().project.name}`);
    await playAt(page, 'flight');
    await paintedAsShipped(page, 'flight');
    await flyThrough(page, 2);
    await untilOver(page);
    await expect(page.locator('.arcade [data-result] [data-line]')).toHaveText(/^(Touched down|Clipped a branch) at \d+\.$/);
    // Play again: a new run, with a new course.
    const seed = await page.evaluate(() => window.owlPark.arcade()?.seed);
    await page.locator('.arcade [data-result] [data-again]').click();
    await expect.poll(() => page.evaluate(() => window.owlPark.arcade()?.seed)).not.toBe(seed);
    await expect(page.locator('.arcade [data-result]')).toBeHidden();
    await flyThrough(page, 3);
    await untilOver(page);
    await paidAndOnTheWall(page, 'flight', /^(Touched down|Clipped a branch) at \d+\.$/, before);
  });

  test('a game’s first run on a device opens on how to play it, and only that once (OP-137)', async ({ page }) => {
    await intoArcade(page, `e2e-howto-${test.info().project.name}`);
    await alongTheHall(page, CABINET.flight.x, CABINET.flight.y);
    await doAction(page, 'cabinet-flight');
    const card = page.locator('.arcade [data-howto]');
    await expect(card).toBeVisible();
    await expect(card.locator('h3')).toHaveText('Moon Flap');
    await expect(card).toContainText('Fly through the gaps between the branches.');
    // Nothing reaches the game while it is up: neither a tap on the field nor the space bar flaps.
    await page.locator('.arcade [data-stage]').dispatchEvent('pointerdown');
    expect(await page.evaluate(() => (window.owlPark.arcade()!.sim as unknown as { flying: boolean }).flying)).toBe(false);
    await page.keyboard.press('Space');
    await expect(card).toBeHidden();
    expect(await page.evaluate(() => (window.owlPark.arcade()!.sim as unknown as { flying: boolean }).flying)).toBe(false);
    await flyThrough(page, 1);
    await untilOver(page);
    // The next run, and the next visit: no card.
    await page.locator('.arcade [data-result] [data-again]').click();
    await expect.poll(async () => (await run(page))?.over).toBe(false);
    await expect(card).toBeHidden();
    await page.reload();
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 30_000 });
    await walkToDoor(page, 'to-arcade');
    await inRoom(page, 'arcade');
    await alongTheHall(page, CABINET.flight.x, CABINET.flight.y);
    await doAction(page, 'cabinet-flight');
    await expect.poll(() => page.evaluate(() => window.owlPark.arcade()?.game ?? null), { timeout: 10_000 }).toBe('flight');
    await expect(card).toBeHidden();
  });

  test('Moon Flap on a phone: the pad’s Interact flaps, over the game, and goes with the run (OP-137)', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'the pad is a touch screen’s');
    await intoArcade(page, 'e2e-flap-pad');
    await playAt(page, 'flight');
    const interact = page.locator('[data-pad-interact]');
    await expect(interact).toBeVisible();
    await expect(page.locator('[data-pad-jump]')).toBeHidden();
    // The pad's Interact is on top of the game screen, where a thumb finds it.
    expect(
      await interact.evaluate((b) => {
        const r = b.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-pad-interact]') === b;
      }),
    ).toBe(true);
    await flyThrough(page, 2, '[data-pad-interact]');
    await untilOver(page);
    await expect(page.locator('.arcade [data-result]')).toBeVisible();
    await expect(interact).toBeHidden();
  });

  test('Talon Toss: the first stack down in one shot, out of shots at the second, paid; and back out to the street', async ({ page }) => {
    const before = await intoArcade(page, `e2e-knock-${test.info().project.name}`);
    await playAt(page, 'sling');
    await paintedAsShipped(page, 'sling');
    await expect(page.locator('.arcade [data-hint]')).toHaveText('Pull back and let go');
    // On a phone the owl is pulled back on the screen; on a computer it is aimed with the keys.
    if (test.info().project.name === 'phone') await knockByPull(page);
    else await knockByKeys(page);
    expect(await run(page)).toMatchObject({ score: 3, over: true });
    await paidAndOnTheWall(page, 'sling', /^Out of shots at stack 2\. 3 points\.$/, before);
    // Back along the hall past the other cabinets to the entrance, and out: on the pavement in front of the doorway.
    await alongTheHall(page, 300, 820);
    await walkToDoor(page, 'to-market');
    await inRoom(page, 'market');
    expect((await state(page)).pos.x).toBeGreaterThan(3000);
  });
});
