/**
 * The party game's dice (OP-314): a small seeded random source whose whole state is one number, so a
 * game's state stays plain data the room server can keep and restore. The room server seeds each game
 * from the platform's cryptographic source and never sends the seed to a page: every roll, Moon Perch
 * hop and surprise is decided on the server.
 */

/** A random source's state: one 32-bit number, changed by every draw. */
export interface Dice {
  s: number;
}

/** A uniform draw in [0, 1) (mulberry32), moving the dice on. */
export function draw(d: Dice): number {
  d.s = (d.s + 0x6d2b79f5) | 0;
  let t = d.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A whole number from 0 to n - 1. */
export function pick(d: Dice, n: number): number {
  return Math.min(n - 1, Math.floor(draw(d) * n));
}

/** A whole number from lo to hi, both included. */
export function between(d: Dice, lo: number, hi: number): number {
  return lo + pick(d, hi - lo + 1);
}

/** A copy of a list in a random order. */
export function shuffled<T>(d: Dice, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = pick(d, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A fresh seed from a uniform source (the server's cryptographic one). */
export function seedFrom(random: () => number): number {
  return Math.floor(random() * 4294967296) | 0;
}
