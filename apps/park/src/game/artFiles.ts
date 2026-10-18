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
