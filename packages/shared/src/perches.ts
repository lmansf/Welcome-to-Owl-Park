/**
 * Upper levels (OP-084): what an owl can stand on above the floor. A perch is a top an owl can land
 * on (a root along the wall, a beam, a stump, a shelf of fungus): its `area`, the top seen from above
 * on the room's floor plan as the floor's polygons are, and its `top`, how high that is above the
 * floor in room pixels. An owl on a perch is drawn that much above its spot on the plan, as it is in
 * a jump. A solid perch is a wall to an owl below its top (the bench along the wall, a stump); one
 * that is not solid is a thing an owl walks under and jumps up through (a branch, a beam), and stands
 * on from above.
 *
 * Heights are above the floor: an owl's air height (flight.ts) is, and the ground under it is the
 * top of the highest perch at or a little above its height where it is, else the floor. Walking at a
 * height is walking as before, on the footing for that height (`footing`): the floor and the tops
 * at or below the owl, less the solid perches it is under.
 *
 * Rolling ground (OP-238): a perch may slope. Its `profile` is its top along the room's width, a
 * polyline of heights at x (room px), flat, gentle (one up for KIT_SLOPE_GENTLE along) or steep (one
 * up for KIT_SLOPE_STEEP) between its points and nothing steeper; its `top` is then the profile's
 * highest. An owl standing on it is at its height there (topAt), walks up and down it at the walk's
 * pace and never slides; the room believes an owl standing anywhere along it.
 */
import { isWalkable, pointInPolygon, type Polygon, type Shut } from './geometry';
import type { Vec2 } from './protocol';
import { ROOM_H, ROOM_MAX_H, type RoomDef } from './room';

export interface Perch {
  /** A name for tests and the ?boxes=1 overlay (OP-127). */
  id: string;
  area: Polygon;
  /** How high it is above the floor; for a sloped perch, the highest its profile goes. */
  top: number;
  solid?: boolean;
  /** A sloped perch's top along x (OP-238): its points left to right; off either end it keeps the end's height. */
  profile?: readonly ProfilePoint[];
}

/** A point of a sloped perch's profile: its height `top` at `x` (room px). */
export interface ProfilePoint {
  x: number;
  top: number;
}

/** A gentle slope: one up for this many along (about 14 degrees). */
export const SLOPE_GENTLE = 4;
/** A steep slope: one up for this many along (about 27 degrees), the steepest an owl walks. */
export const SLOPE_STEEP = 2;
/**
 * How far below a sloped perch's top at its spot an owl may be and still come onto it, and how far a
 * walk down it may drop between two of the flight's steps and keep the owl standing: a frame's walk up
 * or down the steepest slope, with room for a slow frame (OP-238).
 */
export const SLOPE_CATCH = 12;

/** A perch's height at `x`: its top, or on a sloped perch its profile there (the end's height past either end). */
export function topAt(perch: Pick<Perch, 'top' | 'profile'>, x: number): number {
  const pts = perch.profile;
  if (!pts || pts.length === 0) return perch.top;
  if (x <= pts[0]!.x) return pts[0]!.top;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (x <= b.x) return b.x === a.x ? b.top : a.top + ((b.top - a.top) * (x - a.x)) / (b.x - a.x);
  }
  return pts[pts.length - 1]!.top;
}

/**
 * The sloped ground an owl at `p`, about `z` high, stands on (OP-238): its height there and its grade
 * (up per px along, rising to the right positive); null where what is under it is flat or the floor.
 * How a page keeps an owl it was told is standing on its feet as it walks a slope.
 */
export function slopeUnder(perches: readonly Perch[] | undefined, p: Vec2, z: number): { top: number; grade: number } | null {
  let best: { top: number; grade: number } | null = null;
  for (const perch of perches ?? []) {
    if (!perch.profile || !pointInPolygon(p, perch.area)) continue;
    const top = topAt(perch, p.x);
    if (top > z + SLOPE_CATCH || top < z - SLOPE_CATCH || (best && best.top >= top)) continue;
    best = { top, grade: (topAt(perch, p.x + 1) - topAt(perch, p.x - 1)) / 2 };
  }
  return best;
}

/** A perch's lowest height: its top, or the lowest point of its profile. */
export function lowTop(perch: Pick<Perch, 'top' | 'profile'>): number {
  return perch.profile?.length ? Math.min(...perch.profile.map((p) => p.top)) : perch.top;
}

/** What is wrong with a sloped perch's profile, as sentences: its points in order, each stretch flat, gentle or steep, and its top its highest. */
export function profileProblems(perch: Perch, limit = MAX_PERCH_TOP): string[] {
  const pts = perch.profile;
  if (!pts) return [];
  const out: string[] = [];
  if (pts.length < 2) out.push(`${perch.id}'s profile has fewer than two points`);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (b.x <= a.x) {
      out.push(`${perch.id}'s profile goes back at x ${b.x}`);
      continue;
    }
    const rise = Math.abs(b.top - a.top);
    const run = b.x - a.x;
    const ok = rise <= 0.5 || Math.abs(run / rise - SLOPE_GENTLE) <= 0.1 || Math.abs(run / rise - SLOPE_STEEP) <= 0.1;
    if (!ok) out.push(`${perch.id} slopes ${rise} up in ${run} from x ${a.x}: not flat, gentle (1 in ${SLOPE_GENTLE}) or steep (1 in ${SLOPE_STEEP})`);
  }
  for (const p of pts) if (p.top < 0 || p.top > limit) out.push(`${perch.id}'s profile is ${p.top} high at x ${p.x}, outside 0 to ${limit}`);
  if (pts.length && Math.abs(Math.max(...pts.map((p) => p.top)) - perch.top) > 0.5) out.push(`${perch.id}'s top ${perch.top} is not its profile's highest`);
  return out;
}

/** Whether a room's doorways on sloped ground stand at the ground's height there (OP-238), as sentences of what is wrong. */
export function slopeDoorProblems(room: Pick<RoomDef, 'doors' | 'perches'>): string[] {
  const out: string[] = [];
  for (const d of room.doors) {
    const foot = { x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 };
    for (const perch of room.perches ?? []) {
      if (!perch.profile || !pointInPolygon(foot, perch.area)) continue;
      const want = Math.round(topAt(perch, foot.x));
      if (Math.abs((d.top ?? 0) - want) > 0.5) out.push(`doorway ${d.id} stands on ${perch.id}, ${want} high there, at ${d.top ?? 0}`);
    }
  }
  return out;
}

/**
 * How far below a perch's top an owl may be and still come down on it: the rounding of a height
 * sent to the room, and the edge of a top caught on the way past it.
 */
export const PERCH_SLACK = 4;

/**
 * The highest a perch's top may be (room px above the floor): what a page or the room believes an owl's
 * height can be follows from it (each room's own limit is its highest top, Room.ts). 540 since OP-162's
 * roof run, whose lantern tower has its balcony 530 up (it was 480).
 */
export const MAX_PERCH_TOP = 540;

/**
 * The highest a perch's top may be in a room `roomH` high: MAX_PERCH_TOP in a room one screen high,
 * and as much higher as the room is taller, so a tall room seen from the side (the hollow hall) keeps
 * the same headroom over its highest ledge.
 */
export function perchTopLimit(roomH: number): number {
  return MAX_PERCH_TOP + Math.max(0, Math.min(roomH, ROOM_MAX_H) - ROOM_H);
}

/** The highest a perch's top may be in any room: in the tallest room there may be. */
export const TALL_PERCH_TOP = perchTopLimit(ROOM_MAX_H);

type Levels = Pick<RoomDef, 'walkable' | 'perches'>;

/**
 * What an owl at `p`, `z` above the floor, comes down on: the highest perch top there at most
 * PERCH_SLACK above it (a sloped perch's height there, at most SLOPE_CATCH above it), else the floor (0).
 */
export function groundAt(perches: readonly Perch[] | undefined, p: Vec2, z: number): number {
  let ground = 0;
  for (const perch of perches ?? []) {
    const top = perch.profile ? topAt(perch, p.x) : perch.top;
    if (top > ground && top <= z + (perch.profile ? SLOPE_CATCH : PERCH_SLACK) && pointInPolygon(p, perch.area)) ground = top;
  }
  return ground;
}

/**
 * Where an owl `z` above the floor can be on the plan: the floor and the tops of the perches at or
 * below it, and not the solid perches above it. The two lists isWalkable, resolveTarget and
 * steerTarget take, so walking at a height is walking as before. `shut` is the floor shut for now.
 */
export function footing(room: Levels, z: number, shut: readonly Shut[] = []): { walkable: Polygon[]; shut: Shut[] } {
  const walkable = [...room.walkable];
  const blocked = [...shut];
  for (const perch of room.perches ?? []) {
    // A sloped perch is walked on from its lowest point: up it, the owl's height follows its profile.
    if (lowTop(perch) <= z + PERCH_SLACK) walkable.push(perch.area);
    else if (perch.solid) blocked.push(perch.area);
  }
  return { walkable, shut: blocked };
}

/** How many of the room's perches are at or below `z` (with the slack): the footing changes when this does. */
export function footingLevel(room: Pick<RoomDef, 'perches'>, z: number): number {
  return (room.perches ?? []).filter((perch) => lowTop(perch) <= z + PERCH_SLACK).length;
}

/** Whether an owl can be at `p` at some height: on the floor or on a perch's top. The room server's check of a walk, which trusts the page with heights. */
export function onSomeFooting(room: Levels, p: Vec2): boolean {
  return isWalkable(p, room.walkable) || (room.perches ?? []).some((perch) => pointInPolygon(p, perch.area));
}

/**
 * Where on the plan a tap at `p` (a point drawn on the screen, in room pixels) asks the owl to go: the
 * perch whose top is drawn there (its point on the plan is `top` below the tap), the one nearest the
 * front when two are, else the tap itself.
 */
export function tapGoal(room: Pick<RoomDef, 'perches'>, p: Vec2): Vec2 {
  let best: Vec2 | null = null;
  for (const perch of room.perches ?? []) {
    const on = { x: p.x, y: p.y + topAt(perch, p.x) };
    if (pointInPolygon(on, perch.area) && (!best || on.y > best.y)) best = on;
  }
  return best ?? p;
}

/** The heights an owl can stand at in the room: the floor and its perches' tops (a sloped perch's highest). */
export function standingHeights(room: Pick<RoomDef, 'perches'>): number[] {
  return [0, ...(room.perches ?? []).map((perch) => perch.top)];
}

/** A height an owl can stand at, or a range of them (a sloped perch's, lowest to highest). */
export type Standing = number | readonly [number, number];

/** The heights an owl can stand at in the room (OP-238): the floor, each flat perch's top, each sloped perch's range. */
export function standingRanges(room: Pick<RoomDef, 'perches'>): Standing[] {
  return [0, ...(room.perches ?? []).map((perch): Standing => (perch.profile ? [lowTop(perch), perch.top] : perch.top))];
}

/** The top of the room's highest perch (0 for a room without). */
export function highestTop(room: Pick<RoomDef, 'perches'>): number {
  return Math.max(0, ...(room.perches ?? []).map((perch) => perch.top));
}

/**
 * Something that sits up on a perch: a spot for a quest's finds, a quest item put there, a leaf pile.
 * `top` is that perch's top; absent, the thing is on the floor. It is drawn `top` above its point on
 * the plan, as an owl on the perch is.
 */
export interface Raised {
  top?: number;
}

/** Whether an owl over `ground` (groundAt: what it stands on, or would come down on) can reach a thing: only from the perch it sits on, and a thing on the floor only from the floor. */
export function sameLevel(ground: number, thing: Raised): boolean {
  return ground === (thing.top ?? 0);
}
