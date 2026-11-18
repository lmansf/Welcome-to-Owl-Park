import { expect, test } from './fixtures';
import { doAction, openPark, state, walkAndStop } from './helpers';

/**
 * Pinecone bowling in the Party Grove (OP-403, D5), behind `?bowl=1` (src/flags.ts), on this page alone:
 * walk to the head of the lane, Bowl a pinecone, Roll it! three times, and the game's score is said.
 * Its rules are packages/shared/src/party/bowling.test.ts.
 */
const GROVE = { room: 'hub', spawn: 'default' };
/** The head of the lane (BOWL_SPOT in party/bowling.ts). */
const SPOT = { x: 1210, y: 1170 };

test.describe('pinecone bowling in the Party Grove (OP-403, behind ?bowl=1)', () => {
  test('a plain address has no bowling', async ({ page }) => {
    await openPark(page, GROVE);
    expect((await state(page)).bowl).toBeNull();
  });

  test('three rolls at the head of the lane make a game, and every roll knocks pins down', async ({ page }) => {
    test.slow(); // a walk across the grove and three rolls
    await openPark(page, { ...GROVE, bowl: '1' });
    expect((await state(page)).bowl?.atSpot).toBe(false);
    expect((await state(page)).actions).not.toContain('bowl:start');
    await walkAndStop(page, 1500, 950);
    await walkAndStop(page, SPOT.x, SPOT.y);
    await expect.poll(async () => (await state(page)).bowl?.atSpot).toBe(true);

    await doAction(page, 'bowl:start');
    await expect.poll(async () => (await state(page)).bowl?.phase).toBe('aiming');
    await expect.poll(async () => (await state(page)).bowl?.line).toMatch(/Roll 1 of 3/);
    await page.screenshot({ path: 'e2e-screenshots/bowl-aiming.png' });
    for (let k = 1; k <= 3; k++) {
      await expect.poll(async () => (await state(page)).bowl?.phase, { timeout: 10_000 }).toBe('aiming');
      await doAction(page, 'bowl:roll');
      await expect.poll(async () => (await state(page)).bowl?.rolls.length, { timeout: 10_000 }).toBe(k);
      expect((await state(page)).bowl!.rolls[k - 1]).toBeGreaterThan(0);
    }
    await expect.poll(async () => (await state(page)).bowl?.games, { timeout: 10_000 }).toBe(1);
    const s = (await state(page)).bowl!;
    expect(s.phase).toBe('idle');
    expect(s.score).toBe(s.rolls.reduce((a, b) => a + b, 0));
    expect(s.line).toMatch(new RegExp(`^${s.score} of 18 pins`));
    expect(s.standing).toHaveLength(6);
    await page.screenshot({ path: 'e2e-screenshots/bowl-done.png' });

    // Bowl again starts a new game.
    await doAction(page, 'bowl:start');
    await expect.poll(async () => (await state(page)).bowl?.rolls).toEqual([]);
  });
});
