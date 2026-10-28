import { DEFAULT_SPECIES, SPECIES, type SpeciesId } from '@owl-park/shared';
import { DENSE_SCALE, OWL_LAYERS } from './artNames';

export { DENSE_SCALE, OWL_LAYERS, RASTER_EXTS, rasterCandidates, rasterNames } from './artNames';

/** Each species' layer keys (`owl-barn-body` and so on); the great horned owl's are OWL_LAYERS. */
export const SPECIES_LAYERS = Object.fromEntries(
  SPECIES.map((s): [SpeciesId, readonly string[]] => [s.id, s.id === DEFAULT_SPECIES ? OWL_LAYERS : OWL_LAYERS.map((k) => k.replace('owl-', `owl-${s.id}-`))]),
) as Readonly<Record<SpeciesId, readonly string[]>>;

const SPECIES_LAYER_KEYS: ReadonlySet<string> = new Set(SPECIES.filter((s) => s.id !== DEFAULT_SPECIES).flatMap((s) => SPECIES_LAYERS[s.id]));

/** A species' own layer (`owl-barn-face`): not loaded at boot, only when an owl of that kind shows up. */
export function isSpeciesLayer(key: string): boolean {
  return SPECIES_LAYER_KEYS.has(key);
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
