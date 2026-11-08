/**
 * The dash (OP-224): a short sideways burst an owl has inside a parkour course, once a jump. Shift on a
 * computer, the pad's Dash on a phone. It is a walk at AIR_DASH_SPEED for AIR_DASH_DISTANCE across the floor
 * plan while the owl is up in the air, so the room server checks it as it checks any walk (where the
 * owl is, how far it may go, the floor it ends on) and as it checks flight (the owl is in the air):
 *  - the owl holds the dash only in a room that is an act of a course (`course` on the room, room.ts);
 *    the course's trail gate is the way into its first act, and its exit the way out;
 *  - one dash a jump: spent, it comes back only once the owl has stood on something again (the floor
 *    or a perch), and never sooner than AIR_DASH_COOLDOWN_MS after the last;
 *  - only in the air: on the ground the owl walks.
 *
 * Its own module, which flight (flight.ts) calls into for the landing that brings the dash back, so a
 * later rework of flight keeps the dash as it is. A leaf of the geometry: no rooms, no flight.
 */
import { distance, type Polygon, type Shut } from './geometry';
import type { Vec2 } from './protocol';
import { resolveTarget } from './resolveTarget';

/** How fast a dash goes (room px/s): three and a half times the walk. */
export const AIR_DASH_SPEED = 900;
/** How long a dash lasts (ms), and so how far it goes: 162 room px, about an owl and a third. */
export const AIR_DASH_MS = 180;
export const AIR_DASH_DISTANCE = (AIR_DASH_SPEED * AIR_DASH_MS) / 1000;
/** The least time between two dashes (ms), whatever the landings between them. */
export const AIR_DASH_COOLDOWN_MS = 350;
/**
 * The room hears of a dash a moment after the page made it, and reckons the owl's flight from the air
 * state it was told: an owl the room has come down within this long before the dash was still up.
 */
export const DASH_LAND_SLACK_MS = 150;
/** How much further than AIR_DASH_DISTANCE a dash asked of the room may reach and still be taken (a rounding). */
export const DASH_SLACK_PX = 4;

/** The dash as an owl holds it: spent since it last stood on something, and when it last set off (ms). */
export interface DashCharge {
  spent: boolean;
  at: number;
}

/** A dash ready to go: not spent, and none set off yet. */
export const FRESH_DASH: Readonly<DashCharge> = { spent: false, at: Number.NEGATIVE_INFINITY };

/** Why a dash was not taken: the owl does not hold it here, is on the ground, has spent it this jump, or dashed a moment ago. */
export type DashRefusal = 'not-held' | 'grounded' | 'spent' | 'cooldown';

/**
 * Whether the owl may dash now: it holds the dash (in a course), it is in the air, and the dash is not
 * spent this jump nor still cooling down from the last. The page's check and the room's are this one.
 */
export function dashRefusal(c: DashCharge, holds: boolean, airborne: boolean, now: number): DashRefusal | null {
  if (!holds) return 'not-held';
  if (!airborne) return 'grounded';
  if (c.spent) return 'spent';
  if (now - c.at < AIR_DASH_COOLDOWN_MS) return 'cooldown';
  return null;
}

export function canDash(c: DashCharge, holds: boolean, airborne: boolean, now: number): boolean {
  return dashRefusal(c, holds, airborne, now) === null;
}

/** The dash set off at `now`: spent until the owl stands on something again. */
export function spendDash(_c: DashCharge, now: number): DashCharge {
  return { spent: true, at: now };
}

/** The owl stood on something (the landing flight.ts steps, or a take-off the room sees from the ground): the dash is back. */
export function landDash(c: DashCharge): DashCharge {
  return c.spent ? { spent: false, at: c.at } : c;
}

/**
 * Which way a dash goes: along the held keys or the stick, else straight ahead the way the owl faces.
 * Always a unit vector.
 */
export function dashHeading(held: Vec2 | null, facing: -1 | 1): Vec2 {
  const len = held ? Math.hypot(held.x, held.y) : 0;
  if (held && len > 1e-6) return { x: held.x / len, y: held.y / len };
  return { x: facing, y: 0 };
}

/**
 * Where a dash from `from` heading `dir` comes to: AIR_DASH_DISTANCE along it, or as far as the footing
 * goes that way, in whole room pixels. `dir` need not be a unit vector.
 */
export function dashEnd(from: Vec2, dir: Vec2, walkable: Polygon[], shut: readonly Shut[] = []): Vec2 {
  const len = Math.hypot(dir.x, dir.y);
  if (!(len > 1e-6)) return { x: Math.round(from.x), y: Math.round(from.y) };
  const aim = { x: from.x + (dir.x / len) * AIR_DASH_DISTANCE, y: from.y + (dir.y / len) * AIR_DASH_DISTANCE };
  const to = resolveTarget(from, aim, walkable, shut);
  return { x: Math.round(to.x), y: Math.round(to.y) };
}

/**
 * Where the room takes a dash a page asked for to end, from where the room has the owl: toward the
 * point asked, no further than AIR_DASH_DISTANCE (and its slack), and no further than the footing goes.
 * The room's own `from` may be a little behind the page's, so the direction is the room's and the
 * length the dash's; a point asked for right where the owl is ends there.
 */
export function roomDashEnd(from: Vec2, asked: Vec2, walkable: Polygon[]): Vec2 {
  const d = distance(from, asked);
  if (d < 1) return { x: Math.round(from.x), y: Math.round(from.y) };
  const reach = Math.min(d, AIR_DASH_DISTANCE + DASH_SLACK_PX);
  const aim = { x: from.x + ((asked.x - from.x) / d) * reach, y: from.y + ((asked.y - from.y) / d) * reach };
  const to = resolveTarget(from, aim, walkable);
  return { x: Math.round(to.x), y: Math.round(to.y) };
}
