/**
 * The three idols painted in parts (OP-397): the guardian, the robot owl and the glass owl, each as a
 * head, a body, two wings and what it stands on, painted to one brief with the whole idol, so a part
 * can move without a hole behind it (the body is painted whole under the wings and the head).
 *
 * Each part is its own picture (art/<idol>-<part>.webp, and @2x), and here is where it lies in its
 * idol's frame (the frame of the idol's whole picture, art/<idol>.webp), in that frame's pixels, and
 * the point it moves about: the head turns about its neck, a wing opens about its shoulder, the body
 * swells from where it sits. Laid out at these places the parts stand as the idol at rest.
 *
 * Only the guardian moves in parts today (guardianView.ts); the robot owl's and
 * the glass owl's are here for when they do.
 */
import type { Vec2 } from '@owl-park/shared';

/** The parts of an idol, back to front: the order they are drawn in. */
export const PARTS = ['base', 'body', 'wing-left', 'wing-right', 'head'] as const;
export type IdolPart = (typeof PARTS)[number];

/** Where a part lies in its idol's frame (its top-left corner and its size) and the point it moves about. */
export interface PartPlace {
  x: number;
  y: number;
  w: number;
  h: number;
  pivot: Vec2;
}

export interface IdolParts {
  /** The idol's whole picture, whose frame the places are in. */
  key: string;
  w: number;
  h: number;
  parts: Readonly<Record<IdolPart, PartPlace>>;
}

export type IdolKey = 'guardian' | 'robot-owl' | 'glass-idol';

/** Measured from the parts as painted, laid out at rest to stand as tall as the idol's whole picture, on the same foot. */
export const IDOL_PARTS: Readonly<Record<IdolKey, IdolParts>> = {
  guardian: {
    key: 'guardian',
    w: 720,
    h: 820,
    parts: {
      base: { x: 174, y: 659, w: 373, h: 151, pivot: { x: 360, y: 809 } },
      body: { x: 206, y: 278, w: 309, h: 463, pivot: { x: 360, y: 741 } },
      'wing-left': { x: 99, y: 324, w: 177, h: 447, pivot: { x: 276, y: 324 } },
      'wing-right': { x: 444, y: 324, w: 177, h: 447, pivot: { x: 444, y: 324 } },
      head: { x: 224, y: 37, w: 272, h: 281, pivot: { x: 360, y: 284 } },
    },
  },
  'robot-owl': {
    key: 'robot-owl',
    w: 900,
    h: 900,
    parts: {
      base: { x: 286, y: 597, w: 328, h: 286, pivot: { x: 450, y: 882 } },
      body: { x: 264, y: 261, w: 373, h: 382, pivot: { x: 450, y: 597 } },
      'wing-left': { x: 150, y: 299, w: 190, h: 398, pivot: { x: 339, y: 299 } },
      'wing-right': { x: 561, y: 299, w: 190, h: 397, pivot: { x: 561, y: 299 } },
      head: { x: 290, y: 18, w: 322, h: 283, pivot: { x: 450, y: 266 } },
    },
  },
  'glass-idol': {
    key: 'glass-idol',
    w: 520,
    h: 416,
    parts: {
      base: { x: 168, y: 329, w: 186, h: 86, pivot: { x: 260, y: 415 } },
      body: { x: 185, y: 123, w: 151, h: 230, pivot: { x: 260, y: 353 } },
      'wing-left': { x: 127, y: 146, w: 96, h: 226, pivot: { x: 223, y: 146 } },
      'wing-right': { x: 298, y: 146, w: 96, h: 226, pivot: { x: 298, y: 146 } },
      head: { x: 191, y: 13, w: 139, h: 128, pivot: { x: 260, y: 126 } },
    },
  },
};

/** A part's art key: `guardian-head`, `robot-owl-wing-left`. */
export function partKey(idol: IdolKey, part: IdolPart): string {
  return `${idol}-${part}`;
}

/** An idol's part keys, back to front. */
export function partKeys(idol: IdolKey): string[] {
  return PARTS.map((p) => partKey(idol, p));
}

/**
 * How the guardian's parts sit into its body when put together (Logan, Nov 20: "looks really unnatural with
 * the head and wings so disconnected. They should probably overlap the body model a little bit"). Laid out
 * as measured, the head sat on the body's top edge with a seam at the neck, and each wing hung clear of the
 * body, its tip swinging away from it as the body narrows to its feet. So the head sits lower, into the
 * body's ruff (`head`, frame px down), and each wing sits in over the body's side (`wing`, frame px toward
 * the middle), tipped in about its shoulder (`tilt`, radians) so it follows the body down to the bough.
 * A breath, a beat and a hoot open the wings from there (wingOpen).
 */
export const GUARDIAN_TUCK = { head: 20, wing: 28, tilt: 0.06 } as const;

/** Where a part of the guardian is stamped (its pivot) and how far a wing is turned, tucked in (GUARDIAN_TUCK), with the wings `open`. */
export function tuckedPose(part: IdolPart, pivot: Vec2, open: number): { at: Vec2; rotation: number } {
  const T = GUARDIAN_TUCK;
  if (part === 'head') return { at: { x: pivot.x, y: pivot.y + T.head }, rotation: 0 };
  if (part === 'wing-left') return { at: { x: pivot.x + T.wing, y: pivot.y }, rotation: open - T.tilt };
  if (part === 'wing-right') return { at: { x: pivot.x - T.wing, y: pivot.y }, rotation: -(open - T.tilt) };
  return { at: pivot, rotation: 0 };
}

/** How far the wings open (radians, each wing outward about its shoulder): a little with each breath and beat, wide with a hoot. */
export const WING_OPEN = { breath: 0.02, beat: 0.06, hoot: 0.3 } as const;

/** How far each wing is open now, from a breath, a beat and a hoot (each 0 to 1). */
export function wingOpen(breath: number, beat: number, hoot: number): number {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return WING_OPEN.breath * c(breath) + WING_OPEN.beat * c(beat) + WING_OPEN.hoot * c(hoot);
}

/** The most a wing ever opens. */
export const WING_OPEN_MAX = WING_OPEN.breath + WING_OPEN.beat + WING_OPEN.hoot;

/**
 * Where a point of a wing goes when it opens by `open` radians: the left wing turns clockwise on the
 * screen (its tip swings out to the left), the right wing the other way.
 */
export function openedPoint(place: PartPlace, side: 'wing-left' | 'wing-right', p: Vec2, open: number): Vec2 {
  const a = side === 'wing-left' ? open : -open;
  const dx = p.x - place.pivot.x;
  const dy = p.y - place.pivot.y;
  return { x: place.pivot.x + dx * Math.cos(a) - dy * Math.sin(a), y: place.pivot.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** The box that holds an idol's parts with its wings open as far as `open`, in its frame's pixels. */
export function reach(idol: IdolParts, open: number): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const part of PARTS) {
    const q = idol.parts[part];
    const corners = [
      { x: q.x, y: q.y },
      { x: q.x + q.w, y: q.y },
      { x: q.x, y: q.y + q.h },
      { x: q.x + q.w, y: q.y + q.h },
    ];
    for (const c of corners) {
      const p = part === 'wing-left' || part === 'wing-right' ? openedPoint(q, part, c, open) : c;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return { x0, y0, x1, y1 };
}
