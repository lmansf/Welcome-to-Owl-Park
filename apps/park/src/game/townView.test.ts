import { describe, expect, it } from 'vitest';
import { ROOM_H, seenFromSide } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { OPENING, RISE_HEAD, TOWN_VIEW, coverZoom, lookBetween, openingAt, openingOver, restAt, riseBack, screenZoom, townZoom, wholeLook, wholeZoom, type Size } from './townView';

const HALL = ROOMS['m3-hall']!.size;
const LOBBY = ROOMS['lobby']!.size;

/** Screens as the game sees them: its own pixels, and how many make a CSS pixel. */
const SCREENS: ReadonlyArray<{ name: string; screen: Size; ratio: number }> = [
  { name: 'a computer, 1440x900', screen: { w: 1440, h: 900 }, ratio: 1 },
  { name: 'a small computer, 1024x768', screen: { w: 1024, h: 768 }, ratio: 1 },
  { name: 'a wide computer, 2560x1080', screen: { w: 2560, h: 1080 }, ratio: 1 },
  { name: 'a phone upright, 390x844', screen: { w: 780, h: 1688 }, ratio: 2 },
  { name: 'a phone sideways, 844x390', screen: { w: 1688, h: 780 }, ratio: 2 },
  { name: 'a small phone sideways, 640x360', screen: { w: 1280, h: 720 }, ratio: 2 },
  { name: 'a small phone upright, 360x640', screen: { w: 720, h: 1280 }, ratio: 2 },
  { name: 'a tablet upright, 768x1024', screen: { w: 1536, h: 2048 }, ratio: 2 },
];

/** What a zoom shows of a room, in room px. */
const shown = (screen: Size, zoom: number) => ({ w: screen.w / zoom, h: screen.h / zoom });

describe('the town view (OP-336)', () => {
  it('without it a screen shows one screen of a room down, as it always has', () => {
    expect(screenZoom(HALL, { w: 1440, h: 900 })).toBe(900 / ROOM_H);
    expect(shown({ w: 1440, h: 900 }, screenZoom(HALL, { w: 1440, h: 900 }))).toEqual({ w: 1440, h: 900 });
    // A phone held upright sees 416 room px of the Great Hollow across, a sliver of it.
    expect(Math.round(shown({ w: 780, h: 1688 }, screenZoom(HALL, { w: 780, h: 1688 })).w)).toBe(416);
  });

  it('a computer sees a screen and two thirds of the Great Hollow down, and more of it across', () => {
    const screen = { w: 1440, h: 900 };
    const zoom = townZoom(HALL, screen, 1);
    expect(shown(screen, zoom)).toEqual({ w: 2400, h: TOWN_VIEW.depth });
    expect(zoom).toBeCloseTo(0.6);
    expect(shown({ w: 1024, h: 768 }, townZoom(HALL, { w: 1024, h: 768 }, 1)).h).toBeCloseTo(TOWN_VIEW.depth);
  });

  it('a phone held upright sees 900 px of the Great Hollow across, where it saw 416', () => {
    const screen = { w: 780, h: 1688 };
    const view = shown(screen, townZoom(HALL, screen, 2));
    expect(view.w).toBeCloseTo(TOWN_VIEW.across);
    expect(view.h).toBeLessThanOrEqual(HALL.h);
  });

  it('in a room too shallow for that, an upright phone sees its whole depth and no further', () => {
    const screen = { w: 780, h: 1688 };
    const view = shown(screen, townZoom(LOBBY, screen, 2));
    expect(view.h).toBeCloseTo(LOBBY.h);
    expect(Math.round(view.w)).toBe(624);
  });

  it('a room a screen and a half deep or less shows its whole depth on a computer', () => {
    for (const id of ['hub', 'grove', 'market', 'arcade', 'lobby', 'homes']) {
      const room = ROOMS[id]!.size;
      expect(room.h, id).toBeLessThanOrEqual(TOWN_VIEW.depth);
      expect(shown({ w: 1440, h: 900 }, townZoom(room, { w: 1440, h: 900 }, 1)).h, id).toBeCloseTo(room.h);
    }
  });

  it('never draws an owl smaller than a phone held sideways draws it today', () => {
    // 844x390: 0.433 CSS px a room px today; the town view stops at 0.42.
    const screen = { w: 1688, h: 780 };
    expect(townZoom(HALL, screen, 2) / 2).toBeCloseTo(TOWN_VIEW.minCss);
    for (const s of SCREENS) {
      const today = screenZoom(HALL, s.screen) / s.ratio;
      expect(townZoom(HALL, s.screen, s.ratio) / s.ratio, s.name).toBeGreaterThanOrEqual(Math.min(today, TOWN_VIEW.minCss) - 1e-9);
    }
  });

  it('on every screen, in every room seen from above: never less of the room than today, never past its edges', () => {
    const rooms = Object.values(ROOMS).filter((r) => !seenFromSide(r));
    expect(rooms.length).toBeGreaterThan(8);
    for (const room of rooms) {
      for (const s of SCREENS) {
        const zoom = townZoom(room.size, s.screen, s.ratio);
        const what = `${room.id} on ${s.name}`;
        expect(zoom, what).toBeLessThanOrEqual(screenZoom(room.size, s.screen) + 1e-9);
        expect(zoom, what).toBeGreaterThanOrEqual(coverZoom(room.size, s.screen) - 1e-9);
      }
    }
  });

  it('a room one screen deep is seen as it is today', () => {
    for (const room of [{ w: 1600, h: 900 }, { w: 4800, h: 900 }]) {
      for (const s of SCREENS) expect(townZoom(room, s.screen, s.ratio), s.name).toBeCloseTo(screenZoom(room, s.screen));
    }
  });

  it('a phone too small to show more without shrinking its owls keeps the view it has', () => {
    // 640x360 sideways draws a room px at 0.4 CSS px today, already under the town view's smallest.
    const screen = { w: 1280, h: 720 };
    expect(townZoom(HALL, screen, 2)).toBeCloseTo(screenZoom(HALL, screen));
  });
});

describe('the opening look over the Great Hollow (OP-336)', () => {
  it('the whole oval fits the screen', () => {
    for (const s of SCREENS) {
      const view = shown(s.screen, wholeZoom(HALL, s.screen));
      expect(view.w, s.name).toBeGreaterThanOrEqual(HALL.w - 1e-6);
      expect(view.h, s.name).toBeGreaterThanOrEqual(HALL.h - 1e-6);
    }
    expect(wholeZoom(HALL, { w: 1440, h: 900 })).toBeCloseTo(1440 / HALL.w);
  });

  it('holds on the whole room, then eases in on the owl, never drawing back again', () => {
    expect(openingAt(0)).toBe(1);
    expect(openingAt(OPENING.holdMs)).toBe(1);
    expect(openingAt(OPENING.holdMs + OPENING.easeMs / 2)).toBeCloseTo(0.5);
    expect(openingAt(OPENING.holdMs + OPENING.easeMs)).toBe(0);
    expect(openingOver(OPENING.holdMs + OPENING.easeMs)).toBe(true);
    expect(openingOver(OPENING.holdMs + OPENING.easeMs - 1)).toBe(false);
    let last = 1;
    for (let ms = 0; ms <= OPENING.holdMs + OPENING.easeMs + 50; ms += 10) {
      const k = openingAt(ms);
      expect(k).toBeLessThanOrEqual(last + 1e-12);
      last = k;
    }
  });

  it("the player's first move ends it within a quarter of a second, from wherever it was, with no jump", () => {
    for (const cutAt of [0, 200, OPENING.holdMs, OPENING.holdMs + 400, OPENING.holdMs + OPENING.easeMs - 30]) {
      // No jump at the move itself.
      expect(openingAt(cutAt, cutAt), `at ${cutAt}`).toBeCloseTo(openingAt(cutAt));
      expect(openingAt(cutAt + OPENING.cutMs, cutAt), `at ${cutAt}`).toBe(0);
      let last = openingAt(cutAt, cutAt);
      for (let ms = cutAt; ms <= cutAt + OPENING.cutMs; ms += 10) {
        const k = openingAt(ms, cutAt);
        expect(k).toBeLessThanOrEqual(last + 1e-12);
        // Never slower than it would have eased in anyway.
        expect(k).toBeLessThanOrEqual(openingAt(ms) + 1e-12);
        last = k;
      }
    }
    // A move after it is over changes nothing.
    expect(openingAt(5000, 4000)).toBe(0);
  });

  it('mixes the two looks: the zoom by ratio, the middle of the screen straight across', () => {
    const near = { zoom: 0.6, x: 3200, y: 673 };
    const far = { zoom: 0.225, x: 3200, y: 1400 };
    expect(lookBetween(near, far, 0)).toEqual(near);
    const whole = lookBetween(near, far, 1);
    expect(whole.zoom).toBeCloseTo(far.zoom);
    expect(whole.y).toBeCloseTo(far.y);
    const half = lookBetween(near, far, 0.5);
    expect(half.zoom).toBeCloseTo(Math.sqrt(0.6 * 0.225));
    expect(half.y).toBeCloseTo((673 + 1400) / 2);
    // Out of range is held to the ends.
    expect(lookBetween(near, far, -1)).toEqual(near);
    expect(lookBetween(near, far, 2).zoom).toBeCloseTo(far.zoom);
  });

  it('rests where the following camera does: on the owl, held inside the room', () => {
    const bounds = { x: 0, y: -77, w: 6400, h: 2800 + 77 + 107 };
    const view = { w: 2400, h: 1500 };
    // By the knothole at the back: the view stops at the top of the room (and what the HUD covers past it).
    expect(restAt({ x: 3200, y: 220 }, view, bounds)).toEqual({ x: 3200, y: -77 + 750 });
    // Out on the floor: on the owl.
    expect(restAt({ x: 3000, y: 1400 }, view, bounds)).toEqual({ x: 3000, y: 1400 });
    // At the east end: the view stops at the room's side.
    expect(restAt({ x: 6300, y: 1400 }, view, bounds).x).toBe(6400 - 1200);
    // A view bigger than the bounds rests at their start, as the camera does.
    expect(restAt({ x: 100, y: 100 }, { w: 8000, h: 4000 }, bounds)).toEqual({ x: 4000, y: -77 + 2000 });
  });
});

describe('the camera on an owl riding a thermal (OP-340)', () => {
  const top = ROOMS['m3-hall']!.thermals![0]!.top;

  it('draws back with the owl’s height: not at all where the thermal took it, all the way at the top', () => {
    const from = 150;
    expect(riseBack(from, top, from)).toBe(0);
    expect(riseBack(top, top, from)).toBe(1);
    expect(riseBack((from + top) / 2, top, from)).toBeCloseTo(0.5);
    // Below where it was taken (a glide nearly down): none, and never less than none or more than all.
    expect(riseBack(40, top, from)).toBe(0);
    expect(riseBack(top + 200, top, from)).toBe(1);
    let last = 0;
    for (let z = from; z <= top; z += 10) {
      const k = riseBack(z, top, from);
      expect(k).toBeGreaterThanOrEqual(last);
      last = k;
    }
    // A thermal no higher than where it took the owl draws nothing back.
    expect(riseBack(300, 200, 250)).toBe(0);
  });

  it('at the top shows the whole room and the air over its back wall, where an owl that high is drawn', () => {
    for (const s of SCREENS) {
      const look = wholeLook(HALL, s.screen, RISE_HEAD);
      const view = shown(s.screen, look.zoom);
      const y0 = look.y - view.h / 2;
      // The room from side to side and front to back, and RISE_HEAD over it.
      expect(view.w, s.name).toBeGreaterThanOrEqual(HALL.w - 1e-6);
      expect(y0, s.name).toBeLessThanOrEqual(-RISE_HEAD + 1e-6);
      expect(y0 + view.h, s.name).toBeGreaterThanOrEqual(HALL.h - 1e-6);
      expect(look.x).toBe(HALL.w / 2);
    }
    // With no air asked for it is the opening look's: the whole room, about its middle.
    expect(wholeLook(HALL, { w: 1440, h: 900 })).toEqual({ zoom: wholeZoom(HALL, { w: 1440, h: 900 }), x: HALL.w / 2, y: HALL.h / 2 });
    // An owl hovering at the top over the heart is on screen: drawn its height up the room from the heart.
    const heart = ROOMS['m3-hall']!.thermals![0]!.pos;
    expect(heart.y - top).toBeGreaterThan(-RISE_HEAD);
  });
});
