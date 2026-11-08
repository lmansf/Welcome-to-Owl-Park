/**
 * Updrafts (OP-226, docs/levels/updraft-canopy.md, section 2): columns of rising air over the ground
 * line of a room seen from the side. An owl inside a column that is on, gliding (Jump held on the way
 * down), is lifted at UPDRAFT_RISE up to the column's top and hovers there; let go of Jump, or the
 * column switching off, and it falls as from any glide, with the flaps it had left (a column gives
 * none back). Some columns are always on; the rest switch on and off by park time, so every page sees
 * the same gusts: `phase` is the column's place in its cycle at time 0, from 0 to 1. The leaves in a
 * column thin out for its last UPDRAFT_WARN_MS before it drops, so a visitor sees the gust is ending.
 *
 * Only the lifted owl's page decides it is lifted, and tells the room as an air state (LIFTED,
 * flight.ts) with the top it rises to, which every page carries on; the room server takes that state
 * only inside a column that is on (Room.ts).
 */

/** A column of rising air from the ground line up to `top`, from `x` across `w` (room px). */
export interface Updraft {
  id: string;
  x: number;
  w: number;
  /** How high it lifts an owl over the ground line (room px), where it hovers. */
  top: number;
  /** On this long, then off `offMs`, over and over: absent, it is always on. */
  onMs?: number;
  offMs?: number;
  /** Its place in its cycle at park time 0, from 0 to 1 (0: just switched on). */
  phase?: number;
  /** The realm's `updraft` slot (OP-275): drawn up the column once its artist's art is published. */
  art?: string;
}

/** How fast a column lifts an owl (px/s): about the walk's pace, well under a jump's start (880). */
export const UPDRAFT_RISE = 240;
/** The leaves thin out this long before a gust drops (ms). */
export const UPDRAFT_WARN_MS = 750;
/** A state sent this long ago still counts against a column that has just switched off (ms): the room has the owl a moment behind. */
export const UPDRAFT_SLACK_MS = 400;

/** What switches on and off by park time: an updraft's column, or a neon sign (circuit.ts). */
export type Switching = Pick<Updraft, 'onMs' | 'offMs' | 'phase'>;

function cycle(u: Switching): number {
  return (u.onMs ?? 0) + (u.offMs ?? 0);
}

/** How far into its cycle a switching column is at time `t` (ms from its switching on), or null for one always on. */
export function updraftClock(u: Switching, t: number): number | null {
  const c = cycle(u);
  if (!u.onMs || c <= 0) return null;
  const at = (t + (u.phase ?? 0) * c) % c;
  return at < 0 ? at + c : at;
}

/** Whether a column is on at time `t`. */
export function updraftOn(u: Switching, t: number): boolean {
  const at = updraftClock(u, t);
  return at === null || at < (u.onMs ?? 0);
}

/** Whether a column is on and in its last moments before it drops (its leaves thin out). */
export function updraftEnding(u: Switching, t: number): boolean {
  const at = updraftClock(u, t);
  return at !== null && at < (u.onMs ?? 0) && at >= (u.onMs ?? 0) - UPDRAFT_WARN_MS;
}

/** Whether a point across the room is inside a column. */
export function inUpdraft(u: Updraft, x: number): boolean {
  return x >= u.x && x <= u.x + u.w;
}

/** The column that lifts an owl at `x`, `z` up at time `t`: one it is inside, that is on, and that it is below the top of. */
export function liftAt(columns: readonly Updraft[] | undefined, x: number, z: number, t: number): Updraft | undefined {
  return (columns ?? []).find((u) => inUpdraft(u, x) && z <= u.top + 1 && updraftOn(u, t));
}

/** Whether a lifted owl at `x`, rising to `top`, is in a column with that top that is on now or was a moment ago. */
export function liftHolds(columns: readonly Updraft[] | undefined, x: number, top: number, t: number, slackX = 0): boolean {
  return (columns ?? []).some((u) => u.top === top && x >= u.x - slackX && x <= u.x + u.w + slackX && (updraftOn(u, t) || updraftOn(u, t - UPDRAFT_SLACK_MS)));
}
