/**
 * The HUD's solid controls sit over the room's edges: on a computer the Menu, Emotes and Say along the
 * bottom and the owl count at the top right; on a touch screen the Menu and Say at the top right
 * (OP-278). The camera may scroll past the room's top and bottom by as much, so a doorway, landing,
 * hatch or leaf pile at an edge can always be brought out from under them: in a room seen from the
 * side (OP-278) and in one seen from above, whose floor runs to the bottom of the screen (OP-292).
 */
import { WALK_SPEED } from '@owl-park/shared';

/** How far the HUD's controls reach in from the top and the bottom of the screen, in CSS px. */
export interface CoveredEdges {
  top: number;
  bottom: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The camera's bounds for a room `size` wide and tall. `cssToWorld` is room units per CSS pixel
 * (the device's pixel ratio over the camera's zoom).
 *
 * `frontUp` (OP-496) is for a screen narrower than it is tall, where Menu, Emotes and Say make a row
 * right across the foot of the screen: the view's height in room px. Where the room's whole depth is on
 * screen at once (a plaza seen from above), the view is held with the room's front edge on the row's
 * top, wherever the owl is, rather than leaving the bottom of the room under the row until the owl
 * walks down to it: the sealed hollow's doorway, the owl at it and its prompt, and the neon street's
 * leaf piles all lie along the front. What that hides is the top of the back wall (as deep as the row
 * is tall), which nothing an owl uses is on. A room deeper than the view scrolls as before.
 *
 * TODO-DOCS (OP-496): docs/ARCHITECTURE.md's camera notes say that in a window narrower than it is tall,
 * a room seen from above whose depth is all on screen rests with its front edge on the HUD's bottom row,
 * the row measured again whenever it changes size (an action button wrapping it onto two lines).
 */
export function cameraBounds(size: { w: number; h: number }, covered: CoveredEdges, cssToWorld: number, frontUp?: { viewH: number }): Bounds {
  if (!(cssToWorld > 0)) return { x: 0, y: 0, w: size.w, h: size.h };
  const top = Math.max(0, covered.top) * cssToWorld;
  const bottom = Math.max(0, covered.bottom) * cssToWorld;
  const viewH = frontUp?.viewH ?? 0;
  // Bounds exactly the view's height hold the camera still up and down, the room's front on the row.
  if (bottom > 0 && viewH > 0 && viewH >= size.h - 0.5) return { x: 0, y: size.h + bottom - viewH, w: size.w, h: viewH };
  return { x: 0, y: -top, w: size.w, h: size.h + top + bottom };
}

/** Whether the HUD's bottom row runs right across a screen this size (CSS or game px): it is narrower than it is tall (OP-496). */
export function rowAcross(screen: { w: number; h: number }): boolean {
  return screen.w < screen.h;
}

/**
 * The lowest the top of a label `tall` room px high may lie so that it ends above `floor` (room px),
 * or where it is (`y`) when that is higher already, or when there is no floor (OP-496): the prompt at
 * an owl's feet on the floor's front edge stays above the HUD's row rather than under it.
 */
export function keptAbove(y: number, tall: number, floor: number | null): number {
  if (floor === null || !Number.isFinite(floor) || !(tall >= 0)) return y;
  return Math.min(y, floor - tall);
}

/**
 * Measure `rects` (the HUD controls' boxes on a screen `height` CSS px tall): each box in the top half
 * covers the top down to its bottom edge, each in the bottom half the bottom up to its top edge. Boxes
 * not drawn (no size) count for nothing, and neither edge takes more than a quarter of the screen.
 */
export function coveredBy(rects: ReadonlyArray<{ top: number; bottom: number; width: number; height: number }>, height: number): CoveredEdges {
  let top = 0;
  let bottom = 0;
  for (const r of rects) {
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.top + r.height / 2 < height / 2) top = Math.max(top, r.bottom);
    else bottom = Math.max(bottom, height - r.top);
  }
  const cap = height / 4;
  return { top: Math.min(Math.max(0, top), cap), bottom: Math.min(Math.max(0, bottom), cap) };
}

/**
 * How far above the owl the camera centres, in room units, in a room seen from above that is taller
 * than a screen (a plaza, Nov 8): the owl stands lower on the screen, so what is painted along the
 * back of the room (a realm's guardian, its idol, its doorways) stays in view while the owl stands on
 * the painted floor below it. One screen tall, or seen from the side, the camera centres on the owl.
 *
 * So it does in a room with ways `allRound` its rim (the Great Hollow's oval, OP-396), which has no
 * back to keep in view: its owls come in at the back, by the knothole, and three of the four places a
 * newcomer is led to (the arcade's hatch and two courses) are on its front rim, so a camera resting
 * above the owl shows less of the way there. Before OP-396 the hall had the lead on a plain address
 * and lost it after its opening look or a ride on its rising air; centred is what every owl through
 * the turnstiles had, and it is now what every owl has.
 *
 * TODO-DOCS (OP-396): docs/ARCHITECTURE.md's camera notes say where the camera rests: above the owl
 * in a plaza, on it in the Great Hollow, and back at rest after anything that had it (RoomScene's followOwl).
 */
export function followLead(roomH: number, sideView: boolean, viewH: number, screenH: number, allRound = false): number {
  if (sideView || allRound || roomH <= screenH || !(viewH > 0)) return 0;
  return Math.round(viewH * FOLLOW_LEAD);
}

/** The share of the view the camera centres above the owl in a tall room seen from above. */
export const FOLLOW_LEAD = 0.2;

/** The share of the way to the owl the camera goes each frame in a room seen from above (the engine's follow). */
export const FOLLOW_EASE = 0.12;

/**
 * That share for an owl going at `pace` (room px a second). The follow goes a share of the way each
 * frame, so an owl on the move stays ahead of the middle of the view by its frame's walk times
 * (1 - share) / share: at a walk's share an owl carried at twice a walk's pace (a glide lane, OP-287)
 * would be twice as far ahead, and on a slow phone near the edge of the view. This is the share that
 * keeps it as far ahead as a walking owl is.
 */
export function followEaseAt(pace: number): number {
  return 1 / (1 + ((1 - FOLLOW_EASE) / FOLLOW_EASE) * (WALK_SPEED / pace));
}
