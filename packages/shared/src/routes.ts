/**
 * The tiers of OP-084's routes, worked out from a room's perches and the flight's own physics, so a
 * test can hold every room to the route rules: what reaching each perch from the floor takes. Tier
 * 1 is single jumps alone (a stair any beginner can climb), tier 2 needs the second flap somewhere
 * on the way, tier 3 only a glide gets there. A hop is reckoned with room to spare (a rise
 * ROUTE_MARGIN short of the most a jump or a flap gives, a crossing ROUTE_REACH of what the flight
 * could cover), so a hop called a tier is one a visitor makes without a perfect press.
 *
 * Over the plan an owl in the air moves as it walks, at WALK_SPEED; a jump rises JUMP_RISE (about
 * 149 px) and a flap at its top 111 px more; a glide falls one px for GLIDE_SLOPE along.
 *
 * TODO-DOCS (OP-084): docs/TESTING.md: the route tiers and the rooms tests that hold every room's
 * perches to them (each reached somehow, a quest's spots only on tier 1 perches).
 */
import { GLIDE_SINK, JUMP_RISE } from './flight';
import { closestPointOnPolygon, distance, pointInPolygon, type Polygon } from './geometry';
import { DOUBLE_JUMP_IMPULSE, GRAVITY, JUMP_IMPULSE } from './jump';
import type { Vec2 } from './protocol';
import type { RoomDef } from './room';
import { WALK_SPEED } from './walk';

export type RouteTier = 1 | 2 | 3;

/** How much short of a jump's (or a jump and a flap's) top a hop's rise must stay (room px). */
export const ROUTE_MARGIN = 10;
/** The share of what a flight could cover over the plan that a hop may ask for. */
export const ROUTE_REACH = 0.8;

const FLAP_RISE = (DOUBLE_JUMP_IMPULSE * DOUBLE_JUMP_IMPULSE) / (2 * GRAVITY);
const UP_S = JUMP_IMPULSE / GRAVITY;
const FLAP_UP_S = DOUBLE_JUMP_IMPULSE / GRAVITY;
const fallS = (drop: number) => Math.sqrt((2 * Math.max(0, drop)) / GRAVITY);

/**
 * What a hop takes from a top to one `rise` px higher (lower, when negative) and `gap` px away over
 * the plan: a jump (1), the jump and the flap (2), or the jump, the flap and a glide (3); null when
 * nothing reaches it. A tier's crossing is as far as the owl walks while it is up there.
 */
export function hopTier(rise: number, gap: number): RouteTier | null {
  const top1 = JUMP_RISE;
  const top2 = JUMP_RISE + FLAP_RISE;
  if (rise <= top1 - ROUTE_MARGIN && gap <= ROUTE_REACH * WALK_SPEED * (UP_S + fallS(top1 - rise))) return 1;
  if (rise > top2 - ROUTE_MARGIN) return null;
  const up = UP_S + FLAP_UP_S;
  if (gap <= ROUTE_REACH * WALK_SPEED * (up + fallS(top2 - rise))) return 2;
  if (gap <= ROUTE_REACH * WALK_SPEED * (up + (top2 - rise) / GLIDE_SINK)) return 3;
  return null;
}

/** Whether two segments cross. */
function crosses(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const side = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** How far apart two areas are on the plan: 0 when they meet or overlap. */
export function gapBetween(a: Polygon, b: Polygon): number {
  if (a.some((p) => pointInPolygon(p, b)) || b.some((p) => pointInPolygon(p, a))) return 0;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) if (crosses(a[i]!, a[(i + 1) % a.length]!, b[j]!, b[(j + 1) % b.length]!)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (const p of a) best = Math.min(best, distance(p, closestPointOnPolygon(p, b)));
  for (const p of b) best = Math.min(best, distance(p, closestPointOnPolygon(p, a)));
  return best;
}

/**
 * What reaching each of a room's perches from the floor takes, by its id: the easiest route's
 * hardest hop (a route of single jumps is tier 1 even if a flap would cut it short); null for a
 * perch nothing reaches.
 */
export function perchTiers(room: Pick<RoomDef, 'walkable' | 'perches'>): Record<string, RouteTier | null> {
  const perches = room.perches ?? [];
  const tier = new Map<string, number>(perches.map((p) => [p.id, Number.POSITIVE_INFINITY]));
  for (const p of perches) {
    const gap = Math.min(...room.walkable.map((floor) => gapBetween(floor, p.area)));
    tier.set(p.id, hopTier(p.top, gap) ?? Number.POSITIVE_INFINITY);
  }
  // Relax until nothing gets easier: a perch is as easy as the easiest perch it is a hop from, or the hop.
  for (let changed = true; changed; ) {
    changed = false;
    for (const from of perches) {
      const at = tier.get(from.id)!;
      if (!Number.isFinite(at)) continue;
      for (const to of perches) {
        if (to === from) continue;
        const hop = hopTier(to.top - from.top, gapBetween(from.area, to.area));
        if (hop === null) continue;
        const via = Math.max(at, hop);
        if (via < tier.get(to.id)!) {
          tier.set(to.id, via);
          changed = true;
        }
      }
    }
  }
  return Object.fromEntries(perches.map((p) => [p.id, Number.isFinite(tier.get(p.id)!) ? (tier.get(p.id) as RouteTier) : null]));
}
