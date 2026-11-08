import { describe, expect, it } from 'vitest';
import { DOORS_TRIED_KEY, DOORS_TRIED_MAX, TRAIL, TriedDoors, doorKey, doorSpot, nearestDoor, parseTried, trailPoints } from './featherTrail';

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const door = (id: string, x: number, y: number, extra: object = {}) => ({ id, rect: { x, y, w: 100, h: 40 }, ...extra });

describe('the feather trail’s doorways tried (OP-307)', () => {
  it('keeps each doorway the owl goes through on this device, once', () => {
    const storage = memory();
    const tried = new TriedDoors(storage);
    expect(tried.has('m3-hall', 'down')).toBe(false);
    expect(tried.add('m3-hall', 'down')).toBe(true);
    expect(tried.add('m3-hall', 'down')).toBe(false);
    expect(tried.has('m3-hall', 'down')).toBe(true);
    // Another room's doorway of the same name is its own.
    expect(tried.has('grove', 'down')).toBe(false);
    expect(JSON.parse(storage.data.get(DOORS_TRIED_KEY)!)).toEqual([doorKey('m3-hall', 'down')]);
    // A new page reads them back.
    expect(new TriedDoors(storage).has('m3-hall', 'down')).toBe(true);
  });

  it('reads only strings back, and nothing from what it cannot read', () => {
    expect(parseTried('["a#b", 3, null, "c#d"]')).toEqual(['a#b', 'c#d']);
    for (const bad of [null, '', 'nope', '{"a":1}']) expect(parseTried(bad), String(bad)).toEqual([]);
  });

  it('forgets the oldest past its cap, and works with no storage at all', () => {
    const tried = new TriedDoors(null);
    for (let i = 0; i <= DOORS_TRIED_MAX; i++) tried.add('r', `d${i}`);
    expect(tried.has('r', 'd0')).toBe(false);
    expect(tried.has('r', `d${DOORS_TRIED_MAX}`)).toBe(true);
  });
});

describe('where the feather trail goes (OP-307)', () => {
  it('ends at a doorway’s sign, else its sign over the arch, else its middle', () => {
    expect(doorSpot(door('a', 0, 0, { marker: { x: 5, y: 6 } }))).toEqual({ x: 5, y: 6 });
    expect(doorSpot(door('a', 0, 0, { markAt: { x: 7, y: 8 } }))).toEqual({ x: 7, y: 8 });
    expect(doorSpot(door('a', 100, 200))).toEqual({ x: 150, y: 220 });
  });

  it('points to the nearest doorway not tried, and to none when every one is', () => {
    const doors = [door('far', 2000, 500), door('near', 400, 500), door('mid', 1000, 500)];
    expect(nearestDoor({ x: 300, y: 520 }, doors)?.id).toBe('near');
    expect(nearestDoor({ x: 1900, y: 520 }, doors)?.id).toBe('far');
    expect(nearestDoor({ x: 0, y: 0 }, [])).toBeNull();
  });

  it('spaces the feathers along the way and round its bends, clear of the owl and the doorway', () => {
    const pts = trailPoints([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }]);
    expect(pts[0]).toEqual({ x: TRAIL.start, y: 0 });
    // Round the bend: the third feather is past the corner, on the way down.
    expect(pts[2]).toEqual({ x: 300, y: TRAIL.start + 2 * TRAIL.gap - 300 });
    for (const p of pts) expect(Math.hypot(p.x - 300, p.y - 300)).toBeGreaterThanOrEqual(TRAIL.end - 1);
    // A doorway right by the owl gets no feathers; a long way gets at most the cap.
    expect(trailPoints([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual([]);
    expect(trailPoints([{ x: 0, y: 0 }, { x: 10000, y: 0 }])).toHaveLength(TRAIL.most);
  });
});
