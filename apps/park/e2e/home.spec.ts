import { expect, test, type Page } from '@playwright/test';
import { state } from './helpers';

/**
 * The home screen (OP-065), on this device (local mode): a first visit logs in (the owl is made and
 * the owl builder opens on it), a return visit is logged in at once, the home screen's Settings are
 * the park's, and the Menu's Home screen comes back to it.
 */
const home = (page: Page) => page.evaluate(() => window.owlPark.home());
const button = (page: Page, id: 'login' | 'play' | 'owl' | 'settings') => page.locator(`[data-home-btn="${id}"]`);

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

async function play(page: Page): Promise<void> {
  await button(page, 'play').click();
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('lobby');
}

test.describe('the home screen (OP-065)', () => {
  test('a first visit logs in: the owl is made, the builder opens on it, and Play goes to the lobby', async ({ page }) => {
    await openHome(page);
    await expect(page.locator('[data-home] h1')).toHaveText('Owl Park');
    await expect(button(page, 'login')).toHaveText('Make your owl');
    await expect(button(page, 'settings')).toBeVisible();
    await expect(button(page, 'play')).toBeHidden();
    await expect(button(page, 'owl')).toBeHidden();
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
    await expect(button(page, 'owl')).toHaveText('Go to your nest');
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('owl-park:look'))) ?? '{}')).toMatchObject({ body: '#3E6B48' });
    // The owl is drawn beside the buttons.
    expect(await page.evaluate(() => window.owlPark.game.scene.isActive('builder'))).toBe(true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-home-logged-in.png` });

    // Play: the lobby, where guests arrive, with the park's buttons back.
    await play(page);
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
    // On a computer Enter plays; on a phone, a tap.
    if (test.info().project.name === 'desktop') {
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('lobby');
    } else await play(page);
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
    await page.locator('[data-screen="settings"]').click();
    await expect(page.getByRole('dialog', { name: 'Settings' }).locator('[data-setting="bubbles"]')).toHaveAttribute('aria-checked', 'false');
  });

  test("the Menu's Home screen comes back here, and Play goes back in", async ({ page }) => {
    await openHome(page);
    await logIn(page);
    await play(page);
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-screen="title"]').click();
    await page.waitForFunction(() => window.owlPark.home().shown, null, { timeout: 20_000 });
    await expect(button(page, 'play')).toBeVisible();
    await expect(page.locator('[data-menu-btn]')).toBeHidden();
    expect(await page.evaluate(() => window.owlPark.state())).toBeNull();
    await play(page);
    await expect(page.locator('[data-menu-btn]')).toBeVisible();
  });
});
