import { expect, test } from '@playwright/test';
import { cameraView, dist, openPark, state, tapRoomPoint, waitForArrival, walkToDoor } from './helpers';

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
    await page.waitForTimeout(600); // let the camera settle on the owl
    const view = await cameraView(page);
    // A point to the right of the owl that is on screen even on a narrow portrait phone.
    const target = { x: before.pos.x + Math.min(220, view.viewW * 0.3), y: before.pos.y + 40 };
    await tapRoomPoint(page, target.x, target.y);
    await expect.poll(async () => (await state(page)).walking).toBe(true);
    await waitForArrival(page, target.x, target.y);
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
  });
});

test.describe('two visitors on one device', () => {
  test('owls see each other appear, walk, and leave', async ({ context }) => {
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
    await expect.poll(async () => (await state(b)).peers[0]?.walking).toBe(true);
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
