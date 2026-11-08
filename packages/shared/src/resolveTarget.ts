import { closestPointOnSegment, distance, isWalkable, snapToWalkable, type Polygon, type Shut } from './geometry';
import type { Vec2 } from './protocol';

/** Sampling step, in room pixels, when checking a straight walk for blocked ground. */
export const WALK_SAMPLE_PX = 6;

/**
 * Turn a tap into the point the owl will actually walk to:
 *  1. snap the tap onto the walkable area (nearest boundary point when outside), then
 *  2. walk the straight line from `from` and stop at the last walkable sample before the
 *     first blocked one, so an owl never crosses a gap in the walkable area.
 * Client and server both run this, so the server's echo normally matches the client's guess. The
 * client also passes the floor that is `shut` for now (isWalkable), and stops at its edge.
 */
export function resolveTarget(from: Vec2, to: Vec2, walkable: Polygon[], shut: readonly Shut[] = []): Vec2 {
  const snapped = snapToWalkable(to, walkable);
  const len = distance(from, snapped);
  if (len <= WALK_SAMPLE_PX) return isWalkable(snapped, walkable, shut) ? snapped : from;
  if (!isWalkable(from, walkable, shut)) return snapped;
  const steps = Math.ceil(len / WALK_SAMPLE_PX);
  let last: Vec2 = from;
  for (let i = 1; i <= steps; i++) {
    const t = Math.min(1, i / steps);
    const p = { x: from.x + (snapped.x - from.x) * t, y: from.y + (snapped.y - from.y) * t };
    if (!isWalkable(p, walkable, shut)) return last;
    last = p;
  }
  return snapped;
}

/**
 * How far a straight walk from `from` along the unit vector `dir` gets before the walkable area
 * ends, at most `max` room pixels: the last walkable sample on that line. An owl standing on the
 * area's edge may start just outside it, so the first two samples may be off the area.
 */
export function walkableReach(from: Vec2, dir: Vec2, walkable: Polygon[], max = 2400, shut: readonly Shut[] = []): Vec2 {
  let last = from;
  for (let d = WALK_SAMPLE_PX; d <= max; d += WALK_SAMPLE_PX) {
    const p = { x: from.x + dir.x * d, y: from.y + dir.y * d };
    if (isWalkable(p, walkable, shut)) last = p;
    else if (last !== from || d > WALK_SAMPLE_PX * 2) return last;
  }
  return last;
}

/** Bearings tried, in degrees either side, when the way straight ahead is blocked. */
const SLIDE_DEGREES = [15, 30, 45];

/**
 * How far from the asked direction an edge of the floor may run and still be slid along: 60 degrees.
 * Held up and right under the lobby's turnstile line, which falls a degree to the right, the line runs
 * 46 degrees from the keys (OP-124).
 */
const EDGE_SLIDE_MIN_COS = 0.5;

/**
 * Both ways along each edge of `outlines` that passes within a walk sample of `p`, which a key walk
 * into an edge stops within: an owl held against an edge follows it exactly. Beside an edge a little
 * off square a fixed bearing either leaves the floor at once or draws away from the edge, and at the
 * lobby's gate either one missed the turnstiles (OP-124): it stood a step short of them, or passed
 * beneath them.
 */
function edgeWays(p: Vec2, outlines: readonly Polygon[]): Vec2[] {
  const ways: Vec2[] = [];
  for (const poly of outlines) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j]!;
      const b = poly[i]!;
      const len = distance(a, b);
      if (len === 0 || distance(p, closestPointOnSegment(p, a, b)) > WALK_SAMPLE_PX) continue;
      const along = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      ways.push(along, { x: -along.x, y: -along.y });
    }
  }
  return ways;
}

/**
 * Where keyboard walking heads from `from` for the unit direction `dir`: straight on as far as the
 * walkable area allows or, when that is blocked within `minStep`, along the bearing within 45 degrees
 * or the edge within 60 that gets furthest in the asked direction, so the owl slides along the edge.
 * Null when every way is blocked. Floor `shut` for now counts as blocked, and its edges are slid along
 * too (a shut rect's sides run square, which the bearings follow already).
 */
export function steerTarget(from: Vec2, dir: Vec2, walkable: Polygon[], minStep = 12, shut: readonly Shut[] = []): Vec2 | null {
  const reach = (d: Vec2, cos: number) => {
    const to = walkableReach(from, d, walkable, undefined, shut);
    const len = distance(from, to);
    return { to, len, progress: len * cos };
  };
  const straight = reach(dir, 1);
  if (straight.len >= minStep) return straight.to;
  const ways = SLIDE_DEGREES.flatMap((deg) => [deg, -deg]).map((deg) => {
    const a = (deg * Math.PI) / 180;
    return { d: { x: dir.x * Math.cos(a) - dir.y * Math.sin(a), y: dir.x * Math.sin(a) + dir.y * Math.cos(a) }, cos: Math.cos(a) };
  });
  for (const d of edgeWays(from, [...walkable, ...shut.filter((s): s is Polygon => Array.isArray(s))])) {
    const cos = d.x * dir.x + d.y * dir.y;
    if (cos >= EDGE_SLIDE_MIN_COS) ways.push({ d, cos });
  }
  let best: ReturnType<typeof reach> | null = null;
  for (const { d, cos } of ways) {
    const r = reach(d, cos);
    if (r.len >= minStep && (!best || r.progress > best.progress)) best = r;
  }
  return best?.to ?? null;
}
