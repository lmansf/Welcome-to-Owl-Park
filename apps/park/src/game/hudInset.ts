/**
 * The HUD's solid controls sit over the room's edges: on a computer the Menu, Emotes and Say along the
 * bottom and the owl count at the top right; on a touch screen the Menu and Say at the top right
 * (OP-278). In a room seen from the side the camera may scroll past the room's top and bottom by as
 * much, so a doorway, landing or hatch at an edge can always be brought out from under them.
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
 * (the device's pixel ratio over the camera's zoom). Rooms seen from above keep the room's own
 * rectangle: they are framed to the screen and walked in, and the HUD's corners hold nothing there.
 */
export function cameraBounds(size: { w: number; h: number }, side: boolean, covered: CoveredEdges, cssToWorld: number): Bounds {
  if (!side || !(cssToWorld > 0)) return { x: 0, y: 0, w: size.w, h: size.h };
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
