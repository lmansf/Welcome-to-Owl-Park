import { expect, test, type Page } from '@playwright/test';
import { cameraView, dist, openGround, openPark, settleCamera, state, tapRoomPoint, waitForArrival, walkToDoor } from './helpers';

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
    await expect(page.getByText('1 owl here')).toBeVisible();
    // The park's name in the bar (the home screen's heading, hidden in the park, has it too).
    await expect(page.locator('#hud .brand')).toHaveText('Owl Park');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-hub.png` });
  });

  test('tapping the ground walks the owl there', async ({ page }) => {
    await openPark(page);
    const before = await state(page);
    const view = await settleCamera(page);
    // A point beside the owl that is on screen even on a narrow portrait phone, and not under a button.
    const step = Math.min(220, view.viewW * 0.3);
    const target = await openGround(page, [
      { x: before.pos.x + step, y: before.pos.y + 40 },
      { x: before.pos.x - step, y: before.pos.y + 40 },
    ]);
    await tapRoomPoint(page, target.x, target.y);
    await waitForArrival(page, target.x, target.y); // a short walk can finish between two polls, so arrival is the check
  });

  test('using the HUD never stops the owl from walking afterwards', async ({ page }) => {
    await openPark(page);
    const before = await state(page);
    await page.locator('#hud .pill').hover();
    await page.locator('[data-menu-btn]').click();
    await page.getByRole('button', { name: 'Close the menu' }).click();
    expect((await state(page)).pos).toEqual(before.pos); // HUD clicks never move the owl
    const view = await settleCamera(page);
    const target = { x: before.pos.x - Math.min(200, view.viewW * 0.3), y: before.pos.y + 30 };
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
    // The buttons keep clear of it: to its left, or above it.
    const s = (await stick.boundingBox())!;
    for (const b of await page.locator('#hud .bottom .left > button, #hud .bottom .left > div > button, #hud [data-action]').all()) {
      const r = await b.boundingBox();
      if (r) expect(r.x + r.width <= s.x + 1 || r.y + r.height <= s.y + 1).toBe(true);
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
    await page.waitForTimeout(400);
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
    await page.waitForTimeout(400);
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

  test('M opens the Menu, T Say, Q your owl and J the quests; each key closes its screen again, and so does Escape', async ({ page }) => {
    await openPark(page);
    for (const [key, name, opener] of [
      ['KeyM', 'Menu', '[data-menu-btn]'],
      ['KeyT', 'Say', '[data-menu-btn]'],
      ['KeyQ', 'Your owl', '[data-menu-btn]'],
      ['KeyJ', 'Quests', '[data-menu-btn]'],
    ] as const) {
      const screen = page.getByRole('dialog', { name });
      await page.keyboard.press(key);
      await expect(screen, name).toBeVisible();
      await page.keyboard.press(key);
      await expect(screen, name).toBeHidden();
      await page.keyboard.press(key);
      await expect(screen, name).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(screen, name).toBeHidden();
      // The focus goes back to the button for it, even from the owl builder, which hides the buttons while open.
      await expect(page.locator(opener), name).toBeFocused();
    }
    // While a screen is open the walking keys leave the owl where it is.
    const before = (await state(page)).pos;
    await page.keyboard.press('KeyM');
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(500);
    expect((await state(page)).walking).toBe(false);
    await page.keyboard.up('KeyD');
    expect((await state(page)).pos).toEqual(before);
    await page.keyboard.press('Escape');
  });

  test('the bottom bar is Menu and Emotes; the Menu leads to Say, your owl, the quests, the settings and Feedback', async ({ page }) => {
    test.slow(); // the emotes, Say and four screens open and close in turn: 28 to 40 s here, more on a slow CI runner
    await openPark(page);
    await expect(page.locator('#hud .bottom .left button')).toHaveCount(2);
    // Emotes are one tap away.
    await page.locator('[data-emotes-btn]').click();
    const wheel = page.getByRole('dialog', { name: 'Emotes' });
    await expect(wheel).toBeVisible();
    await wheel.getByRole('button', { name: 'Close emotes' }).click();
    await expect(wheel).toBeHidden();
    await page.locator('[data-menu-btn]').click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    // Inside the park the ways out follow Say and the four screens (leave.spec.ts tries them).
    await expect(menu.locator('[data-screen]')).toHaveText([/^Say/, /^Your owl/, /^Quests/, /^Settings/, /^Feedback/, /^Go home/, /^Leave the park/, /^Home screen/]);
    // Feedback is picked out in gold.
    await expect(menu.locator('[data-screen="feedback"]')).toHaveClass(/\bhi\b/);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-menu.png` });
    // Say opens its wheel in the menu's place; closing the wheel goes back to the room.
    await menu.locator('[data-screen="say"]').click();
    const say = page.getByRole('dialog', { name: 'Say' });
    await expect(say).toBeVisible();
    await expect(menu).toBeHidden();
    await say.getByRole('button', { name: 'Close Say' }).click();
    await expect(say).toBeHidden();
    await expect(menu).toBeHidden();
    await page.locator('[data-menu-btn]').click();
    for (const [id, name] of [
      ['owl', 'Your owl'],
      ['quests', 'Quests'],
      ['settings', 'Settings'],
      ['feedback', 'Feedback'],
    ] as const) {
      await menu.locator(`[data-screen="${id}"]`).click();
      const screen = page.getByRole('dialog', { name });
      await expect(screen, name).toBeVisible();
      await expect(menu).toBeHidden();
      await screen.getByRole('button', { name: 'Back to the menu' }).click();
      await expect(screen, name).toBeHidden();
      await expect(menu).toBeVisible();
    }
  });

  test('settings hide the thumbstick, and stay on this device', async ({ page, isMobile }) => {
    await openPark(page);
    // Quests live in the Menu (OP-083): nothing of them on the play screen, and no setting for it.
    await expect(page.locator('#hud .welcome')).toBeHidden();
    await page.locator('[data-menu-btn]').click();
    await page.locator('[data-screen="settings"]').click();
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
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('owl-park:settings') ?? '{}'))).toEqual({ thumbstick: !isMobile, calm: true, bubbles: true });
  });

  test('Feedback from the Menu takes a note, and typing in it never walks the owl, plays an emote or opens a screen', async ({ page }) => {
    await openPark(page);
    const before = (await state(page)).pos;
    const sheet = page.getByRole('dialog', { name: 'Feedback' });
    const openFeedback = async () => {
      await page.locator('[data-menu-btn]').click();
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
    await expect(a.getByText('2 owls here')).toBeVisible();
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
    await expect(b.getByText('1 owl here')).toBeVisible();
  });
});
