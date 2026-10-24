import { describe, expect, it } from 'vitest';
import { distance, distanceToRect, isWalkable, pointInRect, rectCenter } from '../src/geometry';
import { nestDoorIndex } from '../src/homes';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_MAX_H, ROOM_MAX_W, ROOM_W, backgroundTiles, findSpawn, foregroundTiles, type RoomDef } from '../src/room';
import { ANCHORS, NEST_ROOM, ROOMS, STREET_DOORS, STREET_ROOM, getRoom, roomFor } from './index';
import { INTERACTABLES } from '../src/interactables';
import { resolveTarget } from '../src/resolveTarget';
import { NPCS } from '../src/npcs';

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
      const tiles = backgroundTiles(room);
      for (const t of [...tiles, ...foregroundTiles(room)]) {
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
        ...room.doors.map((d): [string, Vec2] => [`door ${d.id}`, { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }]),
        ...(room.spots ?? []).map((s): [string, Vec2] => [`spot ${s.x},${s.y}`, s]),
        ...[...NPCS, ...INTERACTABLES].filter((t) => t.room === room.id).map((t): [string, Vec2] => [t.id, t.pos]),
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
        if (d.to) {
          const to = roomFor(d.to.room);
          expect(to, `${room.id} ${d.id} leads to a room`).toBeDefined();
          expect(Object.hasOwn(to?.spawns ?? {}, d.to.spawn), `${room.id} ${d.id} leads to ${d.to.room} ${d.to.spawn}`).toBe(true);
        }
        if (!d.marker) continue;
        expect(d.marker.x, `${room.id} ${d.id} marker`).toBeGreaterThanOrEqual(0);
        expect(d.marker.x, `${room.id} ${d.id} marker`).toBeLessThanOrEqual(room.size.w);
        expect(d.marker.y, `${room.id} ${d.id} marker`).toBeGreaterThanOrEqual(0);
        expect(d.marker.y, `${room.id} ${d.id} marker`).toBeLessThanOrEqual(room.size.h);
      }
    });

    it(`${room.id}: no spawn stands in a doorway, where an owl would walk straight back out`, () => {
      for (const [name, p] of Object.entries(room.spawns)) for (const d of room.doors) expect(pointInRect(p, d.rect), `${room.id} spawn ${name} in ${d.id}`).toBe(false);
    });
  }
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

  it('a nest is one screen painted as nest, with a spawn inside and the door out to the street', () => {
    expect(NEST_ROOM.size).toEqual({ w: ROOM_W, h: ROOM_H });
    expect(backgroundTiles(NEST_ROOM)).toEqual([{ key: 'nest', x: 0, y: 0 }]);
    expect(NEST_ROOM.spawns['default']).toBeDefined();
    expect(NEST_ROOM.doors.map((d) => d.id)).toEqual(['to-street']);
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

      it('puts every spot on the floor, 60 px or more from every doorway and spot', () => {
        for (const s of spots) {
          expect(isWalkable(s, room.walkable), `${room.id} ${s.x},${s.y} walkable`).toBe(true);
          for (const d of room.doors) expect(distanceToRect(s, d.rect), `${room.id} ${s.x},${s.y} vs ${d.id}`).toBeGreaterThanOrEqual(60);
        }
      });
    });
  }
});
