import type { CDPSession, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark, state } from './helpers';

/**
 * The phone's thumbstick always lets go (OP-242; Logan, 2026-11-05: "the joystick gets stuck, I think it
 * may be from double/triple tapping the screen when jumping"). Two thumbs at once, as a phone has them:
 * touches go in through the browser's own touch screen (CDP), so the pointers, their capture and the
 * touch events are the browser's, not the page's.
 */

type Point = { x: number; y: number };
type Touch = Point & { id: number };

const centreOf = async (page: Page, sel: string): Promise<Point> => {
  const b = (await page.locator(sel).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Where the HUD's stick points now (null while it rests). */
const pointing = (page: Page) =>
  page.evaluate(() => (window.owlPark.game.registry.get('hud') as { stickDirection(): { x: number; y: number } | null }).stickDirection());

/**
 * Fingers going down or moving (touchStart, touchMove: every finger on the screen), or lifting (touchEnd: only
 * the fingers that lift, as Chromium reads it; the others stay down).
 */
const touches = (cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Touch[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(({ x, y, id }) => ({ x, y, id })) });

/** The owl stands still: down on the floor, and where it was a moment ago. */
async function standsStill(page: Page): Promise<void> {
  await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
  await expect
    .poll(
      async () => {
        const a = (await state(page)).pos;
        await page.waitForTimeout(300);
        const b = (await state(page)).pos;
        return Math.hypot(a.x - b.x, a.y - b.y);
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(1);
}

test.describe('the thumbstick lets go (OP-242)', () => {
  test.skip(({ isMobile }) => !isMobile, 'the stick is for touch screens');

  test('held while the other thumb taps Jump three times fast, the stick lets go the moment its thumb lifts, and works again', async ({ page }) => {
    await openPark(page);
    const cdp = await page.context().newCDPSession(page);
    const stick = await centreOf(page, '#hud .stick');
    const jump = await centreOf(page, '[data-pad-jump]');
    const toward = (await state(page)).pos.x < 2400 ? 1 : -1; // toward the middle of the hub, where there is floor
    const thumb: Touch = { x: stick.x + toward * 40, y: stick.y, id: 0 };

    await touches(cdp, 'touchStart', [{ ...stick, id: 0 }]);
    await touches(cdp, 'touchMove', [thumb]);
    await expect.poll(() => pointing(page)).not.toBeNull();
    // Jump, flap, flap: three quick taps with the other thumb, the stick held all the while.
    for (let i = 0; i < 3; i++) {
      await touches(cdp, 'touchStart', [thumb, { ...jump, id: 1 }]);
      await page.waitForTimeout(40);
      await touches(cdp, 'touchEnd', [{ ...jump, id: 1 }]);
      await page.waitForTimeout(60);
    }
    // The other thumb's lifts never let the stick go.
    expect(await pointing(page)).not.toBeNull();
    await expect(page.locator('#hud .stick')).toHaveClass(/\bon\b/);
    // Its own thumb lifts: it rests, and the owl stops.
    await touches(cdp, 'touchEnd', [thumb]);
    await expect.poll(() => pointing(page)).toBeNull();
    await expect(page.locator('#hud .stick')).not.toHaveClass(/\bon\b/);
    await standsStill(page);
    // And it works again.
    await touches(cdp, 'touchStart', [{ ...stick, id: 2 }]);
    await touches(cdp, 'touchMove', [{ ...thumb, id: 2 }]);
    await expect.poll(() => pointing(page)).not.toBeNull();
    await touches(cdp, 'touchEnd', [{ ...thumb, id: 2 }]);
    await expect.poll(() => pointing(page)).toBeNull();
    await cdp.detach();
  });

  test('a lift that never reaches the stick does not keep it pushed: the touch screen’s word, a lift landing elsewhere, or a new thumb on it lets it go', async ({ page }) => {
    await openPark(page);
    const stick = page.locator('#hud .stick');
    const c = await centreOf(page, '#hud .stick');
    const down = (id: number, dx: number) =>
      stick.dispatchEvent('pointerdown', { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: c.x + dx, clientY: c.y, bubbles: true });

    // Pushed, and its lift lost (as Safari can drop one amid quick taps): the touch screen says no finger is down.
    await down(41, 40);
    await expect.poll(() => pointing(page)).not.toBeNull();
    await page.evaluate(() => window.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [] })));
    await expect.poll(() => pointing(page)).toBeNull();
    await expect(stick).not.toHaveClass(/\bon\b/);

    // Pushed, and its lift lands on another element (the stick never held on to its pointer).
    await down(43, 40);
    await expect.poll(() => pointing(page)).not.toBeNull();
    await page.locator('#hud').dispatchEvent('pointerup', { pointerId: 43, pointerType: 'touch', isPrimary: true, bubbles: true });
    await expect.poll(() => pointing(page)).toBeNull();

    // Pushed right and its lift lost; a new thumb on the stick takes over and pushes left.
    await down(44, 40);
    await expect.poll(async () => (await pointing(page))?.x ?? 0).toBeGreaterThan(0);
    await down(45, -40);
    await expect.poll(async () => (await pointing(page))?.x ?? 0).toBeLessThan(0);
    await stick.dispatchEvent('pointerup', { pointerId: 45, pointerType: 'touch', isPrimary: true, bubbles: true });
    await expect.poll(() => pointing(page)).toBeNull();
    // The lost one's late lift changes nothing now.
    await stick.dispatchEvent('pointerup', { pointerId: 44, pointerType: 'touch', isPrimary: true, bubbles: true });
    expect(await pointing(page)).toBeNull();
  });

  test('in the tree, three taps on the pad’s Jump make the triple jump: a jump and both flaps in one flight (OP-239)', async ({ page }) => {
    // Two flaps are the tree's (packages/shared flight.ts); the park has one. Phones play the tree on
    // their side (tree.spec.ts): held upright, a card asks to turn the phone over the pad.
    await page.setViewportSize({ width: 839, height: 412 });
    await openPark(page, { room: 'l1' });
    const before = (await state(page)).flown.n;
    // Thumb taps on the pad's Jump, each held a moment, the next one going down once the last one's rise
    // has slowed near its top. Read in the page as it steps, so a runner's few frames cannot miss a top:
    // the flaps left, each time they change in the air.
    const flaps = await page.evaluate(
      () =>
        new Promise<number[]>((resolve, reject) => {
          const btn = document.querySelector<HTMLElement>('[data-pad-jump]')!;
          const r = btn.getBoundingClientRect();
          const x = r.left + r.width / 2;
          const y = r.top + r.height / 2;
          let id = 60;
          const thumb = (type: string) => btn.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y }));
          const seen: number[] = [];
          let presses = 0;
          let downAt: number | null = null;
          const giveUp = setTimeout(() => {
            const under = document.elementFromPoint(x, y);
            reject(new Error(`after ${presses} taps the flaps went ${JSON.stringify(seen)}; the air ${JSON.stringify(window.owlPark.state()?.air)}; under the thumb ${under?.tagName}.${under?.className}`));
          }, 10_000);
          const step = () => {
            const a = window.owlPark.state()?.air;
            if (a && a.s !== 0 && presses > 0 && seen[seen.length - 1] !== a.f) seen.push(a.f);
            if (downAt !== null && performance.now() - downAt >= 120) {
              thumb('pointerup');
              downAt = null;
            }
            if (presses === 3 && seen.length === 3 && a?.s === 0) {
              clearTimeout(giveUp);
              return resolve(seen);
            }
            const ready = presses === 0 ? a?.s === 0 : seen.length === presses && a !== undefined && a.s !== 0 && a.vz <= 120;
            if (downAt === null && presses < 3 && ready) {
              id += 1;
              thumb('pointerdown');
              downAt = performance.now();
              presses += 1;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
    );
    // A jump (two flaps left), the first flap, the second: all one flight, and down again.
    expect(flaps).toEqual([2, 1, 0]);
    expect((await state(page)).flown.n - before).toBe(1);
  });
});
