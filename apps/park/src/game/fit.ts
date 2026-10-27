import { FIT, SPRITES } from '@owl-park/shared';
import type { OwlAnchors } from '../collect/pixels';
import { ITEM_SIZES } from './itemArt';

/**
 * Sprites placed by what they draw (OP-127), from the sprite manifest: most exported art carries a
 * band of transparent padding, so a sprite stood on its frame's bottom edge floats above its anchor
 * and one centred on its frame sits off to a side. These give the origin that puts the object itself
 * where it belongs; a sprite the manifest does not know keeps the frame's own point.
 *
 * TODO-DOCS (OP-127): docs/ARCHITECTURE.md describes worn items placed by anchor (wornAt: a hat's own
 * bottom on the crown and never below the brow, glasses on the eyes and a monocle on one of them, a
 * collar from the neck and never above the chin; brow and chin measured from the face layer), effects
 * following the drawn anchors through hops and emotes, and pets at their owl's size.
 */
export interface Origin {
  x: number;
  y: number;
}

/** The middle of the object's bottom edge: a sprite standing on its anchor (furniture, a pet, a hat on a head). */
export function footOrigin(key: string | undefined, fallback: Origin = { x: 0.5, y: 1 }): Origin {
  const fit = key ? SPRITES[key] : undefined;
  if (!fit?.solid) return fallback;
  const [w, h] = fit.size;
  const [x, y, sw, sh] = fit.solid;
  return { x: (x + sw / 2) / w, y: (y + sh) / h };
}

/** The middle of what is drawn: a sprite centred on its anchor (glasses on the eyes). */
export function centreOrigin(key: string | undefined, fallback: Origin = { x: 0.5, y: 0.5 }): Origin {
  const fit = key ? SPRITES[key] : undefined;
  if (!fit?.centre) return fallback;
  return { x: fit.centre[0] / fit.size[0], y: fit.centre[1] / fit.size[1] };
}

/** How far down its frame the object's top edge is, 0..1 (0 for a sprite the manifest does not know). */
export function solidTop(key: string | undefined): number {
  const fit = key ? SPRITES[key] : undefined;
  return fit?.solid ? fit.solid[1] / fit.size[1] : 0;
}

/**
 * A tap area round a sprite's object, in its own frame pixels (as `setInteractive` takes it): the
 * object's box grown by FIT.margin plus `extra` room pixels, never under FIT.minSide room pixels
 * across or down, centred where the object is. `scale` is how many room pixels one frame pixel
 * covers. Null for a sprite the manifest does not know.
 */
export function hitArea(key: string, scale: number, extra = 0): { x: number; y: number; w: number; h: number } | null {
  const fit = SPRITES[key];
  if (!fit?.solid || scale <= 0) return null;
  const [x, y, w, h] = fit.solid;
  const grow = (FIT.margin + extra) / scale;
  const min = FIT.minSide / scale;
  const bw = Math.max(w + 2 * grow, min);
  const bh = Math.max(h + 2 * grow, min);
  return { x: x + w / 2 - bw / 2, y: y + h / 2 - bh / 2, w: bw, h: bh };
}

/** The feet inside the owl's 200 x 240 layer canvas: bottom-centre, per the art pipeline canon. */
export const FEET = { x: 100, y: 240 };

/** The widths wearables are drawn for (owl canvas units); a bigger or smaller head scales them. */
const REF = { head: 110, eyes: 92, neck: 100 };
/** Each eye's middle sits this far either side of the eye line's middle, as a share of the eyes' span. */
export const EYE_SPREAD = 0.27;
/** Face items drawn for one eye (by art key): they sit over the painting's right eye, not between the two. */
const ONE_EYE: ReadonlySet<string> = new Set(['item-monocle']);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A worn item on an owl: the point its origin goes to (owl canvas units, the feet at 0, 0), its drawn size and its origin. */
export interface Worn {
  x: number;
  y: number;
  w: number;
  h: number;
  origin: Origin;
}

/**
 * Where a worn item sits on an owl, by what it draws (OP-127): a hat stands its own bottom on the
 * crown, never down over the eyes; glasses centre on the eyes (a monocle on one of them); a collar
 * hangs from the neck with its top band a little above it, never up over the beak. `art` is the
 * item's art key.
 */
export function wornAt(slot: 'head' | 'face' | 'neck', a: OwlAnchors, art: string | undefined): Worn {
  const size = ITEM_SIZES[slot];
  if (slot === 'head') {
    const s = clamp(a.head.w / REF.head, 0.75, 1.35);
    return { x: a.head.x - FEET.x, y: Math.min(a.head.y + 8, a.brow) - FEET.y, w: size.w * s, h: size.h * s, origin: footOrigin(art) };
  }
  if (slot === 'face') {
    const s = clamp(a.eyes.w / REF.eyes, 0.7, 1.4);
    const x = art && ONE_EYE.has(art) ? a.eyes.x + a.eyes.w * EYE_SPREAD : a.eyes.x;
    return { x: x - FEET.x, y: a.eyes.y - FEET.y, w: size.w * s, h: size.h * s, origin: centreOrigin(art) };
  }
  const s = clamp(a.neck.w / REF.neck, 0.7, 1.4);
  const h = size.h * s;
  const origin = { x: centreOrigin(art).x, y: 0.12 };
  const y = a.neck.y - 4;
  const top = y - h * (origin.y - solidTop(art));
  return { x: a.neck.x - FEET.x, y: y + Math.max(0, a.chin - top) - FEET.y, w: size.w * s, h, origin };
}
