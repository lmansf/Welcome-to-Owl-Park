import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, settleCamera, state, toScreen, walkToDoor } from './helpers';

/**
 * The entries setting (OP-156) through the room server: of every hundred new owls, how many start in
 * the tree (map 2), set on the keepers' capacity page. Play still lands every owl in its own nest; an
 * owl the tree takes finds the nest's door leads into the tree, and the others find the street as
 * before. An owl the tree takes walks the new map (map 3) unless its tab asks for the tree as it was
 * (`?newmap=0`), as the first two tests do. Every test ends with the share at 0, as deployed, so the
 * other suites find the park as before.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const LOOK = { body: '#3E6B48', belly: '#F6F1E3', accent: '#C9A227' };

async function share(request: APIRequestContext, tree: number): Promise<void> {
  const r = await request.post('/api/admin/capacity', { headers: ADMIN, data: { realms: { tree } } });
  expect(r.status(), await r.text()).toBe(200);
}

const online = (page: Page) => page.waitForFunction(() => document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout: 20_000 });

/** A new owl on its own device (a look kept, no nest yet): Play, and it is in its own nest. `query` is added to the page's address. */
async function newOwlPlays(browser: Browser, query = ''): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript((look) => localStorage.setItem('owl-park:look', JSON.stringify(look)), LOOK);
  const page = await context.newPage();
  await page.goto(`/?transport=edge${query}`);
  await page.locator('[data-home-btn="play"]').click();
  await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toMatch(/^nest-/);
  // Welcomed by the room server, so the page knows the realms switch before the owl goes out of the door.
  await online(page);
  return page;
}

test.describe('the entries setting (OP-156)', () => {
  test.afterEach(async ({ request }) => share(request, 0));

  test('opened on the keepers’ page, the tree takes every new owl out of its nest’s door onto the tree’s street; dark again, the owl there is sent to the nests’ street (`homes`), outside the park as it was', async ({ browser, request }) => {
    test.slow(); // a keeper's page and a visit through the room server, drawn with software WebGL
    const keeper = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    keeper.on('dialog', (d) => void d.accept());
    await keeper.goto('/admin/capacity');
    await keeper.getByLabel('Admin key').fill(E2E_ADMIN_KEY);
    await keeper.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(keeper.locator('#tree-state')).toHaveText('The tree is dark: only a keeper’s token reaches it.');
    await keeper.locator('#tree-share').fill('100');
    await keeper.locator('#tree-save').click();
    await expect(keeper.locator('#tree-state')).toContainText('The tree is open: 100 in every hundred new owls start there');
    const now = (await (await request.get('/api/admin/capacity', { headers: ADMIN })).json()) as { realms: { tree?: number } };
    expect(now.realms.tree).toBe(100);

    const page = await newOwlPlays(browser, '&newmap=0');
    await walkToDoor(page, 'to-street');
    await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toBe('l5-street');
    await online(page);

    await keeper.locator('#tree-share').fill('0');
    await keeper.locator('#tree-save').click();
    await expect(keeper.locator('#tree-state')).toHaveText('The tree is dark: only a keeper’s token reaches it.');
    await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toBe('homes');
    await keeper.context().close();
    await page.context().close();
  });

  test('an owl of the tree in its nest when the tree goes dark finds its door leads to the street (`homes`), as every owl’s does while the tree takes no share', async ({ browser, request }) => {
    test.slow(); // a visit through the room server, drawn with software WebGL
    await share(request, 100);
    const page = await newOwlPlays(browser, '&newmap=0');
    const door = async () => (await state(page)).doors.find((d) => d.id === 'to-street')?.to;
    expect(await door()).toBe('l5-street');
    await share(request, 0);
    // The room server tells the nest at once: the way out is today's park's again.
    await expect.poll(door, { timeout: 15_000 }).toBe('homes');
    await walkToDoor(page, 'to-street');
    await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toBe('homes');
    await page.context().close();
  });

  test('an owl the tree takes walks the new map: out of its nest onto the nests’ street, to the Treetop Commons, and through the turnstiles down the knothole into the hollow hall', async ({ browser, request }) => {
    test.slow(); // a visit through the room server across three rooms, drawn with software WebGL
    await share(request, 100);
    const page = await newOwlPlays(browser);
    const door = async (id: string) => (await state(page)).doors.find((d) => d.id === id)?.to;
    expect(await door('to-street')).toBe('homes');
    await walkToDoor(page, 'to-street');
    await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toBe('homes');
    await online(page);
    await walkToDoor(page, 'to-lobby');
    await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toBe('lobby');
    await online(page);
    expect(await door('gate')).toBe('m3-hall');
    await walkToDoor(page, 'gate');
    await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toBe('m3-hall');
    // In at the knothole and drawn there, where the camera looks, before any key is pressed (OP-277).
    const arrived = await state(page);
    expect(arrived.air.z).toBeGreaterThan(0);
    expect(arrived.height).toBe(arrived.air.z);
    // The knothole's doorway is at the hall's top edge: the camera stops with that edge below the owl
    // count (and, on a touch screen, the Menu and Say up there), not under them (OP-278).
    await settleCamera(page);
    const roomTop = (await toScreen(page, 0, 0)).y;
    const hudTop = await page.evaluate(() =>
      Math.max(
        0,
        ...[...document.querySelectorAll('#hud .bar .pill, #hud [data-menu-btn], #hud [data-say-btn]')]
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.height > 0 && r.top + r.height / 2 < window.innerHeight / 2)
          .map((r) => r.bottom),
      ),
    );
    expect(hudTop).toBeGreaterThan(0);
    expect(roomTop).toBeGreaterThanOrEqual(hudTop - 1);
    await online(page);
    await page.context().close();
  });
});
