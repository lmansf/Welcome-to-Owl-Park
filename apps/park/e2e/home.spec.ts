import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { dist, GATE_ASK, settleCamera, state, toScreen, travelTo } from './helpers';

/**
 * The home screen (OP-065), on this device (local mode): a first visit logs in (the owl is made and
 * the owl builder opens on it), a return visit is logged in at once, the home screen's Settings are
 * the park's, and the Menu's Home screen comes back to it. Play is the one way in, and it lands the
 * owl in its own nest, before its mirror, every time (OP-105). Play free now, a new owl's first way in,
 * lands it in the Treetop Commons beside the rising air in its moonbeam, for a first flight (OP-363).
 */
const home = (page: Page) => page.evaluate(() => window.owlPark.home());
const button = (page: Page, id: 'login' | 'guest' | 'play' | 'settings') => page.locator(`[data-home-btn="${id}"]`);
/** The home screen's buttons as shown, in order. */
const shownButtons = (page: Page) => page.locator('[data-home-btn]').evaluateAll((bs) => bs.filter((b) => !(b as HTMLElement).hidden).map((b) => b.textContent));
/** Where Play puts the owl: before its nest's mirror (NEST_ROOM's `mirror` spawn). */
const MIRROR_SPAWN = { x: 650, y: 720 };

async function openHome(page: Page): Promise<void> {
  await page.goto('/?transport=local');
  await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
}

/** A first visit: Make your owl, Skip the quiz (which owl are you, OP-076), and the builder opens on the owl; closing it leaves the owl beside Play. */
async function logIn(page: Page): Promise<void> {
  await button(page, 'login').click();
  await page.locator('[data-wo-skip]').click();
  const builder = page.getByRole('dialog', { name: 'Your owl' });
  await expect(builder).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(builder).toBeHidden();
  await expect(button(page, 'play')).toBeVisible();
}

/** In the owl's own nest, where Play puts it (OP-105). */
async function inOwnNest(page: Page): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^nest-/);
  await expect.poll(async () => (await state(page)).nest?.mine, { timeout: 10_000 }).toBe(true);
}

async function play(page: Page): Promise<void> {
  await button(page, 'play').click();
  await inOwnNest(page);
}

/**
 * In the Treetop Commons, beside its moonbeam, where Play free now lands a new owl (OP-363): outside the
 * moonbeam's warm air and a short walk from it, so the feather trail has room to lead in. Says where the
 * moonbeam is.
 */
async function besideTheMoonbeam(page: Page): Promise<{ x: number; y: number }> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('lobby');
  const s = await state(page);
  const beam = s.objects.find((o) => o.id === 'lobby-moonbeam');
  if (!beam) throw new Error('no moonbeam in the Treetop Commons');
  const far = dist(s.pos, beam);
  expect(far).toBeGreaterThan(160);
  expect(far).toBeLessThan(450);
  return { x: beam.x, y: beam.y };
}

/** Every notice the park has shown since `watchNotices`, in the order they came (a notice is gone again in a few seconds). */
const noticesSeen = (page: Page) => page.evaluate(() => (window as unknown as { noticesSeen: string[] }).noticesSeen);
async function watchNotices(page: Page): Promise<void> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { noticesSeen: string[] }).noticesSeen = seen;
    const look = () => {
      for (const el of document.querySelectorAll('#hud [data-toasts] > *')) {
        const words = (el.textContent ?? '').trim();
        if (words && !seen.includes(words)) seen.push(words);
      }
    };
    new MutationObserver(look).observe(document.getElementById('hud')!, { childList: true, subtree: true, characterData: true });
    look();
  });
}

/** The "To the park" sign standing in this room, wholly on screen (its middle in CSS pixels); null if none is. */
async function parkSignOnScreen(page: Page): Promise<{ x: number; y: number } | null> {
  const box = await page.evaluate(() => {
    type Words = { text?: string; getBounds?: () => { x: number; y: number; right: number; bottom: number } };
    const sign = window.owlPark.game.scene.getScene('room').children.list.find((o) => (o as unknown as Words).text?.includes('To the park')) as unknown as Words | undefined;
    const b = sign?.getBounds?.();
    return b ? { x: b.x, y: b.y, right: b.right, bottom: b.bottom } : null;
  });
  if (!box) return null;
  const [a, z] = [await toScreen(page, box.x, box.y), await toScreen(page, box.right, box.bottom)];
  const view = page.viewportSize()!;
  return a.x >= 0 && a.y >= 0 && z.x <= view.width && z.y <= view.height ? { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 } : null;
}

test.describe('the home screen (OP-065)', () => {
  test('a first visit logs in: the owl is made, the builder opens on it, and Play goes into its own nest', async ({ page }) => {
    await openHome(page);
    await expect(page.locator('[data-home] h1')).toHaveText('Owl Park A cozy park you visit in your browser');
    await expect(button(page, 'login')).toHaveText('Make your owl');
    await expect(button(page, 'guest')).toHaveText('Play free now');
    await expect(button(page, 'settings')).toBeVisible();
    await expect(button(page, 'play')).toBeHidden();
    expect(await shownButtons(page)).toEqual(['Play free now', 'Make your owl', 'Settings']);
    // Nothing of the park shows: no Menu, no bar, no thumbstick.
    await expect(page.locator('[data-menu-btn]')).toBeHidden();
    await expect(page.locator('#hud .bar')).toBeHidden();
    expect(await home(page)).toEqual({ shown: true, loggedIn: false });
    expect(await page.evaluate(() => localStorage.getItem('owl-park:look'))).toBeNull();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-home-first-visit.png` });

    // Make your owl: which owl are you first (OP-076); Skip makes the owl on this device, and the builder opens on it.
    await button(page, 'login').click();
    await expect(page.getByRole('dialog', { name: 'Which owl are you?' })).toBeVisible();
    await page.locator('[data-wo-skip]').click();
    const builder = page.getByRole('dialog', { name: 'Your owl' });
    await expect(builder).toBeVisible();
    // The builder covers the home screen, as it covers the park.
    await expect(page.locator('[data-home] h1')).toBeHidden();
    await builder.locator('[data-tab="colours"]').click();
    await builder.locator('[data-part="body"][data-colour="#3E6B48"]').click();
    await page.keyboard.press('Escape');
    await expect(builder).toBeHidden();
    expect(await home(page)).toEqual({ shown: true, loggedIn: true });
    await expect(button(page, 'login')).toBeHidden();
    await expect(button(page, 'play')).toBeVisible();
    // One way in (OP-105): Play, with Settings beside it, and no button of the nest's own.
    expect(await shownButtons(page)).toEqual(['Play', 'Settings']);
    await expect(page.locator('[data-home-btn="owl"]')).toHaveCount(0);
    // The builder hands the focus back to Play.
    await expect(button(page, 'play')).toBeFocused();
    // With no line in front of the park, its card stays out of sight (OP-075).
    await expect(page.locator('[data-home-line]')).toBeHidden();
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('owl-park:look'))) ?? '{}')).toMatchObject({ body: '#3E6B48' });
    // The owl is drawn beside the buttons.
    expect(await page.evaluate(() => window.owlPark.game.scene.isActive('builder'))).toBe(true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-home-logged-in.png` });

    // Play: into the owl's own nest, made for it now, standing before its mirror, with the park's buttons back.
    await play(page);
    expect(dist((await state(page)).pos, MIRROR_SPAWN)).toBeLessThan(4);
    await expect(page.locator('[data-menu-btn]')).toBeVisible();
    expect((await home(page)).shown).toBe(false);
    expect((await state(page)).look.body).toBe('#3E6B48');
  });

  test('says what the park is, and opens About the park and Safety and privacy (the site audit)', async ({ page, isMobile }) => {
    await openHome(page);
    await expect(page.locator('[data-home-lead]')).toHaveText('No download. Enter free as a guest, wander as an owl, alongside everyone else who is here right now.');
    await expect(page.locator('[data-home-welcome]')).toHaveText('Built for anyone who misses the old chatroom worlds.');
    expect(await page.title()).toBe('Owl Park - a cozy virtual park you visit in your browser');
    for (const [kind, title, words] of [
      ['about', 'About the park', 'It is not for anyone who wants to chat freely'],
      ['safety', 'Safety and privacy', 'There is no typed chat.'],
    ] as const) {
      const button = page.locator(`[data-home-info="${kind}"]`);
      await expect(button).toHaveText(title);
      if (isMobile) await button.tap();
      else await button.click();
      const card = page.getByRole('dialog', { name: title });
      await expect(card).toBeVisible();
      await expect(card).toContainText(words);
      await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-home-${kind}.png` });
      await page.keyboard.press('Escape');
      await expect(card).toBeHidden();
      await expect(button).toBeFocused();
    }
    // The screens are words only: the home screen's buttons are as they were.
    expect(await shownButtons(page)).toEqual(['Play free now', 'Make your owl', 'Settings']);
  });

  test('Play free now: the first control and the focus on a first visit; a ready-made owl, with no quiz and no builder, straight to the rising air in the Treetop Commons (OP-364, OP-363)', async ({ page, isMobile }) => {
    await openHome(page);
    // Free play leads (OP-364): the first button on the screen, focused, with the first thing to do named under it.
    const first = page.locator('[data-home] button:visible').first();
    await expect(first).toHaveAttribute('data-home-btn', 'guest');
    await expect(first).toHaveText('Play free now');
    await expect(button(page, 'guest')).toBeFocused();
    await expect(page.locator('[data-home-free-line]')).toHaveText('Straight in with a ready-made owl: the feather trail leads to your first glide.');
    // Make your owl is still there, second and smaller.
    const [free, make] = [(await button(page, 'guest').boundingBox())!, (await button(page, 'login').boundingBox())!];
    expect(make.y).toBeGreaterThan(free.y + free.height);
    expect(make.height).toBeLessThanOrEqual(free.height);
    // For families, one line: no typed chat.
    await expect(page.locator('[data-home-safe]')).toHaveText('Owls talk with set phrases only: there is no typed chat.');
    if (isMobile) await button(page, 'guest').tap();
    else await button(page, 'guest').click();
    await expect(page.getByRole('dialog', { name: 'Which owl are you?' })).toBeHidden();
    // Not into a nest, two rooms and a ticket question from anything to play: into the Treetop Commons,
    // beside the rising air in its moonbeam (OP-363).
    await besideTheMoonbeam(page);
    expect(await page.evaluate(() => localStorage.getItem('owl-park:look'))).not.toBeNull();
    // Logged in now: the home screen comes back with Play, and no free button.
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-tab="settings"]').click();
    await menu.locator('[data-screen="title"]').click();
    await page.waitForFunction(() => window.owlPark.home().shown, null, { timeout: 20_000 });
    expect(await shownButtons(page)).toEqual(['Play', 'Settings']);
    await expect(page.locator('[data-home-safe]')).toBeHidden();
    // Play, from now on, is the owl's own nest as for every owl (OP-105): its home is a doorway from the Commons.
    await play(page);
  });

  test('a new owl flies within a minute and a half of Play free now: the feather trail leads into the moonbeam, a held Jump rides its warm air up over the Commons, and nothing asks about a quiz or a ticket on the way (OP-363)', async ({ page, isMobile }) => {
    test.slow(); // a walk, a rise and a glide down, on a runner a third as fast
    await openHome(page);
    await watchNotices(page);
    const pressed = Date.now();
    if (isMobile) await button(page, 'guest').tap();
    else await button(page, 'guest').click();
    const beam = await besideTheMoonbeam(page);
    // The trail: a glint over the moonbeam's rising air, and feathers from the owl toward it.
    await expect.poll(async () => (await state(page)).trail?.glints ?? [], { timeout: 30_000 }).toContain('play-rise');
    await expect.poll(async () => (await state(page)).trail?.feathers.length ?? 0, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
    const laid = (await state(page)).trail?.feathers ?? [];
    expect(dist(laid.at(-1)!, beam)).toBeLessThan(dist(laid[0]!, beam));
    // Along it into the light, where what the warm air is for is said, once.
    await page.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), beam);
    await expect.poll(async () => { const s = await state(page); return !s.walking && dist(s.pos, beam) < 30; }, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await noticesSeen(page)).join(' | '), { timeout: 15_000 }).toContain('Warm air rises here');
    // Jump, held: lifted (3), and carried far over what a jump and its flaps reach.
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 15_000 }).toBe(3);
    const flying = Date.now() - pressed;
    await expect.poll(async () => (await state(page)).air.z, { timeout: 20_000 }).toBeGreaterThan(200);
    await page.keyboard.up('Space');
    // Down again: its first flight, and the park says so.
    await expect.poll(async () => (await state(page)).firstRise, { timeout: 40_000 }).toBe(true);
    await expect.poll(async () => await noticesSeen(page), { timeout: 10_000 }).toContain('That is flying!');
    // All of it in the Commons, and nothing on the way asked which owl it is or about a ticket.
    expect((await state(page)).room).toBe('lobby');
    await expect(page.getByRole('dialog', { name: 'Which owl are you?' })).toBeHidden();
    await expect(page.locator(GATE_ASK)).toBeHidden();
    // The rising air is found, so the trail leads on from here: to the turnstiles, and the owl's own nest.
    await expect.poll(async () => (await state(page)).trail?.glints ?? [], { timeout: 20_000 }).not.toContain('play-rise');
    await expect.poll(async () => (await state(page)).trail?.glints ?? [], { timeout: 20_000 }).toContain('gate');
    // The ticket's measure: in the air inside a minute and a half of the press (here it is seconds).
    test.info().annotations.push({ type: 'first flight', description: `${(flying / 1000).toFixed(1)} s from Play free now to carried up` });
    expect(flying).toBeLessThan(90_000);
  });

  test('a return visit is logged in at once, with the owl as it was, and Play takes the focus', async ({ page }) => {
    await openHome(page);
    await logIn(page);
    const look = await page.evaluate(() => localStorage.getItem('owl-park:look'));
    await page.reload();
    await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
    expect(await home(page)).toEqual({ shown: true, loggedIn: true });
    await expect(button(page, 'login')).toBeHidden();
    await expect(button(page, 'play')).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('owl-park:look'))).toBe(look);
    // On a computer Enter plays; on a phone, a tap. Either way the owl comes back to the same nest.
    const nest = await page.evaluate(() => window.owlPark.game.registry.get('collection').service.homeNest());
    if (test.info().project.name === 'desktop') {
      await page.keyboard.press('Enter');
      await inOwnNest(page);
    } else await play(page);
    expect((await state(page)).room).toBe(`nest-${nest}`);
  });

  test('from the nest the way to the park needs no instructions: a welcome the first time, then signs and chips that say so, to the hub (OP-105)', async ({ page, isMobile }) => {
    test.slow(); // four rooms, walked through
    await openHome(page);
    await logIn(page);
    await play(page);
    // The first time home, a card under the bar says where the park is; a tap closes it.
    const welcome = page.locator('[data-nest-welcome]');
    await expect(welcome).toBeVisible();
    await expect(welcome).toContainText('Welcome to your nest');
    await expect(welcome).toContainText('The park is out the door.');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-nest-welcome.png` });
    if (isMobile) await welcome.tap();
    else await welcome.click();
    await expect(welcome).toBeHidden();

    // In each room on the way, "To the park" marks the way on: a chip at the screen's edge while the
    // doorway is off screen, else a sign by it on screen, and a tap there walks on. Nothing else is used.
    for (const next of ['homes', 'lobby', 'hub']) {
      await settleCamera(page);
      const here = await state(page);
      const chip = page.locator('.hint.say');
      if (await chip.isVisible()) {
        await expect(chip).toHaveText('To the park');
        await expect(chip).toHaveAttribute('aria-label', 'To the park, off screen: walk there');
        if (isMobile) await chip.tap();
        else await chip.click();
      } else {
        expect(await parkSignOnScreen(page), `the sign in ${here.room}`).not.toBeNull();
        // The doorway the sign marks, as a visitor taps it.
        const door = here.doors.find((d) => d.id === (here.room.startsWith('nest-') ? 'to-street' : 'to-lobby'))!;
        const at = await toScreen(page, door.x, door.y);
        if (isMobile) await page.touchscreen.tap(at.x, at.y);
        else await page.mouse.click(at.x, at.y);
      }
      await expect.poll(async () => (await state(page)).room, { timeout: 30_000, message: `from ${here.room}` }).toBe(next);
      // The welcome stays in the nest.
      await expect(welcome).toBeHidden();
    }
    // Home again, the welcome does not come back: it was this device's first time.
    await travelTo(page, 'nest');
    await inOwnNest(page);
    await expect.poll(async () => (await state(page)).walking).toBe(false);
    await expect(welcome).toBeHidden();
  });

  test("the home screen's Settings are the park's: a change there is the same inside", async ({ page }) => {
    await openHome(page);
    await button(page, 'settings').click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings).toBeVisible();
    // Opened from the home screen, Settings has no way back to the Menu.
    await expect(settings.getByRole('button', { name: /Back/ })).toHaveCount(0);
    await settings.locator('[data-setting="bubbles"]').click();
    await expect(settings.locator('[data-setting="bubbles"]')).toHaveAttribute('aria-checked', 'false');
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await logIn(page);
    await play(page);
    // Inside, the Menu's Settings show the same choice.
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-tab="settings"]').click();
    await expect(menu.locator('[data-setting="bubbles"]')).toHaveAttribute('aria-checked', 'false');
  });

  test("the Menu's Home screen comes back here, and Play goes back in", async ({ page }) => {
    await openHome(page);
    await logIn(page);
    await play(page);
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-tab="settings"]').click();
    await menu.locator('[data-screen="title"]').click();
    await page.waitForFunction(() => window.owlPark.home().shown, null, { timeout: 20_000 });
    await expect(button(page, 'play')).toBeVisible();
    await expect(page.locator('[data-menu-btn]')).toBeHidden();
    expect(await page.evaluate(() => window.owlPark.state())).toBeNull();
    await play(page);
    await expect(page.locator('[data-menu-btn]')).toBeVisible();
  });

  test('reads as one story: the name and its line, then Play, with Settings and the two screens in a small footer close under it (Nov 6)', async ({ page }) => {
    // The phone project checks the narrowest common phone (375 px), the desktop one a laptop.
    const phone = test.info().project.name === 'phone';
    await page.setViewportSize(phone ? { width: 375, height: 812 } : { width: 1280, height: 800 });
    await openHome(page);
    const lead = page.locator('[data-home-lead]');
    const footer = page.locator('[data-home] .h-foot');
    // A first visit: the lead says what the park is, and the footer holds Settings and the two notes.
    await expect(lead).toBeVisible();
    for (const sel of ['[data-home-btn="settings"]', '[data-home-info="about"]', '[data-home-info="safety"]', '[data-home-welcome]']) {
      await expect(footer.locator(sel)).toBeVisible();
    }
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-home-tidy-first-visit.png` });

    await logIn(page);
    // Coming back, the owl knows what the park is: no lead, and Play is the one big thing.
    await expect(lead).toBeHidden();
    const play = await button(page, 'play').boundingBox();
    const settings = await button(page, 'settings').boundingBox();
    expect(play && settings).toBeTruthy();
    // The footer sits under Play, smaller than it.
    expect(settings!.y).toBeGreaterThan(play!.y + play!.height);
    expect(settings!.height).toBeLessThan(play!.height);
    // Everything fits without scrolling the side.
    expect(await page.locator('[data-home] .h-side').evaluate((s) => s.scrollHeight <= s.clientHeight + 1)).toBe(true);
    // Balanced: the footer follows the hero closely (no empty band between them on a tall phone), and its
    // three links take at most two rows.
    const hero = (await page.locator('[data-home] .h-hero').boundingBox())!;
    const foot = (await footer.boundingBox())!;
    expect(foot.y - (hero.y + hero.height)).toBeLessThan(40);
    const rows = await footer.locator('.h-links button').evaluateAll((bs) => new Set(bs.map((b) => Math.round(b.getBoundingClientRect().top))).size);
    expect(rows).toBeLessThanOrEqual(2);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-home-tidy-logged-in.png` });
  });
});
