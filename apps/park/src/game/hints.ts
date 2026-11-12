/**
 * Off-screen hints: where to put a chip at the edge of the screen that points toward something in
 * the room the camera cannot see (an open doorway, an interactive spot). Pure, so it is unit-tested;
 * the HUD draws the chips.
 */
import { doorLabel, doorTarget, mapOf, type DoorDef, type RoomDef, type WalkMap } from '@owl-park/shared';

/**
 * The doorways that carry a sign naming where they lead (DoorDef.label, doorSigns.ts): open, named,
 * and in a room seen from above. Their chips at the screen's edge say the same words.
 */
export function signedDoors(
  room: RoomDef,
  map: WalkMap = 1,
  shut: (roomId: string) => boolean = () => false,
): Array<DoorDef & { label: string }> {
  if (mapOf(room) === 2) return [];
  return room.doors.flatMap((d) => {
    const to = doorTarget(d, map);
    const label = doorLabel(d, map);
    // A shut realm's arch (its closed sign) carries no sign; it opens with the realm.
    if (!to || !label || (d.closedSign && shut(to.room)) || !(d.labelAt ?? d.marker)) return [];
    return [{ ...d, label }];
  });
}

/** What a chip says for a doorway along a course: the way on, the way back, and the way to the finish (OP-346). */
export const CHIP_WORDS = { on: 'Next part', back: 'Back', finish: 'Finish' } as const;

/**
 * The words on the chip for a doorway seen from the side, which has no sign of its own (OP-346). A
 * course's chips were arrows with nothing said: the way on, the way back out and a side room all looked
 * the same at the screen's edge. Where the doorway leads, when that place has a name (`toName`, null
 * for none); in a course (`course`, null out of one) the finish, or which way along it the doorway
 * goes (DoorDef.way); nothing for a side room, whose arrow says only that it is there.
 */
export function sideChipWords(door: Pick<DoorDef, 'way'>, toName: string | null, course: { finish: boolean } | null): string | undefined {
  if (toName) return `To ${toName}`;
  if (!course) return undefined;
  if (course.finish) return CHIP_WORDS.finish;
  return door.way === 'up' ? CHIP_WORDS.on : door.way === 'down' ? CHIP_WORDS.back : undefined;
}

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

/** A doorway as hint targets see it: its id, its floor rect and, seen from the side, its height over the ground line. */
export interface HintDoor {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  top?: number;
}

/** How far over a side view's doorway floor a hint aims (room px): the middle of the doorway's art, not its sill. */
export const SIDE_HINT_OVER = 80;

/**
 * Where a hint points for a doorway: its rect's middle, or seen from the side (the tree, where every
 * doorway's rect lies on the ground line and its `top` says which landing it stands on) the doorway
 * itself, `top` over the ground line `ground`.
 */
export function doorHintTarget(door: HintDoor, ground: number | null): HintTarget {
  const x = door.rect.x + door.rect.w / 2;
  if (ground === null) return { id: door.id, x, y: door.rect.y + door.rect.h / 2 };
  return { id: door.id, x, y: ground - (door.top ?? 0) - SIDE_HINT_OVER };
}

/**
 * Seen from the side, only the targets within `reach` room px above or below the view: in a tall room
 * (the hollow hall) the far landings' doorways are found by climbing past the near ones, and a chip for
 * each would line the screen's edge.
 */
export function nearTargets(targets: HintTarget[], view: ViewRect, reach: number): HintTarget[] {
  return targets.filter((t) => t.y >= view.y - reach && t.y <= view.y + view.h + reach);
}

/**
 * Seen from above, the nearest few targets off each side of the view, and every one the view could
 * show: in a long room (the Great Hollow) a chip for every doorway down the room would line the
 * screen's edge, and a ten year old could not tell which is which. `keep` are always shown (the
 * owl's own nest door, the way to the park).
 */
export function nearestOffSides(targets: HintTarget[], view: ViewRect, perSide = 2, keep: ReadonlySet<string> = new Set()): HintTarget[] {
  const left = targets.filter((t) => t.x < view.x && !keep.has(t.id)).sort((a, b) => b.x - a.x);
  const right = targets.filter((t) => t.x > view.x + view.w && !keep.has(t.id)).sort((a, b) => a.x - b.x);
  const dropped = new Set([...left.slice(perSide), ...right.slice(perSide)].map((t) => t.id));
  return targets.filter((t) => !dropped.has(t.id));
}

/** Seen from above, how near (room px) the owl comes to a doorway before its sign shows (OP-309). */
export const SIGN_REACH = 300;
/** How near (room px) a walk's end lies to a doorway for the walk to count as going there. */
export const SIGN_GOAL_REACH = 160;
/** How much nearer (room px) another doorway must be before the sign shown gives way to it, so two never flicker. */
export const SIGN_HOLD = 60;

/**
 * Seen from above, the one doorway whose sign and chip show (OP-309; the owner, Nov 8: "We're back to
 * clutter on screen from all the directions"): the doorway the owl is walking to, else the nearest
 * within SIGN_REACH of the owl, else none. The sign shown now (`shown`) holds while the owl stays in
 * reach and no other doorway is SIGN_HOLD nearer. Every other doorway keeps only its marker, and the
 * Menu's map keeps the whole list.
 *
 * The doorway that `waits` (the one the owl has just come in by, signWaits) shows its sign only for a
 * walk to it: an owl standing where it arrived is not told the way back before anything else (OP-337).
 */
export function signFocus(
  targets: HintTarget[],
  owl: { x: number; y: number },
  goal: { x: number; y: number } | null,
  shown: string | null = null,
  waits: string | null = null,
): string | null {
  const dist = (t: HintTarget, p: { x: number; y: number }) => Math.hypot(t.x - p.x, t.y - p.y);
  if (goal) {
    const to = targets.filter((t) => dist(t, goal) <= SIGN_GOAL_REACH).sort((a, b) => dist(a, goal) - dist(b, goal))[0];
    if (to) return to.id;
  }
  const near = targets.filter((t) => t.id !== waits && dist(t, owl) <= SIGN_REACH).sort((a, b) => dist(a, owl) - dist(b, owl));
  const held = near.find((t) => t.id === shown);
  if (held && near[0] && dist(held, owl) - dist(near[0], owl) < SIGN_HOLD) return held.id;
  return near[0]?.id ?? null;
}

/**
 * Whether the doorway an owl came in by still keeps its sign back (OP-337): until the owl has been out
 * of its sign's reach once. The first words an arriving owl reads were the way back out ("Up to the
 * Treetop Commons", the moment it landed in the Great Hollow); now the sign is there the first time it
 * comes back to that doorway, or walks to it.
 */
export function signWaits(waiting: boolean, door: { x: number; y: number } | undefined, owl: { x: number; y: number }): boolean {
  return waiting && door !== undefined && Math.hypot(door.x - owl.x, door.y - owl.y) <= SIGN_REACH;
}

/**
 * Where a sign's middle stands across (room px): over its own spot, or slid in just far enough that
 * all its words are on screen (`view`, the room seen now; `margin` kept clear at each side), so a sign
 * by a doorway at the screen's edge is never cut off (the Great Hollow's ends, Nov 8).
 */
export function signX(x: number, w: number, view: { x: number; w: number }, margin: number): number {
  const lo = view.x + margin + w / 2;
  const hi = view.x + view.w - margin - w / 2;
  if (lo > hi) return view.x + view.w / 2;
  return Math.min(hi, Math.max(lo, x));
}

/** How tall an owl stands over its feet (room px), and the gap kept under them, so a sign never sits behind it. */
const OWL_TALL = 95;
const UNDER_FEET = 10;

/**
 * Where a sign's top stands (room px): at its own spot, or just under the owl's feet while the owl
 * stands where it would cover the words (an owl coming out of a doorway lands on its sign).
 */
export function signY(at: { x: number; y: number }, w: number, h: number, owl: { x: number; y: number }): number {
  const across = Math.abs(owl.x - at.x) < w / 2 + 30;
  const behind = at.y < owl.y + UNDER_FEET && at.y + h > owl.y - OWL_TALL;
  return across && behind ? owl.y + UNDER_FEET : at.y;
}

/**
 * The bottom inset on a touch screen: clear of the thumbstick and the face buttons, but never more than
 * TOUCH_BOTTOM_SHARE of the screen's height, so on a phone held sideways a chip for a way down sits low
 * on the screen and not across its middle.
 */
export const TOUCH_BOTTOM_SHARE = 0.25;
export function touchBottom(inset: number, screenH: number): number {
  return Math.min(inset, Math.round(screenH * TOUCH_BOTTOM_SHARE));
}

/** Just over the floor's edges (walkFloor, -0.6), under every piece and owl: a sign never covers the owl. */
export const SIGN_DEPTH = -0.5;

/**
 * How deep a room's signs draw. Seen from above (a room with a bowl) a tall idol stands up over the floor
 * in front of a doorway and hid its sign's first word ("neon street", Nov 9), so there signs draw over the
 * pieces; the sign showing still slides out from under the owl (signY), so it never covers the owl.
 */
export function signDepth(room: Pick<RoomDef, 'bowl' | 'size'>): number {
  return room.bowl ? room.size.h + 100 : SIGN_DEPTH;
}
