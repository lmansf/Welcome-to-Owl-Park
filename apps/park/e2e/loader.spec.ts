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
    await page.goto('/?transport=local');
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
});
