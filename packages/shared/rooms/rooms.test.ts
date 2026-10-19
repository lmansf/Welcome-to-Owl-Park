import { describe, expect, it } from 'vitest';
import { distance, isWalkable, pointInRect, type Rect } from '../src/geometry';
import type { Vec2 } from '../src/protocol';
import { resolveTarget } from '../src/resolveTarget';
import { ROOM_H, ROOM_MAX_H, ROOM_MAX_W, ROOM_W, backgroundTiles, findSpawn, foregroundTiles } from '../src/room';
import { ROOMS } from './index';

/** Distance from a point to the nearest point of a rectangle (0 inside it). */
const toRect = (p: Vec2, r: Rect) => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));

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

describe('hiding spots', () => {
  for (const room of Object.values(ROOMS)) {
    describe(room.id, () => {
      const spots = room.spots ?? [];
      const spawn = findSpawn(room, 'default');

      it('has 8 to 12 spots, spread apart', () => {
        expect(spots.length).toBeGreaterThanOrEqual(8);
        expect(spots.length).toBeLessThanOrEqual(12);
        for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) expect(distance(spots[i]!, spots[j]!)).toBeGreaterThanOrEqual(60);
      });

      it('puts every spot on the floor, 60 px or more from every doorway and spot', () => {
        for (const s of spots) {
          expect(isWalkable(s, room.walkable), `${room.id} ${s.x},${s.y} walkable`).toBe(true);
          for (const d of room.doors) expect(toRect(s, d.rect), `${room.id} ${s.x},${s.y} vs ${d.id}`).toBeGreaterThanOrEqual(60);
        }
      });

      it('reaches every spot by a straight walk from the default spawn that never crosses an exit', () => {
        const exits = room.doors.filter((d) => d.to);
        for (const s of spots) {
          const end = resolveTarget(spawn, s, room.walkable);
          expect(distance(end, s), `${room.id} ${s.x},${s.y} reachable`).toBeLessThan(1);
          const steps = Math.ceil(distance(spawn, s) / 3);
          for (let i = 0; i <= steps; i++) {
            const p = { x: spawn.x + ((s.x - spawn.x) * i) / steps, y: spawn.y + ((s.y - spawn.y) * i) / steps };
            for (const e of exits) expect(pointInRect(p, e.rect), `${room.id} walk to ${s.x},${s.y} crosses ${e.id}`).toBe(false);
          }
        }
      });
    });
  }
});
