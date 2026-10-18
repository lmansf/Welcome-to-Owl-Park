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

/**
 * How far a straight walk from `from` along the unit vector `dir` gets before the walkable area
 * ends, at most `max` room pixels: the last walkable sample on that line. An owl standing on the
 * area's edge may start just outside it, so the first two samples may be off the area.
 */
export function walkableReach(from: Vec2, dir: Vec2, walkable: Polygon[], max = 2400): Vec2 {
  let last = from;
  for (let d = WALK_SAMPLE_PX; d <= max; d += WALK_SAMPLE_PX) {
    const p = { x: from.x + dir.x * d, y: from.y + dir.y * d };
    if (isWalkable(p, walkable)) last = p;
    else if (last !== from || d > WALK_SAMPLE_PX * 2) return last;
  }
  return last;
}

/** Bearings tried, in degrees either side, when the way straight ahead is blocked. */
const SLIDE_DEGREES = [15, 30, 45];

/**
 * Where keyboard walking heads from `from` for the unit direction `dir`: straight on as far as the
 * walkable area allows or, when that is blocked within `minStep`, along the bearing within 45
 * degrees that gets furthest in the asked direction, so the owl slides along the edge. Null when
 * every bearing is blocked.
 */
export function steerTarget(from: Vec2, dir: Vec2, walkable: Polygon[], minStep = 12): Vec2 | null {
  const reach = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const d = { x: dir.x * Math.cos(a) - dir.y * Math.sin(a), y: dir.x * Math.sin(a) + dir.y * Math.cos(a) };
    const to = walkableReach(from, d, walkable);
    const len = distance(from, to);
    return { to, len, progress: len * Math.cos(a) };
  };
  const straight = reach(0);
  if (straight.len >= minStep) return straight.to;
  let best: ReturnType<typeof reach> | null = null;
  for (const deg of SLIDE_DEGREES.flatMap((d) => [d, -d])) {
    const r = reach(deg);
    if (r.len >= minStep && (!best || r.progress > best.progress)) best = r;
  }
  return best?.to ?? null;
}
