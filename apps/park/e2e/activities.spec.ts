import { expect, test, type Page } from '@playwright/test';
import { doAction as act, openPark, state, walkAndStop as walk, walkToJetty } from './helpers';

const feathers = (page: Page) => page.evaluate(() => window.owlPark.collection()?.feathers ?? 0);

test.describe('activities (this device)', () => {
  test('one owl lights the whole lantern beam, and it glows and pays', async ({ page }) => {
    test.slow(); // seven lanterns, each a few seconds after the last
    await openPark(page, { collector: 'e2e-lanterns', tz: 'UTC' });
    // Two lanterns from each of three places along the beam, then the last: one owl alone has to be
    // quick for the first to be still burning when the seventh is lit (each owl lights one every 2.5 s).
    const stops = [800, 800, 970, 970, 1125, 1125, 1235];
    let last = -1;
    let litAt = 0;
    for (const [i, x] of stops.entries()) {
      if (x !== last) await walk(page, x, 760);
      last = x;
      const wait = litAt + 2_550 - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
      // E lights it, as quickly as a visitor at the keyboard.
      await expect.poll(async () => (await state(page)).actions[0], { intervals: [50] }).toBe('act:light');
      await page.keyboard.press('e');
      litAt = Date.now();
      await expect.poll(async () => (await state(page)).play?.lanterns.length ?? 0, { intervals: [50] }).toBe(i + 1);
    }
    await expect.poll(async () => (await state(page)).play?.glowing).toBe(true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-lanterns.png` });
    await expect(page.getByText('The whole lantern beam is lit!')).toBeVisible();
    await expect(page.getByText(/^You helped light the whole beam! \+4 feathers/)).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-beam.png` });
    // The beam glows whole: no lantern to light until it goes dark again.
    expect((await state(page)).actions).not.toContain('act:light');
    // Today's tasks are in the journal.
    await page.locator('[data-quests-btn]').click();
    await expect(page.locator('.journal .today .task')).toHaveCount(3);
  });

  test('a fish bites at the pond, and reeling in on the bite catches it', async ({ page }) => {
    await openPark(page, { collector: 'e2e-fishing', tz: 'UTC', room: 'grove' });
    await walkToJetty(page);
    const before = await feathers(page);
    await act(page, 'act:cast');
    await expect.poll(async () => (await state(page)).play?.line).toBe('out');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-fishing.png` });
    // The bobber dips: reel in now (E, as quick as a visitor at the keyboard).
    await expect.poll(async () => (await state(page)).play?.line, { timeout: 12_000, intervals: [50] }).toBe('bite');
    await page.keyboard.press('e');
    await expect(page.getByText(/^(You caught .+!|You fished out an old boot!)/)).toBeVisible();
    await expect.poll(async () => (await state(page)).play?.line).toBe('idle');
    expect(await feathers(page)).toBeGreaterThanOrEqual(before);
    // Reeling in before the bite loses the fish.
    await page.waitForTimeout(1600);
    await act(page, 'act:cast');
    await act(page, 'act:reel');
    await expect(page.getByText('Too soon! Wait for the bobber to dip.')).toBeVisible();
  });

  test("the robot owl plays a tune and the owl copies it note by note", async ({ page }) => {
    await openPark(page, { collector: 'e2e-copy', tz: 'UTC', room: 'market' });
    await walk(page, 1480, 755);
    await act(page, 'act:copy');
    const card = page.locator('.play-card.copy');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-phase', 'listen');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-copy.png` });
    const game = (await state(page)).play?.copy;
    expect(game?.tune).toHaveLength(3);
    await expect(card).toHaveAttribute('data-phase', 'play', { timeout: 6_000 });
    const before = await feathers(page);
    for (const [i, note] of game!.tune.entries()) {
      await card.locator(`[data-note="${note}"]`).click();
      if (i < game!.tune.length - 1) await expect.poll(async () => (await state(page)).play?.copy?.got).toBe(i + 1);
    }
    await expect(page.getByText(/^Tune copied! \+1 feather/)).toBeVisible();
    await expect.poll(async () => (await state(page)).play?.copy?.level).toBe(1);
    // One feather for the tune (and more if it finished one of today's tasks).
    expect(await feathers(page)).toBeGreaterThanOrEqual(before + 1);
    // A wrong note ends the game.
    const next = (await state(page)).play!.copy!.tune;
    await expect(card).toHaveAttribute('data-phase', 'play', { timeout: 8_000 });
    await card.locator(`[data-note="${next[0] === 'hoot' ? 'flap' : 'hoot'}"]`).click();
    await expect(page.getByText(/^Not quite: the robot owl played/)).toBeVisible();
    await expect(card).toBeHidden();
  });
});

test.describe('the stage quiz (this device)', () => {
  test('standing on the right answer when the question closes pays', async ({ page }) => {
    // A question every 90 seconds on the park clock: this waits for the next one with time to walk over.
    test.setTimeout(160_000);
    await openPark(page, { collector: 'e2e-quiz', tz: 'UTC', spawn: 'from-market' });
    let quiz = (await state(page)).play?.quiz;
    expect(quiz).toBeTruthy();
    if (quiz!.revealAt - Date.now() < 10_000) {
      const n = quiz!.n;
      await expect.poll(async () => (await state(page)).play?.quiz?.n, { timeout: 20_000 }).toBe(n + 1);
      quiz = (await state(page)).play?.quiz;
    }
    const zones = { a: 3660, b: 3900, c: 4140 } as const;
    await walk(page, zones[quiz!.right], 810);
    const card = page.locator('.play-card.quiz');
    await expect(card).toBeVisible();
    await expect.poll(async () => card.getAttribute('data-phase'), { timeout: 100_000 }).toBe('open');
    await expect(card.locator(`.ans.mine[data-zone="${quiz!.right}"]`)).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-quiz.png` });
    const before = await feathers(page);
    await expect(card).toHaveAttribute('data-phase', 'reveal', { timeout: 25_000 });
    await expect(page.getByText(/^Right answer! \+3 feathers/)).toBeVisible();
    await expect(card.locator(`.ans.right[data-zone="${quiz!.right}"]`)).toBeVisible();
    expect(await feathers(page)).toBeGreaterThanOrEqual(before + 3);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-quiz-answer.png` });
  });
});
