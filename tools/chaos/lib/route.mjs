/**
 * A way to a doorway for the journey's page (OP-132). A page walks in straight lines and stops where
 * the floor ends (resolveTarget), so an owl that arrives behind a bench or a planter never reaches a
 * doorway by walking at it (about a third of the hub's arrival spots, for the grove's). The way goes
 * in legs through a grid of floor points, each leg a straight walk the room makes in full, the last
 * one aimed at the doorway, which ends in it.
 */
import { distance, isWalkable, resolveTarget, ROOMS } from './shared.mjs';

const STEP_PX = 40;

const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/**
 * The points a page walks to in turn, from `from` into the door `rect` of room `roomId`: grid points
 * on the floor, then the door's middle. Null when nothing on the floor leads there.
 */
export function legsTo(roomId, from, rect) {
  const room = ROOMS[roomId];
  const aim = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const reaches = (p) => inRect(resolveTarget(p, aim, room.walkable), rect);
  const clear = (a, b) => distance(resolveTarget(a, b, room.walkable), b) <= 1;
  if (reaches(from)) return [aim];
  const point = (gx, gy) => ({ x: (gx + 0.5) * STEP_PX, y: (gy + 0.5) * STEP_PX });
  const cols = Math.ceil(room.size.w / STEP_PX);
  const rows = Math.ceil(room.size.h / STEP_PX);
  // Breadth first from the grid points around `from`, along clear walks to the eight neighbours.
  const came = new Map();
  let frontier = [];
  const gx0 = Math.floor(from.x / STEP_PX);
  const gy0 = Math.floor(from.y / STEP_PX);
  for (let gx = gx0 - 1; gx <= gx0 + 1; gx++)
    for (let gy = gy0 - 1; gy <= gy0 + 1; gy++) {
      const p = point(gx, gy);
      if (gx < 0 || gy < 0 || gx >= cols || gy >= rows || !isWalkable(p, room.walkable) || !clear(from, p)) continue;
      came.set(gy * cols + gx, null);
      frontier.push([gx, gy]);
    }
  while (frontier.length) {
    const next = [];
    for (const [gx, gy] of frontier) {
      if (reaches(point(gx, gy))) {
        const legs = [aim];
        for (let k = gy * cols + gx; k !== null; k = came.get(k)) legs.unshift(point(k % cols, Math.floor(k / cols)));
        return legs;
      }
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const nx = gx + dx;
          const ny = gy + dy;
          const k = ny * cols + nx;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || came.has(k)) continue;
          const p = point(nx, ny);
          if (!isWalkable(p, room.walkable) || !clear(point(gx, gy), p)) continue;
          came.set(k, gy * cols + gx);
          next.push([nx, ny]);
        }
    }
    frontier = next;
  }
  return null;
}
