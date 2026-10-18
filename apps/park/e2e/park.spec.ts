import { expect, test, type Page } from '@playwright/test';
import { cameraView, dist, openPark, settleCamera, state, tapRoomPoint, waitForArrival, walkToDoor } from './helpers';

/** Whether the park ships `<key>.svg` (the loader's first choice); a dev server may answer a miss with index.html. */
async function hasSvg(page: Page, key: string): Promise<boolean> {
  return page.evaluate(async (k) => {
    const res = await fetch(new URL(`art/${k}.svg`, document.baseURI));
    return res.ok && (res.headers.get('content-type') ?? '').includes('svg');
  }, key);
}

test.describe('single visitor', () => {
  test('the park opens in the hub with one owl present', async ({ page }) => {
    await openPark(page);
    const s = await state(page);
    expect(s.room).toBe('hub');
    expect(s.peers).toHaveLength(0);
    await expect(page.getByText('1 owl here')).toBeVisible();
    await expect(page.getByText('Owl Park')).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-hub.png` });
  });

  test('tapping the ground walks the owl there', async ({ page }) => {
    await openPark(page);
    const before = await state(page);
    const view = await settleCamera(page);
    // A point to the right of the owl that is on screen even on a narrow portrait phone.
    const target = { x: before.pos.x + Math.min(220, view.viewW * 0.3), y: before.pos.y + 40 };
    await tapRoomPoint(page, target.x, target.y);
    await waitForArrival(page, target.x, target.y); // a short walk can finish between two polls, so arrival is the check
  });

  test('using the HUD never stops the owl from walking afterwards', async ({ page }) => {
    await openPark(page);
    const before = await state(page);
    await page.locator('#hud .pill').hover();
    await page.getByRole('button', { name: 'Your owl' }).click();
    await page.getByRole('button', { name: 'Your owl' }).click();
    expect((await state(page)).pos).toEqual(before.pos); // HUD clicks never move the owl
    const view = await settleCamera(page);
    const target = { x: before.pos.x - Math.min(200, view.viewW * 0.3), y: before.pos.y + 30 };
    await tapRoomPoint(page, target.x, target.y);
    await waitForArrival(page, target.x, target.y);
  });

  test('WASD and the arrow keys walk the owl, facing the way it goes, and letting go stops it', async ({ page }) => {
    await openPark(page);
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
    await expect.poll(async () => stopped.x - (await state(page)).pos.x).toBeGreaterThan(60);
    expect((await state(page)).eyes).toBeLessThan(0);
    await page.keyboard.down('ArrowUp'); // up and to the left together
    const turned = (await state(page)).pos;
    await expect.poll(async () => turned.y - (await state(page)).pos.y).toBeGreaterThan(20);
    await page.keyboard.up('ArrowUp');
    await page.keyboard.up('ArrowLeft');
    await expect.poll(async () => (await state(page)).walking).toBe(false);
  });

  test('Q opens the collection and closes it again, and Escape closes it too', async ({ page }) => {
    await openPark(page);
    const panel = page.getByRole('region', { name: 'Collection' });
    await page.keyboard.press('KeyQ');
    await expect(panel).toBeVisible();
    await page.keyboard.press('KeyQ');
    await expect(panel).toBeHidden();
    await page.keyboard.press('KeyQ');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
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
    await page.evaluate(() => window.owlPark.walkTo(800, 50)); // far up in the sky
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    const s = await state(page);
    expect(s.pos.y).toBeGreaterThan(400); // landed on the floor's top edge, not in the sky
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
    await expect(page.getByRole('button', { name: 'Gift shop' })).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-market.png` });
    await page.keyboard.press('KeyE'); // E does what the button does
    await expect(page.getByText('The gift shop opens soon.')).toBeVisible();
  });

  test('standing at a realm idol offers the Realm Vote; without a ticketed server it explains', async ({ page }) => {
    await openPark(page, { room: 'grove' });
    await expect(page.getByRole('button', { name: 'Vote for this realm' })).toBeHidden();
    await walkToDoor(page, 'idol');
    await expect(page.getByRole('button', { name: 'Vote for this realm' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Vote for this realm' }).click();
    await expect(page.getByText(/Voting opens/).first()).toBeVisible();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-idol.png` });
  });

  test('tapping the idol from afar walks the owl up to it and pledges on arrival', async ({ page }) => {
    await openPark(page, { room: 'grove' });
    // Stand near the gathering spot (outside it) so the guardian is on screen even on a phone.
    await page.evaluate(() => window.owlPark.walkTo(900, 720));
    await waitForArrival(page, 900, 720);
    await settleCamera(page);
    await tapRoomPoint(page, 800, 260); // the guardian's chest
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
    const target = { x: 600, y: 760 };
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
