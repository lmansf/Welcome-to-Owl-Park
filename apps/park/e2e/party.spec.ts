import { FROM_STUMP_AT, STUMP_ROOM } from '../../../packages/shared/src/party/ids';
import { expect, test } from './fixtures';
import { openPark, state, walkAndStop } from './helpers';

// The Old Stump in the Party Grove (OP-314): only the friends preview shows its seats.
test.describe('the Old Stump’s party game', () => {
  test('with ?friends=1, standing by the stump offers a seat', async ({ page }) => {
    await openPark(page, { collector: 'e2e-party-stump', tz: 'UTC', room: STUMP_ROOM, friends: '1' });
    await walkAndStop(page, FROM_STUMP_AT.x, FROM_STUMP_AT.y);
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000, intervals: [50] }).toContain('party:sit');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-party-stump.png` });
  });

  test('without the flag, the same spot offers no seat', async ({ page }) => {
    await openPark(page, { collector: 'e2e-party-stump-off', tz: 'UTC', room: STUMP_ROOM });
    await walkAndStop(page, FROM_STUMP_AT.x, FROM_STUMP_AT.y);
    await page.waitForTimeout(300);
    expect((await state(page)).actions).not.toContain('party:sit');
  });
});
