import { expect, test } from './fixtures';
import { openPark, state } from './helpers';

/**
 * The first snow (OP-074, D6): for everyone from Dec 1, and before then behind ?snow=1. Falling in the
 * rooms open to the sky, none inside. The snowfall itself is drawn by the room; the screenshots are for a look.
 */
test.describe('the first snow (OP-074, from Dec 1)', () => {
  test('falls at the tree’s foot and in the lobby, never inside the arcade', async ({ page }) => {
    await openPark(page, { collector: 'e2e-snow', tz: 'UTC', snow: '1' });
    expect((await state(page)).snow).toBe(true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-snow-hub.png` });

    await openPark(page, { collector: 'e2e-snow', tz: 'UTC', snow: '1', room: 'arcade' });
    expect((await state(page)).room).toBe('arcade');
    expect((await state(page)).snow).toBe(false);  });

  test('starts for everyone at midnight Eastern on Dec 1, with no flag (Logan, Nov 24: "Snow on Dec 1")', async ({ context }) => {
    // The page's clock starts at the moment given and runs on from there.
    const before = await context.newPage();
    await before.clock.install({ time: new Date('2026-12-01T04:58:00Z') }); // 23:58 Eastern on Nov 30
    await openPark(before, { collector: 'e2e-snow', tz: 'UTC', room: 'lobby' });
    expect((await state(before)).snow).toBe(false);
    await before.close();

    const after = await context.newPage();
    await after.clock.install({ time: new Date('2026-12-01T05:01:00Z') }); // 00:01 Eastern on Dec 1
    await openPark(after, { collector: 'e2e-snow', tz: 'UTC', room: 'lobby' });
    expect((await state(after)).snow).toBe(true);
    await after.screenshot({ path: `e2e-screenshots/${test.info().project.name}-snow-dec1-lobby.png` });
    await after.close();
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
    // One every two seconds: once two have passed, a throw goes and another asked in the same breath does
    // not. Both asked in one go in the page, so a slow runner's round trips cannot open the gap.
    await a.waitForTimeout(2_100);
    expect(await a.evaluate(() => [window.owlPark.snowball('owl-b'), window.owlPark.snowball('owl-b')])).toEqual([true, false]);
    await expect.poll(async () => (await state(a)).snowballs).toEqual({ thrown: 2, landed: 2, hits: ['owl-b', 'owl-b'] });
    await expect.poll(async () => (await state(b)).snowballs.hits).toEqual(['owl-b', 'owl-b']);
    await b.screenshot({ path: `e2e-screenshots/${test.info().project.name}-snowball.png` });
  });
});
