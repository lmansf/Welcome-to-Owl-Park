import { expect, test, type Page } from '@playwright/test';
import { openPark, state, walkToDoor } from './helpers';

async function inRoom(page: Page, room: string): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe(room);
}

// Two room changes and a walk along the three cabinets.
test.describe.configure({ timeout: 90_000 });

test.describe('the arcade (this device)', () => {
  test('in by the doorway at the neon street’s east end, every cabinet still hatching, and back out', async ({ page }) => {
    // On the pavement in front of the doorway, where an owl stands when it comes back out.
    await openPark(page, { room: 'market', spawn: 'from-arcade', collector: 'e2e-arcade' });
    await walkToDoor(page, 'to-arcade');
    await inRoom(page, 'arcade');

    // No game is live yet: standing at a cabinet says so, and offers nothing to press.
    for (const cabinet of ['cabinet-crossing', 'cabinet-flight', 'cabinet-sling']) {
      await walkToDoor(page, cabinet);
      await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
      await expect(page.locator('.toast').filter({ hasText: 'Hatching Soon' }).last()).toBeVisible();
      await expect(page.locator('[data-action]')).toHaveCount(0);
    }

    // Back past the cabinets to the entrance, and out: on the pavement in front of the doorway.
    await page.evaluate(() => window.owlPark.walkTo(300, 820));
    await expect.poll(async () => (await state(page)).walking, { timeout: 15_000 }).toBe(false);
    await walkToDoor(page, 'to-market');
    await inRoom(page, 'market');
    expect((await state(page)).pos.x).toBeGreaterThan(3000);
  });
});
