import { expect, test, type Page } from '@playwright/test';
import { openPark, state } from './helpers';

/** Give a collector a variant before the park loads (as if earned earlier), stored the way the local mode keeps it. */
async function seed(page: Page, collector: string, variant: string): Promise<void> {
  await page.addInitScript(({ cid, v }) => {
    const key = `owl-park:collection:${cid}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ collectors: [], owned: [[cid, v, 'granted', 0]] }));
  }, { cid: collector, v: variant });
}

/** Start a collector with feathers to spend (and the starter pack). */
async function seedFeathers(page: Page, collector: string, feathers: number): Promise<void> {
  await page.addInitScript(({ cid, n }) => {
    const key = `owl-park:collection:${cid}`;
    if (localStorage.getItem(key)) return;
    const owned = ['hoot', 'flap', 'bow-tie~0'].map((v) => [cid, v, 'granted', 0]);
    localStorage.setItem(key, JSON.stringify({ collectors: [{ cid, tz: 'UTC', tzSetAt: 0, feathers: n, createdAt: 0 }], owned }));
  }, { cid: collector, n: feathers });
}

async function owns(page: Page, variant: string): Promise<boolean> {
  return page.evaluate((v) => window.owlPark.collection()?.owned.includes(v) ?? false, variant);
}

/** The current step of an active quest (its index), or -1. */
async function questStep(page: Page, quest: string): Promise<number> {
  return page.evaluate((id) => window.owlPark.quests()?.active.find((q) => q.id === id)?.step ?? -1, quest);
}

test.describe('quests, NPC owls and leaf piles (this device)', () => {
  test('the welcome quest runs across the park and pays a collectible', async ({ page }) => {
    test.slow(); // four rooms, each loaded and drawn with software WebGL on CI runners
    const params = { collector: 'e2e-welcome', tz: 'UTC' };
    await openPark(page, params);
    await expect.poll(async () => (await state(page)).npcs.find((n) => n.id === 'bramble')?.mark, { timeout: 15_000 }).toBe('offer');
    await expect(page.locator('.tracker')).toContainText('Talk to Elder Bramble');

    // Walk up to Elder Bramble and take the quest from the dialogue.
    expect(await page.evaluate(() => window.owlPark.talk('bramble'))).toBe(true);
    const dialogue = page.locator('.dialogue[data-npc="bramble"]');
    await expect(dialogue).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-dialogue.png` });
    await dialogue.locator('[data-offer="story-welcome"]').getByRole('button', { name: 'Take it on' }).click();
    await expect(page.getByText(/^New quest:/)).toBeVisible();
    await expect(page.locator('.tracker')).toContainText('Talk to Pip');

    // Step 1: Pip, in the same room.
    expect(await page.evaluate(() => window.owlPark.talk('pip'))).toBe(true);
    await expect.poll(() => questStep(page, 'story-welcome'), { timeout: 15_000 }).toBe(1);

    // Step 2 and 3: arriving in the clearing counts; then a flop into the leaves.
    await openPark(page, { ...params, room: 'grove' });
    await expect.poll(() => questStep(page, 'story-welcome'), { timeout: 15_000 }).toBe(2);
    expect(await page.evaluate(() => window.owlPark.use('grove-leaves-1'))).toBe(true);
    await expect.poll(async () => (await state(page)).objects.find((o) => o.id === 'grove-leaves-1')?.here, { timeout: 15_000 }).toBe(false);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-leaves.png` });
    await expect.poll(() => questStep(page, 'story-welcome')).toBe(3);

    // Step 4: Nova on the neon street.
    await openPark(page, { ...params, room: 'market' });
    expect(await page.evaluate(() => window.owlPark.talk('nova'))).toBe(true);
    await expect.poll(() => questStep(page, 'story-welcome'), { timeout: 15_000 }).toBe(4);

    // Step 5: a hoot for Elder Bramble, then hand it in.
    await openPark(page, params);
    expect(await page.evaluate(() => window.owlPark.talk('bramble'))).toBe(true);
    await expect(dialogue).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => window.owlPark.emote('hoot'))).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => window.owlPark.quests()?.active[0]?.ready)) ?? false).toBe(true);
    await expect.poll(async () => (await state(page)).npcs.find((n) => n.id === 'bramble')?.mark).toBe('ready');
    await dialogue.locator('[data-quest="story-welcome"]').getByRole('button', { name: 'Hand it in' }).click();
    await expect(page.getByText(/^Reward: Leaf Crown/)).toBeVisible();
    await expect.poll(() => owns(page, 'leaf-crown~0')).toBe(true);
    expect((await page.evaluate(() => window.owlPark.collection()))?.feathers).toBeGreaterThanOrEqual(50);

    // The journal (J) lists what comes next.
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyJ');
    await expect(page.locator('.journal')).toBeVisible();
    await expect(page.locator('.journal')).toContainText('Who has quests for you');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-journal.png` });
  });

  test('the feather shop gives a gift a day and sells today’s three, the featured shelf and the week', async ({ page }) => {
    await seedFeathers(page, 'e2e-shop', 1000);
    await openPark(page, { collector: 'e2e-shop', tz: 'UTC', room: 'market' });
    await expect.poll(async () => (await page.evaluate(() => window.owlPark.collection()))?.feathers ?? 0).toBe(1000);
    await expect(page.locator('[data-feathers]')).toContainText('1000');
    expect(await page.evaluate(() => window.owlPark.talk('nova'))).toBe(true);
    await page.locator('.dialogue[data-npc="nova"]').getByRole('button', { name: 'Open the shop' }).click({ timeout: 15_000 });
    const shop = page.locator('.shop');
    const rot = await page.evaluate(async () => (await window.owlPark.shop()).rotation);
    await expect(shop.locator('.gift')).toBeVisible();
    await expect(shop.getByText("Today's three")).toBeVisible();
    await expect(shop.getByText('This week')).toBeVisible();
    await expect(shop.locator('.grid .item')).toHaveCount(rot.daily.length + rot.featured.length + rot.weekly.length);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-shop.png` });

    // The gift: free, once a day.
    await shop.locator('.gift').getByRole('button', { name: 'Take it' }).click();
    await expect(page.getByText(/^A gift:|already: \+/)).toBeVisible();
    await expect(shop.locator('.gift').getByRole('button', { name: 'Taken' })).toBeDisabled();
    await expect.poll(() => owns(page, rot.gift!.variant)).toBe(true);
    expect(await page.evaluate(() => window.owlPark.gift())).toMatchObject({ ok: false, reason: 'taken' });

    // One of today's three, for feathers.
    const item = rot.daily.find((o) => o.variant !== 'bow-tie~0')!;
    await shop.locator(`.item[data-variant="${item.variant}"]`).getByRole('button', { name: `${item.price} feathers` }).click();
    await expect(page.getByText(/^Bought:/)).toBeVisible();
    await expect.poll(() => owns(page, item.variant)).toBe(true);
    await expect(shop.locator('[data-feathers]')).toHaveAttribute('data-feathers', String(1000 - item.price));
    await expect(shop.locator(`.item[data-variant="${item.variant}"]`)).toContainText('In your collection');
  });

  test('what an owl wears and the emotes it plays reach the other owls', async ({ page: a, context }) => {
    test.slow(); // two live parks in one browser, both drawn with software WebGL on CI runners
    await seed(a, 'e2e-wear', 'witch-hat~3');
    const b = await context.newPage();
    await openPark(a, { id: 'owl-a', collector: 'e2e-wear', tz: 'UTC' });
    await openPark(b, { id: 'owl-b', collector: 'e2e-other', tz: 'UTC' });
    await expect.poll(async () => (await state(b)).peers.map((p) => p.id)).toEqual(['owl-a']);
    await expect.poll(() => owns(a, 'witch-hat~3')).toBe(true);

    expect(await a.evaluate(() => window.owlPark.equip('crown~0'))).toBe(false); // not owned
    expect(await a.evaluate(() => window.owlPark.equip('witch-hat~3'))).toBe(true);
    await expect.poll(async () => (await state(b)).peers[0]?.look.wear?.head, { timeout: 15_000 }).toBe('witch-hat~3');

    expect(await a.evaluate(() => window.owlPark.emote('twirl'))).toBe(false); // not owned
    expect(await a.evaluate(() => window.owlPark.emote('hoot'))).toBe(true); // from the starter pack
    await expect.poll(async () => (await state(b)).peers[0]?.emote, { timeout: 10_000 }).toBe('hoot');
  });

  test('the collection panel shows progress, what is worn, and where the rest comes from', async ({ page }) => {
    await seed(page, 'e2e-panel', 'witch-hat~3');
    await openPark(page, { collector: 'e2e-panel', tz: 'UTC' });
    await expect.poll(() => owns(page, 'witch-hat~3')).toBe(true);
    expect(await page.evaluate(() => window.owlPark.equip('witch-hat~3'))).toBe(true);

    await page.getByRole('button', { name: 'Collection' }).click();
    await expect(page.getByText(/of 1180 · \d+ feathers/)).toBeVisible();
    await page.locator('.card[data-item="witch-hat"]').click();
    await expect(page.getByRole('button', { name: 'Take off' })).toBeVisible();
    await page.locator('.card[data-item="crown"]').click();
    await expect(page.getByText(/earn it on a quest, or look for it in the feather shop/)).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-collection.png` });
    await page.getByRole('button', { name: 'Close collection' }).click();
    await page.getByRole('button', { name: 'Emotes' }).click();
    await expect(page.locator('[data-emote="hoot"]')).toBeVisible();
  });

  test('the owl panel picks a kind of owl: drawn at its size, seen by others, kept on return', async ({ page, context }) => {
    test.slow(); // two live parks in one browser
    const other = await context.newPage();
    await openPark(page, { id: 'owl-a', collector: 'e2e-species', tz: 'UTC' });
    await openPark(other, { id: 'owl-b', collector: 'e2e-species-b', tz: 'UTC' });
    await page.getByRole('button', { name: 'Your owl' }).click();
    await page.getByRole('button', { name: 'Screech owl' }).click();
    await expect.poll(async () => (await state(page)).look.species).toBe('screech');
    await page.getByRole('button', { name: 'Natural colours' }).click();
    await expect.poll(async () => (await state(page)).look.body).toBe('#6B6B6B');
    await expect.poll(async () => (await state(other)).peers.find((p) => p.id === 'owl-a')?.look.species, { timeout: 15_000 }).toBe('screech');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-species.png` });
    await other.close();
    await openPark(page, { id: 'owl-a', collector: 'e2e-species', tz: 'UTC' });
    expect((await state(page)).look).toMatchObject({ species: 'screech', body: '#6B6B6B' });
  });
});
