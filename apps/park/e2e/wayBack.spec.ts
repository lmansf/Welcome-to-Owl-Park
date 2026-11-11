import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { frames, openPark, state, walkAndStop, walkToDoor } from './helpers';

/**
 * The way back waits for a fresh push (doors.ts, backWaits). An owl walked through a doorway with a
 * walking key or the thumbstick held is still holding it as the next room comes in. Where the two rooms'
 * doorways lie the same way (up into the turnstiles and up into the knothole they open on; up out of a
 * nest and up into its door on the street), that same push walked it straight back out, and in again,
 * for as long as it was held: a thumb kept on the stick out of a nest swapped nest and street about once
 * a second. Now the owl stops at the foot of the doorway it came in by, and goes back through it once the
 * key has been let go and pressed again.
 */

/**
 * The doorways' near edges (room px, rooms/hollowHall.ts and rooms/index.ts): an owl stopped before one
 * stands below it. The knothole's is taken from the room (its doorway's middle, and half its depth).
 */
const KNOTHOLE_HALF = 40;
const TURNSTILES_FOOT = 714;
const NEST_DOOR_FOOT = 716;

/** Where an owl lands by each doorway (the rooms' spawns), which it walks up from with the key held. */
const KNOTHOLE_LANDING = 190;
const BY_TURNSTILES = 800;
const BY_NEST_DOOR = 752;

const inRoom = (page: Page, room: string | RegExp) =>
  expect.poll(async () => (await state(page)).room, { timeout: 30_000 }).toMatch(room instanceof RegExp ? room : new RegExp(`^${room}$`));

/**
 * With a key still held: the owl has walked up from where it landed (`from`) as far as the key takes it
 * in `room`, and stands. Before this change it never stood there: the key walked it on into the doorway.
 */
async function standsBefore(page: Page, room: string, from: number, foot: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const s = await state(page);
        return s.room === room && s.connected && !s.walking && s.pos.y < from - 6;
      },
      { timeout: 30_000, intervals: [100] },
    )
    .toBe(true);
  const s = await state(page);
  expect(s.pos.y, 'outside the doorway, at its foot').toBeGreaterThan(foot);
  // And stays there while the key is held: no room change comes.
  await frames(page, 30);
  expect((await state(page)).room).toBe(room);
}

// Room changes, each one a room's art drawn with software WebGL on a CI runner.
test.describe.configure({ timeout: 120_000 });

test.describe('the way back waits for a fresh push', () => {
  test('up held through the turnstiles leaves the owl in the Great Hollow, at the foot of the knothole; let go and pressed again, it goes back up and stops under the turnstiles', async ({ page }) => {
    // A keeper's tab that asks for the new map walks it: the turnstiles open on the Great Hollow.
    await openPark(page, { room: 'lobby', keeper: '1', newmap: '1' });
    await walkAndStop(page, 2595, BY_TURNSTILES);
    await page.keyboard.down('ArrowUp');
    await inRoom(page, 'm3-hall');
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    const knothole = (await state(page)).doors.find((d) => d.id === 'up')!;
    await standsBefore(page, 'm3-hall', knothole.y + KNOTHOLE_LANDING, knothole.y + KNOTHOLE_HALF);

    // Let go: the owl stays where it stands, and the knothole is open to it again.
    await page.keyboard.up('ArrowUp');
    await frames(page, 20);
    expect((await state(page)).room).toBe('m3-hall');

    // A fresh push takes it: up to the Treetop Commons, where the same held key stops it under the turnstiles.
    await page.keyboard.down('ArrowUp');
    await inRoom(page, 'lobby');
    await standsBefore(page, 'lobby', BY_TURNSTILES, TURNSTILES_FOOT);
    await page.keyboard.up('ArrowUp');
  });

  test('up held out of its nest leaves the owl on the street, before its own door', async ({ page }) => {
    await openPark(page, { room: 'homes', collector: `e2e-way-back-${test.info().project.name}` });
    await walkToDoor(page, 'nest-door-0');
    await inRoom(page, /^nest-/);
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    // Under the nest's door out, then up and held.
    const out = (await state(page)).doors.find((d) => d.id === 'to-street')!;
    await walkAndStop(page, out.x, out.y + 60);
    await page.keyboard.down('ArrowUp');
    await inRoom(page, 'homes');
    await standsBefore(page, 'homes', BY_NEST_DOOR, NEST_DOOR_FOOT);
    await page.keyboard.up('ArrowUp');

    // Let go and pressed again, up takes it back into its nest, where the same held key leaves it: the nest's door is the way back now.
    await page.keyboard.down('ArrowUp');
    await inRoom(page, /^nest-/);
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    await frames(page, 60);
    expect((await state(page)).room).toMatch(/^nest-/);
    await page.keyboard.up('ArrowUp');
  });

  test('the thumbstick pushed up and held out of its nest leaves the owl on the street too', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the stick is for touch screens');
    await openPark(page, { room: 'homes', collector: `e2e-way-back-stick-${test.info().project.name}` });
    await walkToDoor(page, 'nest-door-0');
    await inRoom(page, /^nest-/);
    await page.waitForFunction(() => window.owlPark.state()?.connected === true);
    const out = (await state(page)).doors.find((d) => d.id === 'to-street')!;
    await walkAndStop(page, out.x, out.y + 60);
    // A thumb on the stick, pushed up and kept there through the room change (the browser's own touch screen, as stick.spec.ts).
    const cdp = await page.context().newCDPSession(page);
    const box = (await page.locator('#hud .stick').boundingBox())!;
    const thumb = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 0 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [thumb] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...thumb, y: thumb.y - 40 }] });
    await inRoom(page, 'homes');
    await standsBefore(page, 'homes', BY_NEST_DOOR, NEST_DOOR_FOOT);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...thumb, y: thumb.y - 40 }] });
    // Let go, the owl stays on the street.
    await frames(page, 20);
    expect((await state(page)).room).toBe('homes');
  });
});
