import { devices, type APIRequestContext, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, enterAsGuest, frames, state, walkToDoor } from './helpers';

/**
 * One safe area along the top of the screen (OP-369), through the room server set as the live park is:
 * the gate taking tickets (so an owl without one is a guest), the keepers' ribbon on, and the tree
 * taking every new owl (the new map). A new owl goes from the home screen out of its nest, along the
 * street, through the turnstiles as a guest, into the Great Hollow and on into a course, and at every
 * stop, at each of the sizes the owner's audit named, no two of the things laid over the game lie over
 * one another: the ribbon, the guest's "Just looking" badge, the welcome card, a course's objective
 * strip, a two-second notice, the top bar's pieces, the buttons, the feedback button and its card, and
 * on the home screen its own words and buttons.
 * Before, on a computer, the badge lay over the ribbon's words everywhere inside the park, and the
 * objective strip lay over the ribbon's end in a course at every size.
 */
const ADMIN = { 'X-Admin-Key': E2E_ADMIN_KEY };
const LOOK = { body: '#3E6B48', belly: '#F6F1E3', accent: '#C9A227' };
/** About as long as a notice that the park is still being built. */
const RIBBON = 'Owl Park is still being built. Some areas are closed and things may change.';

type Size = { width: number; height: number };

async function capacity(request: APIRequestContext, data: unknown): Promise<void> {
  const r = await request.post('/api/admin/capacity', { headers: ADMIN, data });
  expect(r.status(), await r.text()).toBe(200);
}

async function gate(request: APIRequestContext, mode: 'ticket' | 'deployed'): Promise<number | null> {
  const r = await request.post('/api/admin/gate', { headers: ADMIN, data: { mode } });
  expect(r.status(), await r.text()).toBe(200);
  return ((await r.json()) as { closedAt?: number | null }).closedAt ?? null;
}

/**
 * Everything laid over the game that is on the screen now, and each pair of them that lies over one
 * another (none is the rule). A sign that follows a thing in the room (a doorway's key) is not one of
 * them: it moves with the room under the rest. The phone's pad is one thing: its round buttons are set
 * close on purpose, so their boxes' corners cross where the buttons themselves do not.
 */
async function lyingOver(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const chips = [
      // The park's HUD.
      '.bar .brand', '.bar .feathers', '.bar .pill', '[data-ribbon]', '.spectator.show', '.welcome.show', '.nest-welcome.show', '#objective-strip',
      '.notices > *', '.cards > *', '[data-toasts] > *', '[data-menu-btn]', '[data-emotes-btn]', '[data-say-btn]', '[data-say-reply]', '[data-actions] > *',
      '[data-pad-interact]', '[data-pad-jump]', '[data-pad-dash]', '.fb-bug', '.fb-card',
      // The home screen.
      '[data-home] .h-mascot', '[data-home] h1', '[data-home-lead]', '[data-home-note]', '[data-home-btn]', '[data-home-sub]', '[data-home-info]', '[data-home-welcome]',
    ];
    const seen: Array<{ name: string; pad: boolean; r: DOMRect }> = [];
    for (const sel of chips) {
      for (const el of document.querySelectorAll<HTMLElement>(`#hud ${sel}`)) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || r.bottom <= 0 || r.top >= innerHeight) continue;
        seen.push({ name: `${sel} "${(el.innerText || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 24)}"`, pad: sel.startsWith('[data-pad-'), r });
      }
    }
    const over: string[] = [];
    for (let i = 0; i < seen.length; i++) {
      for (let j = i + 1; j < seen.length; j++) {
        if (seen[i]!.pad && seen[j]!.pad) continue;
        const a = seen[i]!.r;
        const b = seen[j]!.r;
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > 1 && y > 1) over.push(`${seen[i]!.name} over ${seen[j]!.name} by ${Math.round(x)}x${Math.round(y)} at ${innerWidth}x${innerHeight}`);
      }
    }
    return over;
  });
}

/** A two-second notice at the top, as the HUD shows one for a new quest (the same element in the same place). */
const showNotice = (page: Page) =>
  page.evaluate(() => {
    const el = Object.assign(document.createElement('div'), { className: 'notice', textContent: 'New quest: Welcome to Owl Park' });
    el.dataset['testNotice'] = '';
    document.querySelector('[data-notices]')?.append(el);
  });
const dropNotice = (page: Page) => page.evaluate(() => document.querySelector('[data-test-notice]')?.remove());

/**
 * Nothing lies over anything. Asked until it holds: a chip sliding in is a few px from its place for
 * a quarter of a second, and the top area is laid out again a frame after a piece of it changes.
 */
const nothingOver = (page: Page, where: string) => expect.poll(() => lyingOver(page), { message: where, timeout: 4_000 }).toEqual([]);

/** At each size: nothing lies over anything, with a notice up and without. The screen is left at the first size. */
async function clearAt(page: Page, sizes: Size[], where: string): Promise<void> {
  for (const size of sizes) {
    await page.setViewportSize(size);
    await frames(page, 2);
    await nothingOver(page, `${where}, ${size.width}x${size.height}`);
    await showNotice(page);
    await nothingOver(page, `${where}, a notice up, ${size.width}x${size.height}`);
    await dropNotice(page);
  }
  await page.setViewportSize(sizes[0]!);
  await frames(page, 2);
}

const inRoom = (page: Page, id: RegExp) => expect.poll(async () => (await state(page)).room, { timeout: 40_000 }).toMatch(id);

/**
 * A new owl on its own device, from the home screen out of its nest, along the street and through the
 * turnstiles as a guest into the Great Hollow, looked at (`look`) at every stop on the way.
 */
async function guestWalksIn(browser: Browser, options: BrowserContextOptions, look: (page: Page, where: string) => Promise<void>): Promise<Page> {
  const context = await browser.newContext(options);
  await context.addInitScript((owl) => localStorage.setItem('owl-park:look', JSON.stringify(owl)), LOOK);
  const page = await context.newPage();
  await page.goto('/?transport=edge');
  const play = page.locator('[data-home-btn="play"]');
  await expect(play).toBeVisible({ timeout: 30_000 });
  // The home screen asks for the ribbon when it comes up.
  await expect(page.locator('[data-ribbon]')).toBeVisible({ timeout: 15_000 });
  await look(page, 'on the home screen');
  await play.click();
  await inRoom(page, /^nest-/);
  await page.waitForFunction(() => document.querySelector('[data-dot]')?.getAttribute('data-status') === 'online', null, { timeout: 20_000 });
  await look(page, 'in the nest');
  await walkToDoor(page, 'to-street');
  await inRoom(page, /^homes$/);
  await look(page, 'on the nests’ street');
  await walkToDoor(page, 'to-lobby');
  await inRoom(page, /^lobby$/);
  await look(page, 'in the Commons');
  await walkToDoor(page, 'gate');
  await enterAsGuest(page);
  await inRoom(page, /^m3-hall$/);
  await expect.poll(async () => (await state(page)).spectator, { timeout: 15_000 }).toBe(true);
  // The opening look over, the camera in on the owl.
  await expect.poll(async () => (await page.evaluate(() => window.owlPark.camera()!)).viewW, { timeout: 20_000 }).toBeLessThan(3000);
  await look(page, 'in the Great Hollow');
  return page;
}

test.describe('one safe area along the top of the screen (OP-369)', () => {
  test.beforeEach(async ({ request }) => {
    const closedAt = await gate(request, 'ticket');
    await capacity(request, { ribbon: { on: true, words: RIBBON }, realms: { tree: 100 } });
    // Passes are dated to the second: one made in the second the gate closed would still be let in.
    if (closedAt !== null) await expect.poll(() => Date.now(), { intervals: [50] }).toBeGreaterThanOrEqual(Math.floor(closedAt / 1000) * 1000 + 1000);
  });
  // As deployed again, so the other suites find the park as before: the gate open, no ribbon, the tree dark.
  test.afterEach(async ({ request }) => {
    await gate(request, 'deployed');
    await capacity(request, { ribbon: { on: false, words: null }, realms: { tree: 0 } });
  });

  test('on a computer a guest’s badge stands under the ribbon and a course’s objective strip under whatever it would lie over, from the home screen into a first course', async ({ browser }) => {
    test.slow(); // a walk from the home screen to a course through the room server, measured at three sizes at every stop
    const sizes = [
      { width: 1363, height: 936 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
    ];
    const page = await guestWalksIn(browser, { viewport: sizes[0]! }, (p, where) => clearAt(p, sizes, where));
    const ribbon = page.locator('[data-ribbon]');
    const badge = page.locator('#hud .spectator');
    await expect(ribbon).toBeVisible();
    await expect(badge).toBeVisible();
    // The badge under the ribbon, each readable whole.
    const r = (await ribbon.boundingBox())!;
    const b = (await badge.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(r.y + r.height);

    // Into the neon course: its objective strip joins them, under the ribbon it would lie over at this width.
    await walkToDoor(page, 'course-market');
    await inRoom(page, /^circuit-1$/);
    const strip = page.locator('#objective-strip');
    await expect(strip).toBeVisible();
    await clearAt(page, sizes, 'in the course');
    const s = (await strip.boundingBox())!;
    const now = (await ribbon.boundingBox())!;
    expect(s.x, 'at this width the strip reaches over the ribbon').toBeLessThan(now.x + now.width);
    expect(s.y).toBeGreaterThanOrEqual(now.y + now.height);
    await page.context().close();
  });

  test('on a phone the badge waits while the ribbon shows and comes back when it is hidden, and nothing lies over anything either way', async ({ browser }) => {
    test.slow(); // the same walk on a phone, upright and on its side
    const upright = { width: 390, height: 844 };
    const sideways = { width: 844, height: 390 };
    const page = await guestWalksIn(browser, { ...devices['Pixel 7'], viewport: upright }, (p, where) => clearAt(p, [upright, sideways], where));
    const ribbon = page.locator('[data-ribbon]');
    const badge = page.locator('#hud .spectator');
    await expect(ribbon).toBeVisible();
    await expect(badge).toBeHidden();

    // A course asks for the phone on its side: there the strip stands under the ribbon.
    await page.setViewportSize(sideways);
    await walkToDoor(page, 'course-market');
    await inRoom(page, /^circuit-1$/);
    await expect(page.locator('#objective-strip')).toBeVisible();
    await clearAt(page, [sideways], 'in the course');

    // The ribbon hidden by its own button: the badge is back, and still nothing lies over anything.
    await ribbon.locator('button').tap();
    await expect(ribbon).toBeHidden();
    await expect(badge).toBeVisible();
    await clearAt(page, [sideways], 'in the course, the ribbon hidden');
    await page.context().close();
  });
});
