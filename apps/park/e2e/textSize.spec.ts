import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark } from './helpers';

/**
 * Text size (OP-386, Dec 1 plan D8): at 200% every tab of the Menu is still on the screen, upright and
 * on its side, with nothing pushed off its edge; the setting is chosen in Settings and kept. Pinch zoom
 * stays off, so zoom.spec.ts (OP-104) holds as it was. The rules are in src/textSize.test.ts.
 */
const ROOM = { room: 'hub', spawn: 'default' };
const TABS = ['quests', 'collection', 'nest', 'map', 'settings'] as const;

/** What of the Menu reaches past the screen's sides, outside anything that scrolls sideways on purpose. */
async function offScreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const w = window.innerWidth;
    const shell = document.querySelector('.menu-shell');
    if (!shell) return ['no menu'];
    const scrollsSideways = (el: Element | null): boolean => {
      for (let e = el; e && e !== shell; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true;
      }
      return false;
    };
    for (const el of [shell, ...shell.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      if (el !== shell && scrollsSideways(el.parentElement)) continue;
      if (r.left < -1 || r.right > w + 1) out.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className)} ${Math.round(r.left)}..${Math.round(r.right)} of ${w}`);
    }
    return out.slice(0, 8);
  });
}

async function eachTab(page: Page, label: string): Promise<void> {
  await page.locator('[data-menu-btn]').click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  for (const tab of TABS) {
    await menu.locator(`[data-tab="${tab}"]`).click();
    await expect(menu.locator(`[data-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
    await page.waitForTimeout(250);
    expect(await offScreen(page), `${label}: the ${tab} tab at 200%`).toEqual([]);
  }
  await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-${label}-text-200.png` });
  await menu.getByRole('button', { name: 'Close the menu' }).click();
  await expect(menu).toBeHidden();
}

test.describe('text size (OP-386)', () => {
  test('Settings offers 100, 150 and 200%, and the size chosen draws the HUD larger and is kept', async ({ page }) => {
    await openPark(page, ROOM);
    await expect(page.locator('#hud')).toHaveAttribute('data-text', '100');
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await menu.locator('[data-tab="settings"]').click();
    await expect(menu.locator('[data-text-size="100"]')).toHaveAttribute('aria-pressed', 'true');
    const before = (await page.locator('[data-menu-btn]').boundingBox())!;
    await menu.locator('[data-text-size="200"]').click();
    await expect(menu.locator('[data-text-size="200"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(menu.locator('[data-text-size="100"]')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#hud')).toHaveAttribute('data-text', '200');
    const after = (await page.locator('[data-menu-btn]').boundingBox())!;
    expect(after.height).toBeGreaterThan(before.height * 1.6);
    await page.reload();
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    await expect(page.locator('#hud')).toHaveAttribute('data-text', '200');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('owl-park:settings') ?? '{}').text)).toBe(200);
  });

  test('at 200% every tab of the Menu stays on the screen, upright and on its side', async ({ page, isMobile }) => {
    test.slow(); // five tabs, twice on a phone
    await page.addInitScript(() => localStorage.setItem('owl-park:settings', JSON.stringify({ text: 200 })));
    await openPark(page, ROOM);
    await expect(page.locator('#hud')).toHaveAttribute('data-text', '200');
    await eachTab(page, isMobile ? 'upright' : 'desktop');
    if (isMobile) {
      const { width, height } = page.viewportSize()!;
      await page.setViewportSize({ width: height, height: width });
      await page.waitForTimeout(300);
      await eachTab(page, 'sideways');
    }
  });
});
