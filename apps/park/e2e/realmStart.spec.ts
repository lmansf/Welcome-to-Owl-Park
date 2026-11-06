import { expect, test } from './fixtures';
import { openPark, state, walkToDoor } from './helpers';

/**
 * A realm's start, one screen seen from above (OP-276), the stained-glass realm's first, on the local
 * transport: it opens on its one screen with the quest owl at the post, the guardian over the vote spot
 * and the leaf pile by the trading nest; the quest owl's job is taken, flopped and hooted through; the
 * vote spot offers the vote; and the knot-hole leads back out where it did. The layout's numbers (the
 * template's floor, openings and spots) are in packages/shared's realmStart tests.
 */

const shot = (name: string) => `e2e-screenshots/${test.info().project.name}-realm-start-${name}.png`;

async function questStep(page: import('@playwright/test').Page, quest: string): Promise<number> {
  return page.evaluate((id) => window.owlPark.quests()?.active.find((q) => q.id === id)?.step ?? -1, quest);
}

test.describe('a realm’s start (OP-276)', () => {
  test('the stained-glass start is one screen: a quest from the post, the leaves, the vote spot, and the knot-hole back', async ({ page, isMobile }) => {
    test.slow(); // a quest run and a room change, on a slow phone runner too
    // A phone held upright at 390 wide, as most players hold one; the landscape view is a shot of its own.
    if (isMobile) await page.setViewportSize({ width: 390, height: 844 });
    await openPark(page, { room: 'glass', collector: 'e2e-realm-start', tz: 'UTC' });
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('glass');
    const first = await state(page);
    expect(first.doors.map((d) => d.id)).toEqual(['to-hub', 'idol', 'portal']);
    await expect.poll(async () => (await state(page)).npcs.find((n) => n.id === 'prism')?.mark, { timeout: 15_000 }).toBe('offer');
    expect(first.objects.some((o) => o.id === 'glass-leaves-start' && o.here)).toBe(true);
    await page.screenshot({ path: shot('arrival') });

    // The quest owl at the post gives a job: the leaves by the trading nest, then a hoot.
    expect(await page.evaluate(() => window.owlPark.talk('prism'))).toBe(true);
    const dialogue = page.locator('.dialogue[data-npc="prism"]');
    await expect(dialogue).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: shot('quest') });
    await dialogue.locator('[data-offer="story-prism-panes"]').getByRole('button', { name: 'Take it on' }).click();
    await expect.poll(() => questStep(page, 'story-prism-panes'), { timeout: 15_000 }).toBe(0);
    expect(await page.evaluate(() => window.owlPark.use('glass-leaves-start'))).toBe(true);
    await expect.poll(async () => (await state(page)).objects.find((o) => o.id === 'glass-leaves-start')?.here, { timeout: 15_000 }).toBe(false);
    await expect.poll(() => questStep(page, 'story-prism-panes'), { timeout: 15_000 }).toBe(1);
    expect(await page.evaluate(() => window.owlPark.talk('prism'))).toBe(true);
    await expect(dialogue).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.owlPark.emote('hoot'))).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => window.owlPark.quests()?.active.find((q) => q.id === 'story-prism-panes')?.ready)) ?? false, { timeout: 15_000 }).toBe(true);
    await page.keyboard.press('Escape');

    // Front and centre under the guardian, the vote spot offers the vote.
    await walkToDoor(page, 'idol');
    await expect(page.getByRole('button', { name: 'Vote for this realm', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: shot('vote') });
    if (isMobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(400);
      await page.screenshot({ path: shot('landscape') });
    }

    // The knot-hole leads back where it did: into the glass commons on the new map.
    await walkToDoor(page, 'to-hub');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('commons-glass');
  });
});
