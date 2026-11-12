import { describe, expect, it } from 'vitest';
import { COPY_SPOT, FISHING_REACH, FISHING_SPOT, QUIZ_ZONES, distance, doorTarget, isWalkable, pointInRect, quizZoneAt, underBeam, type DoorDef, type Rect } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import {
  DOORS_TRIED_KEY,
  DOORS_TRIED_MAX,
  PLAY_SPOTS,
  TRAIL,
  TriedDoors,
  doorKey,
  doorSpot,
  leadsToPlay,
  nearestDoor,
  parseTried,
  playSpotsAt,
  trailDoor,
  trailPoints,
  trailTo,
} from './featherTrail';

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

describe('the trail leads to a room’s own games first (OP-338)', () => {
  // The Party Grove's job is playing together; the first visits to reach it found neither of its games.
  const mid = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  const corners = (r: Rect) => [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ];
  const toPlay = (d: DoorDef) => leadsToPlay(ROOMS[doorTarget(d, 3)?.room ?? '']);
  const spot = (room: string, id: string) => PLAY_SPOTS[room]!.find((s) => s.id === id)!;

  it('knows each room’s games by the floor an owl plays them from', () => {
    expect(Object.keys(PLAY_SPOTS).sort()).toEqual(['grove', 'hub', 'm3-hall', 'market']);
    // The Great Hollow's roots (OP-347): the floor before each inner run's first root, one find between the two.
    expect(PLAY_SPOTS['m3-hall']!.map((s) => s.id)).toEqual(['play-roots', 'play-roots']);
    expect(PLAY_SPOTS['hub']!.map((s) => s.id)).toEqual(['play-lanterns', 'play-quiz']);
    expect(PLAY_SPOTS['grove']!.map((s) => s.id)).toEqual(['play-fishing']);
    expect(PLAY_SPOTS['market']!.map((s) => s.id)).toEqual(['play-copy']);
    // The middle of each is floor of its room that an owl can walk to.
    for (const [room, spots] of Object.entries(PLAY_SPOTS)) for (const s of spots) expect(isWalkable(mid(s.rect), ROOMS[room]!.walkable), `${room} ${s.id}`).toBe(true);
    // No id could be a doorway's: they are kept among the doorways tried.
    for (const [room, spots] of Object.entries(PLAY_SPOTS)) for (const s of spots) expect(ROOMS[room]!.doors.some((d) => d.id === s.id), s.id).toBe(false);
  });

  it('leads a new owl in the Great Hollow to its roots before any doorway, and on to a doorway once it has stood there (OP-347)', () => {
    const hall = ROOMS['m3-hall']!;
    const from = hall.spawns['from-lobby']!;
    const doors = hall.doors.filter((d) => d.to);
    const spots = PLAY_SPOTS['m3-hall']!;
    const to = trailTo(from, spots, doors, () => true);
    expect(to && 'id' in to ? to.id : null).toBe('play-roots');
    // Found (one mark for both runs), the trail leads to a doorway.
    const tried = new TriedDoors(null);
    tried.add('m3-hall', 'play-roots');
    const left = spots.filter((s) => !tried.has('m3-hall', s.id));
    expect(left).toEqual([]);
    const next = trailTo(from, left, doors, () => true);
    expect(next && 'id' in next ? hall.doors.some((d) => d.id === next.id) : false).toBe(true);
  });

  it('puts each spot where its game is played: under the beam, on an answer, in reach of the fishing spot, before the robot owl', () => {
    for (const p of [mid(spot('hub', 'play-lanterns').rect), ...corners(spot('hub', 'play-lanterns').rect)]) expect(underBeam(p)).toBe(true);
    const quiz = spot('hub', 'play-quiz').rect;
    expect(quizZoneAt(mid(quiz))).toBe('b');
    for (const zone of Object.values(QUIZ_ZONES)) for (const p of corners(zone)) expect(pointInRect(p, quiz)).toBe(true);
    for (const p of corners(spot('grove', 'play-fishing').rect)) expect(distance(p, FISHING_SPOT)).toBeLessThanOrEqual(FISHING_REACH);
    expect(spot('market', 'play-copy').rect).toEqual(COPY_SPOT);
  });

  it('in the Party Grove leads from where an owl lands to the lantern beam, on to the quiz stage, and only then to a doorway', () => {
    const grove = ROOMS['hub']!;
    const landing = grove.spawns['default']!;
    const doors = grove.doors.filter((d) => doorTarget(d, 3) !== undefined);
    const [lanterns, quiz] = PLAY_SPOTS['hub']!;
    // Three arches and the way back are all nearer than either game.
    expect(distance(landing, doorSpot(nearestDoor(landing, doors)!))).toBeLessThan(distance(landing, mid(lanterns!.rect)));
    expect(trailTo(landing, PLAY_SPOTS['hub']!, doors, toPlay)).toBe(lanterns);
    // Under the beam, the lanterns found: on to the stage, right across the room.
    expect(trailTo(mid(lanterns!.rect), [quiz!], doors, toPlay)).toBe(quiz);
    // Both found: a doorway, as the trail picks one in any room.
    expect(trailTo(mid(quiz!.rect), [], doors, toPlay)).toBe(trailDoor(mid(quiz!.rect), doors, toPlay));
    expect(trailTo(landing, [], [], toPlay)).toBeNull();
  });

  it('finds the game an owl is standing at, and none out on the open floor', () => {
    expect(playSpotsAt('hub', mid(spot('hub', 'play-lanterns').rect)).map((s) => s.id)).toEqual(['play-lanterns']);
    expect(playSpotsAt('hub', ROOMS['hub']!.spawns['default']!)).toEqual([]);
    expect(playSpotsAt('market', mid(COPY_SPOT)).map((s) => s.id)).toEqual(['play-copy']);
    expect(playSpotsAt('lobby', { x: 1000, y: 765 })).toEqual([]);
  });
});
