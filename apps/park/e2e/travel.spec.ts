import { expect, test, type Locator, type Page } from '@playwright/test';
import { mapCard, openPark, state, travelTo, walkToDoor } from './helpers';

/**
 * Travel from the Menu's map (OP-130). A place lights up once the owl has walked into it, and its
 * card's button, held, travels there; the owl's own nest is always there. Into the park only through
 * the front gate: a place inside the park offers the gate instead until the owl has walked through
 * the turnstiles, and going home puts it outside again. On this device (the local mode), and through
 * the room server, which keeps the map with the owl and turns a travel in away without the gate.
 */

const isEdge = () => test.info().project.name === 'edge';

async function inRoom(page: Page, room: string | RegExp): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(room);
}

/** A finger held on a travel button until it is full (350 ms), pressed in the page so a busy runner's round trips cannot cut it short. */
const hold = (button: Locator) => button.evaluate((el) => void el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));

/** The page's map, as if this browser had walked these places before (the local mode keeps it per collector). */
async function walkedBefore(page: Page, collector: string, places: string[]): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      } catch {
        // A browser that keeps nothing: the map starts empty.
      }
    },
    [`owl-park:travel:${collector}`, JSON.stringify({ places, gate: false })] as const,
  );
}

// Room changes, each one a room's art drawn with software WebGL on a CI runner.
test.describe.configure({ timeout: 120_000 });

test.describe('travel from the map (OP-130)', () => {
  test('a place lights up once walked into, with a sparkle; its card, held, travels there; the nest is always there', async ({ page }) => {
    test.skip(isEdge(), 'on this device; through the room server below');
    await openPark(page, { room: 'homes', collector: `e2e-travel-lit-${test.info().project.name}` });
    const menu = page.getByRole('dialog', { name: 'Menu' });
    // The street is walked into; the gate not yet: its card says how it lights up, and offers nothing.
    let card = await mapCard(page, 'lobby');
    await expect(card).toContainText('Walk there once, and you can travel there from the map.');
    await expect(card.locator('[data-travel]')).toHaveCount(0);
    await expect(menu.locator('button.pin[data-place="homes"]')).toHaveAttribute('data-lit', '');
    await expect(menu.locator('button.pin[data-place="lobby"]')).toHaveClass(/unlit/);
    await expect(menu.locator('button.pin[data-place="nest"]')).toHaveAttribute('data-lit', '');
    // Closed arches are no place to tap.
    await expect(menu.locator('button.pin[data-place="closed-a"]')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Walked to the gate: it lights up, sparkling the first time the map shows it.
    await walkToDoor(page, 'to-lobby');
    await inRoom(page, 'lobby');
    await expect.poll(async () => (await state(page)).travel.places).toEqual(['homes', 'lobby']);
    card = await mapCard(page, 'homes');
    await expect(menu.locator('button.pin[data-place="lobby"]')).toHaveAttribute('data-lit', '');
    await expect(menu.locator('button.pin[data-place="lobby"] .spark')).toHaveCount(1);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-travel-map.png` });

    // Held, the street's card travels there: the Menu closes and the owl lands where walking in would.
    const button = card.locator('[data-travel="homes"]');
    await expect(button).toHaveText('Travel here');
    await hold(button);
    await expect(menu).toBeHidden();
    await inRoom(page, 'homes');
    // And home from there, before its mirror; the gate sparkles no more.
    card = await mapCard(page, 'nest');
    await expect(menu.locator('.spark')).toHaveCount(0);
    await hold(card.locator('[data-travel="nest"]'));
    await inRoom(page, /^nest-/);
    const at = await state(page);
    expect(at.nest?.mine).toBe(true);
    expect(Math.hypot(at.pos.x - at.mirror!.x, at.pos.y - at.mirror!.y)).toBeLessThan(160);
  });

  test('into the park only through the gate: a place inside it offers the gate until the owl walks through, and home puts it outside again', async ({ page }) => {
    test.skip(isEdge(), 'on this device; through the room server below');
    const collector = `e2e-travel-gate-${test.info().project.name}`;
    await walkedBefore(page, collector, ['homes', 'lobby', 'hub', 'grove', 'market']);
    await openPark(page, { room: 'homes', collector });
    // Outside the park: the clearing's card says the way in is the gate, and offers it.
    let card = await mapCard(page, 'grove');
    await expect(card).toContainText('Enter the park through the gate first.');
    await expect(card.locator('[data-travel]')).toHaveText('Travel to the gate');
    await card.locator('[data-travel]').press('Enter');
    await inRoom(page, 'lobby');
    // At the gate, the great tree's card says the turnstiles are the way.
    card = await mapCard(page, 'hub');
    await expect(card).toContainText('You are at the gate: walk through the turnstiles to go in.');
    await expect(card.locator('[data-travel]')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Through the turnstiles: the park's places travel now, one to another.
    await walkToDoor(page, 'gate');
    await inRoom(page, 'hub');
    await expect.poll(async () => (await state(page)).travel.gate).toBe(true);
    await travelTo(page, 'grove');
    await inRoom(page, 'grove');
    await travelTo(page, 'market');
    await inRoom(page, 'market');
    // The great tree travels to the gate, outside the turnstiles, as walking out does.
    card = await mapCard(page, 'hub');
    await expect(card).toContainText('Into the park is always through the front gate.');
    await page.keyboard.press('Escape');

    // Home puts the owl outside the park again: the gate first, once more.
    await travelTo(page, 'nest');
    await inRoom(page, /^nest-/);
    await expect.poll(async () => (await state(page)).travel.gate).toBe(false);
    card = await mapCard(page, 'market');
    await expect(card).toContainText('Enter the park through the gate first.');
  });

  test('M opens the map; its places and the travel button answer keys', async ({ page, isMobile }) => {
    test.skip(isEdge() || isMobile, 'a keyboard, on this device');
    await openPark(page, { room: 'homes', collector: 'e2e-travel-keys' });
    await page.keyboard.press('KeyM');
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu.locator('[data-tab="map"]')).toHaveAttribute('aria-selected', 'true');
    const nest = menu.locator('button.pin[data-place="nest"]');
    await nest.focus();
    await page.keyboard.press('Enter');
    await expect(nest).toHaveAttribute('aria-pressed', 'true');
    const go = menu.locator('[data-travel-card="nest"] [data-travel]');
    await go.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await inRoom(page, /^nest-/);
  });

  test('through the room server: the map stays with the owl, realm to realm, and a travel into the park without the gate is turned away', async ({ page }) => {
    test.skip(!isEdge(), 'the room server only');
    // In at the spawn the turnstiles let owls in at (walked through the gate), then on to the clearing.
    await openPark(page, { transport: 'edge', room: 'hub', spawn: 'default' });
    await expect.poll(async () => (await state(page)).travel, { timeout: 15_000 }).toEqual({ places: ['hub'], gate: true });
    await walkToDoor(page, 'to-grove');
    await inRoom(page, 'grove');
    // A new page for the same owl: the room server kept its map, and the gate walked through.
    await openPark(page, { transport: 'edge', room: 'market' });
    await expect.poll(async () => (await state(page)).travel, { timeout: 15_000 }).toEqual({ places: ['hub', 'grove', 'market'], gate: true });
    // Realm to realm.
    await travelTo(page, 'grove');
    await inRoom(page, 'grove');
    // Home: outside the park, so the room server forgets the gate.
    await travelTo(page, 'nest');
    await inRoom(page, /^nest-[a-z0-9]{8}$/);
    const home = (await state(page)).room;
    await expect.poll(async () => (await state(page)).travel.gate, { timeout: 15_000 }).toBe(false);
    // A page that still has the owl through the gate (as another screen's could): the room server
    // turns its travel away, and the owl is back home with the reason.
    await page.evaluate(() => {
      const scene = window.owlPark.game.scene.getScene('room') as unknown as { setTravel(s: { places: string[]; gate: boolean }): void };
      scene.setTravel({ places: ['hub', 'grove', 'market'], gate: true });
    });
    const card = await mapCard(page, 'grove');
    await expect(card.locator('[data-travel]')).toHaveText('Travel here');
    await card.locator('[data-travel]').press('Enter');
    await expect(page.getByText('Enter the park through the gate first.')).toBeVisible({ timeout: 20_000 });
    await inRoom(page, home);
    await expect.poll(async () => (await state(page)).travel.gate).toBe(false);
  });
});
