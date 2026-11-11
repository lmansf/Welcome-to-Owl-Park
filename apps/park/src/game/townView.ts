/**
 * The town view (OP-336, flag-hidden behind `?town=1`): how much of a room seen from above a screen
 * shows. The owner's rule is that those rooms "feel big, like a town center, rather than a room.
 * somewhere that 80 people could gather", and the Great Hollow is laid out to be read whole, its ways
 * all round the rim. Without the town view every screen shows one screen's depth of a room (ROOM_H),
 * its owls as big as in a room one screen deep: a computer sees an eighth of the Great Hollow's floor
 * and a phone held upright 416 of its 6,400 px across.
 *
 * The town view draws back, by three rules:
 *
 * - a screen shows up to TOWN_VIEW.depth of a room's depth, the whole depth of most rooms;
 * - a phone held upright shows up to TOWN_VIEW.across of the room across, where the room is deep
 *   enough to fill the screen at that size;
 * - an owl is never drawn smaller than TOWN_VIEW.minCss (what a phone held sideways draws today), and
 *   no screen ever shows less than it does without the town view.
 *
 * Coming through the turnstiles the Great Hollow opens on the whole oval for a moment and eases in on
 * the owl (the opening look). Rooms seen from the side keep their camera. Pure, so it is unit-tested;
 * the room scene sets its camera by it.
 *
 * TODO-DOCS (OP-336): README.md's list of addresses gains `?town=1`; docs/ARCHITECTURE.md's camera notes
 * gain the town view's three rules and the opening look, once it is switched on for everyone.
 */
import { ROOM_H } from '@owl-park/shared';

export const TOWN_VIEW = {
  /** Up to this much of a room's depth on screen (room px). */
  depth: 1500,
  /** A screen narrower than it is tall shows up to this much across (room px): one screen's depth, turned. */
  across: 900,
  /** The fewest CSS px a room px is drawn at: an owl 100 room px wide is never under 42 CSS px. */
  minCss: 0.42,
} as const;

export interface Size {
  w: number;
  h: number;
}

/** The zoom every room has without the town view: the room covers the screen across, and a screen of it down. */
export function screenZoom(room: Size, screen: Size): number {
  return Math.max(screen.w / room.w, screen.h / Math.min(room.h, ROOM_H));
}

/** The smallest zoom at which the room still covers the screen: nothing past its edges shows. */
export function coverZoom(room: Size, screen: Size): number {
  return Math.max(screen.w / room.w, screen.h / room.h);
}

/** The zoom at which the whole room is on screen at once (the opening look). */
export function wholeZoom(room: Size, screen: Size): number {
  return Math.min(screen.w / room.w, screen.h / room.h);
}

/**
 * The town view's zoom for a room seen from above. `screen` is the game's size in its own pixels and
 * `pixelRatio` how many of them make a CSS pixel (the page's config: 1 to 2).
 */
export function townZoom(room: Size, screen: Size, pixelRatio: number): number {
  const wide = Math.min(screen.h / Math.min(room.h, TOWN_VIEW.depth), screen.w / TOWN_VIEW.across);
  const drawn = Math.max(coverZoom(room, screen), TOWN_VIEW.minCss * pixelRatio, wide);
  return Math.min(screenZoom(room, screen), drawn);
}

/** A camera's look at a room: its zoom and the point of the room at the middle of the screen. */
export interface Look {
  zoom: number;
  x: number;
  y: number;
}

/** The opening look's timing (ms): how long the whole room holds, how long it eases in, and how fast a player's first move ends it. */
export const OPENING = { holdMs: 900, easeMs: 1100, cutMs: 260 } as const;

/** Smooth at both ends. */
function ease(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

/**
 * How far drawn back the opening look is `ms` after the room came in: 1 the whole room, 0 the owl's
 * own view. It holds, then eases in. `cutAt` is when the player first moved, if it has: from then it
 * eases in over OPENING.cutMs from wherever it was, and never slower than it would have anyway.
 */
export function openingAt(ms: number, cutAt: number | null = null): number {
  const plain = (t: number) => 1 - ease((t - OPENING.holdMs) / OPENING.easeMs);
  if (cutAt === null || ms <= cutAt) return plain(ms);
  return Math.min(plain(ms), plain(cutAt) * (1 - ease((ms - cutAt) / OPENING.cutMs)));
}

/** When the opening look is over, `ms` after the room came in. */
export function openingOver(ms: number, cutAt: number | null = null): boolean {
  return openingAt(ms, cutAt) <= 0;
}

/**
 * The look between the owl's own view (`near`) and the whole room (`far`), `k` of the way drawn back.
 * The zoom is mixed by ratio, so the room seems to come nearer at a steady pace, and the middle of
 * the screen moves with it.
 */
export function lookBetween(near: Look, far: Look, k: number): Look {
  const t = Math.min(1, Math.max(0, k));
  return {
    zoom: near.zoom * (far.zoom / near.zoom) ** t,
    x: near.x + (far.x - near.x) * t,
    y: near.y + (far.y - near.y) * t,
  };
}

/**
 * How far the camera is drawn back for an owl `z` up that a thermal is lifting, or has lifted, to `top`
 * (OP-340): not at all at the height the thermal took it at (`from`), all the way at the top, so it
 * draws back as the owl rises and comes in again as its glide brings it down.
 */
export function riseBack(z: number, top: number, from: number): number {
  if (!(top > from)) return 0;
  return ease((z - from) / (top - from));
}

/**
 * The look that shows a whole room with `head` room px of air over its back wall: an owl high over the
 * floor is drawn up the screen from its place on it, past the wall when it flies near the back.
 */
export function wholeLook(room: Size, screen: Size, head = 0): Look {
  return { zoom: Math.min(screen.w / room.w, screen.h / (room.h + head)), x: room.w / 2, y: (room.h - head) / 2 };
}

/** How much air over a room's back wall the camera shows an owl riding a thermal (room px). */
export const RISE_HEAD = 320;

/**
 * Where a camera following `at` rests: `at` at the middle of the screen, held inside `bounds` (the
 * room, and what the HUD covers past it). A view wider or taller than the bounds rests at their start,
 * as the camera does.
 */
export function restAt(at: { x: number; y: number }, view: Size, bounds: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  const hold = (v: number, lo: number, span: number, size: number) => Math.min(Math.max(v, lo + size / 2), Math.max(lo + size / 2, lo + span - size / 2));
  return { x: hold(at.x, bounds.x, bounds.w, view.w), y: hold(at.y, bounds.y, bounds.h, view.h) };
}
