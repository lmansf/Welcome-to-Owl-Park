import type { Page } from '@playwright/test';
import { ESCAPE_DOOR } from '../../../packages/shared/src/escape';
import { GROVE_PLAZA, MARKET_PLAZA } from '../../../packages/shared/rooms/index';
import { expect, test } from './fixtures';
import { openPark, settleCamera, state, toScreen, walkAndStop } from './helpers';

/**
 * A computer's window narrower than it is tall (OP-496): Menu, Emotes and Say make a row right across
 * the foot of the screen, and an action button joining it (standing at a doorway or a leaf pile) wraps
 * it onto a second line. Before, the camera measured the row once, as the room came in, and let the
 * room's front edge lie under it until the owl walked right down: in the clearing the sealed hollow's
 * doorway, the owl standing at it and its "Enter the sealed hollow" prompt, and on the neon street its
 * leaf pile, lay under the buttons. Now the room's front edge stays on the row's top, whatever the row's height.
 */

type Box = { left: number; top: number; right: number; bottom: number };

/** A plaza's depth: its floor's front and the strip below it (plaza.test.ts holds the rooms to it). */
const DEPTH = { grove: GROVE_PLAZA.front + 15, market: MARKET_PLAZA.front + 15 };

/** The bottom row's box on the screen (CSS px): Menu, Emotes, Say and the action buttons beside them. */
async function rowBox(page: Page): Promise<Box | null> {
  return page.evaluate(() => {
    const rs = [...document.querySelectorAll('#hud [data-menu-btn], #hud [data-emotes-btn], #hud [data-say-btn], #hud [data-actions] > button')]
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0 && r.top + r.height / 2 >= innerHeight / 2);
    if (rs.length === 0) return null;
    return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
  });
}

/** A box in the room (room px) as it is on the screen now (CSS px). */
async function onScreen(page: Page, b: Box): Promise<Box> {
  const [a, z] = [await toScreen(page, b.left, b.top), await toScreen(page, b.right, b.bottom)];
  return { left: a.x, top: a.y, right: z.x, bottom: z.y };
}

/** Each of these things (room boxes) that lies under the bottom row now, and the room's front edge if it is below the row's top. */
async function underRow(page: Page, things: Record<string, Box>, depth: number): Promise<string[]> {
  const row = await rowBox(page);
  if (!row) return ['no row of buttons along the foot of the screen'];
  const under: string[] = [];
  for (const [name, b] of Object.entries(things)) {
    const s = await onScreen(page, b);
    if (s.left < row.right - 1 && s.right > row.left + 1 && s.bottom > row.top + 1) under.push(`${name} reaches ${Math.round(s.bottom)} px, the row starts at ${Math.round(row.top)} px`);
  }
  const front = await toScreen(page, 0, depth);
  if (front.y > row.top + 1) under.push(`the room's front edge at ${Math.round(front.y)} px, the row starts at ${Math.round(row.top)} px`);
  return under;
}

/** The owl's own box (room px): its feet at `pos`, about an owl's height above them. */
const owlBox = (pos: { x: number; y: number }): Box => ({ left: pos.x - 40, top: pos.y - 100, right: pos.x + 40, bottom: pos.y });

test.describe('a narrow window: the room’s front edge above Menu, Emotes and Say (OP-496)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
  });

  test('in the clearing, the sealed hollow’s doorway, the owl at it and its prompt are clear of the row', async ({ page }) => {
    await openPark(page, { collector: 'e2e-row-door', tz: 'UTC', room: ESCAPE_DOOR.room });
    await walkAndStop(page, ESCAPE_DOOR.at.x, ESCAPE_DOOR.at.y);
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000, intervals: [50] }).toContain('escape-door');
    await expect.poll(async () => (await state(page)).promptShown, { timeout: 10_000 }).toBe('E: Enter the sealed hollow');
    await settleCamera(page);
    const door = { left: ESCAPE_DOOR.rect.x, top: ESCAPE_DOOR.rect.y, right: ESCAPE_DOOR.rect.x + ESCAPE_DOOR.rect.w, bottom: ESCAPE_DOOR.rect.y + ESCAPE_DOOR.rect.h };
    await expect
      .poll(
        async () => {
          const s = await state(page);
          const things: Record<string, Box> = { 'the doorway': door, 'the owl': owlBox(s.pos) };
          if (s.promptBox) things['its prompt'] = s.promptBox;
          return underRow(page, things, DEPTH.grove);
        },
        { timeout: 5_000 },
      )
      .toEqual([]);
    // The prompt was there to be checked.
    expect((await state(page)).promptBox).not.toBeNull();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-row-door-360.png` });
  });

  test('on the neon street, the leaf pile beside the owl and the owl itself are clear of the row', async ({ page }) => {
    await openPark(page, { collector: 'e2e-row-pile', tz: 'UTC', room: 'market' });
    const pile = (await state(page)).objects.find((o) => o.id === 'market-leaves-middle');
    expect(pile, 'the neon street’s middle leaf pile').toBeDefined();
    // Stand beside the pile, in its reach, without flopping into it.
    const pos = await walkAndStop(page, pile!.x, pile!.y - 60);
    expect(Math.hypot(pos.x - pile!.x, pos.y - pile!.y)).toBeLessThan(90);
    await expect.poll(async () => (await state(page)).actions, { timeout: 10_000, intervals: [50] }).toContain('use:market-leaves-middle');
    await settleCamera(page);
    // The pile's drawn heap (LeafPile.ts): 62 px either side of its foot, 52 px tall.
    const heap = { left: pile!.x - 62, top: pile!.y - 52, right: pile!.x + 62, bottom: pile!.y + 4 };
    await expect
      .poll(
        async () => {
          const s = await state(page);
          const things: Record<string, Box> = { 'the leaf pile': heap, 'the owl': owlBox(s.pos) };
          if (s.promptBox) things['its prompt'] = s.promptBox;
          return underRow(page, things, DEPTH.market);
        },
        { timeout: 5_000 },
      )
      .toEqual([]);
    expect((await state(page)).objects.find((o) => o.id === 'market-leaves-middle')?.here).toBe(true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-row-pile-360.png` });
  });
});
