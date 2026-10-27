import { expect, test, type Page } from '@playwright/test';
import { openPark, peakHeight, state } from './helpers';

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** The gap between two round buttons (negative when they overlap). */
const gap = (a: Box, b: Box) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y) - a.width / 2 - b.width / 2;

/** An NPC owl as this page has it now. */
const npc = async (page: Page, id: string) => (await state(page)).npcs.find((n) => n.id === id)!;

test.describe('the pad (OP-082, OP-114)', () => {
  test('a phone has a diamond on the left: Nest on top, Interact nearer the middle, the Menu below, the Map outside; Emotes and Say above', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the pad is for touch screens');
    await openPark(page);
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const stick = await box('#hud .stick');
    const nest = await box('[data-pad-nest]');
    const interact = await box('[data-pad-interact]');
    const menu = await box('[data-menu-btn]');
    const map = await box('[data-pad-map]');
    const emotes = await box('[data-emotes-btn]');
    const say = await box('[data-say-btn]');
    const width = page.viewportSize()!.width;
    // The stick keeps the bottom-right corner; the pad keeps to the left.
    expect(stick.x + stick.width).toBeGreaterThan(width - 40);
    for (const b of [nest, interact, menu, map, emotes, say]) expect(b.x + b.width).toBeLessThan(width / 2 + 20);
    // A diamond like a handheld's face buttons: Nest over the Menu, the Map and Interact either side.
    const [n, i, m, l] = [nest, interact, menu, map].map(centre) as [ReturnType<typeof centre>, ReturnType<typeof centre>, ReturnType<typeof centre>, ReturnType<typeof centre>];
    expect(Math.abs(n.x - m.x)).toBeLessThan(1);
    expect(Math.abs(l.y - i.y)).toBeLessThan(1);
    expect(n.y).toBeLessThan(i.y);
    expect(m.y).toBeGreaterThan(i.y);
    expect(i.x).toBeGreaterThan(n.x);
    expect(l.x).toBeLessThan(n.x);
    // One size, and each 8 px from the next round the diamond.
    for (const b of [interact, menu, map]) expect(b.width).toBeCloseTo(nest.width, 0);
    for (const [a, b] of [[nest, interact], [interact, menu], [menu, map], [map, nest]] as const) expect(gap(a, b)).toBeCloseTo(8, 0);
    // Emotes and Say in the notches above, on either side of Nest.
    expect(centre(emotes).x).toBeLessThan(n.x);
    expect(centre(say).x).toBeGreaterThan(n.x);
    expect(centre(emotes).y).toBeLessThan(i.y);
    expect(centre(say).y).toBeLessThan(i.y);
    // Thumb-sized and apart: each live button at least 44 px; round ones measured as circles, none over another or the stick.
    const live = [nest, interact, menu, map, emotes, say];
    for (const b of live) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) expect(gap(live[a]!, live[b]!), `${a} and ${b}`).toBeGreaterThan(7.5);
    for (const b of live) expect(overlaps(b, stick)).toBe(false);
    // No Jump while the hop is off: the Map has its place.
    await expect(page.locator('[data-pad-jump]')).toBeHidden();
    // Interact wears the '!' (a stroke and a dot), not a hand.
    await expect(page.locator('[data-pad-interact] svg path')).toHaveCount(1);
    await expect(page.locator('[data-pad-interact] svg circle')).toHaveCount(1);
    // The pad's Menu button is the only one, and it still opens the Menu; the Map opens it at its Map tab.
    await expect(page.locator('[data-menu-btn]')).toHaveCount(1);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-pad.png` });
    await page.locator('[data-menu-btn]').tap();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Close the menu' }).tap();
    await expect(dialog).toBeHidden();
    await page.locator('[data-pad-map]').tap();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-tab="map"]')).toHaveAttribute('aria-selected', 'true');
  });

  test('Interact does what the owl stands at, as E does, and rests where there is nothing', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the pad is for touch screens');
    await page.goto('/?transport=local&home=0');
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    const interact = page.locator('[data-pad-interact]');
    // Nothing to do yet: it rests, dimmed.
    await expect(interact).toHaveAttribute('aria-disabled', 'true');
    await expect(interact).toHaveClass(/idle/);
    const booth = (await state(page)).doors.find((d) => d.id === 'booth')!;
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: booth.x, y: booth.y });
    await expect(interact).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 });
    await expect(interact).toHaveAttribute('aria-label', 'Interact: Ticket booth');
    // The first action, which Interact and E do, wears the same '!'.
    await expect(page.locator('[data-action="booth"] .bang svg')).toBeVisible();
    await interact.tap();
    await expect(page.locator('[data-booth="say"]')).toContainText('coming soon');
  });

  test('nothing hops while the hop is off: no Jump on the pad, and the space bar does nothing', async ({ page }) => {
    await openPark(page);
    await expect(page.locator('[data-pad-jump]')).toBeHidden();
    const before = (await state(page)).pos;
    const peak = peakHeight(page, 'own', 1_500);
    await page.keyboard.press('Space');
    expect(await peak).toBe(0);
    expect(await page.evaluate(() => window.owlPark.jump())).toBe(false);
    expect((await state(page)).pos).toEqual(before);
  });

  test('Nest, held, takes the owl home before its mirror; let go sooner it does nothing, and at home it rests', async ({ page, isMobile }) => {
    test.slow(); // two rooms drawn with software WebGL on CI runners
    test.skip(!isMobile, 'the pad is for touch screens');
    await openPark(page, { collector: `e2e-nest-pad-${test.info().project.name}` });
    const nest = page.locator('[data-pad-nest]');
    await expect(nest).toHaveAttribute('aria-disabled', 'false');
    // The thumb's press and its letting go, each in the page at once (a slow runner's frames would
    // otherwise stretch a quick tap past the hold); the answer is whether the ring is filling.
    const press = (type: 'pointerdown' | 'pointerup') => nest.evaluate((el, t) => (el.dispatchEvent(new PointerEvent(t, { bubbles: true })), el.classList.contains('holding')), type);
    // Let go before the ring is full: the owl stays where it is.
    expect(await press('pointerdown')).toBe(true);
    expect(await press('pointerup')).toBe(false);
    await page.waitForTimeout(900);
    expect((await state(page)).room).toBe('hub');
    // Held until the ring is full: the owl goes home, landing before its mirror.
    expect(await press('pointerdown')).toBe(true);
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^nest-/);
    await press('pointerup');
    const home = await state(page);
    expect(home.nest?.mine).toBe(true);
    expect(Math.hypot(home.pos.x - home.mirror!.x, home.pos.y - home.mirror!.y)).toBeLessThan(160);
    // Home already: Nest rests, dimmed, and holding it does nothing.
    await expect(nest).toHaveAttribute('aria-disabled', 'true');
    expect(await press('pointerdown')).toBe(false);
    await press('pointerup');
  });

  test("a '!' shows over the one owl Interact would talk to, from as far as it reaches, and goes as the visitor walks away", async ({ page }) => {
    test.slow(); // walks in two rooms drawn with software WebGL on CI runners
    await openPark(page, { collector: `e2e-approach-${test.info().project.name}` });
    const bramble = await npc(page, 'bramble');
    expect(bramble.approach).toBe(false);
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x + 70, y + 40), bramble);
    await expect.poll(async () => (await npc(page, 'bramble')).approach, { timeout: 20_000 }).toBe(true);
    // Over one owl only, the one Interact (and E) would talk to now.
    const close = await state(page);
    expect(close.actions[0]).toBe('npc:bramble');
    expect(close.npcs.filter((n) => n.approach).map((n) => n.id)).toEqual(['bramble']);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-approach.png` });
    // Walked off: it goes, as Interact's talk does.
    await page.evaluate(() => window.owlPark.walkTo(2450, 820));
    await expect.poll(async () => (await npc(page, 'bramble')).approach, { timeout: 20_000 }).toBe(false);
    expect((await state(page)).actions).not.toContain('npc:bramble');
    // Beside Nova in the gift shop's spot, Interact opens the shop: no '!' over her. A step out of it, there is.
    await openPark(page, { room: 'market', collector: `e2e-approach-${test.info().project.name}` });
    await page.evaluate(() => window.owlPark.walkTo(1000, 740));
    await expect.poll(async () => (await state(page)).actions[0], { timeout: 20_000 }).toBe('shop');
    expect((await state(page)).actions).toContain('npc:nova');
    expect((await npc(page, 'nova')).approach).toBe(false);
    await page.evaluate(() => window.owlPark.walkTo(850, 760));
    await expect.poll(async () => (await npc(page, 'nova')).approach, { timeout: 20_000 }).toBe(true);
    expect((await state(page)).actions[0]).toBe('npc:nova');
  });
});
