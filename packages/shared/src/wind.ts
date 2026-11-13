/**
 * Wind currents (OP-275): sideways gusts in a room seen from the side, that carry a gliding owl across
 * a gap, as the realm kit's `wind-current` piece shows them. A current is a band of air from x0 to x1 at
 * a height `z` over the ground line, blowing one way (`dir`). An owl gliding into it (Jump held on the way
 * down) from a little under or over that height is held at `z`, as an updraft holds an owl at its top
 * (the same LIFTED air state, flight.ts, its top the current's height), and is carried downwind to the
 * current's far end, where it glides on as from any glide. Let go of Jump and it falls out of the air.
 *
 * Only gliding owls ride a current (a walking owl is not blown along), at the walk's pace: the carry is
 * the owl's own walk, so the room server checks it as any walk, and checks the hold as it checks an
 * updraft's (liftColumns, below, is what Room.ts holds an owl to).
 */
import type { Updraft } from './updraft';

export interface WindCurrent {
  id: string;
  /** Its west and east ends (room px). */
  x0: number;
  x1: number;
  /** The height it carries an owl at, over the ground line (room px). */
  z: number;
  /** The way it blows: 1 east, -1 west. */
  dir: 1 | -1;
  /** The realm's `wind-current` slot (OP-275): drawn along it once its artist's art is published. */
  art?: string;
}

/** How far under a current's height a gliding owl is caught by it (room px): about half an owl's height, so a current carries an owl across and is no lift up to it. */
export const WIND_CATCH_BELOW = 60;
/** How far over its height (room px): a glide a little high is brought down onto it. */
export const WIND_CATCH_ABOVE = 30;

/** The current a gliding owl at `x`, `z` up is in, if any: inside its ends, within its catch of its height. */
export function windAt(currents: readonly WindCurrent[] | undefined, x: number, z: number): WindCurrent | undefined {
  return (currents ?? []).find((w) => x >= w.x0 && x <= w.x1 && z >= w.z - WIND_CATCH_BELOW && z <= w.z + WIND_CATCH_ABOVE);
}

/** Where a current carries an owl to: its downwind end. */
export function windEnd(w: WindCurrent): number {
  return w.dir > 0 ? w.x1 : w.x0;
}

/**
 * A room's air that holds an owl up, as the room server checks a LIFTED owl against it (Room.ts,
 * liftHolds): its updrafts, and each wind current as a band its owl is held at the height of.
 */
export function liftColumns(room: { updrafts?: readonly Updraft[] | undefined; winds?: readonly WindCurrent[] | undefined }): Updraft[] {
  return [...(room.updrafts ?? []), ...(room.winds ?? []).map((w): Updraft => ({ id: `wind:${w.id}`, x: w.x0, w: w.x1 - w.x0, top: w.z }))];
}

/** Whether a current's numbers make sense: ends in order and a real length, a height over the floor, a way. */
export function windProblems(w: WindCurrent, roomW: number): string[] {
  const out: string[] = [];
  if (!(w.x1 - w.x0 >= 120)) out.push(`${w.id}: shorter than 120 px`);
  if (w.x0 < 0 || w.x1 > roomW) out.push(`${w.id}: outside the room`);
  if (!(w.z >= WIND_CATCH_BELOW)) out.push(`${w.id}: lower than its catch (${WIND_CATCH_BELOW})`);
  if (w.dir !== 1 && w.dir !== -1) out.push(`${w.id}: no way to blow`);
  return out;
}
