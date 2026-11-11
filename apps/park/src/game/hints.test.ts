import { describe, expect, it } from 'vitest';
import { ROOMS, groundOf } from '@owl-park/shared/rooms';
import { SIDE_HINT_OVER, SIGN_HOLD, SIGN_REACH, doorHintTarget, nearTargets, nearestOffSides, placeHints, signFocus, signWaits, signX, touchBottom, type ScreenBox, type ViewRect } from './hints';

// A 1000 x 600 screen showing room pixels 1000-2000 by 0-600 (one CSS pixel per room pixel).
const view: ViewRect = { x: 1000, y: 0, w: 1000, h: 600 };
const screen: ScreenBox = { w: 1000, h: 600, top: 50, bottom: 50, side: 30 };

describe('placeHints', () => {
  it('shows nothing for a target on screen', () => {
    expect(placeHints([{ id: 'door', x: 1500, y: 300 }], view, screen)).toEqual([]);
  });

  it('puts a chip on the right edge, pointing right, for a target off to the right', () => {
    const [p] = placeHints([{ id: 'door', x: 3000, y: 300 }], view, screen);
    expect(p).toMatchObject({ id: 'door', x: 970, y: 300 });
    expect(p!.angle).toBeCloseTo(0);
  });

  it('puts a chip on the left edge, pointing left, for a target off to the left', () => {
    const [p] = placeHints([{ id: 'door', x: 200, y: 300 }], view, screen);
    expect(p!.x).toBe(30);
    expect(Math.abs(p!.angle)).toBeCloseTo(Math.PI);
  });

  it('follows the line toward the target, so a target low and to the right sits low on the right edge', () => {
    const [p] = placeHints([{ id: 'door', x: 2400, y: 580 }], view, screen);
    expect(p!.x).toBe(970);
    expect(p!.y).toBeGreaterThan(300);
    expect(p!.y).toBeLessThanOrEqual(550);
    expect(p!.angle).toBeGreaterThan(0);
  });

  it('meets the top edge for a target far above', () => {
    const tall: ViewRect = { x: 0, y: 900, w: 1000, h: 600 };
    const [p] = placeHints([{ id: 'spot', x: 500, y: 100 }], tall, screen);
    expect(p!.y).toBe(50);
    expect(p!.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('keeps chips on the same edge apart, inside the edge', () => {
    const ps = placeHints(
      [
        { id: 'a', x: 3000, y: 300 },
        { id: 'b', x: 3000, y: 305 },
        { id: 'c', x: 3000, y: 310 },
      ],
      view,
      screen,
      52,
    );
    const ys = ps.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[1]! - ys[0]!).toBeGreaterThanOrEqual(52);
    expect(ys[2]! - ys[1]!).toBeGreaterThanOrEqual(52);
    expect(Math.max(...ys)).toBeLessThanOrEqual(550);
  });
});

describe('hints seen from the side (an Updraft Canopy room, as an owl stands by the hatch up)', () => {
  const ROOM = ROOMS['canopy-2a']!;
  const GROUND = groundOf(ROOM);
  const HATCH = ROOM.doors.find((d) => d.id === 'hatch-up')!;
  const HATCH_TOP = HATCH.top!;
  // The hatch's ledge filling a phone held sideways: the room's width, about 540 room px high.
  const owlAt = GROUND - HATCH_TOP;
  const phone: ViewRect = { x: 0, y: owlAt - 400, w: 1600, h: 540 };
  const doorways = ROOM.doors.filter((d) => d.to);

  it('points at each doorway on its own ledge, not at the floor its rect lies on', () => {
    expect(doorHintTarget(HATCH, GROUND).y).toBe(GROUND - HATCH_TOP - SIDE_HINT_OVER);
    expect(doorHintTarget(HATCH, null).y).toBe(HATCH.rect.y + HATCH.rect.h / 2);
  });

  it('shows no chip for the hatch the owl stands under, and one for the way down on the floor below', () => {
    const near = nearTargets(doorways.map((d) => doorHintTarget(d, GROUND)), phone, 900);
    const places = placeHints(near, phone, { w: 844, h: 330, top: 64, bottom: touchBottom(190, 330), side: 30 });
    expect(places.map((p) => p.id)).toEqual(['down']);
    expect(places[0]!.angle).toBeGreaterThan(0); // pointing down
  });

  it('on the floor, points at its own doorway and the hatch up on its ledge', () => {
    const floor: ViewRect = { x: 0, y: GROUND - 400, w: 1600, h: 540 };
    const near = nearTargets(doorways.map((d) => doorHintTarget(d, GROUND)), floor, 900);
    expect(near.map((t) => t.id).sort()).toEqual(['down', 'hatch-up']);
  });

  it("keeps a phone's bottom inset to a quarter of a short screen, and the full inset on a tall one", () => {
    expect(touchBottom(190, 330)).toBe(83);
    expect(touchBottom(190, 900)).toBe(190);
  });
});

describe('hints seen from above (the Great Hollow, a huge oval of doorways)', () => {
  const HALL = ROOMS['m3-hall']!;
  const doorways = HALL.doors.filter((d) => d.to).map((d) => doorHintTarget(d, null));
  // A phone held upright at the glass realm's doorway, at the back of the oval: about 500 room px across.
  const phone: ViewRect = { x: 1730, y: 100, w: 500, h: 700 };

  it('points at the nearest two doorways off each side, not at every doorway round the room', () => {
    expect(doorways.filter((t) => t.x > phone.x + phone.w).length).toBeGreaterThan(4);
    const near = nearestOffSides(doorways, phone);
    // East of it, the hatch down and the knothole up; west, the ink-wash course's gate (the glass
    // course's gate and the ink-wash realm's doorway are shut, so they have no chip).
    expect(near.filter((t) => t.x > phone.x + phone.w).map((t) => t.id)).toEqual(['up', 'down']);
    expect(near.filter((t) => t.x < phone.x).map((t) => t.id)).toEqual(['course-ink']);
  });

  it('always keeps a doorway it is told to keep, however far', () => {
    const near = nearestOffSides(doorways, phone, 2, new Set(['to-party']));
    expect(near.map((t) => t.id)).toContain('to-party');
  });
});

describe('one doorway sign at a time, seen from above (OP-309)', () => {
  // The owner on his phone in the Great Hollow, Nov 8: "We're back to clutter on screen from all the directions".
  const HALL = ROOMS['m3-hall']!;
  const doorways = HALL.doors.filter((d) => d.to).map((d) => doorHintTarget(d, null));

  it('shows none where the owl lands in the middle of the Great Hollow, clear of every doorway', () => {
    expect(signFocus(doorways, HALL.spawns['default']!, null)).toBeNull();
  });

  it('shows the doorway the owl stands by, and only that one', () => {
    expect(signFocus(doorways, HALL.spawns['from-party']!, null)).toBe('to-party');
    expect(signFocus(doorways, HALL.spawns['from-lobby']!, null)).toBe('up');
    expect(signFocus(doorways, HALL.spawns['from-under']!, null)).toBe('down');
    expect(signFocus(doorways, { x: 3200, y: 1300 + SIGN_REACH + 200 }, null)).toBeNull();
  });

  it('shows the doorway a tap walk is going to, however far, over the one the owl passes', () => {
    const market = doorways.find((d) => d.id === 'to-market')!;
    expect(signFocus(doorways, HALL.spawns['from-party']!, { x: market.x - 60, y: market.y })).toBe('to-market');
    // A walk to open floor names no doorway: the nearest by the owl shows.
    expect(signFocus(doorways, HALL.spawns['from-party']!, { x: 3200, y: 1480 })).toBe('to-party');
  });

  it('keeps the sign showing between two near doorways until another is clearly nearer, so they never flicker', () => {
    // Two doorways 400 apart (the oval's ways stand far wider apart than this), the owl between them.
    const pair = [
      { id: 'west', x: 1000, y: 500 },
      { id: 'east', x: 1400, y: 500 },
    ];
    const mid = { x: 1200, y: 500 };
    const shown = signFocus(pair, mid, null);
    expect(['west', 'east']).toContain(shown);
    const other = shown === 'west' ? 'east' : 'west';
    const step = (shown === 'west' ? 1 : -1) * (SIGN_HOLD / 2 - 5);
    expect(signFocus(pair, { x: mid.x + step, y: mid.y }, null, shown)).toBe(shown);
    expect(signFocus(pair, { x: mid.x + 4 * step, y: mid.y }, null, shown)).toBe(other);
  });
});

describe('the doorway an owl came in by keeps its sign back (OP-337)', () => {
  // The first words an owl read in the Great Hollow were the way back out: "Up to the Treetop Commons".
  const HALL = ROOMS['m3-hall']!;
  const doorways = HALL.doors.filter((d) => d.to).map((d) => doorHintTarget(d, null));
  const up = doorways.find((d) => d.id === 'up')!;
  const landing = HALL.spawns['from-lobby']!;

  it('shows no sign to an owl standing where it arrived, where the way back would have shown', () => {
    expect(signFocus(doorways, landing, null)).toBe('up');
    expect(signFocus(doorways, landing, null, null, 'up')).toBeNull();
    // Nor does it hold on to a sign that was showing.
    expect(signFocus(doorways, landing, null, 'up', 'up')).toBeNull();
  });

  it('still shows it for a walk to that doorway, and shows any other doorway in reach as ever', () => {
    expect(signFocus(doorways, landing, { x: up.x, y: up.y + 40 }, null, 'up')).toBe('up');
    expect(signFocus(doorways, HALL.spawns['from-party']!, null, null, 'up')).toBe('to-party');
  });

  it('waits until the owl has been out of the sign’s reach once, and not after', () => {
    // 190 px from the knothole, where the turnstiles land an owl: still waiting.
    expect(Math.hypot(landing.x - up.x, landing.y - up.y)).toBeLessThan(SIGN_REACH);
    expect(signWaits(true, up, landing)).toBe(true);
    expect(signWaits(true, up, { x: up.x, y: up.y + SIGN_REACH })).toBe(true);
    // A step further: it has left, and from then the sign is the doorway's own again.
    expect(signWaits(true, up, { x: up.x, y: up.y + SIGN_REACH + 1 })).toBe(false);
    expect(signWaits(false, up, landing)).toBe(false);
    // A room with no doorway back (come by travel, or the page opened there) keeps nothing back.
    expect(signWaits(true, undefined, landing)).toBe(false);
  });
});

describe('a sign by a doorway at the screen’s edge slides in so all its words show', () => {
  const view = { x: 1000, w: 400 };
  it('stays over its own spot when it fits', () => {
    expect(signX(1200, 200, view, 10)).toBe(1200);
  });
  it('slides in from either edge, never past it', () => {
    expect(signX(1000, 200, view, 10)).toBe(1110);
    expect(signX(1400, 200, view, 10)).toBe(1290);
  });
  it('stands in the middle when it is wider than the screen', () => {
    expect(signX(900, 600, view, 10)).toBe(1200);
  });
});
