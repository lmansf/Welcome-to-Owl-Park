/**
 * The tips at the bottom of the screen kept clear of the chips at its edge (OP-415). The two-second
 * tips (the HUD's toasts) stand in a column at the bottom middle, and a chip pointing at a doorway
 * below the view stands on the same bottom edge: in the Great Hollow the warm air's tip was drawn
 * over the arcade's chip, hiding the words a newcomer is meant to read (QA walk, Nov 14). The chips
 * stay where they point; the tips go up above any chip they would cover, and back down once it is gone.
 *
 * The visitor's own owl counts as one more chip (OP-291, QA sweep D14): an owl arriving at the bottom
 * of the entrance plaza or the treehouse clearing stood behind a tip, so the tips go up above it too.
 *
 * Pure, on rects in screen px, so it is unit-tested; the HUD measures and asks it.
 */

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Space kept between a tip and a chip under it. */
export const TOAST_GAP = 8;

function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom + gap && a.bottom > b.top - gap;
}

/**
 * How far to lift the tips' column, standing at `column` where the page puts it, so it covers none of
 * the `chips`: 0 when it covers none, else up past each chip it would meet, never above the top of the
 * screen (`top`, where it stops however many chips there are).
 */
export function toastLift(column: Box, chips: readonly Box[], top = 0, gap = TOAST_GAP): number {
  if (column.bottom <= column.top) return 0;
  let lift = 0;
  for (let moved = true; moved; ) {
    moved = false;
    const at = { ...column, top: column.top - lift, bottom: column.bottom - lift };
    for (const c of chips) {
      if (!overlaps(at, c, gap)) continue;
      const need = column.bottom - (c.top - gap);
      if (need > lift) {
        lift = need;
        moved = true;
      }
    }
  }
  return Math.max(0, Math.min(lift, column.top - top));
}

/** Half the width kept clear around the owl's feet, in screen px (a room owl is about 90 px wide drawn). */
export const OWL_HALF_W = 48;

/**
 * The box the visitor's own owl takes on the screen (OP-291), from its feet and the top of its head in
 * CSS px, for the tips to stay clear of; null for an owl off the screen or not drawn.
 */
export function owlBox(owl: { x: number; y: number; top: number } | null, screen: { w: number; h: number }): Box | null {
  if (!owl || owl.y <= owl.top) return null;
  if (owl.x < 0 || owl.x > screen.w || owl.y < 0 || owl.top > screen.h) return null;
  return { left: owl.x - OWL_HALF_W, right: owl.x + OWL_HALF_W, top: owl.top, bottom: owl.y };
}
