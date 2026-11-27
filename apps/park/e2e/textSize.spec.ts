import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark } from './helpers';

/**
 * Text size (OP-386, Dec 1 plan D8): at 200% every tab of the Menu is still on the screen, upright and
 * on its side, with nothing pushed off its edge; the setting is chosen in Settings and kept. Pinch zoom
 * stays off, so zoom.spec.ts (OP-104) holds as it was. The rules are in src/textSize.test.ts.
 * On a narrow phone (OP-495) the tabs stay in one row on the screen and Settings never scrolls sideways.
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

/**
 * What of the Menu's tabs and text size buttons is not wholly on the screen and inside its own row or
 * panel, and whether the tabs or the panel scroll sideways (OP-495). Each button is scrolled to
 * (up or down) before its height is checked, as an owl would scroll the panel to it.
 */
async function outOfReach(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const w = window.innerWidth;
    const h = window.innerHeight;
    const nav = document.querySelector<HTMLElement>('.menu-shell .mtabs');
    const panel = document.querySelector<HTMLElement>('.menu-shell .mpanel');
    if (!nav || !panel) return ['no menu'];
    if (nav.scrollWidth > nav.clientWidth + 1) out.push(`the tabs scroll sideways: ${nav.scrollWidth} wide in ${nav.clientWidth}`);
    if (panel.scrollWidth > panel.clientWidth + 1) out.push(`the panel scrolls sideways: ${panel.scrollWidth} wide in ${panel.clientWidth}`);
    const check = (el: HTMLElement, within: HTMLElement, what: string, scroll: boolean) => {
      const box = within.getBoundingClientRect();
      const left = Math.max(0, box.left) - 1;
      const right = Math.min(w, box.right) + 1;
      let r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        out.push(`${what} is not drawn`);
        return;
      }
      if (r.left < left || r.right > right) out.push(`${what} spans ${Math.round(r.left)}..${Math.round(r.right)}, its room ${Math.round(left)}..${Math.round(right)} of ${w}`);
      if (scroll) {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        r = el.getBoundingClientRect();
      }
      const top = Math.max(0, box.top) - 1;
      const bottom = Math.min(h, box.bottom) + 1;
      if (r.top < top || r.bottom > bottom) out.push(`${what} spans ${Math.round(r.top)}..${Math.round(r.bottom)} down, its room ${Math.round(top)}..${Math.round(bottom)} of ${h}`);
    };
    const tabs = [...nav.querySelectorAll<HTMLElement>('[data-tab]')];
    if (tabs.length !== 5) out.push(`${tabs.length} tabs`);
    for (const t of tabs) check(t, nav, `the ${t.dataset['tab']} tab`, false);
    const sizes = [...panel.querySelectorAll<HTMLElement>('[data-text-size]')];
    if (sizes.length !== 3) out.push(`${sizes.length} text size buttons`);
    for (const b of sizes) check(b, panel, `the ${b.textContent} button`, true);
    return out;
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

  test('on a phone 360 wide, at 200 and 150%, every tab and every text size button is on the screen and nothing scrolls sideways (OP-495)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.addInitScript(() => localStorage.setItem('owl-park:settings', JSON.stringify({ text: 200 })));
    await openPark(page, ROOM);
    await expect(page.locator('#hud')).toHaveAttribute('data-text', '200');
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await menu.locator('[data-tab="settings"]').click();
    await expect(menu.locator('[data-tab="settings"]')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => outOfReach(page), { message: 'Settings at 200%, 360 wide' }).toEqual([]);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-text-200-360.png` });

    // 150%, chosen right there: the same holds.
    await menu.locator('[data-text-size="150"]').click();
    await expect(page.locator('#hud')).toHaveAttribute('data-text', '150');
    await expect.poll(() => outOfReach(page), { message: 'Settings at 150%, 360 wide' }).toEqual([]);

    // Every tab is a tap away, and so is the way back to 100%.
    for (const tab of TABS) {
      await menu.locator(`[data-tab="${tab}"]`).click();
      await expect(menu.locator(`[data-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
    }
    await expect(menu.getByRole('tablist', { name: 'Menu' }).getByRole('tab')).toHaveText(['Quests', 'Collection', 'Nest', 'Map', 'Settings']);
    await menu.locator('[data-text-size="100"]').click();
    await expect(page.locator('#hud')).toHaveAttribute('data-text', '100');
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
