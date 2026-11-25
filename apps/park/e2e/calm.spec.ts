import { expect, test } from './fixtures';
import { openPark, state } from './helpers';

/**
 * Calm motion (OP-375, Dec 1 plan D8): a device that asks for less motion starts with Calm motion on,
 * the room then fades in in a third of the time and the HUD's screens hardly move; the visitor can turn
 * it off in Settings. What each effect does in calm motion is listed in src/calmMotion.ts and checked
 * in src/calmMotion.test.ts.
 */
const ROOM = { room: 'hub', spawn: 'default' };

async function setCalm(page: import('@playwright/test').Page, on: boolean): Promise<void> {
  await page.locator('[data-menu-btn]').click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await menu.locator('[data-tab="settings"]').click();
  const sw = menu.locator('[data-setting="calm"]');
  if ((await sw.getAttribute('aria-checked')) !== String(on)) await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', String(on));
  await menu.getByRole('button', { name: 'Close the menu' }).click();
  await expect(menu).toBeHidden();
}

test.describe('calm motion (OP-375)', () => {
  test('a plain visit moves as ever: the full fade, and the HUD unchanged', async ({ page }) => {
    await openPark(page, ROOM);
    const m = (await state(page)).motion;
    expect(m.calm).toBe(false);
    expect(m.fadeInMs).toBe(350);
    await expect(page.locator('#hud')).not.toHaveClass(/\bcalm-motion\b/);
  });

  test.describe('on a device that asks for less motion', () => {
    test('Calm motion starts on: a short fade and still screens, and turning it off brings the motion back', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openPark(page, ROOM);
      const m = (await state(page)).motion;
      expect(m.calm).toBe(true);
      expect(m.fadeInMs).toBeLessThan(350);
      await expect(page.locator('#hud')).toHaveClass(/\bcalm-motion\b/);
      // The Menu opens without its slide: its animation is over at once.
      await page.locator('[data-menu-btn]').click();
      const shell = page.locator('.menu-shell');
      await expect(shell).toBeVisible();
      const ms = await shell.evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) * 1000);
      expect(ms).toBeLessThan(1);
      await page.getByRole('dialog', { name: 'Menu' }).getByRole('button', { name: 'Close the menu' }).click();
      // The visitor's own choice stands over the device's wish.
      await setCalm(page, false);
      await expect(page.locator('#hud')).not.toHaveClass(/\bcalm-motion\b/);
      expect((await state(page)).motion.calm).toBe(false);
    });
  });
});
