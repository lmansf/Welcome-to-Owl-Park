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
 * Tier 2 is the flaps the room's park gives (flightFor): one in today's park (260 px in all), two in
 * the tree (OP-239, the triple jump: 371 px in all). hopFlaps says which of the two a tier 2 hop takes.
 */
import { FLAP_RISE, GLIDE_SINK, JUMP_RISE, flapsOf, flightFor } from './flight';
import { closestPointOnPolygon, distance, pointInPolygon, type Polygon } from './geometry';
import { DOUBLE_JUMP_IMPULSE, GRAVITY, JUMP_IMPULSE } from './jump';
import type { Vec2 } from './protocol';
import { mapOf, type RoomDef } from './room';
import type { Updraft } from './updraft';
import { WALK_SPEED } from './walk';
import { WIND_CATCH_BELOW, type WindCurrent } from './wind';

export type RouteTier = 1 | 2 | 3;

/** How much short of a jump's (or a jump and a flap's) top a hop's rise must stay (room px). */
export const ROUTE_MARGIN = 10;
/** The share of what a flight could cover over the plan that a hop may ask for. */
export const ROUTE_REACH = 0.8;

const UP_S = JUMP_IMPULSE / GRAVITY;
const FLAP_UP_S = DOUBLE_JUMP_IMPULSE / GRAVITY;
const fallS = (drop: number) => Math.sqrt((2 * Math.max(0, drop)) / GRAVITY);

/** Flaps an owl may use on a hop: one (today's park) or two (the tree's triple jump). */
export type RouteFlaps = 1 | 2;

/**
 * How much farther a hop reaches with the dash (dash.ts, in a course only): its 115 px, counted at 0.8 as
 * every hop is (docs/levels/README.md).
 */
export const DASH_ROUTE_REACH = Math.round(0.8 * 115);

/** Whether a jump and `n` flaps, with no glide, reach a top `rise` px higher and `gap` px away. */
function flapsReach(rise: number, gap: number, n: RouteFlaps): boolean {
  const top = JUMP_RISE + n * FLAP_RISE;
  return rise <= top - ROUTE_MARGIN && gap <= ROUTE_REACH * WALK_SPEED * (UP_S + n * FLAP_UP_S + fallS(top - rise));
}

/**
 * What a hop takes from a top to one `rise` px higher (lower, when negative) and `gap` px away over
 * the plan, with up to `flaps` flaps: a jump (1), the jump and its flaps (2), or the jump, the flaps
 * and a glide (3); null when nothing reaches it. A tier's crossing is as far as the owl walks while
 * it is up there.
 */
export function hopTier(rise: number, gap: number, flaps: RouteFlaps = 1): RouteTier | null {
  const top1 = JUMP_RISE;
  const top2 = JUMP_RISE + flaps * FLAP_RISE;
  if (rise <= top1 - ROUTE_MARGIN && gap <= ROUTE_REACH * WALK_SPEED * (UP_S + fallS(top1 - rise))) return 1;
  if (rise > top2 - ROUTE_MARGIN) return null;
  const up = UP_S + flaps * FLAP_UP_S;
  if (gap <= ROUTE_REACH * WALK_SPEED * (up + fallS(top2 - rise))) return 2;
  if (gap <= ROUTE_REACH * WALK_SPEED * (up + (top2 - rise) / GLIDE_SINK)) return 3;
  return null;
}

/**
 * How many flaps a tier 2 hop takes at the least (1 or 2, with up to `flaps` of them); null for a hop
 * that is not tier 2. The level plans' "two flaps" hops (docs/levels) are the 2s.
 */
export function hopFlaps(rise: number, gap: number, flaps: RouteFlaps = 2): RouteFlaps | null {
  if (hopTier(rise, gap, flaps) !== 2) return null;
  return flapsReach(rise, gap, 1) ? 1 : 2;
}

/** The flaps an owl has on a hop in a room: the room's park's (flightFor). */
export function roomFlaps(room: Pick<RoomDef, 'map'>): RouteFlaps {
  return flapsOf(flightFor(mapOf(room))) === 2 ? 2 : 1;
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

/** An updraft as a place a route goes through (updraft.ts): its column over the plan, at its top. */
function updraftNode(u: Updraft): { id: string; area: Polygon; top: number; updraft: true } {
  const area: Polygon = [
    { x: u.x, y: -1e6 },
    { x: u.x + u.w, y: -1e6 },
    { x: u.x + u.w, y: 1e6 },
    { x: u.x, y: 1e6 },
  ];
  return { id: `updraft:${u.id}`, area, top: u.top, updraft: true };
}

/**
 * A wind current as a place a route goes through (wind.ts): its band from end to end, at its height.
 * A glide caught in it is carried the band's length and glides off its far end, so like a column's
 * top what it reaches from there takes the glide; it catches only from a little below the band.
 */
function windNode(w: WindCurrent): { id: string; area: Polygon; exit: Polygon; top: number; updraft: true; catchBelow: number } {
  const strip = (a: number, b: number): Polygon => [
    { x: a, y: -1e6 },
    { x: b, y: -1e6 },
    { x: b, y: 1e6 },
    { x: a, y: 1e6 },
  ];
  // Caught anywhere along it; let go at its downwind end.
  const end = w.dir === 1 ? w.x1 : w.x0;
  return { id: `wind:${w.id}`, area: strip(w.x0, w.x1), exit: strip(end - WIND_EXIT_PX, end + WIND_EXIT_PX), top: w.z, updraft: true, catchBelow: WIND_CATCH_BELOW };
}
/** How near its downwind end a route lets go of a wind current (room px). */
const WIND_EXIT_PX = 40;

/**
 * What reaching each of a room's perches from the floor takes, by its id: the easiest route's
 * hardest hop (a route of single jumps is tier 1 even if a flap would cut it short); null for a
 * perch nothing reaches. With the flaps of the room's park (roomFlaps). A room's updrafts (OP-226)
 * are places on the way: an owl glides into a column from as high as its top or lower, within a
 * hop, rises to the top, and glides off it, so a perch reached through one is tier 3, the glide's.
 */
export function perchTiers(room: RouteRoom): Record<string, RouteTier | null> {
  const all = routeTiers(room);
  return Object.fromEntries((room.perches ?? []).map((p) => [p.id, all[p.id] ?? null]));
}

/**
 * What reaching each of a room's updrafts and wind currents takes, by `updraft:<id>` and `wind:<id>`,
 * as perchTiers has it: null for one that no route gets into, which is air no owl will find.
 */
export function airTiers(room: RouteRoom): Record<string, RouteTier | null> {
  const all = routeTiers(room);
  return Object.fromEntries(Object.entries(all).filter(([id]) => id.startsWith('updraft:') || id.startsWith('wind:')));
}

type RouteRoom = Pick<RoomDef, 'walkable' | 'perches' | 'map' | 'updrafts'> & Partial<Pick<RoomDef, 'course' | 'winds'>>;

function routeTiers(room: RouteRoom): Record<string, RouteTier | null> {
  const ledges = room.perches ?? [];
  const perches: Array<{ id: string; area: Polygon; exit?: Polygon; top: number; updraft?: true; catchBelow?: number }> = [
    ...ledges,
    ...(room.updrafts ?? []).map(updraftNode),
    ...(room.winds ?? []).map(windNode),
  ];
  // In a course the owl holds the dash (dash.ts): a hop nothing else makes may take it, counted as a glide's.
  const dash = room.course !== undefined;
  const hop = (rise: number, gap: number): number | null => hopTier(rise, gap, flaps) ?? (dash && hopTier(rise, Math.max(0, gap - DASH_ROUTE_REACH), flaps) !== null ? 3 : null);
  const into = (fromTop: number, gap: number, to: { top: number; updraft?: true; catchBelow?: number }): number | null => {
    if (!to.updraft) return hop(to.top - fromTop, gap);
    // Into a wind current (wind.ts): it catches a glide no lower than a little under its band, so the
    // owl has to get there that high, as onto a ledge at the bottom of the catch; from higher up it
    // lets itself sink into the band.
    if (to.catchBelow !== undefined) return hop(to.top - to.catchBelow - fromTop, gap) === null ? null : 3;
    // Into a column: from no higher than its top, a glide in at the height it left from.
    return fromTop <= to.top && hopTier(0, gap, flaps) !== null ? 3 : null;
  };
  const flaps = roomFlaps(room);
  const tier = new Map<string, number>(perches.map((p) => [p.id, Number.POSITIVE_INFINITY]));
  for (const p of perches) {
    const gap = Math.min(...room.walkable.map((floor) => gapBetween(floor, p.area)));
    tier.set(p.id, into(0, gap, p) ?? Number.POSITIVE_INFINITY);
  }
  // Relax until nothing gets easier: a perch is as easy as the easiest perch it is a hop from, or the hop.
  for (let changed = true; changed; ) {
    changed = false;
    for (const from of perches) {
      const at = tier.get(from.id)!;
      if (!Number.isFinite(at)) continue;
      for (const to of perches) {
        if (to === from) continue;
        const gap = gapBetween(from.exit ?? from.area, to.area);
        // Off the top of a column the owl is gliding: what it reaches from there takes the glide.
        // Into a wind current from other air, it still catches only near its band.
        const step = from.updraft && to.catchBelow === undefined ? (hop(to.top - from.top, gap) === null ? null : 3) : into(from.top, gap, to);
        if (step === null) continue;
        const via = Math.max(at, step);
        if (via < tier.get(to.id)!) {
          tier.set(to.id, via);
          changed = true;
        }
      }
    }
  }
  return Object.fromEntries(perches.map((p) => [p.id, Number.isFinite(tier.get(p.id)!) ? (tier.get(p.id) as RouteTier) : null]));
}
