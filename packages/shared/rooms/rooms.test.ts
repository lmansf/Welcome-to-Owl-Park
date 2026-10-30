import { describe, expect, it } from 'vitest';
import { arrivalPoint, doorAxis, inExit, laneThrough } from '../src/doorways';
import { distance, distanceToRect, isWalkable, pointInRect, rectCenter } from '../src/geometry';
import { FURNITURE, NEST_SPOTS, nestDoorIndex } from '../src/homes';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_MAX_H, ROOM_MAX_W, ROOM_W, backgroundTiles, findSpawn, foregroundTiles, type RoomDef } from '../src/room';
import { OWL_SPECIES, SPECIES } from '../src/species';
import { ANCHORS, CLOSED_SIGNS, GATED_ROOMS, GUARDIANS, NEST_MIRROR, NEST_PARK_SIGN, NEST_ROOM, ROOMS, STREET_DOORS, STREET_ROOM, getRoom, roomFor } from './index';
import { INTERACTABLES } from '../src/interactables';
import { resolveTarget } from '../src/resolveTarget';
import { NPCS } from '../src/npcs';
import { FLIGHT_STEP_MS, GROUNDED, newFlier, stepFlier, type Flier, type FlightInput } from '../src/flight';
import { MAX_PERCH_TOP, footing, groundAt, type Raised } from '../src/perches';
import { perchTiers } from '../src/routes';
import { pointInPolygon } from '../src/geometry';
import { WALK_SPEED } from '../src/walk';

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
      // A spot to stand at (a door with nowhere to go, such as the nest's mirror) may have one.
      const ways = room.doors.filter((d) => d.to);
      for (const [name, p] of Object.entries(room.spawns)) for (const d of ways) expect(pointInRect(p, d.rect), `${room.id} spawn ${name} in ${d.id}`).toBe(false);
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

  it('is the one gated room, two screens wide, with the arch back, the idol and the portal', () => {
    expect(GATED_ROOMS).toEqual(['glass']);
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
    expect(keeping.map((e) => `${e.room.id}:${e.door.id}`).sort()).toEqual(['glass:to-hub', 'grove:to-hub', 'homes:to-lobby', 'hub:to-glass', 'hub:to-grove', 'hub:to-lobby', 'lobby:gate', 'lobby:to-homes']);
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
    const voting = Object.values(ROOMS).filter((r) => r.doors.some((d) => d.id === 'idol')).map((r) => r.id);
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

describe('perches (OP-084)', () => {
  it('stand in the room, drawn inside it, no higher than a perch may be, each by a floor or a perch to jump from', () => {
    for (const room of ALL_ROOMS) {
      const ids = new Set<string>();
      for (const p of room.perches ?? []) {
        expect(ids.has(p.id), `${room.id}: ${p.id} twice`).toBe(false);
        ids.add(p.id);
        expect(p.area.length, p.id).toBeGreaterThanOrEqual(3);
        expect(p.top, p.id).toBeGreaterThan(0);
        expect(p.top, p.id).toBeLessThanOrEqual(MAX_PERCH_TOP);
        for (const v of p.area) {
          expect(v.x >= 0 && v.x <= room.size.w && v.y <= room.size.h, `${p.id} ${v.x},${v.y}`).toBe(true);
          expect(v.y - p.top, `${p.id}: its top is drawn above the room`).toBeGreaterThanOrEqual(0);
        }
        // Somewhere under it or beside it to take off from: its area meets the floor or another perch's.
        const others = (room.perches ?? []).filter((o) => o !== p).map((o) => o.area);
        const meets = p.area.some((v) => isWalkable(v, room.walkable) || others.some((o) => pointInPolygon(v, o)));
        expect(meets, `${room.id}: ${p.id} meets no floor or perch`).toBe(true);
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
