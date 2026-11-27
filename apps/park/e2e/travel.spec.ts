import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { confirmTravel, frames, mapCard, openPark, state, travelTo, walkToDoor } from './helpers';

/**
 * Travel from the Menu's map (OP-130). Every place is lit from the start (the owner's "whole map
 * unlocked", Nov 8), one walked into sparkles the first time the map shows it, and a card's button,
 * tapped and confirmed with Go (OP-385), travels there; the owl's own nest is always there. Into the park only through
 * the front gate: a place inside the park offers the gate instead until the owl has walked through
 * the turnstiles, and going home puts it outside again. On this device (the local mode), and through
 * the room server, which keeps the map with the owl and turns a travel in away without the gate.
 */

const isEdge = () => test.info().project.name === 'edge';

async function inRoom(page: Page, room: string | RegExp): Promise<void> {
  await expect.poll(async () => (await state(page)).room, { timeout: 20_000 }).toMatch(room);
}

/** A travel button tapped (or clicked), then Go on the question it asks (OP-385: a tap and a confirm, no hold). */
async function tapAndGo(button: Locator): Promise<void> {
  const to = await button.getAttribute('data-travel');
  await button.click();
  const go = button.page().locator(`[data-travel-go="${to}"]`);
  await expect(go).toBeVisible();
  await go.click();
}

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
  test('every place is lit from the start, one walked into sparkles once; its card, tapped and confirmed, travels there; the nest is always there', async ({ page }) => {
    test.skip(isEdge(), 'on this device; through the room server below');
    await openPark(page, { room: 'homes', collector: `e2e-travel-lit-${test.info().project.name}` });
    const menu = page.getByRole('dialog', { name: 'Menu' });
    // Only the street is walked into, and still the gate is lit and its card travels there.
    let card = await mapCard(page, 'lobby');
    await expect(card.locator('[data-travel]')).toHaveText('Travel to the gate');
    await expect(menu.locator('button.pin[data-place="homes"]')).toHaveAttribute('data-lit', '');
    await expect(menu.locator('button.pin[data-place="lobby"]')).toHaveAttribute('data-lit', '');
    await expect(menu.locator('button.pin.unlit')).toHaveCount(0);
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
    // The marks have a legend while the map shows them (OP-468), and the card says what is there (OP-469).
    await expect(menu.locator('.mlegend [data-mark="new"]')).toBeVisible();
    await expect(menu.locator('.mlegend [data-mark="here"]')).toBeVisible();
    await expect(menu.locator('.mlegend [data-mark="closed"]')).toBeVisible();
    await expect(card.locator('[data-place-line]')).toHaveText('The street of nests, where owls open theirs to visitors.');
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-travel-map.png` });

    // Tapped and confirmed, the street's card travels there: the Menu closes and the owl lands where walking in would.
    const button = card.locator('[data-travel="homes"]');
    await expect(button).toHaveText('Travel here');
    await tapAndGo(button);
    await expect(menu).toBeHidden();
    await inRoom(page, 'homes');
    // And home from there, before its mirror; the gate sparkles no more.
    card = await mapCard(page, 'nest');
    await expect(menu.locator('.spark')).toHaveCount(0);
    await tapAndGo(card.locator('[data-travel="nest"]'));
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
    await confirmTravel(card);
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

  test('on the new map an owl still in the Party Grove is signed back into the Great Hollow, one sign at a time, and the map has no Party Grove since it folded in (Nov 21)', async ({ page }) => {
    test.skip(isEdge(), 'on this device');
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('owl-park-map', '3');
      } catch {
        // A browser that keeps nothing walks today's park.
      }
    });
    await openPark(page, { room: 'hub', spawn: 'default', collector: `e2e-travel-grove-${test.info().project.name}` });
    await expect.poll(async () => (await state(page)).doorSigns, { timeout: 15_000 }).toContain('Back into the Great Hollow');
    // One doorway at a time is named (OP-309): the way back, which the owl lands beside, and no chips for the
    // rest at the screen's edges, on a phone or a computer.
    await expect.poll(async () => (await state(page)).signShown, { timeout: 10_000 }).toBe('Back into the Great Hollow');
    expect(await page.locator('#hud .hint').count()).toBeLessThanOrEqual(1);
    // Through the trunk's door into the Great Hollow, where the door grew over behind it: its owls and games
    // are in the hall now, so the map has no Party Grove to travel back to, and the hall no sign out to it.
    await walkToDoor(page, 'to-lobby');
    await inRoom(page, 'm3-hall');
    expect((await state(page)).doors.some((d) => d.id === 'to-party')).toBe(false);
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await page.locator('[data-menu-btn]').click();
    await menu.locator('[data-tab="map"]').click();
    await expect(menu.locator('button.pin[data-place="m3-hall"]')).toBeVisible();
    await expect(menu.locator('button.pin[data-place="hub"]')).toHaveCount(0);
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
    // Enter asks once (OP-385): the button's words as the question, Go holding the focus; Not now puts it back.
    await page.keyboard.press('Enter');
    const ask = menu.locator('[data-travel-card="nest"] [data-travel-ask="nest"]');
    await expect(ask).toBeVisible();
    await expect(ask).toContainText('Travel home?');
    await expect(ask.locator('[data-travel-go="nest"]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(ask.locator('[data-travel-stay]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(ask).toBeHidden();
    await expect(go).toBeFocused();
    await expect(menu).toBeVisible();
    expect((await state(page)).room).toBe('homes');
    // Enter, and Enter on Go: the owl goes.
    await page.keyboard.press('Enter');
    await expect(ask.locator('[data-travel-go="nest"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await inRoom(page, /^nest-/);
  });

  test('the new map has all three courses by name; a tap and Go, or Enter and Enter, travels to each, and inside one You are here names it (OP-385)', async ({ page, isMobile }) => {
    test.skip(isEdge(), 'on this device');
    test.slow(); // four rooms drawn with software WebGL on CI runners
    // A phone on its side, as a course plays: held upright, a course shows only the turn-your-phone card
    // (OP-155), which lies over the Menu button.
    if (isMobile) await page.setViewportSize({ width: 915, height: 412 });
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('owl-park-map', '3');
      } catch {
        // A browser that keeps nothing walks today's park.
      }
    });
    // In the Great Hollow, just through the Treetop Commons' turnstiles.
    await openPark(page, { room: 'm3-hall', spawn: 'from-lobby', collector: `e2e-travel-courses-${test.info().project.name}` });
    await expect.poll(async () => (await state(page)).travel.gate).toBe(true);
    const menu = page.getByRole('dialog', { name: 'Menu' });
    let card = await mapCard(page, 'brush-1');
    // Every course by its own name, and the places by the names the rooms' signs use.
    const names: Array<[string, string]> = [
      ['brush-1', 'Brushstroke Bridges'],
      ['canopy-1', 'Updraft Canopy'],
      ['circuit-1', 'Blackout Circuit'],
      ['lobby', 'The Treetop Commons'],
      ['m3-hall', 'The Great Hollow'],
      ['ink', 'The ink garden'],
    ];
    for (const [place, name] of names) await expect(menu.locator(`button.pin[data-place="${place}"] .name`), place).toHaveText(name);
    // The line under the map says what a tap does: no hold.
    await expect(menu.getByText('Tap a place, then its travel button, then Go.', { exact: false })).toBeVisible();
    await expect(menu.getByText(/\bhold\b/i)).toHaveCount(0);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-travel-courses-map.png` });

    // A tap on Travel here asks once; a tap on Go travels, with no hold.
    const button = card.locator('[data-travel="brush-1"]');
    await expect(button).toHaveText('Travel here');
    if (isMobile) await button.tap();
    else await button.click();
    await expect(card.locator('[data-travel-ask="brush-1"]')).toContainText('Travel here?');
    expect((await state(page)).room).toBe('m3-hall');
    const go = card.locator('[data-travel-go="brush-1"]');
    if (isMobile) await go.tap();
    else await go.click();
    await expect(menu).toBeHidden();
    await inRoom(page, 'brush-1');

    // Inside Brushstroke Bridges the map says so, not the ink garden.
    card = await mapCard(page, 'brush-1');
    const here = menu.locator('button.pin.here');
    await expect(here).toHaveCount(1);
    await expect(here).toHaveAttribute('data-place', 'brush-1');
    await expect(here).toContainText('Brushstroke Bridges');
    await expect(here).toContainText('You are here');
    await expect(card).toContainText('You are here.');
    await expect(card.locator('[data-travel]')).toHaveCount(0);

    // By keys: Enter on Travel here, Enter on Go, to the other two courses in turn.
    await travelTo(page, 'canopy-1');
    await inRoom(page, 'canopy-1');
    await travelTo(page, 'circuit-1');
    await inRoom(page, 'circuit-1');
  });

  test('each course has its own mark on the map, and Walk there walks the owl on foot, room by room, with the feathers leading (OP-513)', async ({ page, isMobile }) => {
    test.skip(isEdge(), 'on this device');
    test.slow(); // three rooms drawn with software WebGL on CI runners
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('owl-park-map', '3');
      } catch {
        // A browser that keeps nothing walks today's park.
      }
    });
    // On the nests' street: the Treetop Commons is one doorway away, on foot.
    await openPark(page, { room: 'homes', collector: `e2e-travel-walk-${test.info().project.name}` });
    const menu = page.getByRole('dialog', { name: 'Menu' });
    let card = await mapCard(page, 'lobby');
    // The three courses each with a mark of its own; no realm or other place has one.
    for (const course of ['brush-1', 'canopy-1', 'circuit-1']) {
      const mark = menu.locator(`button.pin[data-place="${course}"] [data-course-icon="${course}"]`);
      await expect(mark, course).toBeVisible();
      await expect(mark).toHaveAttribute('aria-label', /^Course: /);
    }
    await expect(menu.locator('[data-course-icon]')).toHaveCount(3);
    await expect(menu.locator('button.pin[data-place="ink"] [data-course-icon]')).toHaveCount(0);
    await page.screenshot({ path: `e2e-screenshots/${test.info().project.name}-travel-walk-map.png` });
    // The card offers Walk there beside its travel button; one press closes the Menu and the owl walks.
    const walk = card.locator('[data-walk="lobby"]');
    await expect(walk).toHaveText('Walk there');
    await expect(card.locator('[data-travel]')).toBeVisible();
    const thrown: string[] = [];
    page.on('pageerror', (e) => thrown.push(e.message));
    if (isMobile) await walk.tap();
    else await walk.click();
    // Closed, or why not: the card's line when the walk was refused, an error thrown by the press, or the room the owl is in.
    await expect
      .poll(async () => {
        if (!(await menu.isVisible())) return 'closed';
        const line = card.locator('[data-travel-line]');
        const said = (await line.isVisible()) ? await line.textContent() : null;
        return `open; card says ${JSON.stringify(said)}; thrown ${JSON.stringify(thrown)}; in ${(await state(page)).room}; walk still shown ${await walk.isVisible()}`;
      }, { timeout: 10_000 })
      .toBe('closed');
    await expect.poll(async () => (await state(page)).lead).toEqual({ place: 'lobby', room: 'lobby', next: 'lobby' });
    // Walked in, not travelled: the street's doorway takes the owl into the Treetop Commons, and the walk ends there.
    await inRoom(page, 'lobby');
    await expect(page.getByText('Here you are.')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await state(page)).lead).toBeNull();
    // Where the owl stands, the card offers no walk.
    card = await mapCard(page, 'lobby');
    await expect(card.locator('[data-walk]')).toHaveCount(0);
    await page.keyboard.press('Escape');

    // In the Great Hollow, by keys: Enter on Walk there leads to the Blackout Circuit's doorway, the feathers to it.
    await openPark(page, { room: 'm3-hall', spawn: 'from-lobby', collector: `e2e-travel-walk-${test.info().project.name}` });
    card = await mapCard(page, 'circuit-1');
    const there = card.locator('[data-walk="circuit-1"]');
    await there.focus();
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect.poll(async () => (await state(page)).lead).toEqual({ place: 'circuit-1', room: 'circuit-1', next: 'circuit-1' });
    await expect.poll(async () => (await state(page)).walking, { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => (await state(page)).trail?.glints ?? [], { timeout: 10_000 }).toEqual(['course-market']);
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
    // Realm to realm, trip after trip (OP-358): the room server has the owl through the gate from the rooms it let it into.
    await travelTo(page, 'grove');
    await inRoom(page, 'grove');
    await travelTo(page, 'market');
    await inRoom(page, 'market');
    await travelTo(page, 'grove');
    await inRoom(page, 'grove');
    await expect.poll(async () => (await state(page)).travel.gate, { timeout: 15_000 }).toBe(true);
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
    await confirmTravel(card);
    await expect(page.getByText('Enter the park through the gate first.')).toBeVisible({ timeout: 20_000 });
    await inRoom(page, home);
    await expect.poll(async () => (await state(page)).travel.gate).toBe(false);
  });

  test('with the room out of reach the map still travels, trip after trip, once the owl has walked through the turnstiles (OP-358)', async ({ page }) => {
    test.skip(!isEdge(), 'a page the Worker answers while no room lets its owl in');
    test.slow(); // five rooms come into, each one's art drawn before the Worker is asked: 49 s on a quiet runner
    // A network that lets pages through and not sockets: every room's socket closes as it opens, while
    // the Worker goes on answering. It has seen this owl walk into no room, so its map says "not
    // through the gate"; the page, which walked the owl through, is the one that knows.
    await page.routeWebSocket(/\/ws\//, (ws) => ws.close());
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem('owl-park-map', '3');
      } catch {
        // A browser that keeps nothing walks today's park.
      }
    });
    /**
     * The Worker's answer about the map, asked as each room is come into: the test goes on only once the page has had it.
     * Asked only once the room's art is drawn, in software on a CI runner: a busy runner has taken over 30 s for the
     * treehouse clearing, so the wait is 60 s, and one that runs out says where the page was.
     */
    const mapAnswered = () =>
      page.waitForResponse((r) => r.url().includes('/api/travel'), { timeout: 60_000 }).catch(async (e: unknown) => {
        const s = await page.evaluate(() => window.owlPark?.state() ?? null).catch(() => null);
        const where = s ? { room: s.room, connected: s.connected, travel: s.travel } : 'no room scene';
        throw new Error(`no answer from /api/travel within 60 s; the page: ${JSON.stringify(where)}`, { cause: e });
      });
    let answered = mapAnswered();
    // At the front gate, outside the turnstiles, wandering alone.
    const q = new URLSearchParams({ transport: 'edge', room: 'lobby', kit: '0', art: 'old' });
    await page.goto(`/?${q.toString()}`);
    await page.waitForFunction(() => window.owlPark?.state()?.connected === true, null, { timeout: 20_000 });
    await expect(page.locator('[data-dot][data-status]')).toHaveAttribute('data-status', 'offline', { timeout: 20_000 });
    await answered;
    expect((await state(page)).travel.gate).toBe(false);
    // Through the turnstiles into the Great Hollow: the page knows it is through.
    answered = mapAnswered();
    await walkToDoor(page, 'gate');
    await inRoom(page, 'm3-hall');
    await answered;
    await frames(page, 3);
    expect((await state(page)).travel.gate, 'in the Great Hollow, through the turnstiles').toBe(true);
    // Three trips in a row inside the park, each made after the Worker's answer for the room before it.
    for (const place of ['grove', 'glass', 'market']) {
      answered = mapAnswered();
      await travelTo(page, place);
      await inRoom(page, place);
      await answered;
      await frames(page, 3);
      expect((await state(page)).travel.gate, `in ${place}, after the Worker's answer`).toBe(true);
    }
  });
});
