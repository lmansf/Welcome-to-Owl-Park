import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { E2E_ADMIN_KEY, openPark, settleCamera, state, walkAndStop, type ParkState } from './helpers';

/**
 * The ledge painter (OP-156): a keeper paints the tree's ledges over the running room, places the
 * level's named spots, and saves the draft. Against the room server (the edge project): the keepers' key buys the tab a keeper's token
 * (`?keeper=1`), which lets the owl into the dark tree and lets the painter save. The tree's four
 * screens are drawn with software WebGL on a CI runner, a frame a few hundred ms, and each look at the
 * page waits on one: so these look as seldom as they can, and run as slow tests.
 */

const GROUND = 770;
/** Where the lobby's screen starts: the level's second screen. */
const LOBBY = 1600;

type Paint = NonNullable<ParkState['paint']>;
type Pt = { x: number; y: number };

async function paint(page: Page): Promise<Paint> {
  const p = (await state(page)).paint;
  if (!p) throw new Error('the painter is not up');
  return p;
}

/** A keeper's page in the tree's lobby with the painter up and the saved draft (if any) read. */
async function painter(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('dialog', (d) => void d.accept(E2E_ADMIN_KEY));
  await openPark(page, { transport: 'edge', room: 'l1', keeper: '1', paint: '1' });
  await expect(page.locator('[data-paint-panel="l1"]')).toBeVisible();
  await expect.poll(async () => (await state(page)).paint?.state, { timeout: 10_000 }).not.toBe('loading');
  return page;
}

/** Room points' places on the screen (CSS px) by the live camera, and whether the park's canvas is what is there (no HUD, no panel): one look. */
function onScreen(page: Page, points: Pt[]): Promise<Array<Pt & { open: boolean }>> {
  return page.evaluate((pts) => {
    const cam = window.owlPark.camera()!;
    return pts.map((p) => {
      const x = ((p.x - cam.viewX) * cam.zoom) / cam.dpr;
      const y = ((p.y - cam.viewY) * cam.zoom) / cam.dpr;
      return { x, y, open: document.elementFromPoint(x, y)?.tagName === 'CANVAS' };
    });
  }, points);
}

/** A drag through the real pointer, from room point to room point, both on open canvas. */
async function dragRoom(page: Page, a: Pt, b: Pt): Promise<void> {
  const [p, q] = await onScreen(page, [a, b]);
  expect([p!.open, q!.open], 'both ends on open canvas').toEqual([true, true]);
  await page.mouse.move(p!.x, p!.y);
  await page.mouse.down();
  await page.mouse.move(q!.x, q!.y, { steps: 2 });
  await page.mouse.up();
}

/** How far point p is from the segment a to b (room px). */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Whether p is inside the polygon (even-odd). */
function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Whether a line of the draft, or a front (inside it or near its outline), comes within `px` of the span x0..x1 at room y. */
const nearAny = (d: Paint['draft'], x0: number, x1: number, y: number, px: number) => {
  const n = Math.max(2, Math.ceil((x1 - x0) / 5) + 1);
  const along: Pt[] = Array.from({ length: n }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / (n - 1), y }));
  return (
    [...d.ledges, ...d.hazards].some((l) => Math.abs(GROUND - l.top - y) < px && l.x1 > x0 - px && l.x0 < x1 + px) ||
    d.walls.some((w) => w.x > x0 - px && w.x < x1 + px && w.y1 > y - px && w.y0 < y + px) ||
    d.fronts.some((f) => along.some((p) => inside(p, f.points) || f.points.some((a, i) => segmentDistance(p, a, f.points[(i + 1) % f.points.length]!) < px)))
  );
};

test.describe('the ledge painter (OP-156)', () => {
  test('a keeper sees the tree’s ledges, draws one, stands on it at once and saves the draft', async ({ browser, request }) => {
    test.slow(); // the tree drawn with software WebGL, each look at the page a frame or more: 39 s here
    const page = await painter(browser);
    // Every ledge of the room's own (or of a draft saved before) is drawn, each with its height, and
    // every front of its own, the shapes the game draws over the owls (OP-173).
    const first = await paint(page);
    expect(first.own.length).toBeGreaterThan(0);
    expect(first.draft.ledges.map((l) => l.id)).toEqual(expect.arrayContaining(first.own));
    expect(first.drawn.ledges).toEqual(first.draft.ledges.map((l) => l.id));
    expect(first.labels).toBe(first.draft.ledges.length);
    expect(first.ownFronts.length).toBeGreaterThan(0);
    expect(first.draft.fronts.map((f) => f.id)).toEqual(expect.arrayContaining(first.ownFronts));
    expect(first.drawn.fronts).toEqual(first.draft.fronts.map((f) => f.id));
    // A ledge beside the lobby's stair, a jump over the floor, drawn with the mouse where nothing is drawn yet.
    const span = { x0: LOBBY + 770, x1: LOBBY + 880 };
    const top = [100, 70, 130].find((t) => !nearAny(first.draft, span.x0, span.x1, GROUND - t, 30));
    expect(top, 'a clear place for a ledge in the lobby').toBeDefined();
    await walkAndStop(page, LOBBY + 820, GROUND);
    await settleCamera(page);
    await page.locator('[data-tool="ledge"]').click();
    await dragRoom(page, { x: span.x0, y: GROUND - top! }, { x: span.x1, y: GROUND - top! });
    const after = await paint(page);
    const drawn = after.selected as { kind: string; id: string; x0: number; x1: number; top: number } | null;
    expect(drawn).toMatchObject({ kind: 'ledge', id: expect.stringMatching(/^ledge-\d+$/) });
    expect(Math.abs(drawn!.x0 - span.x0)).toBeLessThanOrEqual(2);
    expect(Math.abs(drawn!.x1 - span.x1)).toBeLessThanOrEqual(2);
    expect(Math.abs(drawn!.top - top!)).toBeLessThanOrEqual(2);
    expect(after.draft.ledges).toHaveLength(first.draft.ledges.length + 1);
    expect([after.state, after.trying]).toEqual(['unsaved', true]);
    await expect(page.locator('[data-paint-readout]')).toHaveText(`${drawn!.id}  x0 ${drawn!.x0}  x1 ${drawn!.x1}  top ${drawn!.top}`);
    // The owl walked there with the painter up, and with Try on it stands on the new ledge at once.
    await page.evaluate(() => window.owlPark.jump(400));
    await expect.poll(async () => { const s = await state(page); return [s.air.s, Math.round(s.air.z)]; }, { timeout: 8_000, intervals: [50] }).toEqual([0, drawn!.top]);
    // Saved: the panel says so, and the room server gives back the draft as the painter has it.
    await page.locator('[data-paint="save"]').click();
    await expect(page.locator('[data-paint-status]')).toHaveAttribute('data-state', 'saved');
    await expect(page.locator('[data-paint-status]')).toContainText('Saved');
    const back = await request.get('/api/masks/l1');
    expect(back.status()).toBe(200);
    expect(await back.json()).toEqual({ room: 'l1', ...after.draft, savedAt: expect.any(Number) });
    await page.context().close();
  });

  test('Suggest reads the screen in view and a tap takes one; a front point by point; Delete and Undo', async ({ browser }) => {
    test.slow(); // the tree drawn with software WebGL, each look at the page a frame or more: 48 s here
    const page = await painter(browser);
    await settleCamera(page);
    const start = await paint(page);
    // The lobby's playfield suggests ledges: dashed, none of them a ledge the draft has already.
    await page.locator('[data-paint="suggest"]').click();
    let seen = await state(page);
    await expect.poll(async () => (seen = await state(page)).paint?.suggestions.length).toBeGreaterThan(0);
    const { suggestions, draft } = seen.paint!;
    // The first whose middle is on open canvas (not under the panel or the HUD), clear of the draft's lines.
    const mids = suggestions.map((s) => ({ x: (s.x0 + s.x1) / 2, y: GROUND - s.top }));
    const spots = await onScreen(page, mids);
    const i = mids.findIndex((m, n) => spots[n]!.open && !nearAny(draft, m.x - 1, m.x + 1, m.y, 30));
    expect(i, 'a suggestion on open canvas').toBeGreaterThanOrEqual(0);
    const pick = suggestions[i]!;
    await page.mouse.click(spots[i]!.x, spots[i]!.y);
    let taken = start;
    await expect.poll(async () => (taken = await paint(page)).draft.ledges.length).toBe(start.draft.ledges.length + 1);
    expect(taken.selected).toMatchObject({ kind: 'ledge', ...pick });
    expect(taken.suggestions).not.toContainEqual(pick);
    // A front: Escape lets the suggestions go, three taps and Enter close it, translucent over the playfield.
    await page.keyboard.press('Escape');
    await page.locator('[data-tool="front"]').click();
    const corner = { x: seen.view.x + 200, y: seen.view.y + 260 };
    const corners = await onScreen(page, [corner, { x: corner.x + 70, y: corner.y }, { x: corner.x + 35, y: corner.y + 90 }]);
    expect(corners.map((c) => c.open)).toEqual([true, true, true]);
    for (const c of corners) await page.mouse.click(c.x, c.y);
    await page.keyboard.press('Enter');
    let front = taken;
    await expect.poll(async () => (front = await paint(page)).draft.fronts.length).toBe(start.draft.fronts.length + 1);
    expect(front.selected).toMatchObject({ kind: 'front', id: expect.stringMatching(/^front-\d+$/) });
    expect(front.drawn.fronts).toContain(front.selected!.id);
    await expect(page.locator('[data-paint-readout]')).toHaveText(`${front.selected!.id}  3 points`);
    // Delete takes the front away; Undo (the button, then Ctrl+Z) brings it back and takes back the suggestion too.
    await page.locator('[data-paint="delete"]').click();
    await expect.poll(async () => (await paint(page)).draft.fronts.length).toBe(start.draft.fronts.length);
    await page.locator('[data-paint="undo"]').click();
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await paint(page)).draft).toEqual(start.draft);
    await page.context().close();
  });

  test('a keeper places one of the level’s named spots, drags it, takes the drag back and saves it (OP-156, part 3)', async ({ browser, request }) => {
    test.slow(); // the tree drawn with software WebGL, each look at the page a frame or more
    const page = await painter(browser);
    // The level's names west to east (OP-155's list), and every spot of the room's own or of a draft saved before drawn as a pin with its name.
    const first = await paint(page);
    expect(first.names).toEqual(['closed-west', 'stair-l2-l1', 'stair-l1-l0', 'booth-lobby', 'idol-market', 'guardian-market', 'game-market', 'to-market']);
    expect(first.draft.spots.map((s) => s.id)).toEqual(expect.arrayContaining(first.ownSpots));
    expect(first.drawn.spots).toEqual(first.draft.spots.map((s) => s.id));
    expect(first.pins).toBe(first.draft.spots.length);
    // The spot tool lists them; the lobby's booth is picked to place.
    await settleCamera(page);
    await page.locator('[data-tool="spot"]').click();
    const names = page.locator('[data-paint-names]');
    await expect(names).toBeVisible();
    await expect(names.locator('[data-spot]')).toHaveCount(first.names.length);
    const booth = names.locator('[data-spot="booth-lobby"]');
    await booth.click();
    await expect(booth).toHaveAttribute('aria-pressed', 'true');
    // A room server that kept an earlier run's draft has it placed already: picked with its name, and Delete takes it away first.
    if (first.draft.spots.some((s) => s.id === 'booth-lobby')) {
      await expect.poll(async () => (await paint(page)).selected?.id).toBe('booth-lobby');
      await page.locator('[data-paint="delete"]').click();
    }
    await expect(booth).toHaveAttribute('data-placed', 'false');
    await expect(page.locator('[data-paint-readout]')).toContainText('booth-lobby: tap where it stands');
    // A tap at the foot of the booth's window places it there, picked, its name ticked.
    const candidates = [GROUND, GROUND - 40, GROUND - 80].map((y) => ({ x: LOBBY + 831, y }));
    const seen = await onScreen(page, candidates);
    const n = seen.findIndex((p) => p.open);
    expect(n, 'a place for the booth on open canvas').toBeGreaterThanOrEqual(0);
    await page.mouse.click(seen[n]!.x, seen[n]!.y);
    let placed = first;
    await expect.poll(async () => (placed = await paint(page)).draft.spots.some((s) => s.id === 'booth-lobby')).toBe(true);
    const spot = placed.draft.spots.find((s) => s.id === 'booth-lobby')!;
    expect(Math.abs(spot.x - candidates[n]!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(spot.y - candidates[n]!.y)).toBeLessThanOrEqual(2);
    expect(placed.selected).toMatchObject({ kind: 'spot', id: 'booth-lobby' });
    await expect.poll(async () => (await paint(page)).drawn.spots).toContain('booth-lobby');
    await expect(booth).toHaveAttribute('data-placed', 'true');
    await expect(page.locator('[data-paint-readout]')).toHaveText(`booth-lobby  x ${spot.x}  y ${spot.y}`);
    // Its pin dragged 40 px east moves it; Undo puts it back where it was placed.
    await dragRoom(page, spot, { x: spot.x + 40, y: spot.y });
    await expect.poll(async () => Math.abs(((await paint(page)).draft.spots.find((s) => s.id === 'booth-lobby')?.x ?? 0) - (spot.x + 40))).toBeLessThanOrEqual(2);
    await page.keyboard.press('Control+z');
    await expect.poll(async () => (await paint(page)).draft.spots.find((s) => s.id === 'booth-lobby')).toEqual(spot);
    // Saved: the room server gives the spot back where it was placed.
    await page.locator('[data-paint="save"]').click();
    await expect(page.locator('[data-paint-status]')).toHaveAttribute('data-state', 'saved');
    const saved = await paint(page);
    const back = await request.get('/api/masks/l1');
    expect(back.status()).toBe(200);
    const body = (await back.json()) as Paint['draft'];
    expect(body).toEqual({ room: 'l1', ...saved.draft, savedAt: expect.any(Number) });
    expect(body.spots).toContainEqual(spot);
    await page.context().close();
  });
});
