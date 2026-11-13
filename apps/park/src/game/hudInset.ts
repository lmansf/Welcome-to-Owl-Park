/**
 * The HUD's solid controls sit over the room's edges: on a computer the Menu, Emotes and Say along the
 * bottom and the owl count at the top right; on a touch screen the Menu and Say at the top right
 * (OP-278). The camera may scroll past the room's top and bottom by as much, so a doorway, landing,
 * hatch or leaf pile at an edge can always be brought out from under them: in a room seen from the
 * side (OP-278) and in one seen from above, whose floor runs to the bottom of the screen (OP-292).
 */

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
 */
export function cameraBounds(size: { w: number; h: number }, covered: CoveredEdges, cssToWorld: number): Bounds {
  if (!(cssToWorld > 0)) return { x: 0, y: 0, w: size.w, h: size.h };
  const top = Math.max(0, covered.top) * cssToWorld;
  const bottom = Math.max(0, covered.bottom) * cssToWorld;
  return { x: 0, y: -top, w: size.w, h: size.h + top + bottom };
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
