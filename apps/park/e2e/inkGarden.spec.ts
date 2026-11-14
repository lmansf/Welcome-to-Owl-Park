import { expect, test } from './fixtures';
import { openPark, state, walkToDoor } from './helpers';

/**
 * The ink garden (OP-402), the ink-wash realm's room behind the ink Commons in the Great Hollow, on the
 * new map and the local transport: it opens with its two ways (back into the hollow and up through the
 * moon gate), its quest owl's job is taken, flopped and hooted through, and the tree's doorway leads back
 * into the hollow in front of the ink Commons. The floor, the spots and the plaza are packages/shared's
 * rooms tests.
 */

const shot = (name: string) => `e2e-screenshots/${test.info().project.name}-ink-garden-${name}.png`;

async function questStep(page: import('@playwright/test').Page, quest: string): Promise<number> {
  return page.evaluate((id) => window.owlPark.quests()?.active.find((q) => q.id === id)?.step ?? -1, quest);
}

test.describe('the ink garden (OP-402)', () => {
  test('opens with its two ways and a quest from its owl, and its doorway leads back into the Great Hollow', async ({ page, isMobile }) => {
    test.slow(); // a quest run and a room change, on a slow phone runner too
    if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
    await openPark(page, { room: 'ink', newmap: '1', spawn: 'from-hub', collector: 'e2e-ink-garden', tz: 'UTC' });
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('ink');
    const first = await state(page);
    expect(first.doors.map((d) => d.id)).toEqual(['to-hub', 'to-course']);
    await expect.poll(async () => (await state(page)).npcs.find((n) => n.id === 'sumi')?.mark, { timeout: 15_000 }).toBe('offer');
    await page.screenshot({ path: shot('arrival') });

    // The quest owl just in from the doorway gives a job: the leaves blown in through the moon gate, then a hoot.
    expect(await page.evaluate(() => window.owlPark.talk('sumi'))).toBe(true);
    const dialogue = page.locator('.dialogue[data-npc="sumi"]');
    await expect(dialogue).toBeVisible({ timeout: 15_000 });
    await dialogue.locator('[data-offer="story-sumi-garden"]').getByRole('button', { name: 'Take it on' }).click();
    await expect.poll(() => questStep(page, 'story-sumi-garden'), { timeout: 15_000 }).toBe(0);
    expect(await page.evaluate(() => window.owlPark.use('ink-leaves-gate'))).toBe(true);
    await expect.poll(async () => (await state(page)).objects.find((o) => o.id === 'ink-leaves-gate')?.here, { timeout: 15_000 }).toBe(false);
    await expect.poll(() => questStep(page, 'story-sumi-garden'), { timeout: 15_000 }).toBe(1);
    expect(await page.evaluate(() => window.owlPark.talk('sumi'))).toBe(true);
    await expect(dialogue).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.owlPark.emote('hoot'))).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => window.owlPark.quests()?.active.find((q) => q.id === 'story-sumi-garden')?.ready)) ?? false, { timeout: 15_000 }).toBe(true);
    await page.keyboard.press('Escape');
    if (isMobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('landscape') });
    }

    // Back out through the tree's doorway: into the Great Hollow, in front of the ink Commons.
    await walkToDoor(page, 'to-hub');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('m3-hall');
  });
});
