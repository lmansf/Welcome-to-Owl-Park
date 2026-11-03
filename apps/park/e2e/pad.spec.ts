import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { mapCard, openPark, state } from './helpers';

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const centre = (b: Box) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
/** The gap between two round buttons (negative when they overlap). */
const gap = (a: Box, b: Box) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y) - a.width / 2 - b.width / 2;

/** An NPC owl as this page has it now. */
const npc = async (page: Page, id: string) => (await state(page)).npcs.find((n) => n.id === id)!;

test.describe('the pad (OP-082, OP-114)', () => {
  test('a phone is laid out like a controller: the stick bottom left, Jump the big button bottom right with Interact up and to its left, the Menu and Say small in the top corner (OP-242)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the pad is for touch screens');
    await openPark(page);
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const stick = await box('#hud .stick');
    const interact = await box('[data-pad-interact]');
    const menu = await box('[data-menu-btn]');
    const jump = await box('[data-pad-jump]');
    const say = await box('[data-say-btn]');
    // One button for Say and the emotes on a phone (OP-242).
    await expect(page.locator('[data-emotes-btn]')).toBeHidden();
    const { width, height } = page.viewportSize()!;
    // The stick keeps the bottom-left corner; the face buttons the bottom-right (Logan, 2026-11-03).
    expect(stick.x).toBeLessThan(40);
    expect(stick.y + stick.height).toBeGreaterThan(height - 60);
    expect(jump.x + jump.width).toBeGreaterThan(width - 40);
    expect(jump.y + jump.height).toBeGreaterThan(height - 60);
    // Jump is the big one; Interact sits up and to its left.
    expect(jump.width).toBeGreaterThan(interact.width + 8);
    const [i, j] = [interact, jump].map(centre) as [ReturnType<typeof centre>, ReturnType<typeof centre>];
    expect(i.x).toBeLessThan(j.x);
    expect(i.y).toBeLessThan(j.y);
    expect(interact.x).toBeGreaterThan(width / 2);
    // The Menu and Say are small and up in the top-right corner, off the thumbs.
    for (const b of [menu, say]) {
      expect(b.y).toBeLessThan(80);
      expect(b.x).toBeGreaterThan(width / 2);
      expect(b.width).toBeLessThan(48);
    }
    expect(menu.x).toBeGreaterThan(say.x);
    // Thumb-sized and apart: each button at least 44 px; round ones measured as circles, none over another or the stick.
    const live = [interact, menu, jump, say];
    for (const b of live) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) expect(gap(live[a]!, live[b]!), `${a} and ${b}`).toBeGreaterThan(6.5);
    for (const b of live) expect(overlaps(b, stick)).toBe(false);
    // The top buttons keep off the bar's brand and feathers.
    for (const sel of ['#hud .brand', '[data-feathers]']) {
      const el = page.locator(sel);
      if (await el.isVisible()) for (const b of [menu, say]) expect(overlaps(b, (await el.boundingBox())!), sel).toBe(false);
    }
    // Going home and the Map are the Menu's: no Nest and no Map on the pad, and no place kept empty.
    await expect(page.locator('[data-pad-nest], [data-pad-map], [data-pad-slot]')).toHaveCount(0);
    await expect(page.locator('[data-pad-jump]')).toHaveAttribute('aria-label', 'Jump');
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

  test("a phone's screen keeps what the thumbs need: the count, Feedback and the emotes are the Menu's and Say's, and the ribbon never sits on the guest's badge (OP-242)", async ({ page, isMobile }) => {
    test.skip(!isMobile, "the phone's screen");
    await openPark(page);
    const hud = page.locator('#hud');
    // In sight: the stick, Jump, the Menu, Say and the feathers. Out of it: the count, Emotes, the bug and Interact at rest.
    for (const sel of ['#hud .stick', '[data-pad-jump]', '[data-menu-btn]', '[data-say-btn]']) await expect(page.locator(sel), sel).toBeVisible();
    for (const sel of ['#hud .bar .pill', '[data-emotes-btn]', '[data-feedback-bug]']) await expect(page.locator(sel), sel).toBeHidden();
    expect(await page.locator('[data-pad-interact]').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-declutter-park.png` });

    // The Menu says how many owls are here, and Send feedback stands by Close, in its accent, on every tab.
    await page.locator('[data-menu-btn]').tap();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu.locator('[data-menu-sub]')).toHaveText(/owls? here/);
    const send = menu.locator('[data-menu-feedback]');
    await expect(send).toBeVisible();
    await expect(send).toHaveText('Send feedback');
    const head = (await menu.locator('.mhead').boundingBox())!;
    const sendBox = (await send.boundingBox())!;
    expect(sendBox.y).toBeGreaterThanOrEqual(head.y - 1);
    expect(sendBox.y + sendBox.height).toBeLessThanOrEqual(head.y + head.height + 1);
    expect(sendBox.x + sendBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    for (const tab of ['collection', 'map', 'settings'] as const) {
      await menu.locator(`[data-tab="${tab}"]`).tap();
      await expect(send).toBeVisible();
    }
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-declutter-menu.png` });
    await send.tap();
    const feedback = page.getByRole('dialog', { name: 'Feedback' });
    await expect(feedback).toBeVisible();
    await feedback.getByRole('button', { name: 'Back to the menu' }).tap();
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Close the menu' }).tap();
    await expect(menu).toBeHidden();

    // A guest with the keepers' ribbon up, wandering alone, as in Logan's screenshot of Nov 3: the ribbon
    // shows and the badge waits; hidden, the badge comes back under the bar; the bar keeps a small mark.
    await page.evaluate(() => {
      const reg = window.owlPark.game.registry;
      (reg.get('hud') as { setSpectator(on: boolean): void; setStatus(s: string, k: string): void; toast(m: string, ms?: number): void }).setSpectator(true);
      (reg.get('ribbon') as { set(w: string | null): void }).set('Welcome to the Owl Park Preview');
      const h = reg.get('hud') as { setStatus(s: string, k: string): void; toast(m: string, ms?: number): void };
      h.setStatus('offline', 'edge');
      h.toast('You are wandering alone for now: the park could not connect.', 4000);
    });
    const ribbon = page.locator('[data-ribbon]');
    const badge = page.locator('[data-spectator]');
    await expect(ribbon).toBeVisible();
    await expect(badge).toHaveClass(/show/);
    await expect(badge).toBeHidden();
    await expect(hud.locator('.bar .pill .alone')).toBeVisible();
    await expect(hud.locator('.bar .pill [data-count]')).toBeHidden();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-declutter-guest-ribbon.png` });
    await ribbon.getByRole('button', { name: 'Hide this note' }).tap();
    await expect(ribbon).toBeHidden();
    await expect(badge).toBeVisible();
    const bar = (await hud.locator('.bar').boundingBox())!;
    const b = (await badge.boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(bar.y + bar.height);
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-declutter-guest.png` });
  });

  test('Interact does what the owl stands at, as E does, and rests where there is nothing', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the pad is for touch screens');
    // The market, by its gift shop (the lobby's ticket booth, which this used, went with OP-180).
    await openPark(page, { room: 'market' });
    const interact = page.locator('[data-pad-interact]');
    // The market's spawn is by its first stall, so walk out to the open street first (between the robot
    // owl and the far stalls, clear of every stall, door and owl to talk to).
    await page.evaluate(() => window.owlPark.walkTo(1900, 860));
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    // Nothing to do here: it rests, out of sight (OP-242).
    await expect(interact).toHaveAttribute('aria-disabled', 'true');
    await expect(interact).toHaveClass(/idle/);
    expect(await interact.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    const shop = (await state(page)).doors.find((d) => d.id === 'shop')!;
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), { x: shop.x, y: shop.y });
    await expect(interact).toHaveAttribute('aria-disabled', 'false', { timeout: 15_000 });
    await expect(interact).toHaveAttribute('aria-label', 'Gift shop');
    // It wears what it does (OP-242), so the row's first button, which says the same, stays away; the
    // button stays clear of the stick.
    await expect(interact).toHaveText('Gift shop');
    await expect(interact).toHaveClass(/labelled/);
    await expect(page.locator('[data-action="shop"]')).toBeHidden();
    await expect(page.locator('[data-action="shop"] .bang svg')).toHaveCount(1);
    const pill = (await interact.boundingBox())!;
    const stick = (await page.locator('#hud .stick').boundingBox())!;
    expect(overlaps(pill, stick)).toBe(false);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-declutter-action.png` });
    // Tapped, it does what E does there: with no store's page on this transport, the shop says it opens soon
    // (storecard.spec.ts has the card before the store, on the room server).
    await interact.tap();
    await expect(page.getByText('The gift shop opens soon.')).toBeVisible();
  });

  test('travel home, on the Menu’s map, held, takes the owl home before its mirror; let go sooner it does nothing', async ({ page }) => {
    test.slow(); // two rooms drawn with software WebGL on CI runners
    await openPark(page, { collector: `e2e-go-home-${test.info().project.name}` });
    const menu = page.getByRole('dialog', { name: 'Menu' });
    const home = (await mapCard(page, 'nest')).locator('[data-travel="nest"]');
    await expect(home).toHaveText('Travel home');
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
    await expect(menu.getByText('Hold to travel.')).toBeVisible();
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
    // Home already: the map says so, and offers no travel home.
    const here = await mapCard(page, 'nest');
    await expect(here).toContainText('You are here.');
    await expect(here.locator('[data-travel]')).toHaveCount(0);
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
