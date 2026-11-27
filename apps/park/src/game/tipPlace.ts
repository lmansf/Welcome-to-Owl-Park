/**
 * Where a course's tip goes so its words keep off the visitor's own owl (OP-512, courseTipSigns.ts):
 * the rule alone, with no Phaser, so it is unit-tested.
 */

/** A box in the room (room px). */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Where a tip's foot goes (room y) so its words keep off the visitor's own owl (OP-512): `y` as placed,
 * unless the words (`x` their middle, `w` wide, `h` tall) would cover any of `owl`. Then just over the
 * owl's head, `gap` clear of it, if that stays under `top` (the highest the words' top may go), else
 * just under its feet if that stays over `foot` (the lowest their foot may go). Where neither fits, as
 * placed: the screen is too short to keep both in view apart.
 */
export function clearOfOwl(x: number, y: number, w: number, h: number, owl: Box | null, top: number, foot: number, gap: number): number {
  if (!owl) return y;
  const covers = (at: number) => x + w / 2 > owl.left && x - w / 2 < owl.right && at > owl.top && at - h < owl.bottom;
  if (!covers(y)) return y;
  const over = owl.top - gap;
  if (over - h >= top) return over;
  const under = owl.bottom + gap + h;
  if (under <= foot) return under;
  return y;
}
