import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { cameraView, dist, frames, openPark, state } from './helpers';

/**
 * The mirror (OP-077), on this device (local mode): Your owl is at a mirror in the owl's own nest.
 * Play puts the owl before it (OP-105); Look in the mirror opens Your owl with the room's own owl
 * as the preview, changing as the choices do; and Q leads there from anywhere. (That a mirror in
 * another owl's nest changes only the owl looking in is the room server's: RoomObject.test.ts.)
 */
const MIRROR_SPAWN = { x: 650, y: 720 };
const builder = (page: Page) => page.getByRole('dialog', { name: 'Your owl' });

async function inNest(page: Page): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(/^nest-/);
  await expect.poll(async () => (await state(page)).nest?.mine, { timeout: 10_000 }).toBe(true);
}

/** Your owl is open at the mirror: the builder over the room, and the room's camera drawing the owl in its stage. */
async function openAtMirror(page: Page): Promise<void> {
  await expect(builder(page)).toBeVisible();
  await expect(page.locator('#hud .builder.at-mirror')).toBeVisible();
  await expect.poll(async () => (await state(page)).mirror?.stage ?? null).not.toBeNull();
}

test.describe('the mirror in the nest (OP-077)', () => {
  test('Play puts the owl before its mirror; Look in the mirror opens Your owl, and the owl in the room is the preview', async ({ page, isMobile }) => {
    await page.goto('/?transport=local');
    await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
    // A first visit makes its owl (Skip the quiz, and the builder opens on it in place); then Play goes into its nest (OP-105).
    await page.locator('[data-home-btn="login"]').click();
    await page.locator('[data-wo-skip]').click();
    await expect(builder(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(builder(page)).toBeHidden();
    const play = page.locator('[data-home-btn="play"]');
    await expect(play).toHaveText('Play');
    if (isMobile) await play.tap();
    else await play.click();

    // Inside the nest, before the mirror, facing it.
    await inNest(page);
    const s = await state(page);
    expect(dist(s.pos, MIRROR_SPAWN)).toBeLessThan(4);
    expect(s.mirror!.x).toBeLessThan(s.pos.x);
    expect(s.eyes).toBeLessThan(0);
    // The first time home, the mirror glints once (no words): this device has seen it now.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('owl-park:mirror-glint'))).toBe('1');
    // Standing there, Look in the mirror comes first, before Decorate.
    await expect.poll(async () => (await state(page)).actions.slice(0, 2)).toEqual(['mirror', 'decorate']);
    await expect(page.locator('[data-action="mirror"]')).toHaveText(/Look in the mirror/);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-mirror-nest.png` });

    if (isMobile) {
      // On a phone, the pad's Interact does it.
      const interact = page.locator('[data-pad-interact]');
      await expect(interact).toHaveAttribute('aria-label', 'Interact: Look in the mirror');
      await interact.tap();
    } else await page.keyboard.press('KeyE');
    await openAtMirror(page);
    // Every tab of Your owl, as from anywhere.
    await expect(builder(page).locator('[data-tab]')).toHaveCount(5);
    // No preview of its own: the room's camera draws the owl and its mirror in the builder's stage.
    expect(await page.evaluate(() => window.owlPark.game.scene.isActive('builder'))).toBe(false);
    const stage = (await state(page)).mirror!.stage!;
    const cam = await cameraView(page);
    expect(Math.abs(cam.port.x / cam.dpr - stage.x)).toBeLessThan(1.5);
    expect(Math.abs(cam.port.y / cam.dpr - stage.y)).toBeLessThan(1.5);
    expect(Math.abs(cam.port.w / cam.dpr - stage.w)).toBeLessThan(1.5);
    expect(Math.abs(cam.port.h / cam.dpr - stage.h)).toBeLessThan(1.5);
    const me = (await state(page)).pos;
    for (const x of [me.x, s.mirror!.x]) expect(x > cam.viewX && x < cam.viewX + cam.viewW, `x ${x} in view`).toBe(true);
    expect(me.y > cam.viewY && me.y < cam.viewY + cam.viewH + 1).toBe(true);

    // A new colour: the owl in the room takes it at once, with Your owl still open.
    await builder(page).locator('[data-tab="colours"]').click();
    const before = (await state(page)).look.body;
    const swatches = builder(page).locator('[data-part="body"][data-colour]');
    const colours = await swatches.evaluateAll((els) => els.map((e) => e.getAttribute('data-colour')!));
    const pick = colours.find((c) => c.toLowerCase() !== before.toLowerCase())!;
    await builder(page).locator(`[data-part="body"][data-colour="${pick}"]`).click();
    await expect.poll(async () => (await state(page)).look.body).toBe(pick);
    await expect(builder(page)).toBeVisible();
    expect(await page.evaluate(() => window.owlPark.game.scene.isActive('builder'))).toBe(false);
    await frames(page, 3); // the preview drawn in the new colour
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-mirror.png` });

    // Done: the room's camera has the whole screen and follows the owl again, in its new colour.
    if (isMobile) await builder(page).getByRole('button', { name: 'Done: close your owl' }).tap();
    else await page.keyboard.press('Escape');
    await expect(builder(page)).toBeHidden();
    await expect.poll(async () => (await state(page)).mirror?.stage).toBeNull();
    const after = await cameraView(page);
    expect(after.port.x).toBe(0);
    expect(after.port.y).toBe(0);
    expect((await state(page)).look.body).toBe(pick);
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('owl-park:look'))) ?? '{}')).toMatchObject({ body: pick });
  });

  test('Q leads to the mirror: from the park home to stand before it, then into Your owl; Q closes it, and walks up to it from across the nest', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Q is a key');
    await openPark(page, { room: 'hub', collector: 'e2e-mirror-q' });
    await page.keyboard.press('KeyQ');
    await inNest(page);
    expect(dist((await state(page)).pos, MIRROR_SPAWN)).toBeLessThan(4);
    await expect(builder(page)).toBeHidden();
    // In the nest, Q looks in the mirror; Q again closes Your owl.
    await page.keyboard.press('KeyQ');
    await openAtMirror(page);
    await page.keyboard.press('KeyQ');
    await expect(builder(page)).toBeHidden();
    // From across the nest, Q walks the owl up to the mirror, and Your owl opens when it gets there.
    await page.evaluate(() => window.owlPark.walkTo(1150, 780));
    await expect.poll(async () => dist((await state(page)).pos, MIRROR_SPAWN), { timeout: 15_000 }).toBeGreaterThan(300);
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    await page.keyboard.press('KeyQ');
    await expect.poll(async () => (await state(page)).walking).toBe(true);
    await openAtMirror(page);
    // It stands on the floor in front of the mirror (the spot's rect in NEST_ROOM).
    const at = (await state(page)).pos;
    expect(at.x).toBeGreaterThanOrEqual(560);
    expect(at.x).toBeLessThanOrEqual(700);
    expect(at.y).toBeGreaterThanOrEqual(686);
    expect(at.y).toBeLessThanOrEqual(750);
  });
});
