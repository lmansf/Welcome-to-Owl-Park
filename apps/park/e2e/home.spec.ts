import { expect, test, type Page } from '@playwright/test';
import { dist, settleCamera, state, toScreen } from './helpers';

/**
 * The home screen (OP-065), on this device (local mode): a first visit logs in (the owl is made and
 * the owl builder opens on it), a return visit is logged in at once, the home screen's Settings are
 * the park's, and the Menu's Home screen comes back to it. Play is the one way in, and it lands the
 * owl in its own nest, before its mirror, every time (OP-105).
 */
const home = (page: Page) => page.evaluate(() => window.owlPark.home());
const button = (page: Page, id: 'login' | 'play' | 'settings') => page.locator(`[data-home-btn="${id}"]`);
/** The home screen's buttons as shown, in order. */
const shownButtons = (page: Page) => page.locator('[data-home-btn]').evaluateAll((bs) => bs.filter((b) => !(b as HTMLElement).hidden).map((b) => b.textContent));
/** Where Play puts the owl: before its nest's mirror (NEST_ROOM's `mirror` spawn). */
const MIRROR_SPAWN = { x: 650, y: 720 };

async function openHome(page: Page): Promise<void> {
  await page.goto('/?transport=local');
  await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
}

/** A first visit: Make your owl makes the owl and opens the builder on it; closing it leaves the owl beside Play. */
async function logIn(page: Page): Promise<void> {
  await button(page, 'login').click();
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
    await expect(page.locator('[data-home] h1')).toHaveText('Owl Park');
    await expect(button(page, 'login')).toHaveText('Make your owl');
    await expect(button(page, 'settings')).toBeVisible();
    await expect(button(page, 'play')).toBeHidden();
    expect(await shownButtons(page)).toEqual(['Make your owl', 'Settings']);
    // Nothing of the park shows: no Menu, no bar, no thumbstick.
    await expect(page.locator('[data-menu-btn]')).toBeHidden();
    await expect(page.locator('#hud .bar')).toBeHidden();
    expect(await home(page)).toEqual({ shown: true, loggedIn: false });
    expect(await page.evaluate(() => localStorage.getItem('owl-park:look'))).toBeNull();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-home-first-visit.png` });

    // Make your owl: the owl is kept on this device, and the builder opens on it before anything else.
    await button(page, 'login').click();
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
    await page.locator('[data-menu-btn]').click();
    await page.getByRole('dialog', { name: 'Menu' }).locator('[data-tab="nest"]').click();
    // Go home acts at once on a key; a pointer holds it (pad.spec.ts).
    await page.getByRole('dialog', { name: 'Menu' }).locator('[data-screen="home"]').press('Enter');
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
});
