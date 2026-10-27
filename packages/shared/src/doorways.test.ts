import { describe, expect, it } from 'vitest';
import { arrivalPoint, doorAxis, inExit, laneThrough } from './doorways';
import type { RoomDef } from './room';

/** A room with one doorway back to `other`: in the far wall, or in the west wall. */
const room = (back: 'far' | 'side', floorFrom = 0): RoomDef => ({
  id: 'here',
  size: { w: 1600, h: 900 },
  background: 'x',
  mood: 'hub',
  walkable: [
    [
      { x: floorFrom, y: 500 },
      { x: 1600, y: 500 },
      { x: 1600, y: 880 },
      { x: floorFrom, y: 880 },
    ],
  ],
  spawns: { default: { x: 800, y: 700 } },
  doors: [
    back === 'far'
      ? { id: 'back', rect: { x: 700, y: 440, w: 200, h: 80 }, to: { room: 'other', spawn: 'default' } }
      : { id: 'back', rect: { x: 0, y: 600, w: 100, h: 200 }, to: { room: 'other', spawn: 'default' } },
  ],
});

describe('doorways keep the lane (OP-124)', () => {
  it('runs a doorway in a side wall up and down the floor, any other across it', () => {
    expect(doorAxis(room('side'), room('side').doors[0]!)).toBe('y');
    expect(doorAxis(room('far'), room('far').doors[0]!)).toBe('x');
  });

  it('measures the lane from the left (or upper) end, held to the doorway', () => {
    const r = room('far');
    const door = r.doors[0]!;
    expect(laneThrough(r, door, { x: 700, y: 500 })).toEqual({ axis: 'x', t: 0 });
    expect(laneThrough(r, door, { x: 850, y: 500 })).toEqual({ axis: 'x', t: 0.75 });
    expect(laneThrough(r, door, { x: 1000, y: 500 })).toEqual({ axis: 'x', t: 1 });
    const s = room('side');
    expect(laneThrough(s, s.doors[0]!, { x: 50, y: 650 })).toEqual({ axis: 'y', t: 0.25 });
  });

  it('comes out as far across the doorway back as it went in', () => {
    const r = room('far');
    expect(arrivalPoint(r, 'default', 'other', { axis: 'x', t: 0 })).toEqual({ x: 700, y: 700 });
    expect(arrivalPoint(r, 'default', 'other', { axis: 'x', t: 0.5 })).toEqual({ x: 800, y: 700 });
    expect(arrivalPoint(r, 'default', 'other', { axis: 'x', t: 1 })).toEqual({ x: 900, y: 700 });
    expect(arrivalPoint(room('side'), 'default', 'other', { axis: 'y', t: 0 })).toEqual({ x: 800, y: 600 });
  });

  it('arrives at the spawn round a corner, without a lane, or with no doorway back', () => {
    expect(arrivalPoint(room('side'), 'default', 'other', { axis: 'x', t: 0 })).toEqual({ x: 800, y: 700 });
    expect(arrivalPoint(room('far'), 'default', 'other', undefined)).toEqual({ x: 800, y: 700 });
    expect(arrivalPoint(room('far'), 'default', 'elsewhere', { axis: 'x', t: 0 })).toEqual({ x: 800, y: 700 });
    expect(arrivalPoint(room('far'), 'default', undefined, { axis: 'x', t: 0 })).toEqual({ x: 800, y: 700 });
  });

  it('steps back toward the spawn rather than off the floor or into an exit', () => {
    // The floor starts at x 760: the lane's far end (700) is off it, and so are 725 and 750.
    expect(arrivalPoint(room('far', 760), 'default', 'other', { axis: 'x', t: 0 })).toEqual({ x: 775, y: 700 });
    const withExit = room('far');
    withExit.doors.push({ id: 'out', rect: { x: 860, y: 650, w: 60, h: 100 }, to: { room: 'third', spawn: 'default' } });
    expect(arrivalPoint(withExit, 'default', 'other', { axis: 'x', t: 1 })).toEqual({ x: 850, y: 700 });
  });

  it('counts doorways that lead somewhere and the nest doors as exits, not spots', () => {
    const r = room('far');
    r.doors.push({ id: 'shop', rect: { x: 100, y: 600, w: 100, h: 100 } }, { id: 'nest-door-2', rect: { x: 300, y: 600, w: 100, h: 100 } });
    expect(inExit(r, { x: 800, y: 480 })).toBe(true);
    expect(inExit(r, { x: 150, y: 650 })).toBe(false);
    expect(inExit(r, { x: 350, y: 650 })).toBe(true);
  });
});
