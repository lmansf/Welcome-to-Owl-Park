/**
 * The hop (the Jump button and the space bar, OP-082): a little jump with a flap of the wings that
 * lifts only the drawing of the owl, never its place in the room. Its own state beside emotes, so
 * that flight (OP-084) can later turn the lift into a real height without changing how a hop is
 * asked for or how it reaches the room.
 */

/** How long a hop lasts. */
export const HOP_MS = 400;
/** How high a hop lifts the owl at its top, in owl canvas units (a bigger owl hops higher). */
export const HOP_HEIGHT = 64;

/** How high a hop is at `t` (0 to 1 of HOP_MS), as a share of its top: up and back down. */
export function hopLift(t: number): number {
  return t <= 0 || t >= 1 ? 0 : 4 * t * (1 - t);
}

/** The wings during a hop: two frames, spread then tucked, taking turns four times; null on the ground. */
export function hopFlap(t: number): 'spread' | 'tucked' | null {
  if (t < 0 || t >= 1) return null;
  return Math.floor(t * 4) % 2 === 0 ? 'spread' : 'tucked';
}
