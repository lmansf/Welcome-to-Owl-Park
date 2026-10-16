import { distance, isWalkable, snapToWalkable, type Polygon } from './geometry';
import type { Vec2 } from './protocol';

/** Sampling step, in room pixels, when checking a straight walk for blocked ground. */
export const WALK_SAMPLE_PX = 6;

/**
 * Turn a tap into the point the owl will actually walk to:
 *  1. snap the tap onto the walkable area (nearest boundary point when outside), then
 *  2. walk the straight line from `from` and stop at the last walkable sample before the
 *     first blocked one, so an owl never crosses a gap in the walkable area.
 * Client and server both run this, so the server's echo normally matches the client's guess.
 */
export function resolveTarget(from: Vec2, to: Vec2, walkable: Polygon[]): Vec2 {
  const snapped = snapToWalkable(to, walkable);
  const len = distance(from, snapped);
  if (len <= WALK_SAMPLE_PX) return isWalkable(snapped, walkable) ? snapped : from;
  if (!isWalkable(from, walkable)) return snapped;
  const steps = Math.ceil(len / WALK_SAMPLE_PX);
  let last: Vec2 = from;
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(1, i / steps);
    const p = { x: from.x + (snapped.x - from.x) * t, y: from.y + (snapped.y - from.y) * t };
    if (!isWalkable(p, walkable)) return last;
    last = p;
  }
  return snapped;
}
