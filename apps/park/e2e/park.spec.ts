import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { cameraView, dist, frames, openGround, openPark, settleCamera, state, tapRoomPoint, waitForArrival, walkAndStop, walkToDoor } from './helpers';

/** A finger drawn down the screen from (x, y), `by` pixels, in a few steps, then lifted. */
async function swipeDown(page: Page, x: number, y: number, by: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 4; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (by * i) / 4 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** Whether the park ships `<key>.svg` (the loader's first choice); a dev server may answer a miss with index.html. */
async function hasSvg(page: Page, key: string): Promise<boolean> {
  return page.evaluate(async (k) => {
    const res = await fetch(new URL(`art/${k}.svg`, document.baseURI));
    return res.ok && (res.headers.get('content-type') ?? '').includes('svg');
  }, key);
}

test.describe('single visitor', () => {
  test('the hub opens with one owl present', async ({ page }) => {
    await openPark(page);
    const s = await state(page);
    expect(s.room).toBe('hub');
    expect(s.peers).toHaveLength(0);
    await expect(page.locator('[data-count]')).toHaveText('1 owl here');
    // The park's name in the bar (the home screen's heading, hidden in the park, has it too).
    await expect(page.locator('#hud .brand')).toHaveText('Owl Park');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-hub.png` });
  });

  test('tapping the ground walks the owl there', async ({ page }) => {
    await openPark(page);
    const before = await state(page);
    const view = await settleCamera(page);
    // A point beside the owl that is on screen even on a narrow portrait phone, and not under a button.
    // On a phone the pad and the stick stand low on either side of the owl (it stands low on the
    // screen at the hub's spawn), so beside it at its own height, or a little behind, does too.
    const step = Math.min(220, view.viewW * 0.3);
    const target = await openGround(page, [
      { x: before.pos.x + step, y: before.pos.y + 40 },
      { x: before.pos.x - step, y: before.pos.y + 40 },
      { x: before.pos.x + step, y: before.pos.y },
      { x: before.pos.x - step, y: before.pos.y },
      { x: before.pos.x + step, y: before.pos.y - 30 },
      { x: before.pos.x - step, y: before.pos.y - 30 },
      // On a narrow phone the floor beside the owl can all be the pad's, the stick's or an owl's to talk
      // to (its tap area reaches past it, OP-127): then nearer, a step behind.
      { x: before.pos.x + step / 2, y: before.pos.y - 30 },
      { x: before.pos.x - step / 2, y: before.pos.y - 30 },
      { x: before.pos.x, y: before.pos.y - 50 },
    ]);
    await tapRoomPoint(page, target.x, target.y);
    await waitForArrival(page, target.x, target.y); // a short walk can finish between two polls, so arrival is the check
  });

  test('using the HUD never stops the owl from walking afterwards', async ({ page, isMobile }) => {
    await openPark(page);
    const before = await state(page);
    // A phone's bar has no count to point at (OP-242): the Say button up in its corner instead.
    await page.locator(isMobile ? '[data-say-btn]' : '#hud .pill').hover();
    await page.locator('[data-menu-btn]').click();
    await page.getByRole('button', { name: 'Close the menu' }).click();
    expect((await state(page)).pos).toEqual(before.pos); // HUD clicks never move the owl
    const view = await settleCamera(page);
    // Beside the owl, clear of the pad and the stick on a phone (as in the test above).
    const step = Math.min(200, view.viewW * 0.3);
    const target = await openGround(page, [
      { x: before.pos.x - step, y: before.pos.y + 30 },
      { x: before.pos.x - step, y: before.pos.y },
      { x: before.pos.x + step, y: before.pos.y },
      { x: before.pos.x - step, y: before.pos.y - 30 },
      // On a narrow phone the floor beside the owl can all be the pad's, the stick's or an owl's to talk
      // to (its tap area reaches past it, OP-127): then nearer, a step behind.
      { x: before.pos.x + step / 2, y: before.pos.y - 30 },
      { x: before.pos.x - step / 2, y: before.pos.y - 30 },
      { x: before.pos.x, y: before.pos.y - 50 },
    ]);
    await tapRoomPoint(page, target.x, target.y);
    await waitForArrival(page, target.x, target.y);
  });

  test('on a touch screen the thumbstick walks the owl and letting go stops it; a computer has none', async ({ page, isMobile }) => {
    await openPark(page);
    const stick = page.locator('#hud .stick');
    if (!isMobile) {
      await expect(stick).toBeHidden();
      return;
    }
    await expect(stick).toBeVisible();
    // The buttons keep clear of it: to its right, or above it (OP-242: the stick keeps the bottom-left corner).
    const s = (await stick.boundingBox())!;
    for (const b of await page.locator('#hud .bottom .left > button, #hud .bottom .left > div > button, #hud [data-action]').all()) {
      const r = await b.boundingBox();
      if (r) expect(r.x >= s.x + s.width - 1 || r.y + r.height <= s.y + 1).toBe(true);
    }
    const start = (await state(page)).pos;
    const toward = start.x < 2400 ? 1 : -1; // toward the middle of the hub, where there is floor
    const c = { x: s.x + s.width / 2, y: s.y + s.height / 2 };
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + toward * 45, c.y, { steps: 5 });
    await expect.poll(async () => toward * ((await state(page)).pos.x - start.x)).toBeGreaterThan(80);
    expect(Math.sign((await state(page)).eyes)).toBe(toward); // it faces the way the stick points
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-stick.png` });
    await page.mouse.up();
    await expect.poll(async () => (await state(page)).walking).toBe(false);
    const stopped = (await state(page)).pos;
    await frames(page, 24);
    expect((await state(page)).pos).toEqual(stopped); // it stays where it was let go
  });

  test('WASD and the arrow keys walk the owl, facing the way it goes, and letting go stops it', async ({ page }) => {
    await openPark(page);
    // Start low on the hub's floor. On a slow runner the owl walks on well past each check, sliding up
    // along the floor's edge as it goes; from the spawn's height that could leave it under the top edge,
    // with no room to go up.
    await page.evaluate(() => window.owlPark.walkTo(2400, 815));
    await waitForArrival(page, 2400, 815);
    const start = (await state(page)).pos;
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await state(page)).pos.x - start.x).toBeGreaterThan(60);
    expect((await state(page)).eyes).toBeGreaterThan(0); // its face looks right, the way it walks
    await page.keyboard.up('KeyD');
    await expect.poll(async () => (await state(page)).walking).toBe(false);
    const stopped = (await state(page)).pos;
    await frames(page, 24);
    expect((await state(page)).pos).toEqual(stopped); // it stays where it was let go

    await page.keyboard.down('ArrowLeft');
    // Watch closely: the owl keeps walking while the test looks.
    await page.waitForFunction((x) => {
      const s = window.owlPark?.state();
      return !!s && x - s.pos.x > 60;
    }, stopped.x, { polling: 50 });
    expect((await state(page)).eyes).toBeLessThan(0);
    await page.keyboard.down('ArrowUp'); // up and to the left together
    const turned = (await state(page)).pos;
    await expect.poll(async () => turned.y - (await state(page)).pos.y).toBeGreaterThan(20);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowLeft');
    await expect.poll(async () => (await state(page)).walking).toBe(false);
  });

  test('M opens the Menu, T Say and J the Menu on its quests; each key closes its screen again, and so does Escape (Q: mirror.spec.ts)', { tag: '@smoke' }, async ({ page }) => {
    await openPark(page);
    for (const [key, name, opener] of [
      ['KeyM', 'Menu', '[data-menu-btn]'],
      ['KeyT', 'Say', '[data-say-btn]'],
      ['KeyJ', 'Menu', '[data-menu-btn]'],
    ] as const) {
      const screen = page.getByRole('dialog', { name });
      await page.keyboard.press(key);
      await expect(screen, name).toBeVisible();
      if (key === 'KeyJ') await expect(screen.locator('[data-tab="quests"]')).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press(key);
      await expect(screen, name).toBeHidden();
      await page.keyboard.press(key);
      await expect(screen, name).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(screen, name).toBeHidden();
      // The focus goes back to the button for it.
      await expect(page.locator(opener), name).toBeFocused();
    }
    // While a screen is open the walking keys leave the owl where it is.
    const before = (await state(page)).pos;
    await page.keyboard.press('KeyM');
    await page.keyboard.down('KeyD');
    await frames(page, 30);
    expect((await state(page)).walking).toBe(false);
    await page.keyboard.up('KeyD');
    expect((await state(page)).pos).toEqual(before);
    await page.keyboard.press('Escape');
  });

  test('Space jumps and never opens the Menu, after the Menu was opened from its button or its key and closed (OP-293)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a phone jumps on the pad');
    await openPark(page);
    const menu = page.getByRole('dialog', { name: 'Menu' });
    // Clicked open and closed: the Menu button has the focus back, and the space bar is still the jump.
    await page.locator('[data-menu-btn]').click();
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Close the menu' }).click();
    await expect(menu).toBeHidden();
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Space');
      await frames(page, 20);
      await expect(menu).toBeHidden();
    }
    // Opened with M and closed with Escape, the same.
    await page.keyboard.press('KeyM');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('[data-menu-btn]')).toBeFocused();
    await page.keyboard.press('Space');
    await frames(page, 20);
    await expect(menu).toBeHidden();
    // The Menu still opens from its own button.
    await page.locator('[data-menu-btn]').click();
    await expect(menu).toBeVisible();
  });

  test('the bottom bar is Menu, Emotes and Say; the Menu has five tabs, and its Settings lead to Feedback (Your owl is at the mirror: mirror.spec.ts)', async ({ page, isMobile }) => {
    test.slow(); // the emotes, Say, the Menu's five tabs and Feedback open and close in turn
    await openPark(page);
    await expect(page.locator('#hud .bottom .left').getByRole('button')).toHaveCount(isMobile ? 2 : 3);
    await expect(page.locator('[data-say-reply]')).toBeHidden();
    // Emotes and Say are one tap away: on a computer each has its button; a phone has Say's alone, and
    // the emotes are a tap inside it (OP-242). Each wheel leads to the other.
    const wheel = page.getByRole('dialog', { name: 'Emotes' });
    const say = page.getByRole('dialog', { name: 'Say' });
    if (isMobile) {
      await expect(page.locator('[data-emotes-btn]')).toBeHidden();
      await page.locator('[data-say-btn]').click();
      await expect(say).toBeVisible();
      await say.locator('[data-swap="emotes"]').click();
      await expect(say).toBeHidden();
    } else await page.locator('[data-emotes-btn]').click();
    await expect(wheel).toBeVisible();
    await wheel.getByRole('button', { name: 'Close emotes' }).click();
    await expect(wheel).toBeHidden();
    await page.locator('[data-say-btn]').click();
    await expect(say).toBeVisible();
    await say.getByRole('button', { name: 'Close Say' }).click();
    await expect(say).toBeHidden();
    await expect(page.locator('[data-say-btn]')).toBeFocused();
    await page.locator('[data-say-btn]').click();
    await say.locator('[data-swap="emotes"]').click();
    await expect(wheel).toBeVisible();
    await wheel.locator('[data-swap="say"]').click();
    await expect(say).toBeVisible();
    await say.getByRole('button', { name: 'Close Say' }).click();
    await expect(say).toBeHidden();

    // The Menu: five tabs, each with its word, on the quests first.
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu.getByRole('tablist', { name: 'Menu' }).getByRole('tab')).toHaveText(['Quests', 'Collection', 'Nest', 'Map', 'Settings']);
    await expect(menu.locator('[data-tab="quests"]')).toHaveAttribute('aria-selected', 'true');
    await expect(menu.locator('.journal')).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-menu.png` });
    // Each tab draws its own panel: the collection by kind, the nest with the way to the map, the map with the owl on it.
    await menu.locator('[data-tab="collection"]').click();
    await expect(menu.locator('[data-tab="collection"]')).toHaveAttribute('aria-selected', 'true');
    await expect(menu.locator('[data-tab="quests"]')).toHaveAttribute('aria-selected', 'false');
    await expect(menu.locator('[data-panel="collection"] [role="progressbar"]')).toHaveCount(5);
    await menu.locator('[data-tab="nest"]').click();
    await expect(menu.locator('[data-screen="map"]')).toBeVisible();
    await menu.locator('[data-tab="map"]').click();
    await expect(menu.locator('[data-place="hub"]')).toContainText('You are here');
    await expect(menu.locator('[data-place].here')).toHaveCount(1);
    // On a keyboard the arrows go from tab to tab.
    if (!isMobile) {
      await menu.locator('[data-tab="map"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(menu.locator('[data-tab="settings"]')).toBeFocused();
      await expect(menu.locator('[data-tab="settings"]')).toHaveAttribute('aria-selected', 'true');
    } else await menu.locator('[data-tab="settings"]').click();
    await expect(menu.locator('[data-setting="calm"]')).toBeVisible();
    // Feedback opens in the Menu's place, and its way back is to the Menu, on the Settings it came from.
    await menu.locator('[data-screen="feedback"]').click();
    const feedback = page.getByRole('dialog', { name: 'Feedback' });
    await expect(feedback).toBeVisible();
    await expect(menu).toBeHidden();
    await feedback.getByRole('button', { name: 'Back to the menu' }).click();
    await expect(feedback).toBeHidden();
    await expect(menu).toBeVisible();
    await expect(menu.locator('[data-tab="settings"]')).toHaveAttribute('aria-selected', 'true');
    await menu.getByRole('button', { name: 'Close the menu' }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('[data-menu-btn]')).toHaveAttribute('aria-expanded', 'false');
  });

  test('the Menu leaves the park in sight, and closes on Close, the dimmed park, Escape, the back button and (on a phone) a swipe down its top', async ({ page, isMobile }) => {
    test.slow(); // opened and closed six times
    await openPark(page);
    const menu = page.getByRole('dialog', { name: 'Menu' });
    const open = async () => {
      await page.locator('[data-menu-btn]').click();
      await expect(menu).toBeVisible();
      await expect(page.locator('[data-menu-btn]')).toHaveAttribute('aria-expanded', 'true');
    };
    const closed = async (how: string) => {
      await expect(menu, how).toBeHidden();
      await expect(page.locator('[data-menu-btn]'), how).toHaveAttribute('aria-expanded', 'false');
    };
    await open();
    // At most 70% of the screen high, whichever tab is shown, so the park shows above it.
    const sheet = page.locator('.menu-shell');
    const box = (await sheet.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.7 + 1);
    for (const tab of ['collection', 'map', 'settings'] as const) {
      await menu.locator(`[data-tab="${tab}"]`).click();
      expect((await sheet.boundingBox())!.height, tab).toBeCloseTo(box.height, 0);
    }
    await menu.getByRole('button', { name: 'Close the menu' }).click();
    await closed('Close');
    // A tap on the dimmed park above it.
    await open();
    await page.mouse.click(box.x + box.width / 2, box.y / 2);
    await closed('the dimmed park');
    await open();
    await page.keyboard.press('Escape');
    await closed('Escape');
    // The back button closes it and leaves the page where it was.
    await open();
    await page.goBack();
    await closed('back');
    expect((await state(page)).room).toBe('hub');
    if (isMobile) {
      await open();
      const top = (await menu.locator('.mhead h2').boundingBox())!;
      await swipeDown(page, top.x + top.width / 2, top.y + top.height / 2, 140);
      await closed('a swipe down');
    }
    // And it opens again as ever.
    await open();
    await expect(menu.locator('[data-tab="settings"]')).toHaveAttribute('aria-selected', 'true');
  });

  test("the Menu wears light wood by day and its night variant in the evening, by the visitor's clock", async ({ page }) => {
    for (const [hour, theme] of [[11, 'day'], [21, 'night']] as const) {
      await page.clock.setFixedTime(new Date(2026, 9, 24, hour, 15));
      await openPark(page);
      await page.locator('[data-menu-btn]').click();
      await expect(page.getByRole('dialog', { name: 'Menu' })).toBeVisible();
      await expect(page.locator('.menu-layer'), `${hour}:15`).toHaveAttribute('data-theme', theme);
      await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-menu-${theme}.png` });
    }
  });

  test('settings hide the thumbstick, and stay on this device', async ({ page, isMobile }) => {
    await openPark(page);
    // Quests live in the Menu (OP-083): nothing of them on the play screen, and no setting for it.
    await expect(page.locator('#hud .welcome')).toBeHidden();
    await page.locator('[data-menu-btn]').click();
    await page.getByRole('dialog', { name: 'Menu' }).locator('[data-tab="settings"]').click();
    await expect(page.locator('[data-setting="questCards"]')).toHaveCount(0);
    if (isMobile) {
      await expect(page.locator('#hud .stick')).toBeVisible();
      await page.locator('[data-setting="thumbstick"]').click();
      await expect(page.locator('#hud .stick')).toBeHidden();
    } else await expect(page.locator('[data-setting="thumbstick"]')).toBeHidden();
    await page.locator('[data-setting="calm"]').click();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-settings.png` });
    await page.reload();
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('owl-park:settings') ?? '{}'))).toEqual({ thumbstick: !isMobile, calm: true, bubbles: true, sound: true, trail: true });
  });

  test('Feedback from the Menu takes a note, and typing in it never walks the owl, plays an emote or opens a screen', async ({ page }) => {
    test.slow(); // a dozen taps and 36 keystrokes, each answered by a park drawn with software WebGL on CI runners
    await openPark(page);
    const before = (await state(page)).pos;
    const sheet = page.getByRole('dialog', { name: 'Feedback' });
    const openFeedback = async () => {
      await page.locator('[data-menu-btn]').click();
      await page.getByRole('dialog', { name: 'Menu' }).locator('[data-tab="settings"]').click();
      await page.locator('[data-screen="feedback"]').click();
    };
    await openFeedback();
    await expect(sheet).toBeVisible();
    const send = sheet.getByRole('button', { name: 'Send' });
    await expect(send).toBeDisabled(); // nothing written yet
    await sheet.getByRole('button', { name: 'Bug' }).click();
    const box = sheet.getByRole('textbox', { name: 'Your note' });
    await box.click();
    await box.pressSequentially('wasd q j e m t 1 2: the owl stays put');
    // Only one screen opens at a time: had a key opened another, this one would have closed.
    await expect(sheet).toBeVisible();
    await expect(box).toHaveValue('wasd q j e m t 1 2: the owl stays put');
    expect((await state(page)).pos).toEqual(before);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-feedback.png` });
    await send.click();
    // Without the park's server the note stays in this browser.
    await expect(page.getByText('your note is saved on this device')).toBeVisible();
    await expect(sheet).toBeHidden();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('owl-park:feedback') ?? '[]') as unknown[]);
    expect(kept).toEqual([expect.objectContaining({ kind: 'bug', text: 'wasd q j e m t 1 2: the owl stays put', room: 'hub' })]);
    // Escape closes it from inside the text box too.
    await openFeedback();
    await expect(box).toHaveValue('');
    await box.click();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('art is rasterized for the device: sharper on dense screens, bounded for rooms', async ({ page }) => {
    await openPark(page);
    const dpr = (await cameraView(page)).dpr; // 1 on the desktop project, 2 (capped) on the phone project
    // An SVG room is rasterized at min(dpr, 1.5); a painted room (WebP or PNG) is used as shipped,
    // 1600 wide, or 3200 when a 2x copy exists and the screen is dense.
    const roomWidths = async (key: string) => ((await hasSvg(page, key)) ? [1600 * Math.min(dpr, 1.5)] : dpr > 1.25 ? [1600, 3200] : [1600]);
    const hub = await page.evaluate(() => window.owlPark.textureSize('hub'));
    const owl = await page.evaluate(() => window.owlPark.textureSize('owl-body'));
    expect(await roomWidths('hub')).toContain(hub?.w);
    expect(owl?.w).toBe(200 * Math.min(dpr, 2));
    await walkToDoor(page, 'to-market');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('market');
    // The previous room's art is released; the new room's is loaded at the same scale.
    expect(await page.evaluate(() => window.owlPark.textureSize('hub'))).toBeNull();
    expect(await roomWidths('market')).toContain((await page.evaluate(() => window.owlPark.textureSize('market')))?.w);
  });

  test('the Party Grove is drawn from its four painted layers for visitors, and from its earlier paintings on ?art=old', async ({ page }) => {
    await openPark(page, { art: '' });
    // Every screen's backdrop, middle, playable layer and overlay, shipped with the build; the earlier paintings are not asked for.
    for (const layer of ['back', 'mid', 'play', 'front']) {
      await expect.poll(() => page.evaluate((k) => window.owlPark.textureSize(k), `partygrove-${layer}-1`), { timeout: 15_000 }).toEqual({ w: 1600, h: 900 });
    }
    expect(await page.evaluate(() => window.owlPark.textureSize('hub'))).toBeNull();
    await openPark(page);
    await expect.poll(() => page.evaluate(() => window.owlPark.textureSize('hub')), { timeout: 15_000 }).not.toBeNull();
    expect(await page.evaluate(() => window.owlPark.textureSize('partygrove-play-1'))).toBeNull();
  });

  test('tapping outside the walkable area snaps to its edge', async ({ page }) => {
    await openPark(page);
    await page.evaluate(() => window.owlPark.walkTo(2400, 50)); // far up in the sky
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    const s = await state(page);
    expect(s.pos.y).toBeGreaterThan(400); // landed on the floor's top edge, not in the sky
  });

  test('a walk that only passes a doorway stays in the room; one that ends at the doorway goes through', async ({ page }) => {
    await openPark(page);
    await page.evaluate(() => window.owlPark.walkTo(1550, 730)); // the hollow's west bay
    await waitForArrival(page, 1550, 730);
    await page.evaluate(() => window.owlPark.walkTo(2000, 640)); // back into the nave, straight across the doorway to the grove
    await waitForArrival(page, 2000, 640);
    expect((await state(page)).room).toBe('hub');
    await walkToDoor(page, 'to-grove');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('grove');
  });

  test('walking into an open doorway changes room and back', async ({ page }) => {
    await openPark(page);
    await walkToDoor(page, 'to-grove');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('grove');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-grove.png` });
    await walkToDoor(page, 'to-hub');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('hub');
  });

  test('a closed doorway shows its sign wording', async ({ page }) => {
    await openPark(page);
    await walkToDoor(page, 'closed-a');
    await expect(page.getByText(/Not Yet Fledged|Closed for Molting|Pardon Our Feathers|Hatching Soon/)).toBeVisible({ timeout: 15_000 });
  });

  test('the neon realm offers the gift shop near the kiosk', async ({ page }) => {
    await openPark(page, { room: 'market' });
    await walkToDoor(page, 'shop');
    await expect(page.getByRole('button', { name: 'Gift shop', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-market.png` });
    await page.keyboard.press('KeyE'); // E does what the button does
    await expect(page.getByText('The gift shop opens soon.')).toBeVisible();
  });

  test('standing at a realm idol offers the Realm Vote; without a ticketed server it explains', async ({ page }) => {
    await openPark(page, { room: 'grove' });
    await expect(page.getByRole('button', { name: 'Vote for this realm', exact: true })).toBeHidden();
    await walkToDoor(page, 'idol');
    await expect(page.getByRole('button', { name: 'Vote for this realm', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Vote for this realm', exact: true }).click();
    await expect(page.getByText(/Voting opens/).first()).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-idol.png` });
  });

  test('tapping the idol from afar walks the owl up to it and pledges on arrival', async ({ page }) => {
    await openPark(page, { room: 'grove' });
    // Stand near the gathering spot (outside it) so the guardian is on screen even on a phone.
    await page.evaluate(() => window.owlPark.walkTo(2500, 720));
    await waitForArrival(page, 2500, 720);
    await settleCamera(page);
    await tapRoomPoint(page, 2400, 260); // the guardian's chest
    const s = await state(page);
    const spot = s.doors.find((d) => d.id === 'idol')!;
    await waitForArrival(page, spot.x, spot.y); // the tap sent the owl to the gathering spot
    await expect(page.getByText(/Voting opens/).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('the prompt at the owl (OP-344)', () => {
  test('what an owl can do where it stands shows at its own feet, with the key on a computer, and goes when it talks or walks off', async ({ page }) => {
    await openPark(page);
    const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    // At the way in the owl stands in the moonbeam: the prompt says what Interact does there.
    await expect.poll(async () => (await state(page)).promptShown, { timeout: 10_000 }).toBe(touch ? 'Bask in the moonbeam' : 'E: Bask in the moonbeam');
    // Out on the open floor nothing is in reach: no prompt.
    await walkAndStop(page, 2600, 880);
    await expect.poll(async () => (await state(page)).promptShown, { timeout: 10_000 }).toBeNull();
    // Beside Elder Bramble: what Interact does, in words, where the visitor is looking.
    await walkAndStop(page, 2280, 760);
    await expect.poll(async () => (await state(page)).promptShown, { timeout: 10_000 }).toBe(touch ? 'Talk to Elder Bramble' : 'E: Talk to Elder Bramble');
    // Talking to him: the prompt is gone while the two talk.
    expect(await page.evaluate(() => window.owlPark.talk('bramble'))).toBe(true);
    await expect(page.locator('.dialogue[data-npc="bramble"]')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await state(page)).promptShown, { timeout: 10_000 }).toBeNull();
    // Walked well away: nothing in reach, no prompt.
    await walkAndStop(page, 2800, 900);
    await expect.poll(async () => (await state(page)).promptShown, { timeout: 10_000 }).toBeNull();
  });
});

test.describe('two visitors on one device', () => {
  test('owls see each other appear, walk, and leave', async ({ context }) => {
    // Two live parks in one browser, both drawn with software WebGL: on a loaded runner the walk
    // and the room change alone use most of the default budget (about 45 s on a 4-core box).
    test.slow();
    const a = await context.newPage();
    const b = await context.newPage();
    await openPark(a, { id: 'owl-a', look: '#8B5A2B,#F6F1E3,#C9A227' });
    await openPark(b, { id: 'owl-b', look: '#2F3E5C,#E0D4F0,#00E5FF' });

    await expect.poll(async () => (await state(a)).peers.map((p) => p.id)).toEqual(['owl-b']);
    await expect.poll(async () => (await state(b)).peers.map((p) => p.id)).toEqual(['owl-a']);
    await expect(a.locator('[data-count]')).toHaveText('2 owls here');
    expect((await state(b)).peers[0]?.look.body).toBe('#8B5A2B');

    // A walks; B's copy of A follows the same path and ends at the same spot.
    const target = { x: 2200, y: 760 };
    await a.evaluate(({ x, y }) => window.owlPark.walkTo(x, y), target);
    await waitForArrival(a, target.x, target.y);
    await expect.poll(async () => dist((await state(b)).peers[0]!.pos, target), { timeout: 15_000 }).toBeLessThan(6);
    await a.screenshot({ path: `e2e-screenshots/${test.info().project.name}-two-owls.png` });

    // A leaves for another room; B is alone again.
    await walkToDoor(a, 'to-grove');
    await expect.poll(async () => (await state(a)).room, { timeout: 20_000 }).toBe('grove');
    await expect.poll(async () => (await state(b)).peers.length, { timeout: 15_000 }).toBe(0);
    await expect(b.locator('[data-count]')).toHaveText('1 owl here');
  });

  for (const room of ['market', 'l0'] as const) {
    test(`held to either end of the ${room} floor, the whole owl stays on screen (OP-296)`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'a phone walks by the thumbstick: the same floor, held by keys here');
      test.slow(); // Two walks across the room each have a 30-second arrival budget.
      await openPark(page, { room });
      for (const key of ['KeyD', 'KeyA'] as const) {
        await page.keyboard.down(key);
        // Held until the owl stops at the floor's end.
        let last = Number.NaN;
        await expect
          .poll(
            async () => {
              const x = (await state(page)).pos.x;
              const still = Math.abs(x - last) < 0.5;
              last = x;
              return still;
            },
            { timeout: 30_000, intervals: [400] },
          )
          .toBe(true);
        await page.keyboard.up(key);
        await settleCamera(page);
        const s = await state(page);
        // Half an owl: the Owl's 200 px art at OWL_SCALE 0.5, at the room's owl scale.
        const half = 50 * s.owlScale;
        expect(s.pos.x - half, `${room} ${key}`).toBeGreaterThanOrEqual(s.view.x - 1);
        expect(s.pos.x + half, `${room} ${key}`).toBeLessThanOrEqual(s.view.x + s.view.w + 1);
      }
    });
  }
});

test.describe('the Great Hollow reads (OP-346)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('tall art goes see-through while the visitor\'s own owl is behind it, and a doorway at the hall\'s end has its sign beside it', async ({ page }) => {
    await openPark(page, { room: 'm3-hall', keeper: '1', newmap: '1' });
    const doors = (await state(page)).doors;
    const idol = doors.find((d) => d.id === 'idol-market')!;
    const way = doors.find((d) => d.id === 'to-market')!;
    // Out on the open floor nothing hides the owl.
    expect((await state(page)).seeThrough).toEqual([]);
    // Behind the neon street's idol (north of its foot, inside its picture): it fades so the owl shows.
    await walkAndStop(page, idol.x + 10, idol.y - 130);
    await expect.poll(async () => (await state(page)).seeThrough, { timeout: 10_000 }).toContain('robot-owl');
    // Out from behind it, the idol stands solid again.
    await walkAndStop(page, idol.x - 420, idol.y - 130);
    await expect.poll(async () => (await state(page)).seeThrough, { timeout: 10_000 }).toEqual([]);

    // By the doorway at the hall's east end: its sign stands beside the doorway, not out over the idol.
    await walkAndStop(page, way.x - 150, way.y + 30);
    await expect.poll(async () => (await state(page)).signShown, { timeout: 10_000 }).toBe('The neon street');
    const box = (await state(page)).signBox!;
    expect(box.right, 'the sign ends just in from the doorway').toBeLessThan(way.x);
    expect(way.x - box.right, 'and stands by it').toBeLessThan(140);
    expect(box.top, 'level with the doorway, or under the owl standing on it').toBeGreaterThan(way.y - 80);
  });
});

test.describe('a first flight where owls arrive (OP-347)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('the trail leads a new owl to the Great Hollow\'s roots, tips say how to hop up and glide, and the first glide is marked once', async ({ page }) => {
    const touch = await (async () => {
      await openPark(page, { room: 'm3-hall', spawn: 'from-lobby', keeper: '1', newmap: '1' });
      return page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    })();
    // Come in from the Treetop Commons: no tip yet, and the feathers lead down the hall to the roots, not to a doorway.
    expect((await state(page)).tipShown).toBeNull();
    expect((await state(page)).firstFlight).toBe(false);
    await expect.poll(async () => (await state(page)).trail?.feathers.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(3);
    const s0 = await state(page);
    const last = s0.trail!.feathers[s0.trail!.feathers.length - 1]!;
    // The first root of the inner run on each side of the hall's middle (rooms/hollowHall.ts, ROOT_RUNS and RUN_Y).
    const roots = [
      { x: 2300, y: 1238 },
      { x: 3140, y: 1238 },
    ];
    const near = roots.map((p) => Math.hypot(last.x - p.x, last.y - p.y));
    expect(Math.min(...near), 'the trail ends by an inner run\'s first root').toBeLessThan(260);
    expect(s0.trail!.glints).toContain('play-roots');

    // Walked down to the roots: how to get up them, in this device's words.
    const log = roots.reduce((a, b) => (Math.hypot(last.x - a.x, last.y - a.y) < Math.hypot(last.x - b.x, last.y - b.y) ? a : b));
    await walkAndStop(page, log.x, log.y + 90);
    await expect.poll(async () => (await state(page)).tipShown, { timeout: 10_000 }).toBe(touch ? 'Hop up the roots. Tap Jump, and again in the air to flap.' : 'Hop up the roots. Space to jump, and again in the air to flap.');
    // Stood there, the roots are found: the trail leads on to a doorway.
    await expect.poll(async () => (await state(page)).trail?.glints.includes('play-roots') ?? true, { timeout: 10_000 }).toBe(false);

    // Up on the stump: how to leave it. Then the glide itself.
    await openPark(page, { room: 'm3-hall', spawn: 'on-stump', keeper: '1', newmap: '1' });
    await expect.poll(async () => (await state(page)).tipShown, { timeout: 10_000 }).toBe(touch ? 'Jump off the top and hold Jump to glide.' : 'Jump off the top and hold Space to glide.');
    const from = (await state(page)).pos;
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).firstFlight, { timeout: 15_000, intervals: [100] }).toBe(true);
    await page.keyboard.up('Space');
    await page.keyboard.up('ArrowLeft');
    const landed = (await state(page)).pos;
    expect(from.x - landed.x, 'a glide, not a step off').toBeGreaterThan(320);
    await expect(page.locator('#hud [data-toasts]')).toContainText('That is flying!');
    // The tips have done their work: none now, and none on the next visit of this device.
    expect((await state(page)).tipShown).toBeNull();
    await openPark(page, { room: 'm3-hall', spawn: 'on-stump', keeper: '1', newmap: '1' });
    await frames(page, 30);
    expect((await state(page)).firstFlight).toBe(true);
    expect((await state(page)).tipShown).toBeNull();
  });
});

test.describe('the park’s sounds for the visitor’s own owl (OP-350)', () => {
  test('with the flag a jump, a flap, a glide and a landing are heard, and a doorway; the Sounds switch turns them off', async ({ page }) => {
    await openPark(page, { room: 'hub', sfx: '1' });
    expect((await state(page)).sounds).toEqual([]);
    // A tap of Jump: off the ground, and down again.
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).sounds, { timeout: 10_000 }).toEqual(['jump', 'land']);

    // Jump, again in the air (a flap), and held on the way down (the wings spread): each heard once, in order.
    await page.keyboard.press('Space');
    await page.waitForTimeout(260);
    await page.keyboard.down('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000, intervals: [50] }).toBe(2);
    await page.keyboard.up('Space');
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    expect((await state(page)).sounds).toEqual(['jump', 'land', 'jump', 'flap', 'glide', 'land']);

    // The Sounds switch (Settings) turns every one of them off, and on again.
    await page.evaluate(() => (window.owlPark.game.registry.get('settings') as { set(p: { sound: boolean }): void }).set({ sound: false }));
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).flown.n, { timeout: 10_000 }).toBe(3);
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    expect((await state(page)).sounds).toHaveLength(6);
    await page.evaluate(() => (window.owlPark.game.registry.get('settings') as { set(p: { sound: boolean }): void }).set({ sound: true }));

    // Through a doorway: heard as the room is left, and kept by the page into the next room.
    await walkToDoor(page, 'to-grove');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('grove');
    expect((await state(page)).sounds[6]).toBe('door');
  });

  test('without the flag nothing is played', async ({ page }) => {
    await openPark(page, { room: 'hub' });
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page)).flown.n, { timeout: 10_000 }).toBe(1);
    await expect.poll(async () => (await state(page)).air.s, { timeout: 10_000 }).toBe(0);
    expect((await state(page)).sounds).toEqual([]);
  });
});
