/**
 * Tall art an owl can stand behind goes see-through while the visitor's own owl is behind it (OP-346).
 * In a room seen from above, a thing drawn standing up covers whatever stands north of its foot: the
 * neon realm's idol, about 500 px tall on the Great Hollow's rim, hid the visitor's own owl whole, and
 * an owl that cannot be seen cannot be steered. Only the visitor's own owl counts: the others stay
 * behind things as before, which is what says the thing stands in front of them.
 *
 * The rule here is pure (hiddenBehind); seeThroughArt.ts fades the art.
 */
import type { Rect, Vec2 } from '@owl-park/shared';

/** How see-through tall art goes, how quickly (ms), and how tall art must be drawn to count (room px; an owl is about 90). */
export const SEE_THROUGH = { alpha: 0.35, ms: 160, tall: 170 } as const;

/** The owl's body over its feet, as far as being hidden goes (room px). */
export const OWL_BODY = { w: 56, h: 88 } as const;

/**
 * Whether an owl with its feet at `feet`, `z` up in the air, is hidden by art drawn over `art` (room px)
 * that stands at `footY`: the owl stands behind it (north of its foot) and half its body or more is
 * inside the art's box.
 */
export function hiddenBehind(feet: Vec2, z: number, art: Rect, footY: number): boolean {
  if (feet.y >= footY) return false;
  const left = feet.x - OWL_BODY.w / 2;
  const top = feet.y - z - OWL_BODY.h;
  const w = Math.min(left + OWL_BODY.w, art.x + art.w) - Math.max(left, art.x);
  const h = Math.min(top + OWL_BODY.h, art.y + art.h) - Math.max(top, art.y);
  return w > 0 && h > 0 && w * h >= (OWL_BODY.w * OWL_BODY.h) / 2;
}
