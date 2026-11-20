import { FROM_STUMP_AT, STUMP_ROOM } from '../../../packages/shared/src/party/ids';
import { expect, test } from './fixtures';
import { openPark, state, walkAndStop } from './helpers';

// The Old Stump in the Great Hollow (OP-314): its seats are there for every visitor since Nov 20.
test.describe('the Old Stump’s party game', () => {
  test('on a plain address, standing by the stump offers a seat', async ({ page }) => {
    await openPark(page, { collector: 'e2e-party-stump', tz: 'UTC', room: STUMP_ROOM });
    await walkAndStop(page, FROM_STUMP_AT.x, FROM_STUMP_AT.y);
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000, intervals: [50] }).toContain('party:sit');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-party-stump.png` });
  });
});
