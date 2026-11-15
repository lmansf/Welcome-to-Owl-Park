import { expect, test } from './fixtures';
import { openPark, state } from './helpers';

/**
 * The first snow (OP-074, D6), behind ?snow=1: falling in the rooms open to the sky, none inside, and
 * nothing without the flag. The snowfall itself is drawn by the room; the screenshots are for a look.
 */
test.describe('the first snow (OP-074, behind ?snow=1)', () => {
  test('falls at the tree’s foot and in the lobby, never inside the arcade, and not without the flag', async ({ page }) => {
    await openPark(page, { collector: 'e2e-snow', tz: 'UTC', snow: '1' });
    expect((await state(page)).snow).toBe(true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-snow-hub.png` });

    await openPark(page, { collector: 'e2e-snow', tz: 'UTC', snow: '1', room: 'arcade' });
    expect((await state(page)).room).toBe('arcade');
    expect((await state(page)).snow).toBe(false);

    await openPark(page, { collector: 'e2e-snow', tz: 'UTC', room: 'lobby' });
    expect((await state(page)).snow).toBe(false);
  });
});
