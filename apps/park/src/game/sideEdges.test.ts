import { describe, expect, it } from 'vitest';
import { doorTarget, footing, isWalkable, walkableReach, type RoomDef } from '@owl-park/shared';
import { ROOMS } from '../rooms';
import { sideEdges } from './sideEdges';

/** Half an owl of today's size (the Owl's OWL_W 200 at OWL_SCALE 0.5), at a room's owl scale. */
const half = (room: RoomDef) => 50 * (room.owlScale ?? 1);

/** Every room an owl walks into on the new map, from the Treetop Commons. */
function newMapRooms(): RoomDef[] {
  const seen = new Set(['lobby']);
  const todo = ['lobby'];
  while (todo.length > 0) {
    for (const door of ROOMS[todo.shift()!]!.doors) {
      const to = doorTarget(door, 3)?.room;
      if (to && ROOMS[to] && !seen.has(to)) {
        seen.add(to);
        todo.push(to);
      }
    }
  }
  return [...seen].map((id) => ROOMS[id]!);
}

describe("the room's sides (OP-296)", () => {
  it('keeps a strip of half an owl along each side, narrowed at a doorway there', () => {
    const room = { size: { w: 1000 }, doors: [] };
    expect(sideEdges(room, 50)).toEqual([
      { x: -100_000, y: -100_000, w: 100_050, h: 200_000 },
      { x: 950, y: -100_000, w: 100_050, h: 200_000 },
    ]);
    // A doorway 0..40 at the left: the strip leaves 10 of it to walk into. One in the middle changes nothing.
    const doors = [{ rect: { x: 0, y: 0, w: 40, h: 40 } }, { rect: { x: 500, y: 0, w: 80, h: 40 } }];
    const [left, right] = sideEdges({ size: { w: 1000 }, doors }, 50);
    expect(left!.x + left!.w).toBe(30);
    expect(right!.x).toBe(950);
    expect(sideEdges(room, 0)).toEqual([]);
  });

  it('stops a walk to either end of every room of the new map with the whole owl inside the room', () => {
    const rooms = newMapRooms();
    expect(rooms.map((r) => r.id)).toEqual(expect.arrayContaining(['market', 'arcade', 'm3-hall', 'm3-under', 'brush-1', 'circuit-3']));
    // And the tree's own levels, seen from the side (?newmap=0).
    rooms.push(...['l0', 'l1', 'l5-street'].map((id) => ROOMS[id]!));
    for (const room of rooms) {
      const edges = sideEdges(room, half(room));
      const { walkable, shut } = footing(room, 0, edges);
      // Where a doorway at a side narrows the strip, the owl may stand that much nearer the side: to walk into it.
      const left = Math.min(half(room), ...edges.filter((e) => e.x < 0).map((e) => e.x + e.w));
      const right = Math.max(room.size.w - half(room), ...edges.filter((e) => e.x > 0).map((e) => e.x));
      for (const [name, from] of Object.entries(room.spawns ?? {})) {
        if (!isWalkable(from, walkable, shut)) continue;
        for (const dir of [{ x: 1, y: 0 }, { x: -1, y: 0 }]) {
          const end = walkableReach(from, dir, walkable, room.size.w, shut);
          // A walk sample's rounding either way.
          expect(end.x, `${room.id} ${name} ${dir.x}`).toBeGreaterThanOrEqual(left - 1);
          expect(end.x, `${room.id} ${name} ${dir.x}`).toBeLessThanOrEqual(right + 1);
        }
      }
    }
  });

  it('leaves every doorway that could be walked into still open to walk into', () => {
    for (const room of newMapRooms()) {
      const { walkable, shut } = footing(room, 0, sideEdges(room, half(room)));
      for (const door of room.doors) {
        const { x, y, w, h } = door.rect;
        const points = Array.from({ length: 41 }, (_, i) => Array.from({ length: 9 }, (_, j) => ({ x: x + (w * i) / 40, y: y + (h * j) / 8 }))).flat();
        const before = points.some((p) => isWalkable(p, room.walkable));
        if (before) expect(points.some((p) => isWalkable(p, walkable, shut)), `${room.id} ${door.id}`).toBe(true);
      }
    }
  });
});
