import { describe, expect, it } from 'vitest';
import { doorTarget } from '../src/doorways';
import { pointInPolygon } from '../src/geometry';
import { INTERACTABLES } from '../src/interactables';
import { kitProblems } from '../src/kit';
import { idolRealms, mapOf, voteRealmAt } from '../src/room';
import { HALL_BACK, HALL_COMMONS, HALL_FRONT, HALL_H, HALL_ID, HALL_MIDDLE, HALL_ROOM, HALL_W, OWL_ROOM_PX2, PLAZA_Y, commonsX, courseDoor, fromCourse, fromRealm, idolAt, realmDoor, voteDoor } from './hollowHall';
import { ANCHORS, ROOMS, TREE_REALMS } from './index';

const hall = ROOMS[HALL_ID]!;
const doorOf = (id: string) => hall.doors.find((d) => d.id === id)!;
const onFloor = (p: { x: number; y: number }) => hall.walkable.some((poly) => pointInPolygon(p, poly));
const middle = (id: string) => {
  const r = doorOf(id).rect;
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
/** Where a room's ways lead on the new map (doorTarget with map 3). */
const leadsTo = (room: string) => ROOMS[room]!.doors.map((d) => doorTarget(d, 3)).filter((t) => t !== undefined);

describe('the Great Hollow (Nov 7)', () => {
  it('is one top-down room, four screens wide, open to every owl, with nothing wrong in its kit', () => {
    expect(hall).toBe(HALL_ROOM);
    expect(hall.keeperOnly).toBeUndefined();
    expect(mapOf(hall)).not.toBe(2);
    expect(hall.size.w).toBe(HALL_W);
    expect(kitProblems(hall)).toEqual([]);
    expect(TREE_REALMS.has(HALL_ID)).toBe(false);
  });

  it('sets the four Commons side by side, west to east glass, ink, the clearing and neon, and leaves no old Commons rooms', () => {
    expect(HALL_COMMONS.map((c) => c.level)).toEqual(['glass', 'ink', 'grove', 'market']);
    expect(HALL_COMMONS.map((c) => commonsX(c.level))).toEqual([0, HALL_W / 4, HALL_W / 2, (3 * HALL_W) / 4]);
    for (const level of ['glass', 'ink', 'grove', 'market']) expect(ROOMS[`commons-${level}`], level).toBeUndefined();
  });

  it('gives every spawn floor to stand on, and every doorway a bit of floor to step into', () => {
    for (const [name, at] of Object.entries(hall.spawns)) expect(onFloor(at), name).toBe(true);
    for (const d of hall.doors) expect(onFloor(middle(d.id)) || onFloor(d.marker!), d.id).toBe(true);
  });

  it("opens each Commons on its realm and its course, and shuts the ways that aren't there yet with a sign", () => {
    for (const c of HALL_COMMONS) {
      const realm = doorOf(realmDoor(c.level));
      const course = doorOf(courseDoor(c.level));
      expect(realm.to, c.level).toEqual(c.realm);
      expect(course.to, c.level).toEqual(c.course);
      expect(!!realm.closedSign, c.level).toBe(!c.realm);
      expect(!!course.closedSign, c.level).toBe(!c.course);
      for (const way of [c.realm, c.course]) if (way) expect(ROOMS[way.room]?.spawns[way.spawn], way.room).toBeDefined();
    }
    expect(doorOf(realmDoor('ink')).closedSign).toBe('Hatching Soon');
    expect(doorOf(courseDoor('glass')).closedSign).toBe('Not Yet Fledged');
  });

  it('brings an owl back from each realm and course to its own doorway', () => {
    for (const c of HALL_COMMONS) {
      if (c.realm) expect(leadsTo(c.realm.room), c.level).toContainEqual({ room: HALL_ID, spawn: fromRealm(c.level) });
      if (c.course) expect(leadsTo(c.course.room), c.level).toContainEqual({ room: HALL_ID, spawn: fromCourse(c.level) });
    }
  });

  it('stands an idol over a Realm Vote spot in each Commons of a voted realm, and none in the ink-wash Commons', () => {
    expect(idolRealms(hall)).toEqual(['glass', 'grove', 'market']);
    for (const realm of ['glass', 'grove', 'market'] as const) {
      expect(voteRealmAt(hall, voteDoor(realm)), realm).toBe(realm);
      expect(onFloor(middle(voteDoor(realm))), realm).toBe(true);
      // The idol stands on its base, off the floor, so owls walk round it.
      expect(onFloor(idolAt(realm)), realm).toBe(false);
    }
    expect(hall.doors.some((d) => d.id === voteDoor('ink'))).toBe(false);
    expect(voteRealmAt(hall, 'idol')).toBeNull();
    expect(Object.keys(ANCHORS[HALL_ID] ?? {}).sort()).toEqual(['gathering', 'guardian', 'idol', 'robot']);
  });

  it('names every open way out on a sign at its doorway, the Party Grove among them, and leaves the shut ones unnamed', () => {
    const named = hall.doors.filter((d) => d.label);
    for (const d of hall.doors) expect(!!d.label, d.id).toBe(!!d.to && !d.closedSign);
    expect(new Set(named.map((d) => d.label)).size).toBe(named.length);
    expect(doorOf('to-party').label).toBe('Out to the Party Grove');
    expect(doorOf('up').label).toBe('Up to the Treetop Commons');
    expect(doorOf('down').label).toBe('Down to the arcade');
    for (const d of named) {
      // On the floor, by its own doorway, where an owl walking up to it reads it.
      expect(onFloor(d.labelAt!), d.id).toBe(true);
      expect(Math.abs(d.labelAt!.x - middle(d.id).x), d.id).toBeLessThan(5);
      expect(Math.abs(d.labelAt!.y - middle(d.id).y), d.id).toBeLessThan(180);
    }
  });

  it('keeps the ways up, out and down together in the middle, and a leaf pile in each Commons', () => {
    expect(doorOf('up').to).toEqual({ room: 'lobby', spawn: 'from-hub' });
    expect(doorOf('to-party').to).toEqual({ room: 'hub', spawn: 'default' });
    expect(doorOf('down').to).toEqual({ room: 'm3-under', spawn: 'from-l1' });
    for (const id of ['up', 'to-party', 'down']) expect(Math.abs(middle(id).x - HALL_MIDDLE), id).toBeLessThan(250);
    expect(middle('down').y).toBeGreaterThan(HALL_FRONT - 60);
    expect(middle('up').y).toBeLessThan(HALL_BACK + 40);
    const piles = INTERACTABLES.filter((t) => t.room === HALL_ID);
    for (const c of HALL_COMMONS) expect(piles.some((p) => p.id === `m3-hall-leaves-${c.level}`), c.level).toBe(true);
    for (const p of piles) expect(onFloor(p.pos), p.id).toBe(true);
  });

  it('makes each Commons a plaza a crowd of 80 owls can gather in, more than a screen deep', () => {
    expect(HALL_H).toBeGreaterThan(900);
    for (const c of HALL_COMMONS) {
      const x0 = commonsX(c.level);
      let floor = 0;
      for (let x = x0 + 10; x < x0 + 1600; x += 20) for (let y = HALL_BACK + 10; y < HALL_H; y += 20) if (onFloor({ x, y })) floor += 400;
      expect(floor / OWL_ROOM_PX2, c.level).toBeGreaterThanOrEqual(80);
      // Its middle, where its moonbeam falls, is open floor with room round it.
      for (const [dx, dy] of [[0, 0], [-300, 0], [300, 0], [0, -150], [0, 150]] as const) expect(onFloor({ x: x0 + 800 + dx, y: PLAZA_Y + dy }), c.level).toBe(true);
    }
  });

  it('gives every stretch of the plaza something close by to do: a doorway, an idol, a moonbeam or a leaf pile', () => {
    const things = [
      ...INTERACTABLES.filter((t) => t.room === HALL_ID).map((t) => t.pos),
      ...hall.doors.map((d) => d.marker ?? { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }),
    ];
    expect(INTERACTABLES.filter((t) => t.room === HALL_ID && t.kind === 'moonbeam')).toHaveLength(HALL_COMMONS.length);
    for (let x = 80; x < HALL_W - 80; x += 40)
      for (let y = HALL_BACK + 20; y < HALL_FRONT; y += 40) {
        if (!onFloor({ x, y })) continue;
        // A few seconds' walk at most (WALK_SPEED is 260 px a second).
        const near = Math.min(...things.map((t) => Math.hypot(t.x - x, t.y - y)));
        expect(near, `${x},${y}`).toBeLessThanOrEqual(560);
      }
  });
});
