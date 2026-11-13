/**
 * A thermal (OP-340): a column of warm rising air over a spot of a room seen from above, a circle on
 * the room's plan. An owl gliding inside it (Jump held on the way down) is lifted, at an updraft's
 * pace, up to the thermal's top and hovers there; carried out of the column, or Jump let go, it falls
 * as from any glide, and a glide held from the top carries it a long way across the room (one down for
 * three along, flight.ts). The Great Hollow has one at its heart, high enough for a held glide to
 * reach every way on its rim: travel as play (OP-308), and owls moving like owls (OP-287).
 *
 * It is an updraft (updraft.ts) for a room walked across from above: an updraft is a band across a
 * room seen from the side, always the room's whole depth, where a thermal is a place on the floor.
 * As with an updraft, only the lifted owl's page decides it is lifted, and tells the room as an air
 * state (LIFTED, flight.ts) with the top it rises to; the room server takes that state only from an
 * owl inside a thermal of the room with that top (Room.ts).
 *
 * TODO-DOCS (OP-340): docs/ARCHITECTURE.md's flight notes gain the thermal beside the updraft, and that a
 * lifted owl's state goes to the room with the top it rises to (flight.ts, airOut).
 */
import type { Vec2 } from './protocol';

export interface Thermal {
  id: string;
  /** The middle of the column on the room's plan (room px). */
  pos: Vec2;
  /** How far out from the middle it lifts (room px). */
  r: number;
  /** How high it lifts an owl over the floor (room px), where it hovers. */
  top: number;
}

/** Whether a point of the plan is inside a thermal's column, `slack` px past its edge at most. */
export function inThermal(t: Thermal, p: Vec2, slack = 0): boolean {
  return Math.hypot(p.x - t.pos.x, p.y - t.pos.y) <= t.r + slack;
}

/** The thermal that lifts an owl at `p`, `z` up: one it is inside and below the top of. */
export function thermalAt(thermals: readonly Thermal[] | undefined, p: Vec2, z: number): Thermal | undefined {
  return (thermals ?? []).find((t) => inThermal(t, p) && z <= t.top + 1);
}

/** Whether a lifted owl at `p`, rising to `top`, is in a thermal with that top (the room server's check, with its slack for latency). */
export function thermalHolds(thermals: readonly Thermal[] | undefined, p: Vec2, top: number, slack = 0): boolean {
  return (thermals ?? []).some((t) => t.top === top && inThermal(t, p, slack));
}

/** The highest any thermal of a room lifts an owl: 0 for a room with none. */
export function thermalTop(room: { thermals?: readonly Thermal[] | undefined }): number {
  return Math.max(0, ...(room.thermals ?? []).map((t) => t.top));
}

/** Whether a thermal's numbers make sense: a column wide enough to stand in, a top over the floor. */
export function thermalProblems(t: Thermal): string[] {
  const out: string[] = [];
  if (!(t.r >= 60)) out.push(`${t.id}: narrower than an owl can stand in (60 px out)`);
  if (!(t.top > 0)) out.push(`${t.id}: no height`);
  return out;
}
