import { describe, expect, it } from 'vitest';
import { doorTarget, type DoorDef } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { DOORS_TRIED_KEY, DOORS_TRIED_MAX, TRAIL, TriedDoors, doorKey, doorSpot, leadsToPlay, nearestDoor, parseTried, trailDoor, trailPoints } from './featherTrail';

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

describe('the trail leads to play first (OP-337)', () => {
  // Of the first visits that reached the Great Hollow, the ones that stayed found a course or the arcade.
  const HALL = ROOMS['m3-hall']!;
  const landing = HALL.spawns['from-lobby']!;
  const ways = HALL.doors.filter((d) => doorTarget(d, 3) !== undefined);
  const toPlay = (d: DoorDef) => leadsToPlay(ROOMS[doorTarget(d, 3)?.room ?? '']);
  /** The ways not tried yet, with the way the owl came in by and `tried` taken out. */
  const untried = (...tried: string[]) => ways.filter((d) => d.id !== 'up' && !tried.includes(d.id));

  it('counts a course’s rooms and the arcade as play; a realm’s room, the Commons and no room at all are not', () => {
    for (const id of ['canopy-1', 'circuit-1', 'brush-1', 'arcade']) expect(leadsToPlay(ROOMS[id]), id).toBe(true);
    for (const id of ['grove', 'market', 'glass', 'hub', 'lobby', 'm3-hall', 'homes']) expect(leadsToPlay(ROOMS[id]), id).toBe(false);
    expect(leadsToPlay(undefined)).toBe(false);
  });

  it('from where the turnstiles land an owl, leads to the arcade’s hatch, though a realm’s doorway is nearer', () => {
    const nearest = nearestDoor(landing, untried())!;
    expect(toPlay(nearest)).toBe(false);
    expect(['to-glass', 'to-grove']).toContain(nearest.id);
    expect(trailDoor(landing, untried(), toPlay)!.id).toBe('down');
  });

  it('then to each course’s gate, nearest first, and only then to the doorways that are left', () => {
    const order: string[] = [];
    for (let door = trailDoor(landing, untried(...order), toPlay); door && toPlay(door); door = trailDoor(landing, untried(...order), toPlay)) order.push(door.id);
    expect(order[0]).toBe('down');
    expect([...order].sort()).toEqual(['course-grove', 'course-ink', 'course-market', 'down']);
    // Nothing to play left untried: the nearest doorway, as ever.
    expect(trailDoor(landing, untried(...order), toPlay)).toBe(nearestDoor(landing, untried(...order)));
    // Every doorway tried: none.
    expect(trailDoor(landing, [], toPlay)).toBeNull();
  });

  it('in a room with no way to play, leads to the nearest doorway as ever', () => {
    const lobby = ROOMS['lobby']!;
    const doors = lobby.doors.filter((d) => doorTarget(d, 3) !== undefined);
    const from = lobby.spawns['default']!;
    const play = (d: DoorDef) => leadsToPlay(ROOMS[doorTarget(d, 3)?.room ?? '']);
    expect(doors.some(play)).toBe(false);
    expect(trailDoor(from, doors, play)).toBe(nearestDoor(from, doors));
  });
});
