/**
 * Neon signs on circuits (docs/levels/neon-course.md, section 2): the neon realm's course's one new
 * mechanic. A sign is a ledge of the room that stands only while it is lit. The signs are wired on two
 * circuits, a and b, that take turns by park time: circuit a is lit, then, as it flickers out, circuit
 * b comes on, and so on, with a short spell in each turn when both are lit, so an owl that hops from
 * one circuit to the other as the first flickers lands on a sign that has just come on. A sign
 * flickers for its last SIGN_WARN_MS before it goes dark, and an owl standing on a dark sign falls.
 *
 * The turns run on park time (the room server's clock), so every page sees the same sign lit. Every
 * sign is a perch of its room, declared in the room's data (signPerches), so the room server believes
 * an owl standing on one; each page leaves out the signs that are dark as it steps its owl
 * (litPerches), as it does a brush stone's faded ink (brush.ts).
 */
import type { Perch } from './perches';
import { updraftClock, updraftOn } from './updraft';

/** Which circuit a sign is wired to. */
export type Circuit = 'a' | 'b';

/** How a room's circuits take turns: each is lit `onMs` of every `cycleMs`, circuit b half a cycle behind a. */
export interface CircuitPace {
  cycleMs: number;
  onMs: number;
}

/** A neon sign: a ledge from `x0` to `x1` across at `top`, lit `onMs` then dark `offMs`, from `phase` (0 to 1) of its cycle at park time 0. */
export interface NeonSign {
  /** The perch of the room it is (the same id). */
  id: string;
  x0: number;
  x1: number;
  top: number;
  circuit: Circuit;
  onMs: number;
  offMs: number;
  phase: number;
}

/** The pace of the rooftops (acts 1 and 3): a four-second turn, each circuit lit 2.4 s, so both are lit for 0.4 s at each change. */
export const ROOFTOP_PACE: CircuitPace = { cycleMs: 4000, onMs: 2400 };
/** The pace of the power cut (act 2): the circuits stutter, a 3.2 s turn, each lit 2 s, still 0.4 s of both. */
export const BROWNOUT_PACE: CircuitPace = { cycleMs: 3200, onMs: 2000 };
/** A sign flickers this long before it goes dark (ms). */
export const SIGN_WARN_MS = 600;

/** A sign on `circuit` at `pace`. */
export function neonSign(id: string, x0: number, x1: number, top: number, circuit: Circuit, pace: CircuitPace = ROOFTOP_PACE): NeonSign {
  return { id, x0, x1, top, circuit, onMs: pace.onMs, offMs: pace.cycleMs - pace.onMs, phase: circuit === 'a' ? 0 : 0.5 };
}

/** Whether a sign is lit at park time `t`. */
export function signLit(sign: NeonSign, t: number): boolean {
  return updraftOn(sign, t);
}

/** Whether a sign is lit and in its last moments before it goes dark (it flickers). */
export function signEnding(sign: NeonSign, t: number): boolean {
  const at = updraftClock(sign, t);
  return at !== null && at < sign.onMs && at >= sign.onMs - SIGN_WARN_MS;
}

/** A thin strip of the ground line from `x0` to `x1`: where a perch of a room seen from the side stands (as kitPerches lays its ledges). */
function strip(ground: number, x0: number, x1: number) {
  return [
    { x: x0, y: ground - 4 },
    { x: x1, y: ground - 4 },
    { x: x1, y: ground + 4 },
    { x: x0, y: ground + 4 },
  ];
}

/** The perches of a room's signs, as the room declares them. */
export function signPerches(signs: readonly NeonSign[], ground: number): Perch[] {
  return signs.map((s) => ({ id: s.id, top: s.top, area: strip(ground, s.x0, s.x1) }));
}

/** The ids of the signs lit at park time `t`. */
export function litSigns(signs: readonly NeonSign[] | undefined, t: number): Set<string> {
  return new Set((signs ?? []).filter((s) => signLit(s, t)).map((s) => s.id));
}

/** A room's perches as they stand at park time `t`: its own, less the signs that are dark. */
export function litPerches(perches: readonly Perch[] | undefined, signs: readonly NeonSign[] | undefined, t: number): Perch[] {
  if (!signs?.length) return [...(perches ?? [])];
  const dark = new Set(signs.filter((s) => !signLit(s, t)).map((s) => s.id));
  return (perches ?? []).filter((p) => !dark.has(p.id));
}
