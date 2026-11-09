import { ESCAPE_DOOR } from '../../../packages/shared/src/escape';
import { expect, test } from './fixtures';
import { openPark, state, walkAndStop } from './helpers';

// The sealed hollow's doorway (OP-310) on the grove clearing's front edge: only the friends preview shows it.
test.describe('the sealed hollow’s doorway', () => {
  test('with ?friends=1, standing in the doorway offers the way in', async ({ page }) => {
    await openPark(page, { collector: 'e2e-escape-door', tz: 'UTC', room: ESCAPE_DOOR.room, friends: '1' });
    await walkAndStop(page, ESCAPE_DOOR.at.x, ESCAPE_DOOR.at.y);
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000, intervals: [50] }).toContain('escape-door');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-escape-door.png` });
  });

  test('without the flag, the same spot offers nothing of the hollow', async ({ page }) => {
    await openPark(page, { collector: 'e2e-escape-door-off', tz: 'UTC', room: ESCAPE_DOOR.room });
    await walkAndStop(page, ESCAPE_DOOR.at.x, ESCAPE_DOOR.at.y);
    // Give the action list a moment to settle where the owl stopped, then check it holds no doorway.
    await page.waitForTimeout(300);
    expect((await state(page)).actions).not.toContain('escape-door');
  });
});
