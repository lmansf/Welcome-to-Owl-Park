import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGround, openPark, settleCamera, state, toScreen, waitForArrival, walkToDoor } from './helpers';

/**
 * A touch never zooms the page (OP-104): a double tap zoomed the park on an iPhone, and nothing took
 * it back out. Chrome keeps a phone page at its size whatever these tests tap (the viewport tag says
 * so), so they also read the page as Safari does. There a touch can zoom the page wherever the
 * touch-action worked out for its element, from the page down, still allows it (auto, manipulation or
 * pinch-zoom), and the working out starts over in every box that scrolls (WebKit's
 * computeEffectiveTouchActions, in style/StyleAdjuster.cpp).
 */

/** The elements on screen that a touch could zoom the page from in Safari, by tag and class. */
async function zoomable(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found = new Set<string>();
    const scrolls = (s: CSSStyleDeclaration) => [s.overflowX, s.overflowY].some((o) => o === 'auto' || o === 'scroll');
    const visit = (el: Element, above: string[]) => {
      const s = getComputedStyle(el);
      if (s.display === 'none') return;
      let allowed = scrolls(s) ? ['auto'] : above;
      const own = s.touchAction.split(' ');
      if (!own.includes('auto')) {
        if (allowed.includes('none')) allowed = ['none'];
        else if (allowed.includes('auto') || allowed.includes('manipulation')) allowed = own;
        else if (!own.includes('manipulation')) {
          const shared = allowed.filter((a) => own.includes(a));
          allowed = shared.length > 0 ? shared : ['none'];
        }
      }
      const zooms = allowed.some((a) => a === 'auto' || a === 'manipulation' || a === 'pinch-zoom');
      const touchable = s.visibility !== 'hidden' && s.pointerEvents !== 'none' && el.getClientRects().length > 0;
      if (zooms && touchable && el !== document.documentElement) {
        const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
        found.add(el.tagName.toLowerCase() + cls);
      }
      for (const child of el.children) visit(child, allowed);
    };
    visit(document.documentElement, ['auto']);
    return [...found];
  });
}

const scale = (page: Page) => page.evaluate(() => window.visualViewport?.scale ?? 1);

/**
 * Taps at one point on the screen in quick succession, each finger lifted before the next comes down,
 * sent together so they land within a few milliseconds (Playwright's own taps are far enough apart
 * for the camera, following the owl, to move between them, so each would walk somewhere else).
 */
async function quickTaps(page: Page, x: number, y: number, n: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const sent: Array<Promise<unknown>> = [];
  for (let i = 0; i < n; i++) {
    sent.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }));
    sent.push(cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
  }
  await Promise.all(sent);
  await cdp.detach();
}

test.describe('a touch never zooms the page (OP-104)', () => {
  test('a double and a triple tap on open ground walk the owl there, and the page stays at its size', async ({ page }) => {
    await openPark(page);
    for (const [taps, side] of [[2, 1], [3, -1]] as const) {
      const at = (await state(page)).pos;
      const view = await settleCamera(page);
      // Beside the owl at its height or a little behind, clear of the pad and the stick (as in park.spec.ts).
      const step = side * Math.min(220, view.viewW * 0.3);
      const target = await openGround(page, [
        { x: at.x + step, y: at.y + 40 },
        { x: at.x + step, y: at.y },
        { x: at.x + step, y: at.y - 30 },
        { x: at.x - step, y: at.y + 40 },
        { x: at.x - step, y: at.y },
        { x: at.x - step, y: at.y - 30 },
        // On a narrow phone the floor beside the owl can all be the pad's, the stick's or an owl's to talk
        // to (its tap area reaches past it, OP-127): then nearer, a step behind.
        { x: at.x + step / 2, y: at.y - 30 },
        { x: at.x - step / 2, y: at.y - 30 },
        { x: at.x, y: at.y - 50 },
      ]);
      const p = await toScreen(page, target.x, target.y);
      await quickTaps(page, p.x, p.y, taps);
      await waitForArrival(page, target.x, target.y);
      expect(await scale(page), `${taps} taps`).toBe(1);
    }
    // Nothing on the park's screen, the pad and the stick included, leaves a zoom to Safari.
    expect(await zoomable(page)).toEqual([]);
  });

  test('the Menu and its tabs, Feedback, the wheels and Your owl scroll but never zoom, and take quick taps', async ({ page }) => {
    test.slow(); // the Menu's five tabs and four screens, each opened and closed by touch
    // The Menu on each of its tabs, Feedback from its Settings, Say and the emote wheel.
    await openPark(page);
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await page.locator('[data-menu-btn]').tap();
    await expect(menu).toBeVisible();
    for (const tab of ['quests', 'collection', 'nest', 'map', 'settings'] as const) {
      await menu.locator(`[data-tab="${tab}"]`).tap();
      await expect(menu.locator(`[data-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
      expect(await zoomable(page), `the Menu: ${tab}`).toEqual([]);
    }
    await menu.locator('[data-screen="feedback"]').tap();
    const feedback = page.getByRole('dialog', { name: 'Feedback' });
    await expect(feedback).toBeVisible();
    expect(await zoomable(page), 'Feedback').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(feedback).toBeHidden();
    await page.locator('[data-say-btn]').tap();
    const say = page.getByRole('dialog', { name: 'Say' });
    await expect(say).toBeVisible();
    expect(await zoomable(page), 'Say').toEqual([]);
    // Two groups tapped in quick succession: both taps land, and the second group is the one shown.
    await say.locator('[data-group="cheers"]').tap();
    await say.locator('[data-group="together"]').tap();
    await expect(say.locator('[data-group="together"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(say.locator('[data-group="cheers"]')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(say).toBeHidden();
    await page.locator('[data-emotes-btn]').tap();
    const wheel = page.getByRole('dialog', { name: 'Emotes' });
    await expect(wheel).toBeVisible();
    expect(await zoomable(page), 'the emote wheel').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(wheel).toBeHidden();

    // Your owl: its tabs and its pages both scroll.
    await page.evaluate(() => window.owlPark.openBuilder());
    const builder = page.getByRole('dialog', { name: 'Your owl' });
    await expect(builder).toBeVisible();
    expect(await zoomable(page), 'Your owl').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(builder).toBeHidden();
    expect(await scale(page)).toBe(1);
  });

  test('Decorate scrolls its pieces but never zooms, and three quick taps on Next spot are three spots', async ({ page }) => {
    await openPark(page, { room: 'homes', collector: 'e2e-zoom', tz: 'UTC' });
    await expect.poll(async () => (await state(page)).street?.[0]?.kind ?? null, { timeout: 20_000 }).toBe('own');
    await walkToDoor(page, 'nest-door-0');
    await expect.poll(async () => (await state(page)).nest?.mine ?? false, { timeout: 20_000 }).toBe(true);
    await page.locator('[data-action="decorate"]').tap();
    const sheet = page.locator('section.decorate');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-where]')).toHaveText(/^1 \/ 12/);
    expect(await zoomable(page), 'Decorate').toEqual([]);
    const next = sheet.getByRole('button', { name: 'Next spot' });
    for (let i = 0; i < 3; i++) await next.tap();
    await expect(sheet.locator('[data-where]')).toHaveText(/^4 \/ 12/);
    expect(await scale(page)).toBe(1);
  });
});
