import { expect, test, type Page } from '@playwright/test';
import { openPark, state } from './helpers';

/** A drop of this visitor's current window, opening the park in its room if it is elsewhere. */
async function goToAFind(page: Page, params: Record<string, string>): Promise<{ n: number; room: string }> {
  await expect.poll(async () => (await page.evaluate(() => window.owlPark.drops())).length, { timeout: 15_000 }).toBeGreaterThan(0);
  const drops = await page.evaluate(() => window.owlPark.drops());
  const d = drops[0]!;
  if ((await state(page)).room !== d.room) {
    await openPark(page, { ...params, room: d.room });
    await expect.poll(async () => (await page.evaluate(() => window.owlPark.drops())).some((x) => x.n === d.n), { timeout: 15_000 }).toBe(true);
  }
  return { n: d.n, room: d.room };
}

/** Give a collector a variant before the park loads (as if found earlier), stored the way the local mode keeps it. */
async function seed(page: Page, collector: string, variant: string): Promise<void> {
  await page.addInitScript(({ cid, v }) => {
    const key = `owl-park:collection:${cid}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ collectors: [], owned: [[cid, v, 'granted', 0]], drops: [] }));
  }, { cid: collector, v: variant });
}

async function owns(page: Page, variant: string): Promise<boolean> {
  return page.evaluate((v) => window.owlPark.collection()?.owned.includes(v) ?? false, variant);
}

test.describe('collectibles (this device)', () => {
  test('a find waits on the floor; walking onto it collects it', async ({ page }) => {
    const params = { collector: 'e2e-find', tz: 'UTC' };
    await openPark(page, params);
    await expect(page.locator('[data-finds]')).toContainText(/finds? left this (morning|afternoon)/);
    await expect.poll(async () => (await page.evaluate(() => window.owlPark.collection()))?.owned.length ?? 0).toBe(3); // the starter pack
    const { n } = await goToAFind(page, params);
    expect(await page.evaluate((x) => window.owlPark.pickup(x), n)).toBe(true);
    const toast = page.getByText(/^Found/);
    await expect(toast).toBeVisible({ timeout: 20_000 });
    expect((await page.evaluate(() => window.owlPark.drops())).some((d) => d.n === n)).toBe(false);
    // Usually something new; rarely a duplicate of the starter pack, which pays feathers instead.
    const dup = /again/.test((await toast.first().textContent()) ?? '');
    expect((await page.evaluate(() => window.owlPark.collection()))?.owned.length).toBe(dup ? 3 : 4);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-found.png` });
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

  test('the collection panel shows progress, what is worn, and what crafting costs', async ({ page }) => {
    await seed(page, 'e2e-panel', 'witch-hat~3');
    await openPark(page, { collector: 'e2e-panel', tz: 'UTC' });
    await expect.poll(() => owns(page, 'witch-hat~3')).toBe(true);
    expect(await page.evaluate(() => window.owlPark.equip('witch-hat~3'))).toBe(true);

    await page.getByRole('button', { name: 'Collection' }).click();
    await expect(page.getByText(/of 1068 · \d+ feathers/)).toBeVisible();
    await page.locator('.card[data-item="witch-hat"]').click();
    await expect(page.getByRole('button', { name: 'Take off' })).toBeVisible();
    await page.locator('.card[data-item="crown"]').click();
    await expect(page.getByRole('button', { name: /Craft for 600 feathers/ })).toBeDisabled();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-collection.png` });
    await page.getByRole('button', { name: 'Close collection' }).click();
    await page.getByRole('button', { name: 'Emotes' }).click();
    await expect(page.locator('[data-emote="hoot"]')).toBeVisible();
  });
});
