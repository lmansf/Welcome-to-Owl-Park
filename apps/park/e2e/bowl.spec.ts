import { expect, test } from './fixtures';
import { BOWL_SPOT } from '../../../packages/shared/src/party/bowling';
import { TAG_ROOM } from '../../../packages/shared/src/party/tag';
import { doAction, openPark, state, walkAndStop } from './helpers';

/**
 * Pinecone bowling in the Great Hollow (OP-403, D5; the Party Grove's until Nov 19), behind `?bowl=1` (src/flags.ts), on this page alone:
 * walk to the head of the lane, Bowl a pinecone, Roll it! three times, and the game's score is said.
 * Its rules are packages/shared/src/party/bowling.test.ts.
 */
const HOLLOW = { room: TAG_ROOM, spawn: 'default' };
/** The head of the lane. */
const SPOT = BOWL_SPOT;

test.describe('pinecone bowling in the Great Hollow (OP-403, behind ?bowl=1)', () => {
  test('a plain address has no bowling', async ({ page }) => {
    await openPark(page, HOLLOW);
    expect((await state(page)).bowl).toBeNull();
  });

  test('three rolls at the head of the lane make a game, and every roll knocks pins down', async ({ page }) => {
    test.slow(); // a walk across the hollow and three rolls
    await openPark(page, { ...HOLLOW, bowl: '1' });
    expect((await state(page)).bowl?.atSpot).toBe(false);
    expect((await state(page)).actions).not.toContain('bowl:start');
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
