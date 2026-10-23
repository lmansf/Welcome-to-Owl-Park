import { expect, test, type Locator, type Page } from '@playwright/test';
import { openPark, state, walkToDoor } from './helpers';

async function inRoom(page: Page, room: string | RegExp): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(room);
}

async function openMenu(page: Page): Promise<Locator> {
  await page.locator('[data-menu-btn]').click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  return menu;
}

/** In the lobby, in front of the turnstiles and outside them. */
async function outsideTheGate(page: Page): Promise<void> {
  await inRoom(page, 'lobby');
  const s = await state(page);
  const gate = s.doors.find((d) => d.id === 'gate')!;
  expect(Math.abs(s.pos.x - gate.x)).toBeLessThan(160);
  expect(s.pos.y).toBeGreaterThan(gate.y + 40);
}

// Room changes and a nest made on first sight.
test.describe.configure({ timeout: 90_000 });

test.describe('leaving the park (this device)', () => {
  test('walking off the hub floor where owls come in leads back to the lobby, outside the gate', async ({ page }) => {
    await openPark(page, { room: 'hub', collector: 'e2e-leave-walk' });
    const wayOut = (await state(page)).doors.find((d) => d.id === 'to-lobby');
    expect(wayOut?.to).toBe('lobby');
    await walkToDoor(page, 'to-lobby');
    await outsideTheGate(page);
    // Outside the park the Menu offers no way out of it; home is still a tap away.
    const menu = await openMenu(page);
    await expect(menu.locator('[data-screen="leave"]')).toBeHidden();
    await expect(menu.locator('[data-screen="home"]')).toBeVisible();
  });

  test('Leave the park asks first: Stay keeps the owl where it is, Leave takes it to the lobby', async ({ page }) => {
    await openPark(page, { room: 'grove', collector: 'e2e-leave-menu' });
    let menu = await openMenu(page);
    await expect(menu.locator('[data-screen]')).toHaveText([/^Say/, /^Your owl/, /^Quests/, /^Settings/, /^Feedback/, /^Go home/, /^Leave the park/]);
    await menu.locator('[data-screen="leave"]').click();
    const card = page.getByRole('dialog', { name: 'Leave the park' });
    await expect(card).toContainText('Leave the park? Your ticket keeps running.');
    // Stay comes first, so a stray key never leaves.
    await expect(card.locator('[data-leave="stay"]')).toBeFocused();
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-leave-card.png` });
    await card.locator('[data-leave="stay"]').click();
    await expect(card).toBeHidden();
    expect((await state(page)).room).toBe('grove');

    menu = await openMenu(page);
    await menu.locator('[data-screen="leave"]').click();
    await card.locator('[data-leave="leave"]').click();
    await outsideTheGate(page);
  });

  test('Go home goes straight to the owl’s own nest, from the park and from the lobby', async ({ page }) => {
    await openPark(page, { room: 'hub', collector: 'e2e-go-home' });
    let menu = await openMenu(page);
    await menu.locator('[data-screen="home"]').click();
    await inRoom(page, /^nest-/);
    await expect.poll(async () => (await state(page)).nest?.mine, { timeout: 10_000 }).toBe(true);
    const home = (await state(page)).room;
    // At home neither way out is offered.
    menu = await openMenu(page);
    await expect(menu.locator('[data-screen="home"]')).toBeHidden();
    await expect(menu.locator('[data-screen="leave"]')).toBeHidden();
    await page.keyboard.press('Escape');
    // Out of the nest, the owl is on the street in front of its own door.
    await walkToDoor(page, 'to-street');
    await inRoom(page, 'homes');
    const door0 = (await state(page)).doors.find((d) => d.id === 'nest-door-0')!;
    expect(Math.abs((await state(page)).pos.x - door0.x)).toBeLessThan(200);

    // And from the lobby, the same nest.
    await openPark(page, { room: 'lobby', collector: 'e2e-go-home' });
    menu = await openMenu(page);
    await menu.locator('[data-screen="home"]').click();
    await inRoom(page, home);
  });
});
