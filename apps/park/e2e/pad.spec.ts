import { expect, test } from '@playwright/test';
import { openPark, peakHeight, state } from './helpers';

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe('the pad and the hop (OP-082)', () => {
  test('a phone has a pad: the stick on the right; Interact and Jump on a diagonal on the left; the Menu and Say small in the corner', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the pad is for touch screens');
    await openPark(page);
    const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
    const stick = await box('#hud .stick');
    const interact = await box('[data-pad-interact]');
    const jump = await box('[data-pad-jump]');
    const menu = await box('[data-menu-btn]');
    const emotes = await box('[data-emotes-btn]');
    const say = await box('[data-say-btn]');
    const width = page.viewportSize()!.width;
    // The stick keeps the bottom-right corner; the pad keeps to the left.
    expect(stick.x + stick.width).toBeGreaterThan(width - 40);
    for (const b of [interact, jump, menu, emotes, say]) expect(b.x + b.width).toBeLessThan(width / 2 + 20);
    // A diagonal like a handheld's: Interact nearer the middle and higher, Jump nearer the corner and
    // lower, and the Menu button, smaller, below and left of them in the corner.
    expect(interact.x).toBeGreaterThan(jump.x);
    expect(interact.y).toBeLessThan(jump.y);
    expect(menu.x).toBeLessThanOrEqual(jump.x);
    expect(menu.y).toBeGreaterThan(jump.y);
    expect(menu.width).toBeLessThan(jump.width);
    // Say sits beside the Menu button in the corner, as small.
    expect(say.x).toBeGreaterThan(menu.x);
    expect(say.y).toBeGreaterThan(jump.y);
    expect(say.width).toBeLessThan(jump.width);
    // Thumb-sized and apart: each at least 44 px, none over another.
    const all = [interact, jump, menu, emotes, say, stick];
    for (const b of all) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i]!, all[j]!), `${i} and ${j}`).toBe(false);
    // The pad's Menu button is the only one, and it still opens the Menu.
    await expect(page.locator('[data-menu-btn]')).toHaveCount(1);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-pad.png` });
    await page.locator('[data-menu-btn]').tap();
    await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
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
    await interact.tap();
    await expect(page.locator('[data-booth="say"]')).toContainText('coming soon');
  });

  test('Jump hops the owl up and back down where it stands; on a computer the space bar does', async ({ page, isMobile }) => {
    await openPark(page);
    const before = (await state(page)).pos;
    const peak = peakHeight(page, 'own');
    if (isMobile) await page.locator('[data-pad-jump]').tap();
    else await page.keyboard.press('Space');
    expect(await peak).toBeGreaterThan(8);
    // Back on the floor, in the same place: a hop moves nothing.
    expect((await state(page)).height).toBe(0);
    expect((await state(page)).pos).toEqual(before);
    // One hop at a time: a second at once is not one.
    expect(await page.evaluate(() => [window.owlPark.jump(), window.owlPark.jump()])).toEqual([true, false]);
    if (!isMobile) await expect(page.locator('[data-pad-jump]')).toBeHidden();
  });
});
