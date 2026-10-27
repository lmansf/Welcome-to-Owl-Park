/**
 * The sprite manifest (OP-127): what each published sprite draws, trimmed of the transparent padding
 * most image exports carry. The art tools measure it (`pnpm art:finish sprites`, and publishing art
 * rewrites it), so a new sprite gets its drawn area without anyone typing pixel values in.
 *
 * And the fit rules that read it: an interactable's trigger box is what it draws plus a margin, never
 * smaller than a fingertip on a phone, centred on what is drawn rather than on the file's frame; its
 * '!' marker sits just above what is drawn.
 *
 * TODO-DOCS (OP-127): docs/ARCHITECTURE.md describes the manifest (sprites.json: size, drawn box and
 * centre per published sprite, measured by `pnpm art:finish sprites`) and the fit rules here.
 */
import type { Vec2 } from './protocol';
import type { Rect } from './geometry';
import manifest from './sprites.json';

export interface SpriteFit {
  /** The size the sprite is drawn at (its 1x file), in pixels. */
  size: readonly [number, number];
  /** What it draws, `[x, y, w, h]` in those pixels; null for a file with nothing drawn. */
  drawn: readonly [number, number, number, number] | null;
  /** The middle of what it draws. */
  centre: readonly [number, number] | null;
  /** The object itself: only its pixels at least half opaque, without the glow or haze painted round it. */
  solid: readonly [number, number, number, number] | null;
}

// JSON reads its arrays as number[]; the art tools write them as these tuples.
export const SPRITES: Readonly<Record<string, SpriteFit>> = manifest.sprites as unknown as Record<string, SpriteFit>;

/** The fit rules (OP-127), in room pixels. */
export const FIT = {
  /** A trigger box reaches this far past what is drawn, on every side. */
  margin: 12,
  /** And is never narrower or shorter than this: a fingertip on a phone. */
  minSide: 44,
  /** A '!' marker's foot sits this far above what is drawn. */
  markerGap: 6,
} as const;

/** How a sprite is placed: the point it is drawn at, its origin (0..1 of its frame) and its scale. */
export interface Placement {
  at: Vec2;
  origin?: Vec2;
  scale?: number;
}

/**
 * Where a sprite drawn this way draws, in room pixels: its trimmed box, not its frame. Null for a
 * sprite the manifest does not know (or one with nothing drawn).
 */
export function drawnRect(key: string, place: Placement): Rect | null {
  const fit = SPRITES[key];
  if (!fit?.drawn) return null;
  const s = place.scale ?? 1;
  const o = place.origin ?? { x: 0.5, y: 0.5 };
  const [w, h] = fit.size;
  const [dx, dy, dw, dh] = fit.drawn;
  return { x: place.at.x + (dx - o.x * w) * s, y: place.at.y + (dy - o.y * h) * s, w: dw * s, h: dh * s };
}

/**
 * The trigger box of an interactable that draws `drawn`: that box grown by FIT.margin (plus `extra`)
 * on every side, at least FIT.minSide across and down, centred where it was.
 */
export function interactBox(drawn: Rect, extra = 0): Rect {
  const grow = FIT.margin + extra;
  const w = Math.max(drawn.w + 2 * grow, FIT.minSide);
  const h = Math.max(drawn.h + 2 * grow, FIT.minSide);
  const cx = drawn.x + drawn.w / 2;
  const cy = drawn.y + drawn.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Where an interactable's '!' marker stands: centred over what it draws, FIT.markerGap above its top. */
export function markerAt(drawn: Rect): Vec2 {
  return { x: drawn.x + drawn.w / 2, y: drawn.y - FIT.markerGap };
}
