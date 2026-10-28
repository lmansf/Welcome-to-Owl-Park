import { expect, test, type Page } from '@playwright/test';
import { openPark, state, walkToDoor } from './helpers';

/**
 * The load screen (OP-129): an owl on a branch that grows as the art comes. These hold the park's
 * art back (each picture a little later than the one before) so the screen stays up long enough to
 * watch: its progress is the bytes that have come, a fact comes after two seconds, the owl hoots at
 * a tap, and the screen goes once the home screen or the room is ready.
 */
const loadScreen = (page: Page) => page.evaluate(() => window.owlPark.loadScreen());
const loader = (page: Page) => page.locator('#loader');

/** From now on each picture of the park's art comes `stepMs` after the one asked for before it, the first after `firstMs`. */
async function slowArt(page: Page, firstMs: number, stepMs: number): Promise<() => Promise<void>> {
  let n = 0;
  const hold = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
    const wait = firstMs + stepMs * n++;
    await new Promise((r) => setTimeout(r, wait));
    await route.continue().catch(() => undefined);
  };
  await page.route('**/art/**', hold);
  return () => page.unroute('**/art/**', hold);
}

/** Watch the screen's progress while it is up, sampling every 50 ms, until it goes. */
function watchProgress(page: Page): Promise<number[]> {
  return page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const seen: number[] = [];
        const tick = setInterval(() => {
          const s = window.owlPark?.loadScreen?.();
          if (!s) return;
          if (s.shown) seen.push(s.progress);
          else if (seen.length) {
            clearInterval(tick);
            resolve(seen);
          }
        }, 50);
      }),
  );
}

test.describe('the load screen (OP-129)', () => {
  test('up from the first paint: the branch grows with the art, a fact after two seconds, a hoot at a tap, gone with the home screen', async ({ page }) => {
    await slowArt(page, 1_500, 250);
    // Looked at as the page comes, not once it has loaded: a dev server's first page (its modules not
    // bundled yet) can take longer to load than the art takes to come.
    await page.goto('/?transport=local', { waitUntil: 'commit' });
    // Up before the script has drawn anything, with the park's words.
    await expect(loader(page)).toBeVisible();
    await expect(page.locator('.lo-words')).toHaveText('Opening the park…');
    await page.waitForFunction(() => !!window.owlPark?.loadScreen);
    const progress = watchProgress(page);
    // Two seconds in, an owl fact.
    await expect.poll(async () => (await loadScreen(page)).fact, { timeout: 5_000 }).toMatch(/^[A-Z].*\.$/);
    // The owl hoots at a tap (a hop and a soft sound; the sound is the park's, on here).
    await page.locator('.lo-tap').click();
    expect((await loadScreen(page)).hoots).toBe(1);
    await expect(loader(page)).toHaveClass(/hoot/);
    // The home screen comes and the load screen goes.
    await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 30_000 });
    await expect(loader(page)).toBeHidden();
    expect((await loadScreen(page)).shown).toBe(false);
    // On the way the branch grew a piece at a time with the pictures, never shrinking, and was full at the end.
    const seen = await progress;
    expect(seen.some((p) => p > 0.05 && p < 0.95)).toBe(true);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
  });

  test('a room whose art takes a while shows it on the screen, which goes once the owl can move; calm motion keeps the owl still', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openPark(page);
    await expect(loader(page)).toBeHidden();
    // Into the grove, its art held back: the screen comes up for it, with the room's word.
    const fast = await slowArt(page, 800, 300);
    await walkToDoor(page, 'to-grove');
    await expect(loader(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.lo-words')).toHaveText('Opening…');
    // Calm motion (from the device's reduced motion): the owl hops at no tap and the leaves do not spring.
    await expect(loader(page)).toHaveClass(/calm/);
    await page.locator('.lo-tap').click();
    await expect(loader(page)).not.toHaveClass(/hoot/);
    expect((await loadScreen(page)).hoots).toBe(1);
    await expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toBe('grove');
    await expect(loader(page)).toBeHidden();
    await fast();
  });

  test('the page itself asks for the owl’s art, each piece once, and the park takes those downloads instead of asking again', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (/^\/art\/owl-(body|belly|accent|face|blink|wing-body|wing-accent)(%402x)?\.(png|webp)$/.test(u.pathname)) asked.push(`${u.pathname}${u.search}`);
    });
    await openPark(page);
    // The page's own downloads (index.html, before the game's script): every one taken by the art loader.
    expect(await page.evaluate(() => Object.keys((window as { __owlParkArt?: object }).__owlParkArt ?? { none: true }))).toEqual([]);
    // Seven pieces, each asked for once, at the screen's density.
    expect(asked).toHaveLength(7);
    expect(new Set(asked).size).toBe(7);
    const dense = await page.evaluate(() => window.devicePixelRatio >= 1.375);
    for (const a of asked) expect(a.includes('%402x')).toBe(dense);
  });

  test('walking to a doorway fetches the next room’s art on the way, before the owl is through', async ({ page }) => {
    await openPark(page);
    const fetched: string[] = [];
    page.on('request', (r) => {
      if (/\/art\/grove[^/]*\.(webp|png)/.test(r.url())) fetched.push(r.url());
    });
    // Across the hall to the grove's arch: a couple of seconds' walk.
    await walkToDoor(page, 'to-grove');
    await expect.poll(() => fetched.length, { timeout: 5_000 }).toBeGreaterThan(0);
    // Asked for while the owl was still on its way, in the hub.
    expect(await page.evaluate(() => window.owlPark.state()?.room ?? null)).toBe('hub');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('grove');
  });

  test('on a dense screen a room opens on its 1x painting while the 2x is on its way, then sharpens in place once the owl stands still', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'only a dense screen asks for the 2x paintings');
    // The stained-glass realm's 2x paintings held back until let go.
    let letGo!: () => void;
    const held = new Promise<void>((r) => (letGo = r));
    const hold = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
      await held;
      await route.continue().catch(() => undefined);
    };
    await page.route(/\/art\/glass(-east)?%402x\.webp/, hold);
    await openPark(page, { room: 'glass' });
    // The owl can move already, on the 1x paintings.
    const s = await state(page);
    expect(s.connected).toBe(true);
    expect(s.soft.sort()).toEqual(['glass', 'glass-east']);
    expect(await page.evaluate(() => window.owlPark.textureSize('glass'))).toEqual({ w: 1600, h: 900 });
    // The 2x copies come while the owl walks: the swap holds up a frame, so it waits.
    await page.keyboard.down('ArrowRight');
    const came = Promise.all([page.waitForResponse(/\/art\/glass%402x\.webp/), page.waitForResponse(/\/art\/glass-east%402x\.webp/)]);
    letGo();
    await came;
    await page.waitForTimeout(1000);
    expect((await state(page)).soft.sort()).toEqual(['glass', 'glass-east']);
    // It stands still: each painting swaps in place, the same size in the room.
    await page.keyboard.up('ArrowRight');
    await expect.poll(async () => (await state(page)).soft, { timeout: 15_000 }).toEqual([]);
    expect(await page.evaluate(() => window.owlPark.textureSize('glass'))).toEqual({ w: 3200, h: 1800 });
    expect(await page.evaluate(() => window.owlPark.textureSize('glass-east'))).toEqual({ w: 3200, h: 1800 });
    await page.unroute(/\/art\/glass(-east)?%402x\.webp/, hold);
  });

  test('a tapped walk past one realm’s arch on its way to another fetches only the room it goes into', async ({ page }) => {
    await openPark(page);
    const fetched: string[] = [];
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (/^\/art\/(glass|market)/.test(path)) fetched.push(path);
    });
    // From the hub's middle to the market's arch, right by the stained-glass realm's.
    await walkToDoor(page, 'to-market');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('market');
    expect(fetched.some((p) => p.startsWith('/art/market'))).toBe(true);
    expect(fetched.filter((p) => p.startsWith('/art/glass'))).toEqual([]);
  });
});
