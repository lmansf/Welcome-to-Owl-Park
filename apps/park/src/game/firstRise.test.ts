import { describe, expect, it } from 'vitest';
import { COMMONS_THERMAL, FIRST_LOOK_SPAWN, HALL_ROOM, ROOMS } from '@owl-park/shared/rooms';
import { GLIDE_SLOPE, distance, isWalkable, thermalAt, thermalProblems } from '@owl-park/shared';
import { PLAY_SPOTS, RISE_SPOT, doorSpot, trailPoints, trailTo } from './featherTrail';
import { FIRST_RISE_MARK, RISE_SHARE, marksFirstRise, rodeUp } from './firstRise';

const COMMONS = ROOMS['lobby']!;

describe('the Treetop Commons has rising air before the turnstiles (OP-363)', () => {
  it('rises in the plaza’s moonbeam, wide enough to stand in', () => {
    expect(COMMONS.thermals).toEqual([COMMONS_THERMAL]);
    expect(thermalProblems(COMMONS_THERMAL)).toEqual([]);
    expect(isWalkable(COMMONS_THERMAL.pos, COMMONS.walkable)).toBe(true);
    expect(thermalAt(COMMONS.thermals, COMMONS_THERMAL.pos, 0)).toBe(COMMONS_THERMAL);
  });

  it('lifts an owl high enough that a held glide from its top reaches the floor before the turnstiles', () => {
    const gate = COMMONS.doors.find((d) => d.id === 'gate')!;
    const before = { x: gate.rect.x + gate.rect.w / 2, y: gate.rect.y + gate.rect.h + 60 };
    expect(COMMONS_THERMAL.top * GLIDE_SLOPE).toBeGreaterThanOrEqual(distance(COMMONS_THERMAL.pos, before));
    // And no higher than that takes, give or take a turn on the way.
    expect(COMMONS_THERMAL.top * GLIDE_SLOPE).toBeLessThan(distance(COMMONS_THERMAL.pos, before) + 200);
  });

  it('lands an owl that came to look around on the plaza beside it: outside the column, a few steps off, toward the turnstiles', () => {
    const at = COMMONS.spawns[FIRST_LOOK_SPAWN]!;
    expect(isWalkable(at, COMMONS.walkable)).toBe(true);
    expect(thermalAt(COMMONS.thermals, at, 0)).toBeUndefined();
    const off = distance(at, COMMONS_THERMAL.pos);
    expect(off).toBeGreaterThan(COMMONS_THERMAL.r);
    // Near enough that a phone held upright shows the moonbeam (it shows 900 px of a room across), and
    // far enough that the feather trail lays three feathers on the way in.
    expect(off).toBeLessThan(450);
    expect(trailPoints([at, COMMONS_THERMAL.pos]).length).toBeGreaterThanOrEqual(3);
    // On the turnstiles' side of the light: the way on is ahead of it, not behind.
    const gate = COMMONS.doors.find((d) => d.id === 'gate')!;
    expect(distance(at, doorSpot(gate))).toBeLessThan(distance(COMMONS_THERMAL.pos, doorSpot(gate)));
  });

  it('is where the feather trail leads an owl that has not stood in it, before any doorway', () => {
    const spots = PLAY_SPOTS['lobby']!;
    expect(spots.map((s) => s.id)).toEqual([RISE_SPOT]);
    const spot = spots[0]!;
    // The whole spot is inside the column: anywhere on it Jump held rides the air up.
    for (const corner of [
      { x: spot.rect.x, y: spot.rect.y },
      { x: spot.rect.x + spot.rect.w, y: spot.rect.y + spot.rect.h },
    ])
      expect(distance(corner, COMMONS_THERMAL.pos)).toBeLessThanOrEqual(COMMONS_THERMAL.r);
    const from = COMMONS.spawns[FIRST_LOOK_SPAWN]!;
    expect(trailTo(from, spots, COMMONS.doors, () => false)).toBe(spot);
    // Once stood in, the trail leads on to the turnstiles, the nearer of the room's two ways.
    const next = trailTo(from, [], COMMONS.doors, () => false);
    expect(next && 'id' in next ? next.id : null).toBe('gate');
    expect(distance(from, doorSpot(COMMONS.doors.find((d) => d.id === 'gate')!))).toBeLessThan(distance(from, doorSpot(COMMONS.doors.find((d) => d.id === 'to-homes')!)));
  });
});

describe('the first ride on rising air is marked once (OP-363)', () => {
  it('in a room with rising air and no first flight of its own', () => {
    expect(marksFirstRise(COMMONS, false)).toBe(true);
    // The Great Hollow marks its first flight off its roots (OP-347), not this.
    expect(marksFirstRise(HALL_ROOM, true)).toBe(false);
    expect(marksFirstRise(ROOMS['hub']!, false)).toBe(false);
  });

  it('counts a flight the air took at least halfway to its top, and no hop or glide without it', () => {
    const top = COMMONS_THERMAL.top;
    expect(rodeUp(true, top, top)).toBe(true);
    expect(rodeUp(true, top * RISE_SHARE, top)).toBe(true);
    expect(rodeUp(true, top * RISE_SHARE - 1, top)).toBe(false);
    expect(rodeUp(false, top, top)).toBe(false);
    expect(rodeUp(true, 100, 0)).toBe(false);
    expect(FIRST_RISE_MARK).not.toBe('first-flight');
  });
});
