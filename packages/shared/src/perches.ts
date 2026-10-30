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
 * TODO-DOCS (OP-084): docs/ARCHITECTURE.md (movement): perches, the ground under an owl, the footing
 * at a height, the landing on a perch told to the room, and things up on perches (`Raised`: a quest
 * spot, a leaf pile) reached only from that perch; docs/PLAYBOOK.md (controls): jump onto a perch,
 * walk off its edge to come down.
 */
import { isWalkable, pointInPolygon, type Polygon, type Shut } from './geometry';
import type { Vec2 } from './protocol';
import type { RoomDef } from './room';

export interface Perch {
  /** A name for tests and the ?boxes=1 overlay (OP-127). */
  id: string;
  area: Polygon;
  top: number;
  solid?: boolean;
}

/**
 * How far below a perch's top an owl may be and still come down on it: the rounding of a height
 * sent to the room, and the edge of a top caught on the way past it.
 */
export const PERCH_SLACK = 4;

/** The highest a perch's top may be (room px above the floor): what a page or the room believes an owl's height can be follows from it. */
export const MAX_PERCH_TOP = 480;

type Levels = Pick<RoomDef, 'walkable' | 'perches'>;

/** What an owl at `p`, `z` above the floor, comes down on: the highest perch top there at most PERCH_SLACK above it, else the floor (0). */
export function groundAt(perches: readonly Perch[] | undefined, p: Vec2, z: number): number {
  let ground = 0;
  for (const perch of perches ?? []) if (perch.top > ground && perch.top <= z + PERCH_SLACK && pointInPolygon(p, perch.area)) ground = perch.top;
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
    if (perch.top <= z + PERCH_SLACK) walkable.push(perch.area);
    else if (perch.solid) blocked.push(perch.area);
  }
  return { walkable, shut: blocked };
}

/** How many of the room's perches are at or below `z` (with the slack): the footing changes when this does. */
export function footingLevel(room: Pick<RoomDef, 'perches'>, z: number): number {
  return (room.perches ?? []).filter((perch) => perch.top <= z + PERCH_SLACK).length;
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
    const on = { x: p.x, y: p.y + perch.top };
    if (pointInPolygon(on, perch.area) && (!best || on.y > best.y)) best = on;
  }
  return best ?? p;
}

/** The heights an owl can stand at in the room: the floor and its perches' tops. */
export function standingHeights(room: Pick<RoomDef, 'perches'>): number[] {
  return [0, ...(room.perches ?? []).map((perch) => perch.top)];
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
