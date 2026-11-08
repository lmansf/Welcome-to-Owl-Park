import { expect, test } from './fixtures';
import { openPark, state, walkToDoor } from './helpers';

/**
 * The feather trail (OP-307): in a room seen from above, feathers lead from the owl toward the nearest
 * doorway it hasn't been through, and each such doorway glints. Going through one counts it as tried on
 * this device, and Settings can switch the trail off.
 */
test.describe('the feather trail (OP-307)', () => {
  test('feathers lead toward a doorway not tried yet, and a doorway gone through stops glinting', async ({ page }) => {
    await openPark(page, { room: 'hub' });
    await expect.poll(async () => (await state(page)).trail?.glints.length ?? 0, { timeout: 10_000 }).toBeGreaterThan(1);
    const first = (await state(page)).trail!;
    expect(first.on).toBe(true);
    // Through the Party Grove's doorway to the treehouses, and back the way it came.
    expect(first.glints).toContain('to-grove');
    await walkToDoor(page, 'to-grove');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('grove');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    await walkToDoor(page, 'to-hub');
    await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe('hub');
    await expect.poll(async () => (await state(page)).trail?.glints ?? ['none yet'], { timeout: 10_000 }).not.toContain('to-grove');
    // The trail is laid toward one of the doorways still glinting.
    await expect.poll(async () => (await state(page)).trail?.feathers.length ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
  });
});
