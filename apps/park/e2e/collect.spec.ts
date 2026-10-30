import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { frames, openPark, state } from './helpers';

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
    // Quests live in the Menu (OP-083): nothing about them over the room; the quests screen says where to start.
    await expect(page.locator('#hud .welcome')).toBeHidden();
    await page.keyboard.press('KeyJ');
    await expect(page.locator('.journal')).toContainText('Start with Elder Bramble');
    await page.keyboard.press('Escape');

    // Walk up to Elder Bramble and take the quest from the dialogue.
    expect(await page.evaluate(() => window.owlPark.talk('bramble'))).toBe(true);
    const dialogue = page.locator('.dialogue[data-npc="bramble"]');
    await expect(dialogue).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-dialogue.png` });
    await dialogue.locator('[data-offer="story-welcome"]').getByRole('button', { name: 'Take it on' }).click();
    // A new quest is a short line at the top and a dot on the Menu button, nothing more.
    await expect(page.locator('.notice').filter({ hasText: /^New quest:/ })).toBeVisible();
    await expect(page.locator('[data-quest-dot]')).toBeVisible();
    // The quests screen lists it with its progress, and opening it clears the dot.
    await page.keyboard.press('KeyJ');
    const card = page.locator('.journal [data-quest="story-welcome"]');
    await expect(card.locator('[data-progress]')).toHaveText('0/5');
    await expect(card.locator('li.now')).toContainText('Pip');
    await expect(page.locator('[data-quest-dot]')).toBeHidden();
    await page.keyboard.press('Escape');

    // Step 1: Pip, in the same room. A step done says nothing over the room.
    expect(await page.evaluate(() => window.owlPark.talk('pip'))).toBe(true);
    await expect.poll(() => questStep(page, 'story-welcome'), { timeout: 15_000 }).toBe(1);
    await frames(page, 30);
    await expect(page.locator('.toast').filter({ hasText: /step done|\d of \d/ })).toHaveCount(0);

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
    await expect(page.locator('.notice').filter({ hasText: /^Quest complete:/ })).toBeVisible();
    await expect(page.locator('[data-quest-dot]')).toBeVisible();
    // Collected from the quests screen: Elder Bramble stands right here, so the reward comes at once.
    await page.keyboard.press('KeyJ');
    await expect(card.locator('[data-progress]')).toHaveText('Done');
    await card.getByRole('button', { name: 'Collect' }).click();
    await expect(page.getByText(/^Reward: Leaf Crown/)).toBeVisible();
    await expect.poll(() => owns(page, 'leaf-crown~0')).toBe(true);
    expect((await page.evaluate(() => window.owlPark.collection()))?.feathers).toBeGreaterThanOrEqual(50);

    // Quests (J) lists what comes next.
    await page.keyboard.press('Escape');
    await page.keyboard.press('KeyJ');
    await expect(page.locator('.journal')).toBeVisible();
    await page.locator('.journal [data-tab="more"]').click();
    await expect(page.locator('.journal')).toContainText('Who has quests for you');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-journal.png` });
  });

  test('every owl gets the Bat pet as a Halloween present, and hears about it once', async ({ page }) => {
    // A collection from before the present.
    await seedFeathers(page, 'e2e-present', 0);
    await openPark(page, { collector: 'e2e-present', tz: 'UTC' });
    await expect(page.getByText(/^Happy Halloween! Every owl gets a Bat pet/)).toBeVisible({ timeout: 15_000 });
    expect(await owns(page, 'bat~0')).toBe(true);
    expect(await owns(page, 'bow-tie~0')).toBe(true);
    // It can be worn at once.
    expect(await page.evaluate(() => window.owlPark.equip('bat~0'))).toBe(true);
    await expect.poll(async () => (await page.evaluate(() => window.owlPark.state()?.look.wear?.pet)) ?? null).toBe('bat~0');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-bat-present.png` });
    // The next visit on this device says nothing more.
    await page.reload();
    await page.waitForFunction(() => window.owlPark?.collection() !== null, null, { timeout: 20_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByText(/^Happy Halloween!/)).toHaveCount(0);
    expect(await owns(page, 'bat~0')).toBe(true);
  });

  test('walking up to a leaf pile on the far side of a doorway does not take the doorway', async ({ page }) => {
    // From the clearing's arrival point the way to this pile crosses the hollow's doorway.
    await openPark(page, { collector: 'e2e-doorway', tz: 'UTC', room: 'grove' });
    expect(await page.evaluate(() => window.owlPark.use('grove-leaves-2'))).toBe(true);
    await expect.poll(async () => (await state(page)).objects.find((o) => o.id === 'grove-leaves-2')?.here, { timeout: 15_000 }).toBe(false);
    expect((await state(page)).room).toBe('grove');
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

  test('the owl builder shows progress, puts on and takes off what is owned, and says where the rest comes from', async ({ page }) => {
    await seed(page, 'e2e-panel', 'witch-hat~3');
    await openPark(page, { collector: 'e2e-panel', tz: 'UTC' });
    await expect.poll(() => owns(page, 'witch-hat~3')).toBe(true);
    expect(await page.evaluate(() => window.owlPark.equip('witch-hat~3'))).toBe(true);

    // Your owl as the first run opens it, over the room (mirror.spec.ts opens it at the nest's mirror).
    await page.evaluate(() => window.owlPark.openBuilder());
    const builder = page.getByRole('dialog', { name: 'Your owl' });
    await expect(builder.getByText(/of 1190 collected · \d+ feathers/)).toBeVisible();
    // The owl is drawn big while the builder is open, over the room.
    await expect.poll(() => page.evaluate(() => window.owlPark.game.scene.isActive('builder'))).toBe(true);
    await builder.locator('[data-tab="wear"]').click();
    const hat = builder.locator('.card[data-item="witch-hat"]');
    await expect(hat).toHaveAttribute('aria-pressed', 'true');
    await hat.click();
    await expect.poll(async () => (await state(page)).look.wear?.head ?? null).toBeNull();
    await hat.click();
    await expect.poll(async () => (await state(page)).look.wear?.head ?? null).toBe('witch-hat~3');
    await expect(builder.getByRole('button', { name: 'Take off' })).toBeVisible();
    await builder.locator('.card[data-item="crown"]').click();
    await expect(builder.getByText(/earn it on a quest, or look for it in the feather shop/)).toBeVisible();
    expect((await state(page)).look.wear?.head).toBe('witch-hat~3');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-owl-builder.png` });
    await builder.getByRole('button', { name: 'Done: close your owl' }).click();
    await expect(builder).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.owlPark.game.scene.isActive('builder'))).toBe(false);
  });

  test('the Emotes button opens the wheel, which plays one and closes; on a keyboard 1 to 8 play one at once', async ({ page, context }) => {
    test.slow(); // two live parks in one browser
    await seed(page, 'e2e-wheel', 'dance');
    const other = await context.newPage();
    await openPark(page, { id: 'owl-a', collector: 'e2e-wheel', tz: 'UTC' });
    await openPark(other, { id: 'owl-b', collector: 'e2e-wheel-b', tz: 'UTC' });
    await expect.poll(() => owns(page, 'dance')).toBe(true);
    const seen = async () => (await state(other)).peers.find((p) => p.id === 'owl-a')?.emote;
    await page.locator('[data-emotes-btn]').click();
    const wheel = page.getByRole('dialog', { name: 'Emotes' });
    await expect(page.locator('[data-emotes-btn]')).toHaveAttribute('aria-expanded', 'true');
    // The starter pack's two and the one earned, in the catalogue's order.
    await expect(wheel.locator('[data-emote]')).toHaveCount(3);
    await expect(wheel.locator('[data-emote]').first()).toHaveAttribute('data-emote', 'hoot');
    const order = await wheel.locator('[data-emote]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset['emote']));
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-emote-wheel.png` });
    await wheel.locator('[data-emote="dance"]').click();
    await expect(wheel).toBeHidden();
    await expect(page.locator('[data-emotes-btn]')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(seen, { timeout: 10_000 }).toBe('dance');
    // Open again, a number on a keyboard plays that slot. (T is Say's key, C44.)
    await page.locator('[data-emotes-btn]').click();
    await expect(wheel).toBeVisible();
    await page.keyboard.press('Digit1');
    await expect(wheel).toBeHidden();
    await expect.poll(seen, { timeout: 10_000 }).toBe('hoot');
    // With nothing open a number plays that emote at once (after the room's pause between emotes).
    await page.waitForTimeout(1_600);
    await page.keyboard.press('Digit2');
    await expect.poll(seen, { timeout: 10_000 }).toBe(order[1]);
    // While another screen is open the numbers are left alone.
    await page.waitForTimeout(1_600);
    await page.keyboard.press('KeyM');
    await page.keyboard.press('Digit1');
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
    await frames(page, 30);
    expect(await seen()).toBe(order[1]);
    await page.keyboard.press('Escape');
  });

  test('the owl builder picks a kind of owl: drawn in its own art at its size, seen by others, kept on return', async ({ page, context }) => {
    test.slow(); // two live parks in one browser
    const other = await context.newPage();
    await openPark(page, { id: 'owl-a', collector: 'e2e-species', tz: 'UTC' });
    await openPark(other, { id: 'owl-b', collector: 'e2e-species-b', tz: 'UTC' });
    await page.evaluate(() => window.owlPark.openBuilder());
    // A barn owl wears its own painted layers, loaded when it first shows up.
    await page.getByRole('button', { name: 'Barn owl' }).click();
    await expect.poll(async () => (await state(page)).owlArt, { timeout: 15_000 }).toBe('owl-barn-body');
    // So does the screech owl, at its own small size.
    await page.getByRole('button', { name: 'Screech owl' }).click();
    await expect.poll(async () => (await state(page)).look.species).toBe('screech');
    await expect.poll(async () => (await state(page)).owlArt, { timeout: 15_000 }).toBe('owl-screech-body');
    await page.locator('.builder [data-tab="colours"]').click();
    await page.getByRole('button', { name: 'Natural colours' }).click();
    await expect.poll(async () => (await state(page)).look.body).toBe('#6B6B6B');
    await expect.poll(async () => (await state(other)).peers.find((p) => p.id === 'owl-a')?.look.species, { timeout: 15_000 }).toBe('screech');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-species.png` });
    await other.close();
    await openPark(page, { id: 'owl-a', collector: 'e2e-species', tz: 'UTC' });
    expect((await state(page)).look).toMatchObject({ species: 'screech', body: '#6B6B6B' });
  });
});
