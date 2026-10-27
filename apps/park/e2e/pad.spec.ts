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
  test('a phone has three places on the left: Interact nearer the middle, the Menu outside, Jump’s place below them; Emotes and Say above', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the pad is for touch screens');
    await openPark(page);
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const stick = await box('#hud .stick');
    const interact = await box('[data-pad-interact]');
    const menu = await box('[data-menu-btn]');
    const slot = await box('[data-pad-slot]');
    const emotes = await box('[data-emotes-btn]');
    const say = await box('[data-say-btn]');
    const width = page.viewportSize()!.width;
    // The stick keeps the bottom-right corner; the pad keeps to the left.
    expect(stick.x + stick.width).toBeGreaterThan(width - 40);
    for (const b of [interact, menu, slot, emotes, say]) expect(b.x + b.width).toBeLessThan(width / 2 + 20);
    // Three of a handheld's face buttons (Logan, 2026-10-27): the Menu and Interact either side, Jump's place below between them.
    const [i, m, j] = [interact, menu, slot].map(centre) as [ReturnType<typeof centre>, ReturnType<typeof centre>, ReturnType<typeof centre>];
    expect(Math.abs(m.y - i.y)).toBeLessThan(1);
    expect(m.x).toBeLessThan(i.x);
    expect(j.y).toBeGreaterThan(i.y);
    expect(Math.abs(j.x - (m.x + i.x) / 2)).toBeLessThan(1);
    // One size, and Jump's place 8 px from each.
    for (const b of [menu, slot]) expect(b.width).toBeCloseTo(interact.width, 0);
    for (const [a, b] of [[menu, slot], [slot, interact]] as const) expect(gap(a, b)).toBeCloseTo(8, 0);
    // Emotes and Say above, over the Menu and Interact.
    expect(centre(emotes).x).toBeLessThan(centre(say).x);
    expect(centre(emotes).y).toBeLessThan(m.y);
    expect(centre(say).y).toBeLessThan(i.y);
    // Thumb-sized and apart: each live button at least 44 px; round ones measured as circles, none over another or the stick.
    const live = [interact, menu, emotes, say];
    for (const b of live) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) expect(gap(live[a]!, live[b]!), `${a} and ${b}`).toBeGreaterThan(7.5);
    for (const b of [...live, slot]) expect(overlaps(b, stick)).toBe(false);
    // Going home and the Map are the Menu's: no Nest and no Map on the pad.
    await expect(page.locator('[data-pad-nest], [data-pad-map]')).toHaveCount(0);
    // No Jump while the hop is off: its place is drawn dim and takes no tap.
    await expect(page.locator('[data-pad-jump]')).toBeHidden();
    const empty = page.locator('[data-pad-slot]');
    await expect(empty).toBeVisible();
    expect(await empty.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    expect(Number(await empty.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(0.5);
    // Interact wears the '!' (a stroke and a dot), not a hand.
    await expect(page.locator('[data-pad-interact] svg path')).toHaveCount(1);
    await expect(page.locator('[data-pad-interact] svg circle')).toHaveCount(1);
    // The pad's Menu button is the only one, and it still opens the Menu.
    await expect(page.locator('[data-menu-btn]')).toHaveCount(1);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-pad.png` });
    await page.locator('[data-menu-btn]').tap();
    const dialog = page.getByRole('dialog', { name: 'Menu' });
    await expect(dialog).toBeVisible();
    await page.getByRole('button', { name: 'Close the menu' }).tap();
    await expect(dialog).toBeHidden();
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

  test('Go home, at the top of the Menu’s Nest tab, held, takes the owl home before its mirror; let go sooner it does nothing', async ({ page }) => {
    test.slow(); // two rooms drawn with software WebGL on CI runners
    await openPark(page, { collector: `e2e-go-home-${test.info().project.name}` });
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-tab="nest"]').click();
    const home = menu.locator('[data-screen="home"]');
    await expect(home).toHaveText('Go home');
    // Pressed and let go in one go in the page (a busy runner's round trips would otherwise stretch a
    // quick tap past the hold): filling while pressed, empty once let go.
    const tap = () =>
      home.evaluate((el) => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        const filling = el.classList.contains('holding');
        el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        return [filling, el.classList.contains('holding')];
      });
    // Let go before it is full: the owl stays where it is, and the Menu says to hold it.
    expect(await tap()).toEqual([true, false]);
    await expect(menu.getByText('Hold to go home.')).toBeVisible();
    await page.waitForTimeout(900);
    expect((await state(page)).room).toBe('hub');
    await expect(menu).toBeVisible();
    // Held until it is full: the Menu closes and the owl goes home, landing before its mirror.
    expect(await home.evaluate((el) => (el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), el.classList.contains('holding')))).toBe(true);
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^nest-/);
    await expect(menu).toBeHidden();
    const at = await state(page);
    expect(at.nest?.mine).toBe(true);
    expect(Math.hypot(at.pos.x - at.mirror!.x, at.pos.y - at.mirror!.y)).toBeLessThan(160);
    // Home already: the Nest tab offers no way home.
    await page.locator('[data-menu-btn]').click();
    await menu.locator('[data-tab="nest"]').click();
    await expect(home).toHaveCount(0);
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
