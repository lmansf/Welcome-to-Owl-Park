import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openPark, state, walkToDoor } from './helpers';

/**
 * Arriving by an activity link (OP-392, behind `golink`): `/?go=<place>` names no room, so the owl
 * comes in the usual way, and only once it has walked through the turnstiles is it flown on to the place.
 * On this device (the local mode), on today's park: the nests' street, the gate, then the treehouse clearing.
 */
async function inRoom(page: Page, room: string): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toBe(room);
}

test.describe.configure({ timeout: 120_000 });

test.describe('activity links (OP-392)', () => {
  test('the home screen says where the link goes, and nothing skips it', async ({ page }) => {
    await page.goto('/?transport=local&go=arcade&golink=1');
    await page.waitForFunction(() => window.owlPark?.home?.().shown === true, null, { timeout: 20_000 });
    await expect(page.getByText('Your link goes to the arcade, past the turnstiles.')).toBeVisible();
  });

  test('outside the turnstiles the owl is told to walk through them; through them, it flies on to the place', async ({ page }) => {
    await openPark(page, { room: 'homes', go: 'treehouse-clearing', golink: '1', collector: `e2e-golink-${test.info().project.name}` });
    await expect(page.getByText('Walk through the turnstiles, then you fly on to the treehouse clearing.')).toBeVisible({ timeout: 15_000 });
    await walkToDoor(page, 'to-lobby');
    await inRoom(page, 'lobby');
    // At the gate and still outside: no travel yet.
    expect((await state(page)).travel.gate).toBe(false);
    await walkToDoor(page, 'gate');
    await inRoom(page, 'hub');
    await expect.poll(async () => (await state(page)).travel.gate).toBe(true);
    await inRoom(page, 'grove');
  });

  test('with the flag off, the same address does nothing past the turnstiles', async ({ page }) => {
    await openPark(page, { room: 'homes', go: 'treehouse-clearing', collector: `e2e-golink-off-${test.info().project.name}` });
    await walkToDoor(page, 'to-lobby');
    await inRoom(page, 'lobby');
    await walkToDoor(page, 'gate');
    await inRoom(page, 'hub');
    await page.waitForTimeout(5_000);
    expect((await state(page)).room).toBe('hub');
    await expect(page.getByText(/fly on to/)).toHaveCount(0);
  });
});
