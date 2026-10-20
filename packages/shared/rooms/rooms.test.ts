import { describe, expect, it } from 'vitest';
import { distance, distanceToRect, isWalkable } from '../src/geometry';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_MAX_H, ROOM_MAX_W, ROOM_W, backgroundTiles, findSpawn, foregroundTiles, type RoomDef } from '../src/room';
import { ANCHORS, ROOMS } from './index';
import { INTERACTABLES } from '../src/interactables';
import { NPCS } from '../src/npcs';

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
  for (const room of Object.values(ROOMS)) {
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
  for (const room of Object.values(ROOMS)) {
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

describe('hiding spots', () => {
  it('the lobby has none: it is outside the park', () => {
    expect(ROOMS.lobby?.spots).toBeUndefined();
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
