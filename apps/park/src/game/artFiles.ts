/**
 * The raster files the loader tries for a key once there is no SVG, in order. WebP comes before
 * PNG (painted rooms ship as WebP, everything else as PNG), and on a dense screen the 2x copies
 * come before the 1x ones. Kept free of Phaser so the order can be unit-tested.
 */
export const RASTER_EXTS = ['webp', 'png'] as const;

/** Above this scale a `@2x` copy is worth fetching. */
export const DENSE_SCALE = 1.25;

export function rasterCandidates(baseUrl: string, key: string, scale: number): string[] {
  const one = RASTER_EXTS.map((ext) => `${baseUrl}${key}.${ext}`);
  if (scale <= DENSE_SCALE) return one;
  return [...RASTER_EXTS.map((ext) => `${baseUrl}${key}@2x.${ext}`), ...one];
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
