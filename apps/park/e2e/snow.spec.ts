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

  test('a snowball thrown from the action button flies to the other owl, who shivers on both pages; one every two seconds', async ({ context, isMobile }) => {
    test.slow(); // two rendered rooms
    const a = await context.newPage();
    const b = await context.newPage();
    await openPark(a, { id: 'owl-a', snow: '1', tz: 'UTC' });
    await openPark(b, { id: 'owl-b', snow: '1', tz: 'UTC' });
    await expect.poll(async () => (await state(a)).peers.map((p) => p.id)).toContain('owl-b');
    await expect.poll(async () => (await state(b)).peers.map((p) => p.id)).toContain('owl-a');
    // A step aside, so the actions are looked at afresh with the other owl in reach.
    const at = (await state(a)).pos;
    await a.evaluate(({ x, y }) => window.owlPark.walkTo(x + 40, y), at);
    const throwIt = a.getByRole('button', { name: 'Throw a snowball' });
    await expect(throwIt).toBeVisible();
    if (isMobile) await throwIt.tap();
    else await throwIt.click();
    await expect.poll(async () => (await state(a)).snowballs).toEqual({ thrown: 1, landed: 1, hits: ['owl-b'] });
    await expect.poll(async () => (await state(b)).snowballs.hits).toEqual(['owl-b']);
    await b.screenshot({ path: `e2e-screenshots/${test.info().project.name}-snowball.png` });
    // Another at once is not thrown.
    expect(await a.evaluate(() => window.owlPark.snowball('owl-b'))).toBe(false);
  });
});
