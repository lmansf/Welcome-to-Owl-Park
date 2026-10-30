import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGround, openPark, state, toScreen } from './helpers';

/**
 * Idle owls (OP-126), on this device (local mode). With nothing done on the page for a while the
 * owl falls asleep where it stands, and every owl in the room sees it; a key or a tap wakes it.
 * Asleep a long while, "Still here?" asks; with no answer the owl leaves its room as any visitor
 * does, and Come back brings it home to its nest, where it may sleep as long as it likes. The
 * times are cut to seconds here (`?sleep=`, `?away=`, `?answer=`); a visit waits 45 seconds,
 * 10 minutes and a minute.
 */
const away = (page: Page) => page.evaluate(() => window.owlPark.away());

/** The two owls on this device, `a` the one that will doze off. */
async function twoOwls(context: BrowserContext, params: Record<string, string>): Promise<{ a: Page; b: Page }> {
  const b = await context.newPage();
  await openPark(b, { id: 'owl-b', look: '#2F3E5C,#E0D4F0,#00E5FF' });
  const a = await context.newPage();
  await openPark(a, { id: 'owl-a', look: '#8B5A2B,#F6F1E3,#C9A227', ...params });
  return { a, b };
}

// Two live parks in one browser, a room change and a nest made on first sight.
test.describe.configure({ timeout: 90_000 });

test.describe('idle owls sleep (this device)', () => {
  test('an owl left alone falls asleep where it stands, for everyone; a key or a tap wakes it', async ({ context }) => {
    const { a, b } = await twoOwls(context, { sleep: '2' });
    const where = (await state(a)).pos;
    await expect.poll(async () => (await state(a)).asleep, { timeout: 15_000 }).toBe(true);
    await expect.poll(async () => (await state(b)).peers.find((p) => p.id === 'owl-a')?.asleep, { timeout: 10_000 }).toBe(true);
    const s = await state(a);
    expect(s.pos).toEqual(where);
    expect(s.walking).toBe(false);
    expect(s.room).toBe('hub');
    await a.screenshot({ path: `e2e-screenshots/${test.info().project.name}-asleep.png` });

    if (test.info().project.name === 'phone') {
      const spot = await openGround(a, [
        { x: where.x - 120, y: where.y + 40 },
        { x: where.x + 120, y: where.y + 40 },
        { x: where.x, y: where.y - 80 },
      ]);
      const p = await toScreen(a, spot.x, spot.y);
      await a.touchscreen.tap(p.x, p.y);
    } else {
      await a.keyboard.press('Shift');
    }
    await expect.poll(async () => (await state(a)).asleep, { timeout: 5_000 }).toBe(false);
    await expect.poll(async () => (await state(b)).peers.find((p) => p.id === 'owl-a')?.asleep, { timeout: 10_000 }).toBe(false);
    expect(await away(a)).toBeNull();
  });

  test('asleep a long while, "Still here?" asks; I\'m here! keeps the owl where it is', async ({ page }) => {
    // Awake again after I'm here!, the owl would doze off a second later with `sleep: '1'`.
    await openPark(page, { collector: 'e2e-sleep-here', sleep: '3', away: '2', answer: '60' });
    await expect.poll(() => away(page), { timeout: 15_000 }).toBe('ask');
    const card = page.getByRole('dialog', { name: 'Still here?' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Your owl has been asleep for a while.');
    const here = card.locator('[data-away="here"]');
    await expect(here).toHaveText("I'm here!");
    await expect(here).toBeFocused();
    expect((await state(page)).asleep).toBe(true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-still-here.png` });

    await here.click();
    await expect(card).toBeHidden();
    expect(await away(page)).toBeNull();
    const s = await state(page);
    expect(s.asleep).toBe(false);
    expect(s.room).toBe('hub');
    expect(s.connected).toBe(true);
  });

  test('with no answer the owl leaves its room; Come back brings it home to its nest, where nothing asks', async ({ context }) => {
    const { a, b } = await twoOwls(context, { collector: 'e2e-sleep-away', sleep: '1', away: '3', answer: '3' });
    await expect.poll(async () => (await state(b)).peers.map((p) => p.id), { timeout: 10_000 }).toEqual(['owl-a']);

    // No answer: the owl has left, and the other owl is alone in the room.
    await expect.poll(() => away(a), { timeout: 30_000 }).toBe('gone');
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(0);
    await expect(b.getByText('1 owl here')).toBeVisible();
    const card = a.getByRole('dialog', { name: 'Still here?' });
    await expect(card).toContainText('Your owl dozed off and went home to its nest.');
    const back = card.locator('[data-away="back"]');
    await expect(back).toHaveText('Come back');
    await a.screenshot({ path: `e2e-screenshots/${test.info().project.name}-dozed-off.png` });

    await back.click();
    await expect(card).toBeHidden();
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toMatch(/^nest-/);
    await expect.poll(async () => (await state(a)).nest?.mine, { timeout: 10_000 }).toBe(true);
    expect(await away(a)).toBeNull();

    // At home the owl sleeps as long as it likes: past the time "Still here?" would ask, nothing does.
    await expect.poll(async () => (await state(a)).asleep, { timeout: 10_000 }).toBe(true);
    await a.waitForTimeout(4_000);
    expect(await away(a)).toBeNull();
    expect((await state(a)).asleep).toBe(true);
    expect((await state(a)).room).toMatch(/^nest-/);
  });
});
