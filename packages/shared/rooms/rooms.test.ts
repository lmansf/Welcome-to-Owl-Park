import { describe, expect, it } from 'vitest';
import { CABINETS } from '../src/arcade';
import { arrivalPoint, doorAxis, doorTarget, inExit, laneThrough } from '../src/doorways';
import { distance, distanceToRect, isWalkable, pointInRect, rectCenter } from '../src/geometry';
import { FURNITURE, NEST_SPOTS, isStreetRoom, nestDoorIndex } from '../src/homes';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_MAX_H, ROOM_MAX_W, ROOM_W, backgroundTiles, findSpawn, foregroundTiles, mapOf, tileFade, tilePlacement, type DoorDef, type RoomDef } from '../src/room';
import { OWL_SPECIES, SPECIES } from '../src/species';
import { ANCHORS, CLOSED_SIGNS, GATED_ROOMS, GUARDIANS, NEST_MIRROR, NEST_PARK_SIGN, NEST_ROOM, ROOMS, STREET_DOORS, STREET_ROOM, TREE_ARRIVAL, TREE_GROUND, TREE_REALMS, getRoom, roomFor } from './index';
import { INTERACTABLES } from '../src/interactables';
import { resolveTarget } from '../src/resolveTarget';
import { NPCS } from '../src/npcs';
import { FLIGHT_STEP_MS, GLIDE_SLOPE, GROUNDED, MAX_RISE, newFlier, stepFlier, type Flier, type FlightInput } from '../src/flight';
import { PERCH_SLACK, footing, groundAt, perchTopLimit, type Raised } from '../src/perches';
import { gapBetween, perchTiers } from '../src/routes';
import { pointInPolygon } from '../src/geometry';
import { WALK_SPEED } from '../src/walk';
import { treeLevelOf, treeSpotsFor } from '../src/treeSpots';
import { NEW_MAP, NEW_MAP_HALL, isNewMapRoom } from '../src/newMap';

/** Every room an owl can stand in: the registry's, and the one every nest is made from. */
const ALL_ROOMS: readonly RoomDef[] = [...Object.values(ROOMS), NEST_ROOM];

const STEP = 10;
const cell = (p: Vec2) => `${Math.round(p.x / STEP) * STEP},${Math.round(p.y / STEP) * STEP}`;

/**
 * The floor an owl can get to from a point, as cells every STEP px: a cell is reached when a
 * neighbouring reached cell and the point halfway to it are both on the floor. Owls walk in
 * straight lines, so a far corner of a wide room may take a few walks, but none is cut off.
 */
function reachableFloor(room: RoomDef, from: Vec2): Set<string> {
  const start = { x: Math.round(from.x / STEP) * STEP, y: Math.round(from.y / STEP) * STEP };
  const seen = new Set([cell(start)]);
  const queue = [start];
  while (queue.length) {
    const p = queue.pop()!;
    for (const [dx, dy] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as const) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (seen.has(cell(q)) || !isWalkable(q, room.walkable) || !isWalkable({ x: p.x + dx / 2, y: p.y + dy / 2 }, room.walkable)) continue;
      seen.add(cell(q));
      queue.push(q);
    }
  }
  return seen;
}

describe('room size and art tiles', () => {
  for (const room of ALL_ROOMS) {
    it(`${room.id}: fits the biggest room and is covered exactly by its background tiles`, () => {
      expect(room.size.w).toBeLessThanOrEqual(ROOM_MAX_W);
      expect(room.size.h).toBeLessThanOrEqual(ROOM_MAX_H);
      // A tile that scrolls at its own rate (the tree's sky plate and overlay, OP-156) is a layer of a
      // screen the room's own tiles paint: it covers nothing of its own.
      // So is a plain one (OP-173's six layers: a screen's platforms over its back scenery, its front props).
      const tiles = backgroundTiles(room).filter((t) => (t.rate ?? 1) === 1 && !t.plain);
      for (const t of [...backgroundTiles(room), ...foregroundTiles(room)]) {
        if ((t.rate ?? 1) !== 1 || t.plain) expect(tiles.some((o) => o.x === t.x && o.y === t.y), `${t.key} is a layer of a screen of the room`).toBe(true);
        expect(t.x % ROOM_W, `${t.key} sits on the tile grid`).toBe(0);
        expect(t.y % ROOM_H, `${t.key} sits on the tile grid`).toBe(0);
        expect(t.x + ROOM_W, `${t.key} inside the room`).toBeLessThanOrEqual(room.size.w);
        expect(t.y + ROOM_H, `${t.key} inside the room`).toBeLessThanOrEqual(room.size.h);
      }
      const cells = new Set(tiles.map((t) => `${t.x / ROOM_W},${t.y / ROOM_H}`));
      expect(cells.size, 'no two background tiles overlap').toBe(tiles.length);
      expect(cells.size * ROOM_W * ROOM_H, 'background tiles cover the room').toBe(room.size.w * room.size.h);
    });
  }
});

describe('the floor', () => {
  for (const room of ALL_ROOMS) {
    it(`${room.id}: everything an owl walks to is on one floor with every spawn`, () => {
      const floor = reachableFloor(room, findSpawn(room, 'default'));
      const things: [string, Vec2][] = [
        ...Object.entries(room.spawns).map(([name, p]): [string, Vec2] => [`spawn ${name}`, p]),
        // A doorway taken up on a perch (its top that perch's) is reached from the perch, as what sits on one is.
        ...room.doors
          .filter((d) => !(d.top && room.perches?.some((p) => p.top === d.top && pointInPolygon(rectCenter(d.rect), p.area))))
          .map((d): [string, Vec2] => [`door ${d.id}`, { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }]),
        // What sits up on a perch is reached from the perch (the perches' tests below).
        ...(room.spots ?? []).filter((s) => !s.top).map((s): [string, Vec2] => [`spot ${s.x},${s.y}`, s]),
        ...[...NPCS, ...INTERACTABLES].filter((t) => t.room === room.id && !(t as Raised).top).map((t): [string, Vec2] => [t.id, t.pos]),
      ];
      // A doorway or the idol's gathering spot may reach past the floor's edge; its middle is on the floor or next to it.
      for (const [name, p] of things) expect(floor.has(cell(p)) || [0, 1, -1].some((d) => floor.has(cell({ x: p.x, y: p.y + d * 2 * STEP }))), `${room.id} ${name} reachable`).toBe(true);
    });

    it(`${room.id}: set pieces stand on the room's own screens`, () => {
      for (const [name, a] of Object.entries(ANCHORS[room.id] ?? {})) {
        expect(a.x, name).toBeGreaterThanOrEqual(0);
        expect(a.x, name).toBeLessThanOrEqual(room.size.w);
        expect(a.y, name).toBeLessThanOrEqual(room.size.h);
      }
    });
  }
});

describe('doors and spawns', () => {
  for (const room of ALL_ROOMS) {
    it(`${room.id}: every open door leads to a spawn that is there, and every marker is on the room's own screens`, () => {
      for (const d of room.doors) {
        for (const way of [d.to, d.toTree]) {
          if (!way) continue;
          const to = roomFor(way.room);
          expect(to, `${room.id} ${d.id} leads to a room`).toBeDefined();
          expect(Object.hasOwn(to?.spawns ?? {}, way.spawn), `${room.id} ${d.id} leads to ${way.room} ${way.spawn}`).toBe(true);
        }
        // The tree's way back goes to the tree, from a doorway that also leads somewhere for today's park.
        if (d.toTree) {
          expect(mapOf(roomFor(d.toTree.room)!), `${room.id} ${d.id}'s way for the tree`).toBe(2);
          expect(d.to, `${room.id} ${d.id}'s way for today's park`).toBeDefined();
        }
        if (!d.marker) continue;
        expect(d.marker.x, `${room.id} ${d.id} marker`).toBeGreaterThanOrEqual(0);
        expect(d.marker.x, `${room.id} ${d.id} marker`).toBeLessThanOrEqual(room.size.w);
        expect(d.marker.y, `${room.id} ${d.id} marker`).toBeGreaterThanOrEqual(0);
        expect(d.marker.y, `${room.id} ${d.id} marker`).toBeLessThanOrEqual(room.size.h);
      }
    });

    it(`${room.id}: no spawn stands in a doorway, where an owl would walk straight back out`, () => {
      // A spot to stand at (a door with nowhere to go, such as the nest's mirror) may have one. A street's
      // nest door is a way through too: an owl standing in it goes into the nest (OP-128).
      const ways = room.doors.filter((d) => d.to || (isStreetRoom(room.id) && nestDoorIndex(d.id) !== null));
      for (const [name, p] of Object.entries(room.spawns)) for (const d of ways) expect(pointInRect(p, d.rect), `${room.id} spawn ${name} in ${d.id}`).toBe(false);
    });
  }
});

describe("the tree's ways into today's park (OP-162)", () => {
  it('the roof run opens into the market, whose way out leads a tree owl back to the archway and everyone else to the hub', () => {
    const arch = ROOMS['l1']!.doors.find((d) => d.id === 'to-market')!;
    expect(arch.to).toEqual({ room: 'market', spawn: 'default' });
    const out = ROOMS['market']!.doors.find((d) => d.id === 'to-hub')!;
    expect(doorTarget(out, 1)).toEqual({ room: 'hub', spawn: 'from-market' });
    expect(doorTarget(out, 2)).toEqual({ room: 'l1', spawn: 'market' });
    // Doorways without a way for the tree lead a tree owl where they lead everyone.
    expect(doorTarget(arch, 2)).toEqual(arch.to);
    // The arrival stands on the ground line just short of the archway, out of it.
    const back = ROOMS['l1']!.spawns['market']!;
    expect(back.y).toBe(TREE_GROUND);
    expect(arch.rect.x - back.x).toBeGreaterThan(0);
    expect(arch.rect.x - back.x).toBeLessThan(120);
  });

  it('every doorway lands in a room that leads straight back to where the owl came from, on both maps (OP-217)', () => {
    // A doorway that lands an owl somewhere with no way back to where it was reads as a teleport: the
    // market's arcade door once dropped an owl walking the tree into level 0's cave, whose only way
    // out is level 0's cavern. Walked from each map's start (the hub; the tree's arrival on level 5).
    const starts: Record<1 | 2, string> = { 1: 'hub', 2: TREE_ARRIVAL.room };
    for (const map of [1, 2] as const) {
      const seen = new Set<string>([starts[map]]);
      const queue = [starts[map]];
      while (queue.length) {
        const room = ROOMS[queue.shift()!]!;
        for (const door of room.doors) {
          const to = doorTarget(door, map);
          if (!to) continue;
          const there = ROOMS[to.room];
          expect(there, `map ${map}: ${room.id} ${door.id} leads to a room that exists`).toBeDefined();
          expect(there!.spawns[to.spawn], `map ${map}: ${room.id} ${door.id} lands at a spawn of ${to.room}`).toBeDefined();
          const back = there!.doors.some((d) => doorTarget(d, map)?.room === room.id);
          expect(back, `map ${map}: ${room.id} ${door.id} lands in ${to.room}, which has a way back to ${room.id}`).toBe(true);
          if (!seen.has(to.room)) {
            seen.add(to.room);
            queue.push(to.room);
          }
        }
      }
      // The tree's own walk reaches every level and the cave, and none of today's park's streets.
      if (map === 2) {
        for (const id of ['l0', 'l0-arcade', 'l1', 'l2', 'l3', 'l4', 'l5', 'l5-street']) expect(seen.has(id), id).toBe(true);
        for (const id of ['hub', 'lobby', STREET_ROOM, 'arcade']) expect(seen.has(id), id).toBe(false);
      }
    }
  });

  it("the realms the tree opens into are the market and the rooms it leads to, never today's park's own streets", () => {
    // Not today's arcade, and not the cave either: for an owl of the tree the market's arcade door is
    // shut (OP-217), since the cave is on level 0 and the door would drop the owl a level down.
    expect([...TREE_REALMS].sort()).toEqual(['glass', 'market']);
    const arcadeDoor = ROOMS['market']!.doors.find((d) => d.id === 'to-arcade')!;
    expect(doorTarget(arcadeDoor, 2)).toBeUndefined();
    expect(doorTarget(arcadeDoor, 1)).toEqual({ room: 'arcade', spawn: 'from-market' });
    for (const id of ['hub', 'lobby', STREET_ROOM]) expect(TREE_REALMS.has(id), id).toBe(false);
  });

  it("a side view's doorways stand at a height, so a ledge over one is walked along without going through", () => {
    for (const room of ALL_ROOMS) {
      // A course's rooms (OP-224) are climbed through hatches up on their ledges: course.test.ts holds them.
      // The hollow hall's doorways stand on its landings: hollowHall.test.ts holds them.
      if (mapOf(room) !== 2 || room.course || NEW_MAP_HALL.includes(room.id)) continue;
      // Every way through is on the ground (OP-220): none is taken from a ledge.
      for (const d of room.doors) {
        if (!d.to) continue;
        expect(d.top, `${room.id} ${d.id}`).toBe(0);
      }
    }
    // The lobby's lintel lies over the way down: an owl standing on it walks on past the doorway under it.
    const l1 = ROOMS['l1']!;
    const down = l1.doors.find((d) => d.id === 'stair-l1-l0')!;
    const lintel = l1.perches!.find((x) => x.id === 'lintel')!;
    expect(Math.min(...lintel.area.map((v) => v.x))).toBeLessThan(down.rect.x);
    expect(Math.max(...lintel.area.map((v) => v.x))).toBeGreaterThan(down.rect.x + down.rect.w);
  });

  it('the arrival from the market by the archway is where an owl coming back through it stands', () => {
    const l1 = ROOMS['l1']!;
    expect(arrivalPoint(l1, 'market', 'market', { axis: 'y', t: 0.5 })).toEqual(l1.spawns['market']);
    const market = ROOMS['market']!;
    expect(arrivalPoint(market, 'default', 'l1', { axis: 'x', t: 0.5 })).toEqual(market.spawns['default']);
  });
});

describe('reading the tree at a glance (OP-173)', () => {
  const playTiles = (room: RoomDef) => backgroundTiles(room).filter((t) => (t.rate ?? 1) === 1);

  it("fronts and shades are shapes inside one tile of a tree room's playfield, each named once", () => {
    for (const room of ALL_ROOMS) {
      const shapes = [...(room.fronts ?? []), ...(room.shades ?? [])];
      if (mapOf(room) !== 2) {
        expect(shapes, room.id).toEqual([]);
        continue;
      }
      const ids = new Set<string>();
      for (const s of shapes) {
        expect(ids.has(s.id), `${room.id} ${s.id} twice`).toBe(false);
        ids.add(s.id);
        expect(s.poly.length, s.id).toBeGreaterThanOrEqual(3);
        const xs = s.poly.map((p) => p.x);
        const ys = s.poly.map((p) => p.y);
        expect(playTiles(room).some((t) => Math.min(...xs) >= t.x && Math.max(...xs) <= t.x + ROOM_W), `${room.id} ${s.id} lies in one playfield tile`).toBe(true);
        expect(Math.min(...ys) >= 0 && Math.max(...ys) <= room.size.h, `${room.id} ${s.id} inside the room`).toBe(true);
      }
      for (const s of room.shades ?? []) expect(s.alpha > 0 && s.alpha <= 0.6, `${s.id} shades by ${s.alpha}`).toBe(true);
    }
  });

  it("a tree room's doorways to other rooms each have a mark over the arch, and only those", () => {
    for (const room of ALL_ROOMS) {
      for (const d of room.doors) {
        if (mapOf(room) === 2 && d.to) expect(d.markAt, `${room.id} ${d.id}`).toBeDefined();
        if (!d.markAt) continue;
        expect(mapOf(room), `${room.id} ${d.id}`).toBe(2);
        expect(d.to, d.id).toBeDefined();
        expect(d.markAt.y, `${d.id}'s mark stands over it`).toBeLessThan(d.rect.y);
        expect(Math.abs(d.markAt.x - (d.rect.x + d.rect.w / 2)), `${d.id}'s mark is over it`).toBeLessThan(80);
      }
    }
  });
});

describe('a tree level’s placed spots (OP-156)', () => {
  it('are each one of its level’s named spots, once, at a whole room pixel inside the room; no other room has any', () => {
    for (const room of ALL_ROOMS) {
      const places = room.places ?? [];
      // The hollow hall is drawn from the kit, no level's painting: it has no named spots.
      if (mapOf(room) !== 2 || room.course || NEW_MAP_HALL.includes(room.id)) {
        expect(places, room.id).toEqual([]);
        continue;
      }
      const names = treeSpotsFor(room.id).map((s) => s.id);
      expect(names.length, `${room.id} is a level of the tree with named spots`).toBeGreaterThan(0);
      const seen = new Set<string>();
      for (const { id, at } of places) {
        expect(names, `${room.id} ${id} is one of its level's names`).toContain(id);
        expect(seen.has(id), `${room.id} ${id} twice`).toBe(false);
        seen.add(id);
        expect(Number.isInteger(at.x) && Number.isInteger(at.y), `${room.id} ${id} at whole pixels`).toBe(true);
        expect(at.x >= 0 && at.x <= room.size.w && at.y >= 0 && at.y <= room.size.h, `${room.id} ${id} inside the room`).toBe(true);
      }
    }
  });
});

describe('the street and the nests', () => {
  const street = ROOMS[STREET_ROOM]!;
  const door = (room: RoomDef, id: string) => room.doors.find((d) => d.id === id)!;

  it("the lobby's west end leads to the street, and the street's east end back", () => {
    const out = door(ROOMS.lobby!, 'to-homes');
    expect(out.rect.x).toBe(0);
    expect(out.rect.x + out.rect.w).toBeLessThanOrEqual(110);
    expect(out.to).toEqual({ room: STREET_ROOM, spawn: 'from-lobby' });
    const back = door(street, 'to-lobby');
    expect(back.rect.x + back.rect.w).toBe(street.size.w);
    expect(back.to).toEqual({ room: 'lobby', spawn: 'from-homes' });
  });

  it('the street is two screens, painted as homes-west and homes', () => {
    expect(street.id).toBe(STREET_ROOM);
    expect(street.size).toEqual({ w: 2 * ROOM_W, h: ROOM_H });
    expect(backgroundTiles(street).map((t) => [t.key, t.x])).toEqual([
      ['homes-west', 0],
      ['homes', ROOM_W],
    ]);
  });

  it('six nest doors stand along the street, door 0 nearest the lobby, each with its marker over it and a spawn in front', () => {
    const nests = street.doors.filter((d) => d.id.startsWith('nest-door-'));
    expect(nests.map((d) => d.id)).toEqual(Array.from({ length: STREET_DOORS }, (_, n) => `nest-door-${n}`));
    expect(street.doors.filter((d) => nestDoorIndex(d.id) === null).map((d) => d.id)).toEqual(['to-lobby']);
    expect(Object.keys(street.spawns).sort()).toEqual(['default', 'from-lobby', ...nests.map((_, n) => `from-nest-${n}`)].sort());
    const lobbyEnd = rectCenter(door(street, 'to-lobby').rect);
    nests.forEach((d, n) => {
      expect(nestDoorIndex(d.id)).toBe(n);
      // Door 0 is the visitor's own nest and the others someone else's, so where each leads is decided per visitor.
      expect(d.to, d.id).toBeUndefined();
      expect(d.closedSign, d.id).toBeUndefined();
      expect(d.marker, d.id).toBeDefined();
      expect(d.marker!.y, `${d.id} marker over the doorway`).toBeLessThan(d.rect.y);
      expect(d.marker!.x, `${d.id} marker over the doorway`).toBeGreaterThanOrEqual(d.rect.x);
      expect(d.marker!.x, `${d.id} marker over the doorway`).toBeLessThanOrEqual(d.rect.x + d.rect.w);
      const prev = nests[n - 1];
      if (prev) {
        expect(distance(rectCenter(d.rect), lobbyEnd), `${d.id} further from the lobby than ${prev.id}`).toBeGreaterThan(distance(rectCenter(prev.rect), lobbyEnd));
        expect(distance(rectCenter(d.rect), rectCenter(prev.rect)), `${d.id} spread from ${prev.id}`).toBeGreaterThanOrEqual(400);
      }
      // Out of a nest, the owl stands in front of the door it went in by, nearer it than any other.
      const back = street.spawns[`from-nest-${n}`]!;
      expect(distanceToRect(back, d.rect), `from-nest-${n}`).toBeLessThanOrEqual(80);
      for (const other of nests) if (other !== d) expect(distanceToRect(back, other.rect), `from-nest-${n} vs ${other.id}`).toBeGreaterThan(distanceToRect(back, d.rect));
    });
    expect(nests.filter((d) => d.rect.x + d.rect.w <= ROOM_W).length, 'doors on the west screen').toBeGreaterThan(0);
    expect(nests.filter((d) => d.rect.x >= ROOM_W).length, 'doors on the east screen').toBeGreaterThan(0);
  });

  it('one walk from wherever an owl appears on the street takes it to any door, and out of a nest', () => {
    // Owls walk in straight lines, stopping where the floor ends, so each doorstep reaches into the
    // lane far enough that a walk along it to a door ends on the doorstep.
    for (const [name, from] of Object.entries(street.spawns)) {
      for (const d of street.doors) expect(pointInRect(resolveTarget(from, rectCenter(d.rect), street.walkable), d.rect), `${d.id} from ${name}`).toBe(true);
    }
    const out = door(NEST_ROOM, 'to-street');
    expect(pointInRect(resolveTarget(NEST_ROOM.spawns['default']!, rectCenter(out.rect), NEST_ROOM.walkable), out.rect)).toBe(true);
  });

  it('a nest is one screen painted as nest, with a spawn inside, the door out to the street and the mirror', () => {
    expect(NEST_ROOM.size).toEqual({ w: ROOM_W, h: ROOM_H });
    expect(backgroundTiles(NEST_ROOM)).toEqual([{ key: 'nest', x: 0, y: 0 }]);
    expect(NEST_ROOM.spawns['default']).toBeDefined();
    expect(NEST_ROOM.doors.map((d) => d.id)).toEqual(['to-street', 'mirror']);
    expect(door(NEST_ROOM, 'to-street').to?.room).toBe(STREET_ROOM);
    // A template, not a room of the registry: each nest is this room under its own id.
    expect(Object.hasOwn(ROOMS, NEST_ROOM.id)).toBe(false);
    expect(Object.values(ROOMS)).not.toContain(NEST_ROOM);
  });
});

describe('the arcade', () => {
  const arcade = ROOMS['arcade']!;
  const spot = (id: string) => arcade.doors.find((d) => d.id === id)!;

  it('is a hall three screens long, painted as arcade, arcade-mid and arcade-end', () => {
    expect(arcade.size).toEqual({ w: 3 * ROOM_W, h: ROOM_H });
    expect(backgroundTiles(arcade).map((t) => [t.key, t.x, t.y])).toEqual([
      ['arcade', 0, 0],
      ['arcade-mid', ROOM_W, 0],
      ['arcade-end', 2 * ROOM_W, 0],
    ]);
  });

  it('has a bay for each cabinet, west to east, with its spot on the floor in front and its marker on the same screen', () => {
    const cabinets = ['cabinet-crossing', 'cabinet-flight', 'cabinet-sling'];
    expect(cabinets.map((id) => Math.floor(rectCenter(spot(id).rect).x / ROOM_W))).toEqual([0, 1, 2]);
    for (const id of cabinets) {
      expect(isWalkable(rectCenter(spot(id).rect), arcade.walkable), `${id} on the floor`).toBe(true);
      expect(Math.floor(spot(id).marker!.x / ROOM_W), `${id} marker`).toBe(Math.floor(rectCenter(spot(id).rect).x / ROOM_W));
    }
  });

  it('is entered from the street at its west end, where an owl arrives clear of the doorway', () => {
    const door = spot('to-market');
    expect(door.rect.x).toBe(0);
    expect(door.to).toEqual({ room: 'market', spawn: 'from-arcade' });
    const arrive = findSpawn(arcade, 'from-market');
    expect(arrive.x).toBeLessThan(ROOM_W / 4);
    expect(distanceToRect(arrive, door.rect)).toBeGreaterThan(60);
  });
});

describe("a nest's mirror (OP-077)", () => {
  const mirror = NEST_ROOM.doors.find((d) => d.id === 'mirror')!;

  it('is a spot to stand at, not a way out, on the floor in front of the mirror', () => {
    expect(mirror.to).toBeUndefined();
    expect(isWalkable(NEST_MIRROR, NEST_ROOM.walkable)).toBe(true);
    for (const corner of [
      { x: mirror.rect.x, y: mirror.rect.y },
      { x: mirror.rect.x + mirror.rect.w, y: mirror.rect.y },
      { x: mirror.rect.x, y: mirror.rect.y + mirror.rect.h },
      { x: mirror.rect.x + mirror.rect.w, y: mirror.rect.y + mirror.rect.h },
    ])
      expect(isWalkable(corner, NEST_ROOM.walkable), JSON.stringify(corner)).toBe(true);
    // In front of the mirror's foot, so an owl standing there is drawn before it.
    expect(mirror.rect.y).toBeGreaterThan(NEST_MIRROR.y);
    expect(distanceToRect(NEST_MIRROR, mirror.rect)).toBeLessThan(60);
  });

  it('stands clear of the doorway and of the furniture spots, so it is the same in every nest', () => {
    const out = NEST_ROOM.doors.find((d) => d.id === 'to-street')!;
    expect(distanceToRect(NEST_MIRROR, out.rect)).toBeGreaterThan(200);
    expect(distanceToRect(rectCenter(mirror.rect), out.rect)).toBeGreaterThan(200);
    // Its frame (84 px wide) clear of the pieces on the floor beside it, and below the wall's.
    for (const spot of NEST_SPOTS.filter((s) => s.place === 'floor')) {
      expect(distance(spot, NEST_MIRROR), spot.id).toBeGreaterThan(100);
      expect(pointInRect(spot, mirror.rect), spot.id).toBe(false);
    }
    for (const spot of NEST_SPOTS.filter((s) => s.place === 'wall')) expect(NEST_MIRROR.y - 150, spot.id).toBeGreaterThan(spot.y + 60);
  });

  it('stands high on the floor, where a phone shows it above the pad and the stick in the front corners', () => {
    const front = Math.max(...NEST_ROOM.walkable[0]!.map((p) => p.y));
    expect(front - NEST_MIRROR.y).toBeGreaterThan(200);
  });

  it('has a spawn before it, facing it, where Play puts the owl (OP-105)', () => {
    const at = NEST_ROOM.spawns['mirror']!;
    expect(pointInRect(at, mirror.rect)).toBe(true);
    expect(findSpawn(NEST_ROOM, 'mirror')).toEqual(at);
    // The way out is one walk away from it.
    const out = NEST_ROOM.doors.find((d) => d.id === 'to-street')!;
    expect(pointInRect(resolveTarget(at, rectCenter(out.rect), NEST_ROOM.walkable), out.rect)).toBe(true);
  });
});

describe("the nest's way to the park (OP-105)", () => {
  it('has its sign on the round door, clear of every wall piece in every wall spot and of the mirror', () => {
    const out = NEST_ROOM.doors.find((d) => d.id === 'to-street')!;
    // On the doorway, above the door's glow, and well above any owl standing in it.
    expect(Math.abs(NEST_PARK_SIGN.x - rectCenter(out.rect).x)).toBeLessThan(40);
    expect(NEST_PARK_SIGN.y).toBeLessThan(out.marker!.y - 150);
    // The words (about 160 x 32 room pixels) never meet a wall piece, however wide or tall, in any wall spot.
    const sign = { x: NEST_PARK_SIGN.x - 80, y: NEST_PARK_SIGN.y - 32, w: 160, h: 32 };
    for (const spot of NEST_SPOTS.filter((s) => s.place === 'wall')) {
      for (const piece of FURNITURE.filter((f) => f.place === 'wall')) {
        const box = { x: spot.x - piece.size.w / 2, y: spot.y - piece.size.h, w: piece.size.w, h: piece.size.h };
        const apart = box.x + box.w <= sign.x || sign.x + sign.w <= box.x || box.y + box.h <= sign.y || sign.y + sign.h <= box.y;
        expect(apart, `${piece.id} in ${spot.id}`).toBe(true);
      }
    }
    expect(distance(NEST_PARK_SIGN, NEST_MIRROR)).toBeGreaterThan(250);
  });
});

describe('finding a room by its id', () => {
  it('finds the rooms of the registry as they are', () => {
    for (const [id, room] of Object.entries(ROOMS)) {
      expect(roomFor(id)).toBe(room);
      expect(getRoom(id)).toBe(room);
    }
  });

  it('makes a nest from the template under its own id, leaving the template as it was', () => {
    const nest = roomFor('nest-k3x9q2ab')!;
    expect(nest).toEqual({ ...NEST_ROOM, id: 'nest-k3x9q2ab' });
    expect(getRoom('nest-k3x9q2ab')).toEqual(nest);
    expect(roomFor('nest-00000000')?.id).toBe('nest-00000000');
    expect(NEST_ROOM.id).toBe('nest');
  });

  it('finds no room for anything else, where getRoom still falls back to the hub', () => {
    for (const id of ['', 'nest', 'nest-', 'nest-K3X9Q2AB', 'nest-k3x9q2a', 'nest-k3x9q2abc', 'nests', 'Hub', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(roomFor(id), id).toBeUndefined();
      expect(getRoom(id), id).toBe(ROOMS.hub);
    }
  });
});

describe('hiding spots', () => {
  it('the lobby, the street and the nests have none: they are outside the park', () => {
    expect(ROOMS.lobby?.spots).toBeUndefined();
    expect(ROOMS[STREET_ROOM]?.spots).toBeUndefined();
    expect(NEST_ROOM.spots).toBeUndefined();
  });

  for (const room of Object.values(ROOMS).filter((r) => r.spots)) {
    describe(room.id, () => {
      const spots = room.spots ?? [];

      it('has 6 to 12 spots on every screen, spread apart', () => {
        for (const t of backgroundTiles(room)) {
          const here = spots.filter((s) => s.x >= t.x && s.x < t.x + ROOM_W && s.y >= t.y && s.y < t.y + ROOM_H);
          expect(here.length, `${room.id} screen ${t.key}`).toBeGreaterThanOrEqual(6);
          expect(here.length, `${room.id} screen ${t.key}`).toBeLessThanOrEqual(12);
        }
        for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(distance(spots[i]!, spots[j]!)).toBeGreaterThanOrEqual(60);
      });

      it('puts every spot on the floor or up on a perch single jumps reach, 60 px or more from every doorway and spot', () => {
        const tiers = perchTiers(room);
        for (const s of spots) {
          if (s.top) {
            // A quest never asks for more than single jumps: the perch is a tier 1 one (routes.ts).
            const perch = room.perches?.find((p) => p.top === s.top && pointInPolygon(s, p.area));
            expect(perch, `${room.id} ${s.x},${s.y} on a perch with top ${s.top}`).toBeDefined();
            expect(tiers[perch!.id], `${room.id} ${s.x},${s.y} on ${perch!.id}`).toBe(1);
          } else expect(isWalkable(s, room.walkable), `${room.id} ${s.x},${s.y} walkable`).toBe(true);
          for (const d of room.doors) expect(distanceToRect(s, d.rect), `${room.id} ${s.x},${s.y} vs ${d.id}`).toBeGreaterThanOrEqual(60);
        }
      });
    });
  }
});

describe('the stained-glass realm (gated)', () => {
  const hub = ROOMS.hub!;
  const glass = ROOMS.glass!;

  it('is the one gated room of today\'s park, two screens wide, with the arch back, the idol and the portal', () => {
    expect(GATED_ROOMS.filter((id) => mapOf(getRoom(id)) === 1)).toEqual(['glass']);
    expect(glass.gated).toBe(true);
    expect(glass.size).toEqual({ w: 2 * ROOM_W, h: ROOM_H });
    expect(glass.doors.map((d) => d.id)).toEqual(['to-hub', 'idol', 'portal']);
    expect(glass.doors.find((d) => d.id === 'to-hub')?.to).toEqual({ room: 'hub', spawn: 'from-glass' });
    expect(ANCHORS.glass).toBeDefined();
  });

  it("opens from the hub's east arch, which keeps its sign and blockade while the realm is closed; the west arch stays boarded", () => {
    const arch = hub.doors.find((d) => d.id === 'to-glass')!;
    expect(arch.to).toEqual({ room: 'glass', spawn: 'from-hub' });
    expect(arch.closedSign).toBe('Hatching Soon');
    const boarded = hub.doors.filter((d) => d.closedSign && !d.to);
    expect(boarded.map((d) => d.id)).toEqual(['closed-a']);
    for (const d of hub.doors) if (d.closedSign) expect(CLOSED_SIGNS).toContain(d.closedSign);
    // The floor now runs through the arch to its threshold, and the spawn back from the realm stands clear of it.
    expect(isWalkable({ x: 2665, y: 640 }, hub.walkable)).toBe(true);
    expect(isWalkable({ x: 2665, y: 740 }, hub.walkable)).toBe(true);
    expect(pointInRect(hub.spawns['from-glass']!, arch.rect)).toBe(false);
  });
});

describe("doorways keep the owl's lane (OP-124)", () => {
  const exits = Object.values(ROOMS).flatMap((room) => room.doors.filter((d) => d.to).map((door) => ({ room, door, to: ROOMS[door.to!.room]! })));
  const through = (e: (typeof exits)[number], t: number) => arrivalPoint(e.to, e.door.to!.spawn, e.room.id, { axis: doorAxis(e.room, e.door), t });

  it('lands every lane of every doorway on the floor, out of the exits and near its spawn', () => {
    expect(exits.length).toBeGreaterThan(10);
    for (const e of exits) {
      const spawn = e.to.spawns[e.door.to!.spawn]!;
      for (const t of [0, 0.25, 0.5, 0.75, 1]) {
        const p = through(e, t);
        const where = `${e.room.id}:${e.door.id} t=${t}`;
        expect(isWalkable(p, e.to.walkable), where).toBe(true);
        expect(inExit(e.to, p), where).toBe(false);
        // The room server keeps an arrival within its resume radius of the spawn (LIMITS.resumeRadius, 240).
        expect(distance(p, spawn), where).toBeLessThanOrEqual(240);
      }
    }
  });

  it('keeps the lane where both doorways run the same way; round a corner the owl arrives at the spawn', () => {
    const keeping = exits.filter((e) => {
      const [a, b] = [through(e, 0), through(e, 1)];
      return a.x !== b.x || a.y !== b.y;
    });
    // The stained-glass street's way back is its painted arch in the far wall (OP-127), as the hub's east arch is.
    // In the tree, the stairs between levels and level 3's doorway into the stained-glass street
    // do too: an owl comes out as far along the floor from the spawn as it went in from the doorway's middle.
    expect(keeping.map((e) => `${e.room.id}:${e.door.id}`).sort()).toEqual([
      'glass:to-hub', 'grove:to-hub', 'homes:to-lobby', 'hub:to-glass', 'hub:to-grove', 'hub:to-lobby', 'l0:stair-l1-l0', 'l1:stair-l1-l0', 'l1:stair-l2-l1', 'l2:stair-l2-l1', 'l2:stair-l3-l2', 'l3:stair-l3-l2', 'l3:stair-l4-l3', 'l3:to-glass', 'l4:stair-l4-l3', 'l4:stair-l5-l4', 'l5-street:gate', 'l5:stair-l5-l4', 'l5:to-street', 'lobby:gate', 'lobby:to-homes',
      // The test course's acts (OP-224, trialCourse.ts): each act's doorway east into the next, and back west.
      'trail-1:east', 'trail-2:east', 'trail-2:west', 'trail-3:west',
      // The Updraft Canopy (OP-226, updraftCanopy.ts): its doorways and hatches between the rooms of the course, both ways.
      'canopy-1:roots', 'canopy-1:to-trunk', 'canopy-2a:down', 'canopy-2a:hatch-up', 'canopy-2b:down', 'canopy-2b:hatch-up', 'canopy-2c:down', 'canopy-2c:hatch-up', 'canopy-3:down', 'canopy-roots:out',
      // The new map's stairs between its levels (NEW_MAP), as the levels' own.
      'm3-ground:stair-l1-l0', 'm3-ground:stair-l2-l1', 'm3-stair-1:stair-l3-l2', 'm3-stair-2:stair-l4-l3', 'm3-stair-2:stair-l5-l4', 'm3-stair-3:stair-l2-l1', 'm3-stair-3:stair-l3-l2', 'm3-under:stair-l1-l0',
      // The hollow hall (hollowHall.ts): each landing's doorway into its Commons, and each Commons' way out back to it.
      'm3-hall:to-glass', 'm3-hall:to-grove', 'm3-hall:to-ink', 'm3-hall:to-market', 'commons-glass:out', 'commons-grove:out', 'commons-ink:out', 'commons-market:out',
    ].sort());
  });

  it("takes the owl through the gate's left turnstile, between the plinth and the first post, onto the hub's path at its left", () => {
    const lobby = ROOMS['lobby']!;
    const hub = ROOMS['hub']!;
    const gate = lobby.doors.find((d) => d.id === 'gate')!;
    const left = { x: 2365, y: 708 };
    expect(isWalkable(left, lobby.walkable)).toBe(true);
    expect(pointInRect(left, gate.rect)).toBe(true);
    const fromLeft = arrivalPoint(hub, 'default', 'lobby', laneThrough(lobby, gate, left));
    const fromMiddle = arrivalPoint(hub, 'default', 'lobby', laneThrough(lobby, gate, { x: 2570, y: 700 }));
    expect(fromMiddle).toEqual(hub.spawns['default']);
    expect(fromLeft.x).toBeLessThan(fromMiddle.x - 60);
    expect(fromLeft.y).toBe(fromMiddle.y);
  });
});

describe("the realms' guardians (OP-112)", () => {
  it('stand in every realm with a Realm Vote spot, and only there', () => {
    // A Commons of the hollow hall holds its realm's idol (votesFor), as the realm itself does until the hall opens.
    const voting = [...new Set(Object.values(ROOMS).filter((r) => r.doors.some((d) => d.id === 'idol')).map((r) => r.votesFor ?? r.id))];
    expect(GUARDIANS.filter((g) => !g.reserved).map((g) => g.realm).sort()).toEqual(voting.sort());
  });

  it('are a different real species in every realm, the held ones too', () => {
    const species = GUARDIANS.map((g) => g.species);
    expect(new Set(species).size).toBe(species.length);
    expect(new Set(GUARDIANS.map((g) => g.realm)).size).toBe(GUARDIANS.length);
    for (const s of species) expect(OWL_SPECIES).toContain(s);
    expect(GUARDIANS.find((g) => g.realm === 'market')?.species).toBe('barred');
  });

  it('hold a species for a realm not open yet, which has no room', () => {
    const held = GUARDIANS.filter((g) => g.reserved);
    expect(held.map((g) => g.species).sort()).toEqual(['burrowing', 'snowy']);
    for (const g of held) expect(Object.hasOwn(ROOMS, g.realm)).toBe(false);
  });

  it("name species from the list the visitors' owls come from", () => {
    for (const s of SPECIES) expect(OWL_SPECIES).toContain(s.id);
  });
});

/**
 * An owl flown step by step while it walks from `from` towards `to` at the walk's pace on the
 * footing for its height, coming down on the ground under it: as its own page flies it (OP-084).
 */
function flyOver(room: RoomDef, from: Vec2, to: Vec2, plan: Array<[FlightInput, number]>, start: Flier = newFlier()): { fl: Flier; pos: Vec2 } {
  let fl = start;
  let pos = { ...from };
  const step = (WALK_SPEED * FLIGHT_STEP_MS) / 1000;
  for (const [input, n] of plan) {
    for (let i = 0; i < n; i++) {
      fl = stepFlier(fl, i === 0 ? input : { ...input, pressed: false }, groundAt(room.perches, pos, fl.air.z));
      const f = footing(room, fl.air.z);
      const goal = resolveTarget(pos, to, f.walkable, f.shut);
      const left = distance(pos, goal);
      if (left > 0.01) pos = left <= step ? goal : { x: pos.x + ((goal.x - pos.x) / left) * step, y: pos.y + ((goal.y - pos.y) / left) * step };
    }
  }
  return { fl, pos };
}
const steps = (ms: number) => Math.round(ms / FLIGHT_STEP_MS);
const PRESS: FlightInput = { pressed: true, held: true };
const HOLD: FlightInput = { pressed: false, held: true };
const NONE: FlightInput = { pressed: false, held: false };

describe('spawns up on a perch (the hollow hall)', () => {
  it('name a spawn of the room and stand on a perch that high there', () => {
    for (const room of ALL_ROOMS) {
      for (const [name, top] of Object.entries(room.spawnTops ?? {})) {
        const at = room.spawns[name];
        expect(at, `${room.id}: spawnTops names ${name}, no spawn of the room`).toBeDefined();
        expect(top, `${room.id} ${name}`).toBeGreaterThan(0);
        expect(groundAt(room.perches, at!, top), `${room.id} ${name}: a perch ${top} high there`).toBe(top);
      }
    }
  });
});

describe('perches (OP-084)', () => {
  it('stand in the room, drawn inside it, no higher than a perch may be, each by a floor or a perch to jump from', () => {
    for (const room of ALL_ROOMS) {
      const ids = new Set<string>();
      for (const p of room.perches ?? []) {
        expect(ids.has(p.id), `${room.id}: ${p.id} twice`).toBe(false);
        ids.add(p.id);
        expect(p.area.length, p.id).toBeGreaterThanOrEqual(3);
        expect(p.top, p.id).toBeGreaterThan(0);
        expect(p.top, p.id).toBeLessThanOrEqual(perchTopLimit(room.size.h));
        for (const v of p.area) {
          expect(v.x >= 0 && v.x <= room.size.w && v.y <= room.size.h, `${p.id} ${v.x},${v.y}`).toBe(true);
          expect(v.y - p.top, `${p.id}: its top is drawn above the room`).toBeGreaterThanOrEqual(0);
        }
        // Somewhere under it or beside it to take off from: its area meets the floor or another perch's.
        // A tree room's parkour sets ledges apart across gaps (OP-084's tiers): the tree's reach test
        // below finds every one of them a way up instead.
        if (mapOf(room) === 2) continue;
        const others = (room.perches ?? []).filter((o) => o !== p).map((o) => o.area);
        const meets = p.area.some((v) => isWalkable(v, room.walkable) || others.some((o) => pointInPolygon(v, o)));
        expect(meets, `${room.id}: ${p.id} meets no floor or perch`).toBe(true);
      }
    }
  });

  it('that meet stand level, or one more than PERCH_SLACK above the other: an owl walks across only on the level', () => {
    // A top a little above where the owl stands would lift it as it walks on (groundAt's slack), with
    // no landing for its page to draw or tell the room: what meets is level, or a jump up.
    for (const room of ALL_ROOMS) {
      const perches = room.perches ?? [];
      for (const a of perches)
        for (const b of perches) {
          if (a === b || gapBetween(a.area, b.area) > 0) continue;
          const step = Math.abs(a.top - b.top);
          expect(step === 0 || step > PERCH_SLACK, `${room.id}: ${a.id} and ${b.id} meet ${step} px apart`).toBe(true);
        }
    }
  });

  it('each have a route up from the floor, by single jumps, the second flap or a glide (routes.ts)', () => {
    for (const room of ALL_ROOMS) for (const [id, tier] of Object.entries(perchTiers(room))) expect(tier, `${room.id}: nothing reaches ${id}`).not.toBeNull();
  });

  it('hold what sits up on them, each on a perch with that very top, where an owl standing on it is drawn', () => {
    for (const room of ALL_ROOMS) {
      const raised: Array<[string, Vec2, number]> = [
        ...(room.spots ?? []).filter((s) => s.top).map((s): [string, Vec2, number] => [`spot ${s.x},${s.y}`, s, s.top!]),
        ...INTERACTABLES.filter((t) => t.room === room.id && t.top).map((t): [string, Vec2, number] => [t.id, t.pos, t.top!]),
      ];
      for (const [name, p, top] of raised) {
        expect(room.perches?.some((perch) => perch.top === top && pointInPolygon(p, perch.area)), `${room.id} ${name}`).toBe(true);
        // What an owl there comes down on is that perch, from the floor's side too: nothing higher hides it.
        expect(groundAt(room.perches, p, top), `${room.id} ${name}`).toBe(top);
      }
    }
    // The hub's first: two quest spots on the bench, a leaf pile on the beam.
    expect(ROOMS['hub']!.spots?.filter((s) => s.top === 80)).toHaveLength(2);
    expect(INTERACTABLES.find((t) => t.id === 'hub-leaves-beam')?.top).toBe(264);
  });

  it("the hub's bench is a jump up from the floor, and the lantern beam a jump and the second flap up from the bench", () => {
    const hub = ROOMS['hub']!;
    const atFace = { x: 900, y: 740 };
    const onBench = { x: 900, y: 696 };
    // From the floor: walk to the bench, held there at its face, jump and keep walking: up on its seat.
    const up = flyOver(hub, atFace, onBench, [[NONE, steps(400)], [PRESS, steps(320)], [NONE, steps(900)]]);
    expect(up.fl.air).toEqual({ z: 80, vz: 0, s: GROUNDED, f: 0 });
    expect(distance(up.pos, onBench)).toBeLessThan(1);
    // Without the jump the face holds the owl on the floor.
    const held = flyOver(hub, atFace, onBench, [[NONE, steps(1500)]]);
    expect(held.fl.air.z).toBe(0);
    expect(held.pos.y).toBeGreaterThan(712);
    // From the bench, a jump alone falls short of the beam and comes back down on the bench.
    const standing: Flier = { ...newFlier(), air: { z: 80, vz: 0, s: GROUNDED, f: 0 } };
    const short = flyOver(hub, onBench, onBench, [[PRESS, steps(360)], [NONE, steps(1200)]], standing);
    expect(short.fl.air).toEqual({ z: 80, vz: 0, s: GROUNDED, f: 0 });
    // A jump, and the second flap at its top: up on the beam.
    const flap = flyOver(hub, onBench, onBench, [[PRESS, steps(330)], [NONE, steps(10)], [PRESS, steps(300)], [NONE, steps(1200)]], standing);
    expect(flap.fl.air).toEqual({ z: 264, vz: 0, s: GROUNDED, f: 0 });
    // Walked off the beam's east end, where it bends down into the trunk: down onto the bench below.
    const onBeam: Flier = { ...newFlier(), air: { z: 264, vz: 0, s: GROUNDED, f: 0 } };
    const off = flyOver(hub, { x: 1100, y: 696 }, { x: 1200, y: 696 }, [[NONE, steps(1500)]], onBeam);
    expect(off.fl.air).toEqual({ z: 80, vz: 0, s: GROUNDED, f: 0 });
    // And a glide off the bench's front carries the owl out over the floor, slowly, before it lands.
    const glide = flyOver(hub, onBench, { x: 900, y: 900 }, [[PRESS, steps(200)], [HOLD, steps(2000)]], standing);
    expect(glide.fl.air.z).toBeGreaterThan(0);
    expect(glide.pos.y).toBeGreaterThan(850);
    const landed = flyOver(hub, onBench, { x: 900, y: 900 }, [[PRESS, steps(200)], [HOLD, steps(4000)]], standing);
    expect(landed.fl.air).toEqual({ z: 0, vz: 0, s: GROUNDED, f: 0 });
  });
});

// ---- The tree (map 2, OP-128 and OP-156): a side-scrolling world, dark until it opens ----
describe('the tree (map 2)', () => {
  // The tree visitors walk: the new map's copies of its levels (NEW_MAP) have their own tests below.
  const tree = Object.values(ROOMS).filter((r) => mapOf(r) === 2 && !isNewMapRoom(r.id) && !r.course);
  const l1 = getRoom('l1');
  /** The tree's floor strip's y extent, from a polygon of it. */
  const yRange = (poly: readonly Vec2[]): [number, number] => [Math.min(...poly.map((p) => p.y)), Math.max(...poly.map((p) => p.y))];

  it('is a room of its own map, gated, with owls a quarter bigger: level 1, four screens with the lobby second', () => {
    expect(tree.map((r) => r.id)).toEqual(['l1', 'l4', 'l3', 'l2', 'l5-street', 'l5', 'l0', 'l0-arcade']);
    for (const r of tree) {
      expect(r.gated, `${r.id} is dark until the keepers open it`).toBe(true);
      expect(GATED_ROOMS).toContain(r.id);
      expect(r.owlScale).toBe(1.25);
    }
    expect(mapOf(getRoom('hub'))).toBe(1);
    expect(l1.size).toEqual({ w: 4 * ROOM_W, h: ROOM_H });
    // West to east: the closed gate, the lobby at the trunk's foot, the market's square, its roof run.
    const screens = ['w1', '0', 'e1', 'e2'];
    const at = (t: { key: string; x: number }) => [t.key, t.x / ROOM_W];
    expect(backgroundTiles(l1).filter((t) => (t.rate ?? 1) === 1).map(at)).toEqual(screens.map((s, i) => [`tree-l1-${s}-play`, i]));
    expect(backgroundTiles(l1).filter((t) => t.rate === 0.75).map(at)).toEqual(screens.map((s, i) => [`tree-l1-${s}-mid`, i]));
    expect(foregroundTiles(l1).map((t) => [...at(t), t.rate])).toEqual(screens.map((s, i) => [`tree-l1-${s}-fg`, i, 1.2]));
    // The skies are drawn farthest from the lobby first, so each lies over the one beyond it, and the
    // lobby's on top of both its neighbours: its own view stays the approved painting.
    expect(backgroundTiles(l1).filter((t) => t.rate === 0.5).map(at)).toEqual([['tree-l1-e2-bg', 3], ['tree-l1-e1-bg', 2], ['tree-l1-w1-bg', 0], ['tree-l1-0-bg', 1]]);
    // The layers are drawn sky, middle distance, playfield: farthest first.
    expect(backgroundTiles(l1).map((t) => t.rate ?? 1)).toEqual([0.5, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.75, 1, 1, 1, 1]);
  });

  it('level 4 is two screens in six layers: only the back scenery is quieted, the front props drawn over the owls (OP-159)', () => {
    const l4 = getRoom('l4');
    expect(l4.size).toEqual({ w: 2 * ROOM_W, h: ROOM_H });
    const at = (t: { key: string; x: number }) => [t.key, t.x / ROOM_W];
    const ones = backgroundTiles(l4).filter((t) => (t.rate ?? 1) === 1);
    expect(ones.map(at)).toEqual([['tree-l4-0-back', 0], ['tree-l4-e1-back', 1], ['tree-l4-0-play', 0], ['tree-l4-e1-play', 1]]);
    expect(ones.map((t) => !!t.plain)).toEqual([false, false, true, true]);
    // Farthest first: the skies (the landing's on top), the landing's middle distance, then the room.
    expect(backgroundTiles(l4).map((t) => t.rate ?? 1)).toEqual([0.5, 0.5, 0.75, 1, 1, 1, 1]);
    expect(backgroundTiles(l4).filter((t) => t.rate === 0.5).map(at)).toEqual([['tree-l4-e1-bg', 1], ['tree-l4-0-bg', 0]]);
    // In front of the owls: the front props with the room, then the overlay over them.
    expect(foregroundTiles(l4).map((t) => [...at(t), t.rate ?? 1, !!t.plain])).toEqual([
      ['tree-l4-0-front', 0, 1, true],
      ['tree-l4-e1-front', 1, 1, true],
      ['tree-l4-0-fg', 0, 1.2, false],
      ['tree-l4-e1-fg', 1, 1.2, false],
    ]);
    // No tile of today's park, nor of level 1 (painted before the six layers), is drawn plain.
    for (const r of ALL_ROOMS) if (mapOf(r) !== 2 || r.id === 'l1') expect([...backgroundTiles(r), ...foregroundTiles(r)].some((t) => t.plain), r.id).toBe(false);
  });

  it('level 3 is three screens in six layers, its stair to level 4 taken from its foot and its doorway into the stained-glass street (OP-160, OP-220)', () => {
    const l3 = getRoom('l3');
    const l4 = getRoom('l4');
    expect(l3.size).toEqual({ w: 3 * ROOM_W, h: ROOM_H });
    const at = (t: { key: string; x: number }) => [t.key, t.x / ROOM_W];
    const ones = backgroundTiles(l3).filter((t) => (t.rate ?? 1) === 1);
    expect(ones.filter((t) => !t.plain).map(at)).toEqual(['0', 'e1', 'e2'].map((s, i) => [`tree-l3-${s}-back`, i]));
    expect(ones.filter((t) => t.plain).map(at)).toEqual(['0', 'e1', 'e2'].map((s, i) => [`tree-l3-${s}-play`, i]));
    // Only the landing has front props, and only the landing and the reach a middle distance.
    expect(foregroundTiles(l3).filter((t) => t.plain).map(at)).toEqual([['tree-l3-0-front', 0]]);
    expect(backgroundTiles(l3).filter((t) => t.rate === 0.75).map(at)).toEqual([['tree-l3-0-mid', 0], ['tree-l3-e2-mid', 2]]);
    // The stair joins the two levels both ways: up from level 3's boardwalk at the stair's foot, down from level 4's.
    const up = l3.doors.find((d) => d.id === 'stair-l4-l3')!;
    const down = l4.doors.find((d) => d.id === 'stair-l4-l3')!;
    expect(up.to).toEqual({ room: 'l4', spawn: 'from-l3' });
    expect([up.top, up.way]).toEqual([0, 'up']);
    expect(down.to).toEqual({ room: 'l3', spawn: 'from-l4' });
    expect(down.way).toBe('down');
    expect(down.top).toBe(0);
    expect(l4.spawns['from-l3']).toBeDefined();
    expect(l3.spawns['from-l4']).toBeDefined();
    // The stained-glass street's way out brings an owl walking the tree back to the doorway on the reach.
    expect(l3.doors.find((d) => d.id === 'to-glass')!.to).toEqual({ room: 'glass', spawn: 'default' });
    const out = ROOMS['glass']!.doors.find((d) => d.id === 'to-hub')!;
    expect(doorTarget(out, 1)).toEqual({ room: 'hub', spawn: 'from-glass' });
    expect(doorTarget(out, 2)).toEqual({ room: 'l3', spawn: 'glass' });
  });

  it('level 2 is three screens in six layers, its stairs up to level 3 and down to level 1 joining the levels both ways (OP-161)', () => {
    const l2 = getRoom('l2');
    const l3 = getRoom('l3');
    expect(l2.size).toEqual({ w: 3 * ROOM_W, h: ROOM_H });
    const at = (t: { key: string; x: number }) => [t.key, t.x / ROOM_W];
    const screens = ['w2', 'w1', '0'];
    const ones = backgroundTiles(l2).filter((t) => (t.rate ?? 1) === 1);
    expect(ones.filter((t) => !t.plain).map(at)).toEqual(screens.map((s, i) => [`tree-l2-${s}-back`, i]));
    expect(ones.filter((t) => t.plain).map(at)).toEqual(screens.map((s, i) => [`tree-l2-${s}-play`, i]));
    // The skies, farthest from the trunk first, so the landing's lies on top; only the landing has front props.
    expect(backgroundTiles(l2).filter((t) => t.rate === 0.5).map(at)).toEqual(screens.map((s, i) => [`tree-l2-${s}-bg`, i]));
    expect(foregroundTiles(l2).filter((t) => t.plain).map(at)).toEqual([['tree-l2-0-front', 2]]);
    // Up: from level 2's floor at the stair's foot to level 3's floor; down: from level 3's stairhead to level 2's floor.
    const up = l2.doors.find((d) => d.id === 'stair-l3-l2')!;
    const down = l3.doors.find((d) => d.id === 'stair-l3-l2')!;
    expect(up.to).toEqual({ room: 'l3', spawn: 'from-l2' });
    expect([up.top, up.way]).toEqual([0, 'up']);
    expect(down.to).toEqual({ room: 'l2', spawn: 'from-l3' });
    expect([down.top, down.way]).toEqual([0, 'down']);
    // Level 1's lobby stair leads up from its foot, and level 2's stairhead west of the trunk leads down.
    const fromL1 = l1.doors.find((d) => d.id === 'stair-l2-l1')!;
    const toL1 = l2.doors.find((d) => d.id === 'stair-l2-l1')!;
    expect(fromL1.to).toEqual({ room: 'l2', spawn: 'from-l1' });
    expect([fromL1.top, fromL1.way]).toEqual([0, 'up']);
    expect(toL1.to).toEqual({ room: 'l1', spawn: 'from-l2' });
    expect([toL1.top, toL1.way]).toEqual([0, 'down']);
    for (const [room, spawn] of [[l2, 'from-l3'], [l2, 'from-l1'], [l3, 'from-l2'], [l1, 'from-l2']] as const) expect(room.spawns[spawn], `${room.id} ${spawn}`).toBeDefined();
  });

  it('level 5 is two rooms joined at the front gate: the nests street to the trunk outside, the canopy inside, its stair down to level 4 (OP-158)', () => {
    const street = getRoom('l5-street');
    const canopy = getRoom('l5');
    const l4 = getRoom('l4');
    const at = (t: { key: string; x: number }) => [t.key, t.x / ROOM_W];
    expect(street.size).toEqual({ w: 3 * ROOM_W, h: ROOM_H });
    expect(canopy.size).toEqual({ w: 3 * ROOM_W, h: ROOM_H });
    expect(backgroundTiles(street).filter((t) => t.plain).map(at)).toEqual(['w2', 'w1', '0'].map((s, i) => [`tree-l5-${s}-play`, i]));
    expect(backgroundTiles(canopy).filter((t) => t.plain).map(at)).toEqual(['e1', 'e2', 'e3'].map((s, i) => [`tree-l5-${s}-play`, i]));
    expect(foregroundTiles(street).filter((t) => t.plain).map(at)).toEqual([['tree-l5-0-front', 2]]);
    // The front gate at the street's east end, its turnstiles into the canopy under the arch; back out by the canopy's west end.
    expect(street.doors.find((d) => d.id === 'gate')!.to).toEqual({ room: 'l5', spawn: 'default' });
    expect(canopy.doors.find((d) => d.id === 'to-street')!.to).toEqual({ room: 'l5-street', spawn: 'from-canopy' });
    // Down to level 4 from the canopy's boardwalk, the way into the tree reading as down; up from level 4's floor.
    const down = canopy.doors.find((d) => d.id === 'stair-l5-l4')!;
    const up = l4.doors.find((d) => d.id === 'stair-l5-l4')!;
    expect([down.to, down.top, down.way]).toEqual([{ room: 'l4', spawn: 'from-l5' }, 0, 'down']);
    expect([up.to, up.top, up.way]).toEqual([{ room: 'l5', spawn: 'from-l4' }, 0, 'up']);
    // The street's west end: a doorway for places beyond Owl Park at the foot of bough 6, leading nowhere
    // yet, behind a fallen branch (OP-220); the boughs are shut, so neither room has a ledge.
    const beyond = street.doors.find((d) => d.id === 'closed-beyond')!;
    expect(beyond.to).toBeUndefined();
    expect(beyond.closedSign).toBe('Hatching Soon');
    expect(beyond.top).toBe(0);
    expect(street.barriers?.find((b) => b.id === 'closed-beyond')?.kind).toBe('branch');
    expect(canopy.barriers?.find((b) => b.id === 'bough-7')?.kind).toBe('branch');
    expect([street.perches ?? [], canopy.perches ?? []]).toEqual([[], []]);
    for (const [room, spawn] of [[street, 'from-canopy'], [canopy, 'from-l4'], [l4, 'from-l5']] as const) expect(room.spawns[spawn], `${room.id} ${spawn}`).toBeDefined();
  });

  it('level 0 is the cavern and the arcade cave beside it: the stair up to level 1, the mouth into the cave, the closed stairwell (OP-163)', () => {
    const l0 = getRoom('l0');
    const cave = getRoom('l0-arcade');
    const l1 = getRoom('l1');
    const at = (t: { key: string; x: number }) => [t.key, t.x / ROOM_W];
    expect(l0.size).toEqual({ w: 2 * ROOM_W, h: ROOM_H });
    expect(cave.size).toEqual({ w: 3 * ROOM_W, h: ROOM_H });
    expect(backgroundTiles(l0).filter((t) => t.plain).map(at)).toEqual(['w1', '0'].map((s, i) => [`tree-l0-${s}-play`, i]));
    expect(backgroundTiles(cave).filter((t) => t.plain).map(at)).toEqual(['c0', 'c1', 'c2'].map((s, i) => [`tree-l0-${s}-play`, i]));
    // Up to level 1 from the stair's foot; down from level 1's way down, both on the floor (OP-220).
    const up = l0.doors.find((d) => d.id === 'stair-l1-l0')!;
    const down = l1.doors.find((d) => d.id === 'stair-l1-l0')!;
    expect([up.to, up.top, up.way]).toEqual([{ room: 'l1', spawn: 'from-l0' }, 0, 'up']);
    expect([down.to, down.top, down.way]).toEqual([{ room: 'l0', spawn: 'from-l1' }, 0, 'down']);
    // The mouth into the cave and back.
    expect(l0.doors.find((d) => d.id === 'to-arcade')!.to).toEqual({ room: 'l0-arcade', spawn: 'from-l0' });
    expect(cave.doors.find((d) => d.id === 'to-l0')!.to).toEqual({ room: 'l0', spawn: 'from-arcade' });
    // The cave holds the arcade's three cabinets, on its floor.
    for (const c of CABINETS) {
      const spot = cave.doors.find((d) => d.id === c.spot)!;
      expect(spot, c.spot).toBeDefined();
      expect(spot.top, c.spot).toBe(0);
    }
    // The stairwell to OP-115's first lock is closed.
    expect(l0.doors.find((d) => d.id === 'stair-challenge')!.closedSign).toBe('Not Yet Fledged');
    for (const [room, spawn] of [[l0, 'from-l1'], [l0, 'from-arcade'], [cave, 'from-l0'], [l1, 'from-l0']] as const) expect(room.spawns[spawn], `${room.id} ${spawn}`).toBeDefined();
  });

  it('fades the edges of the layers that do not meet their neighbours edge to edge (OP-162)', () => {
    const tile = (key: string) => [...backgroundTiles(l1), ...foregroundTiles(l1)].find((t) => t.key === key)!;
    // A sky fades over the one beneath it: the lobby's over both neighbours, the square's over the roof run's.
    expect(tileFade(tile('tree-l1-0-bg'))).toEqual({ left: 220, right: 220 });
    expect(tileFade(tile('tree-l1-e1-bg'))).toEqual({ left: 0, right: 220 });
    expect(tileFade(tile('tree-l1-w1-bg'))).toEqual({ left: 0, right: 0 });
    expect(tileFade(tile('tree-l1-e2-bg'))).toEqual({ left: 0, right: 0 });
    // Neighbouring tiles at half and three-quarter pace overlap (by 960 and 480 view px): each fade, drawn
    // as big as its tile, stays inside the overlap, so no gap opens between them.
    const view = { w: ROOM_W, h: ROOM_H };
    for (const [rate, fade] of [[0.5, 220], [0.75, 230]] as const) {
      const a = tilePlacement({ key: 'a', x: ROOM_W, y: 0, rate }, view);
      const b = tilePlacement({ key: 'b', x: 2 * ROOM_W, y: 0, rate }, view);
      const overlap = a.x + a.w - b.x;
      expect(overlap, `tiles at ${rate} overlap`).toBeGreaterThan(0);
      expect(fade * (a.w / ROOM_W), `the fade at ${rate} stays inside the overlap`).toBeLessThan(overlap);
    }
    for (const s of ['w1', '0', 'e1', 'e2']) {
      expect(tileFade(tile(`tree-l1-${s}-mid`)), `${s}: the middle distance fades into its neighbours`).toEqual({ left: 230, right: 230 });
      expect(tileFade(tile(`tree-l1-${s}-fg`)), `${s}: the overlay fades where it ends mid-view`).toEqual({ left: 120, right: 120 });
      expect(tileFade(tile(`tree-l1-${s}-play`)), `${s}: the playfields meet edge to edge`).toEqual({ left: 0, right: 0 });
    }
    // A fade is at most half the tile's width.
    expect(tileFade({ key: 'x', x: 0, y: 0, fade: { left: 5000, right: -3 } })).toEqual({ left: ROOM_W / 2, right: 0 });
  });

  it('has its floor on the ground line, and every ledge is a stretch of that floor, inside the room', () => {
    for (const r of tree) {
      expect(r.walkable).toHaveLength(1);
      const [lo, hi] = yRange(r.walkable[0]!);
      expect(lo).toBeLessThan(TREE_GROUND);
      expect(hi).toBeGreaterThan(TREE_GROUND);
      expect(hi - lo, 'a strip, so an owl stays on the ground line').toBeLessThanOrEqual(8);
      for (const p of r.perches ?? []) {
        expect(yRange(p.area), `${r.id} ${p.id} on the ground line`).toEqual([lo, hi]);
        for (const q of p.area) expect(q.x > 0 && q.x < r.size.w, `${r.id} ${p.id} inside the room`).toBe(true);
        expect(p.solid, `${r.id} ${p.id}: an owl walks under a ledge and jumps up through it`).toBeUndefined();
      }
      for (const [name, s] of Object.entries(r.spawns)) expect(isWalkable(s, r.walkable), `${r.id} spawn ${name}`).toBe(true);
    }
  });

  it('lets an owl reach every ledge: a jump and a flap above the floor or a ledge, less what a glide sinks over any gap', () => {
    const rise = MAX_RISE - 20; // a jump and a flap at the top, without the room the limit keeps to spare
    for (const r of tree) {
      const ledges = r.perches ?? [];
      const span = (id: string): [number, number] => {
        const xs = ledges.find((p) => p.id === id)!.area.map((q) => q.x);
        return [Math.min(...xs), Math.max(...xs)];
      };
      const reached = new Set<string>();
      for (let grew = true; grew; ) {
        grew = false;
        for (const p of ledges) {
          if (reached.has(p.id)) continue;
          const [a0, a1] = span(p.id);
          // Over a ledge, straight up; across a gap from one, a glide off the top of the jump sinks a
          // pixel for every GLIDE_SLOPE it goes on, so the far ledge must be that much lower.
          const gap = (q: string) => Math.max(a0, span(q)[0]) - Math.min(a1, span(q)[1]);
          const from = p.top <= rise || ledges.some((q) => reached.has(q.id) && p.top - q.top <= rise - Math.max(0, gap(q.id)) / GLIDE_SLOPE);
          if (from) {
            reached.add(p.id);
            grew = true;
          }
        }
      }
      expect([...reached].sort(), r.id).toEqual(ledges.map((p) => p.id).sort());
    }
  });
});

describe("the tree's directions and barriers (OP-220)", () => {
  const tree = ALL_ROOMS.filter((r) => mapOf(r) === 2 && !isNewMapRoom(r.id) && !r.course);
  const levels = tree.filter((r) => treeLevelOf(r.id) !== null);
  const isStair = (d: DoorDef) => d.id.startsWith('stair-');
  const x0 = (d: DoorDef) => d.rect.x;
  const x1 = (d: DoorDef) => d.rect.x + d.rect.w;
  const floorSpan = (r: RoomDef): [number, number] => {
    const xs = r.walkable[0]!.map((p) => p.x);
    return [Math.min(...xs), Math.max(...xs)];
  };

  it("every tree level's down stair is at its left end and its up stair at its right end", () => {
    let pairs = 0;
    for (const room of levels) {
      const stairs = room.doors.filter(isStair);
      const level = treeLevelOf(room.id)!;
      for (const d of stairs) {
        expect(d.way, `${room.id} ${d.id} says which way it goes`).toBeDefined();
        // The way it says is the way it goes: a stair up leads to the level above, a stair down to the one below.
        const to = doorTarget(d, 2);
        if (to) expect(treeLevelOf(to.room), `${room.id} ${d.id} leads ${d.way}`).toBe(level + (d.way === 'up' ? 1 : -1));
      }
      const downs = stairs.filter((d) => d.way === 'down');
      const ups = stairs.filter((d) => d.way === 'up');
      for (const down of downs) {
        for (const up of ups) {
          pairs++;
          expect(x1(down), `${room.id}: ${down.id} (down) west of ${up.id} (up)`).toBeLessThanOrEqual(x0(up));
          // The two stairs bound the level's stairway: no other doorway stands between them.
          const between = room.doors.filter((d) => d !== down && d !== up && x1(d) > x1(down) && x0(d) < x0(up));
          expect(between.map((d) => d.id), `${room.id}: nothing between ${down.id} and ${up.id}`).toEqual([]);
        }
      }
    }
    // Levels 0 to 4 each have a stair down (level 0's is the closed challenge stair) and one up.
    expect(pairs).toBe(5);
    // The one stair out of the canopy, the way into the tree, goes down.
    expect(ROOMS['l5']!.doors.filter(isStair).map((d) => [d.id, d.way])).toEqual([['stair-l5-l4', 'down']]);
  });

  it('every stair doorway is at floor height', () => {
    for (const room of tree) {
      for (const d of room.doors) {
        if (!isStair(d) && !d.to && !d.closedSign) continue;
        expect(d.top, `${room.id} ${d.id}`).toBe(0);
        // On the floor itself, not past its ends.
        const [a, b] = floorSpan(room);
        const mid = d.rect.x + d.rect.w / 2;
        expect(mid >= a && mid <= b, `${room.id} ${d.id} on the floor (${a} to ${b})`).toBe(true);
      }
    }
  });

  it("no doorway lies between an owl's floor and another doorway it must reach", () => {
    for (const room of tree) {
      // No doorway stands over or inside another: each is a stretch of the floor of its own.
      const doors = [...room.doors].sort((a, b) => x0(a) - x0(b));
      for (let i = 1; i < doors.length; i++) expect(x0(doors[i]!), `${room.id}: ${doors[i - 1]!.id} and ${doors[i]!.id} do not overlap`).toBeGreaterThanOrEqual(x1(doors[i - 1]!));
    }
    // An owl that comes in by one stair walks to the level's other stair without crossing a doorway: it
    // lands on the side of its stair that faces the other one, and nothing stands between.
    let walks = 0;
    for (const room of levels) {
      for (const other of ALL_ROOMS) {
        for (const door of other.doors) {
          const to = doorTarget(door, 2);
          if (!isStair(door) || to?.room !== room.id) continue;
          const at = room.spawns[to.spawn]!;
          expect(at, `${other.id} ${door.id} lands at a spawn of ${room.id}`).toBeDefined();
          for (const next of room.doors) {
            if (!isStair(next) || !next.to || next.to.room === other.id) continue;
            walks++;
            const [a, b] = at.x < x0(next) ? [at.x, x0(next)] : [x1(next), at.x];
            const crossed = room.doors.filter((d) => d !== next && x1(d) > a && x0(d) < b);
            expect(crossed.map((d) => d.id), `${room.id}: from ${to.spawn} to ${next.id}`).toEqual([]);
            expect(room.doors.some((d) => pointInRect(at, d.rect)), `${room.id} ${to.spawn} stands in no doorway`).toBe(false);
          }
        }
      }
    }
    // Up and down through levels 1 to 4: each level's two open stairs, each way.
    expect(walks).toBe(8);
  });

  it('every closed doorway of the tree has a barrier in it, with its own sign', () => {
    // l1's closed gate, l5-street's way beyond and spare nest, l0's challenge stair.
    const closed = tree.flatMap((r) => r.doors.filter((d) => d.closedSign).map((d) => [`${r.id}:${d.id}`, r.barriers?.find((b) => b.id === d.id)?.kind]));
    expect(closed.sort()).toEqual([['l0:stair-challenge', 'boards'], ['l1:closed-west', 'gate'], ['l5-street:closed-beyond', 'branch'], ['l5-street:spare-nest', 'boards']]);
    for (const room of tree) {
      for (const d of room.doors.filter((x) => x.closedSign)) {
        const b = room.barriers?.find((x) => x.id === d.id);
        expect(b, `${room.id} ${d.id} has a barrier`).toBeDefined();
        expect(b!.sign, `${room.id} ${d.id}`).toBe(d.closedSign);
        expect(b!.x < x1(d) && b!.x + b!.w > x0(d), `${room.id} ${d.id}: the barrier stands in the doorway`).toBe(true);
      }
    }
  });

  it('a barrier is drawn on the floor with an approved sign, and no ledge stands over it or past one that ends the floor', () => {
    let count = 0;
    for (const room of ALL_ROOMS) {
      if (mapOf(room) !== 2) {
        expect(room.barriers ?? [], room.id).toEqual([]);
        expect(room.landings ?? [], room.id).toEqual([]);
        continue;
      }
      const [a, b] = floorSpan(room);
      const ids = new Set<string>();
      for (const bar of room.barriers ?? []) {
        // The new map's levels (NEW_MAP) keep their levels' barriers: counted once, on the levels.
        if (!isNewMapRoom(room.id)) count++;
        expect(ids.has(bar.id), `${room.id} ${bar.id} once`).toBe(false);
        ids.add(bar.id);
        expect(CLOSED_SIGNS as readonly string[], `${room.id} ${bar.id}`).toContain(bar.sign);
        expect(['gate', 'rope', 'branch', 'boards']).toContain(bar.kind);
        expect(bar.w, bar.id).toBeGreaterThan(0);
        expect(bar.x >= 0 && bar.x + bar.w <= room.size.w, `${room.id} ${bar.id} inside the room`).toBe(true);
        // It stands on the floor: over it or at one of its ends.
        expect(bar.x <= b && bar.x + bar.w >= a, `${room.id} ${bar.id} on the floor`).toBe(true);
        const endsWest = bar.x <= a && bar.x + bar.w >= a;
        const endsEast = bar.x <= b && bar.x + bar.w >= b;
        for (const p of room.perches ?? []) {
          const xs = p.area.map((v) => v.x);
          const [p0, p1] = [Math.min(...xs), Math.max(...xs)];
          expect(p1 <= bar.x || p0 >= bar.x + bar.w, `${room.id} ${p.id} is not over ${bar.id}`).toBe(true);
          if (endsWest) expect(p0, `${room.id} ${p.id} is not past ${bar.id}`).toBeGreaterThanOrEqual(bar.x + bar.w);
          if (endsEast) expect(p1, `${room.id} ${p.id} is not past ${bar.id}`).toBeLessThanOrEqual(bar.x);
        }
      }
    }
    expect(count).toBe(8);
  });

  it("the parkour that leads nowhere yet is shut: the boughs, level 3's reach and level 1's roof run hold no ledge, behind a barrier", () => {
    const ledges = (id: string) => (getRoom(id).perches ?? []).map((p) => p.id);
    expect(ledges('l5-street')).toEqual([]);
    expect(ledges('l5')).toEqual([]);
    for (const id of ['stump', 'table', 'fungus', 'board-1', 'board-2', 'tip']) expect(ledges('l3'), id).not.toContain(id);
    for (const id of ['crates-1', 'crates-2', 'crates-3', 'roof-low', 'barrel', 'roof-high', 'tower-balcony']) expect(ledges('l1'), id).not.toContain(id);
    // Each has its barrier: the fallen branches across the boughs, the ropes across the reach and the roof run's foot.
    const bar = (room: string, id: string) => getRoom(room).barriers?.find((b) => b.id === id);
    expect([bar('l5-street', 'closed-beyond')?.kind, bar('l5', 'bough-7')?.kind, bar('l3', 'reach')?.kind, bar('l1', 'roof-run')?.kind]).toEqual(['branch', 'branch', 'rope', 'rope']);
    // A stair is taken at its foot, so no stair's treads are ledges any more.
    for (const room of tree) for (const p of room.perches ?? []) expect(p.id.startsWith('stair'), `${room.id} ${p.id}`).toBe(false);
  });

  it('a stairhead is drawn wherever a stair stands with no painted stair, under that stair', () => {
    const drawn: string[] = [];
    for (const room of tree) {
      for (const l of room.landings ?? []) {
        const d = room.doors.find((x) => x.id === l.id);
        expect(d && isStair(d), `${room.id} ${l.id} is a stair's`).toBe(true);
        expect(l.x <= x0(d!) && l.x + l.w >= x1(d!), `${room.id} ${l.id} spans its doorway`).toBe(true);
        drawn.push(`${room.id}:${l.id}`);
      }
    }
    expect(drawn.sort()).toEqual(['l2:stair-l2-l1', 'l3:stair-l3-l2']);
  });
});

describe('the new map (map 3): the park as one tree', () => {
  const newRooms = Object.keys(NEW_MAP).map((id) => ROOMS[id]!);
  /** Every doorway of `room` that takes an owl walking the new map somewhere, and where. */
  const ways = (room: RoomDef, cameFrom?: string) => room.doors.flatMap((door) => {
    const to = doorTarget(door, 3, cameFrom);
    return to ? [{ room, door, to }] : [];
  });

  it('has its own rooms, each a copy of a level of the tree seen from the side, open to every owl it takes', () => {
    expect(newRooms.map((r) => r.id)).toEqual(['m3-stair-1', 'm3-stair-2', 'm3-stair-3', 'm3-ground', 'm3-under', 'm3-cave']);
    for (const r of newRooms) {
      const from = ROOMS[NEW_MAP[r.id]!]!;
      expect(r.keeperOnly, r.id).toBeUndefined();
      expect(r.gated, r.id).toBe(from.gated);
      expect(mapOf(r), r.id).toBe(2);
      expect(r.size, r.id).toEqual(from.size);
      expect(r.walkable, r.id).toEqual(from.walkable);
      expect(r.perches, r.id).toEqual(from.perches);
    }
  });

  it('no visitor’s doorway leads into it: only the new map’s own ways (toNew) and its own rooms do', () => {
    for (const room of Object.values(ROOMS)) {
      // The keepers' rooms (the hollow hall's Commons) are no visitor's.
      if (isNewMapRoom(room.id) || room.keeperOnly) continue;
      for (const d of room.doors) {
        for (const to of [d.to, d.toTree]) expect(isNewMapRoom(to?.room), `${room.id}:${d.id}`).toBe(false);
      }
    }
    // And the levels it copies are as they were: their ways lead where they always have.
    expect(doorTarget(ROOMS['lobby']!.doors.find((d) => d.id === 'gate')!, 1)).toEqual({ room: 'hub', spawn: 'default' });
    expect(doorTarget(ROOMS['glass']!.doors.find((d) => d.id === 'to-hub')!, 2)).toEqual({ room: 'l3', spawn: 'glass' });
  });

  it('every way of it leads to a spawn that is there, landing every lane on the floor near it, out of the exits', () => {
    for (const room of Object.values(ROOMS)) {
      for (const { door, to } of ways(room)) {
        const dest = roomFor(to.room);
        const where = `${room.id}:${door.id}`;
        expect(dest, where).toBeDefined();
        expect(dest!.spawns[to.spawn], where).toBeDefined();
        for (const t of [0, 0.5, 1]) {
          const p = arrivalPoint(dest!, to.spawn, room.id, { axis: doorAxis(room, door), t });
          expect(isWalkable(p, dest!.walkable), `${where} t=${t}`).toBe(true);
          expect(inExit(dest!, p), `${where} t=${t}`).toBe(false);
          expect(distance(p, dest!.spawns[to.spawn]!), `${where} t=${t}`).toBeLessThanOrEqual(240);
        }
      }
    }
  });

  it('every way between two of its rooms leads back the way it came, so no stair or doorway is one way', () => {
    const inMap = new Set([...Object.keys(NEW_MAP), 'lobby', 'glass', 'grove', 'market', 'hub']);
    for (const id of inMap) {
      for (const { door, to } of ways(ROOMS[id]!)) {
        if (!inMap.has(to.room)) continue;
        const back = ways(ROOMS[to.room]!, id).filter((w) => w.to.room === id);
        expect(back.length, `${id}:${door.id} back from ${to.room}`).toBeGreaterThan(0);
      }
    }
  });

  it('runs from the turnstiles past every open realm to the ground, the Party Grove and the arcade cave, all of it reachable', () => {
    const seen = new Set<string>(['lobby']);
    const next = ['lobby'];
    for (let id = next.pop(); id; id = next.pop()) {
      for (const { to } of ways(ROOMS[id]!)) {
        if (seen.has(to.room) || !ROOMS[to.room]) continue;
        seen.add(to.room);
        next.push(to.room);
      }
    }
    for (const id of [...Object.keys(NEW_MAP), 'glass', 'grove', 'market', 'hub', 'homes', 'arcade']) expect(seen.has(id), id).toBe(true);
    // Down the stairs in the order of the park map: the turnstiles, the glass realm's landing, the quiet one, the clearing's, the ground.
    const down = (id: string) => ways(ROOMS[id]!).find((w) => w.door.way === 'down' || w.door.id === 'gate')?.to.room;
    expect(['lobby', 'm3-stair-1', 'm3-stair-2', 'm3-stair-3', 'm3-ground'].map(down)).toEqual(['m3-stair-1', 'm3-stair-2', 'm3-stair-3', 'm3-ground', 'm3-under']);
    // Each realm's Commons hangs off its landing, its Realm Vote idol inside, and leads back to it.
    for (const [landing, realm] of [['m3-stair-1', 'glass'], ['m3-stair-3', 'grove'], ['m3-ground', 'market']] as const) {
      expect(ways(ROOMS[landing]!).some((w) => w.to.room === realm), landing).toBe(true);
      expect(ROOMS[realm]!.doors.some((d) => d.id === 'idol'), realm).toBe(true);
      expect(ways(ROOMS[realm]!).find((w) => w.door.id === 'to-hub')?.to.room, realm).toBe(landing);
      // In from the Party Grove's arch, back out to it.
      expect(ways(ROOMS[realm]!, 'hub').find((w) => w.door.id === 'to-hub')?.to.room, realm).toBe('hub');
    }
  });

  it("each of its doorways to another room has a mark over the arch, and its stairs are a level's", () => {
    for (const room of newRooms) {
      for (const { door } of ways(room)) {
        if (nestDoorIndex(door.id) !== null) continue;
        expect(door.markAt, `${room.id}:${door.id}`).toBeDefined();
        expect(door.top, `${room.id}:${door.id}`).toBe(0);
      }
    }
  });
});
