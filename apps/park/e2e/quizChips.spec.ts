import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { cameraView, openGround, openPark, state, toScreen } from './helpers';

/**
 * OP-435: in the Great Hollow the stage quiz's card opens at the top right, and a walk-there chip for a
 * doorway off screen to the right sat over its answer B; another sat on the answer plates. The owl gets to
 * the plates the way a player does (clicks on a computer, taps on a phone; no walk hook, FP-008), and on
 * each plate, with a question showing, no chip covers an answer row or a plate.
 */
const PLATES = { a: { x: 2462, y: 1720, w: 165, h: 100 }, b: { x: 2642, y: 1720, w: 165, h: 100 }, c: { x: 2822, y: 1720, w: 165, h: 100 } } as const;
type Box = { left: number; top: number; right: number; bottom: number };
const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

async function press(page: Page, isMobile: boolean, p: { x: number; y: number }): Promise<void> {
  const s = await toScreen(page, p.x, p.y);
  if (isMobile) await page.touchscreen.tap(s.x, s.y);
  else await page.mouse.click(s.x, s.y);
}

async function stood(page: Page): Promise<void> {
  await page.waitForTimeout(120);
  await expect.poll(async () => (await state(page)).walking, { timeout: 15_000, intervals: [50] }).toBe(false);
}

/** Whether a room point is on screen, with the room (not the HUD) under it. */
async function onCanvas(page: Page, p: { x: number; y: number }): Promise<boolean> {
  const s = await toScreen(page, p.x, p.y);
  const size = page.viewportSize()!;
  if (s.x < 24 || s.y < 90 || s.x > size.width - 24 || s.y > size.height - 160) return false;
  return page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.tagName === 'CANVAS', [s.x, s.y]);
}

/** Onto a plate by clicks or taps: on it when it shows, else on the farthest open floor toward it. */
async function walkOnto(page: Page, isMobile: boolean, z: keyof typeof PLATES): Promise<void> {
  const r = PLATES[z];
  const aim = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  for (let i = 0; i < 14; i++) {
    const at = (await state(page)).pos;
    if (Math.abs(at.x - aim.x) < r.w / 2 - 10 && Math.abs(at.y - aim.y) < r.h / 2 - 10) return;
    if (await onCanvas(page, aim)) {
      await press(page, isMobile, aim);
    } else {
      const way: Array<{ x: number; y: number }> = [];
      for (let k = 20; k >= 1; k--) way.push({ x: at.x + ((aim.x - at.x) * k) / 20, y: at.y + ((aim.y - at.y) * k) / 20 });
      const shown: Array<{ x: number; y: number }> = [];
      for (const p of way) if (await onCanvas(page, p)) shown.push(p);
      const to = await openGround(page, shown);
      await press(page, isMobile, to);
    }
    await stood(page);
  }
  throw new Error(`never got onto plate ${z}`);
}

/** No chip over an answer row of the card or over a plate. */
async function chipsClear(page: Page, label: string): Promise<void> {
  const cam = await cameraView(page);
  const plates: Box[] = [];
  for (const r of Object.values(PLATES)) {
    const a = await toScreen(page, r.x, r.y);
    const b = await toScreen(page, r.x + r.w, r.y + r.h);
    plates.push({ left: a.x, top: a.y, right: b.x, bottom: b.y });
  }
  expect(cam.zoom).toBeGreaterThan(0);
  const seen = await page.evaluate(() => {
    const box = (e: Element) => {
      const r = e.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    };
    return {
      rows: [...document.querySelectorAll('.play-card.quiz .ans')].map(box),
      chips: [...document.querySelectorAll('[data-hints] .hint')].map((e) => ({ id: (e as HTMLElement).dataset['hint'] ?? '', ...box(e) })),
    };
  });
  expect(seen.rows.length, `${label}: the card shows its three answers`).toBe(3);
  for (const c of seen.chips) {
    for (const [i, row] of seen.rows.entries()) expect(meets(c, row), `${label}: chip ${c.id} over answer ${'ABC'[i]}`).toBe(false);
    for (const [i, p] of plates.entries()) expect(meets(c, p), `${label}: chip ${c.id} over plate ${'ABC'[i]}`).toBe(false);
  }
}

test.describe('the stage quiz in the Great Hollow keeps its answers in sight (OP-435)', () => {
  test('on each plate, by clicks at 1440 and 1024 wide and by taps on a phone, no walk-there chip covers an answer or a plate', async ({ page, isMobile }) => {
    // A question every 90 seconds on the park clock: up to two waits for one, and the walk there.
    test.setTimeout(260_000);
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1440, height: 813 });
    await openPark(page, { room: 'm3-hall', newmap: '1', collector: 'e2e-quiz-chips', tz: 'UTC' });
    await walkOnto(page, isMobile, 'b');
    const card = page.locator('.play-card.quiz');
    await expect(card).toBeVisible();
    // A question showing, with time left to stand on all three plates.
    await expect
      .poll(async () => {
        const q = (await state(page)).play?.quiz;
        return (await card.getAttribute('data-phase')) === 'open' && !!q && q.revealAt - Date.now() > 12_000;
      }, { timeout: 190_000, intervals: [500] })
      .toBe(true);
    const sizes = isMobile ? ['phone'] : ['1440', '1024'];
    for (const size of sizes) {
      if (size === '1024') await page.setViewportSize({ width: 1024, height: 768 });
      for (const z of ['b', 'a', 'c'] as const) {
        await walkOnto(page, isMobile, z);
        await page.waitForTimeout(400); // the chips are laid a few times a second
        await chipsClear(page, `${size}, on ${z.toUpperCase()}`);
      }
      await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-quiz-chips-${size}.png` });
    }
  });
});
