import { DEFAULT_SPECIES, SPECIES, type SpeciesId } from '@owl-park/shared';

/** The great horned owl's five layers, in drawing order: body, belly, accent, face, blink. */
export const OWL_LAYERS = ['owl-body', 'owl-belly', 'owl-accent', 'owl-face', 'owl-blink'] as const;

/** Each species' layer keys (`owl-barn-body` and so on); the great horned owl's are OWL_LAYERS. */
export const SPECIES_LAYERS = Object.fromEntries(
  SPECIES.map((s): [SpeciesId, readonly string[]] => [s.id, s.id === DEFAULT_SPECIES ? OWL_LAYERS : OWL_LAYERS.map((k) => k.replace('owl-', `owl-${s.id}-`))]),
) as Readonly<Record<SpeciesId, readonly string[]>>;

const SPECIES_LAYER_KEYS: ReadonlySet<string> = new Set(SPECIES.filter((s) => s.id !== DEFAULT_SPECIES).flatMap((s) => SPECIES_LAYERS[s.id]));

/** A species' own layer (`owl-barn-face`): not loaded at boot, only when an owl of that kind shows up. */
export function isSpeciesLayer(key: string): boolean {
  return SPECIES_LAYER_KEYS.has(key);
}

/**
 * The raster files the loader tries for a key once there is no SVG, in order. WebP comes before
 * PNG (painted rooms ship as WebP, everything else as PNG), and on a dense screen the 2x copies
 * come before the 1x ones. Given the files the build ships (`published`: each name in the art
 * folder and its content's hash), only those are tried, so a key costs one request, not a miss or
 * two first, and each is asked for with its hash (OP-129). Names are sent percent-encoded: the asset
 * server answers `owl-body@2x.png` with a redirect to `owl-body%402x.png`, a round trip for nothing.
 * Kept free of Phaser so the order can be unit-tested.
 */
export const RASTER_EXTS = ['webp', 'png'] as const;

/** Above this scale a `@2x` copy is worth fetching. */
export const DENSE_SCALE = 1.25;

/** The file names a key is looked for under at `scale`, best first; with `published`, only those the build ships. */
export function rasterNames(key: string, scale: number, published?: ReadonlyMap<string, string>): string[] {
  const one = RASTER_EXTS.map((ext) => `${key}.${ext}`);
  const names = scale <= DENSE_SCALE ? one : [...RASTER_EXTS.map((ext) => `${key}@2x.${ext}`), ...one];
  return published ? names.filter((n) => published.has(n)) : names;
}

export function rasterCandidates(baseUrl: string, key: string, scale: number, published?: ReadonlyMap<string, string>): string[] {
  return rasterNames(key, scale, published).map((n) => `${baseUrl}${encodeURIComponent(n)}${published ? `?v=${published.get(n)}` : ''}`);
}

/** Decoded bytes of one 1600 x 900 room texture at 1x (RGBA). */
export const ROOM_TEXTURE_BYTES = 1600 * 900 * 4;

/** A phone's budget for one room's big art: what a one-screen room costs today (background and overlay at 2x). */
export const PHONE_ROOM_BUDGET = 2 * 4 * ROOM_TEXTURE_BYTES;

/**
 * The cap on texture pixels per room pixel for a room with `textures` room-size textures (its
 * background and foreground tiles): `scaleMax` while they all fit `budgetBytes` at the scale the
 * screen wants (2x copies cost four times the 1x ones), otherwise 1, so the room loads its 1x copies.
 */
export function roomScaleCap(textures: number, pixelRatio: number, scaleMax: number, budgetBytes: number): number {
  const scale = Math.min(pixelRatio, scaleMax);
  const each = scale > DENSE_SCALE ? 4 * ROOM_TEXTURE_BYTES : Math.ceil(scale * scale * ROOM_TEXTURE_BYTES);
  return textures * each <= budgetBytes ? scaleMax : 1;
}
