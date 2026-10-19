/**
 * Off-screen hints: where to put a chip at the edge of the screen that points toward something in
 * the room the camera cannot see (an open doorway, an interactive spot). Pure, so it is unit-tested;
 * the HUD draws the chips.
 */

/** Something worth pointing at, in room pixels. */
export interface HintTarget {
  id: string;
  x: number;
  y: number;
}

/** The part of the room the camera shows, in room pixels. */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The screen in CSS pixels, and how far chips stay from its edges (the HUD bars are top and bottom). */
export interface ScreenBox {
  w: number;
  h: number;
  top: number;
  bottom: number;
  side: number;
}

/** A chip's centre in CSS pixels and the direction its arrow points (radians, 0 = right, clockwise). */
export interface HintPlace {
  id: string;
  x: number;
  y: number;
  angle: number;
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

/**
 * A chip for every target outside the view: on the line from the middle of the screen toward the
 * target, where it meets the inset edge, its arrow pointing that way. Chips on the same edge keep
 * `spacing` apart.
 */
export function placeHints(targets: HintTarget[], view: ViewRect, screen: ScreenBox, spacing = 52): HintPlace[] {
  const box = { left: screen.side, right: screen.w - screen.side, top: screen.top, bottom: screen.h - screen.bottom };
  if (box.right <= box.left || box.bottom <= box.top) return [];
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const placed: Array<HintPlace & { edge: Edge }> = [];
  for (const t of targets) {
    if (t.x >= view.x && t.x <= view.x + view.w && t.y >= view.y && t.y <= view.y + view.h) continue; // on screen
    const dx = ((t.x - view.x) / view.w) * screen.w - cx;
    const dy = ((t.y - view.y) / view.h) * screen.h - cy;
    if (!dx && !dy) continue;
    // How far along the ray each edge is; the nearest one is where the chip sits.
    const sx = dx > 0 ? (box.right - cx) / dx : dx < 0 ? (box.left - cx) / dx : Infinity;
    const sy = dy > 0 ? (box.bottom - cy) / dy : dy < 0 ? (box.top - cy) / dy : Infinity;
    const s = Math.min(sx, sy);
    const edge: Edge = sx <= sy ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
    placed.push({ id: t.id, x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx), edge });
  }
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const along = edge === 'left' || edge === 'right' ? 'y' : 'x';
    const [lo, hi] = along === 'y' ? [box.top, box.bottom] : [box.left, box.right];
    const row = placed.filter((p) => p.edge === edge).sort((a, b) => a[along] - b[along]);
    for (let i = 1; i < row.length; i++) row[i]![along] = Math.max(row[i]![along], row[i - 1]![along] + spacing);
    // Pushed past the end: slide the whole row back (never past the start).
    const over = row.length ? row[row.length - 1]![along] - hi : 0;
    if (over > 0) for (const p of row) p[along] = Math.max(lo, p[along] - over);
  }
  return placed.map(({ edge: _edge, ...p }) => p);
}
