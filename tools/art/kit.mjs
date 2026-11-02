/**
 * The art kit's jobs (OP-229): seamless textures and keyed shape sheets, from `config/kit.json`
 * (the one list of what the kit holds; `art:finish texture|sheet` and the README read the same
 * file). Painted to the park's style guide: one palette, clean cel-shaded shapes, no outlines.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'config', 'kit.json'), 'utf8'));
export const KIT_KEY_COLOUR = '#FF00FF';
export const SHEET_SIZE = '2048x1152';
export const SHEET_GRID = { cols: 3, rows: 2 };

export const KIT_STYLE = `Hand-painted 2D game art in one house style: clean cel-shaded shapes with soft painted gradients, no outlines, large flat areas, crisp clean edges, lit from the upper left by cool cream moonlight with warm lantern gold only where a lantern is named. Palette: ${KIT.palette}. No text, letters or numbers anywhere. No owls, birds, animals, people or characters.`;

/** The ten textures: one square each, painted to tile. */
export const KIT_TEXTURE_KEYS = Object.keys(KIT.textures).map((name) => `kit-tex-${name}`);
export const KIT_TEXTURE_PROMPTS = Object.fromEntries(Object.entries(KIT.textures).map(([name, desc]) => [`kit-tex-${name}`,
  `A seamless, tileable texture of ${desc}, filling the whole square evenly from edge to edge so that it repeats with no visible seam: the pattern continues across the left and right edges and across the top and bottom edges, even lighting with no vignette, no hot spot, no large single feature, no border, no frame, no shadow, the same scale of detail everywhere, seen flat on. ${KIT_STYLE}`]));

/** The eighteen sheets: six props each on the key colour, in a grid of three across and two down. */
export const KIT_SHEET_KEYS = Object.keys(KIT.sheets).map((name) => `kit-sheet-${name}`);
export const KIT_SHEET_PROMPTS = Object.fromEntries(Object.entries(KIT.sheets).map(([name, sheet]) => {
  const items = sheet.pieces.map((p, i) => `${i + 1}) ${p.desc}`);
  return [`kit-sheet-${name}`,
    `A sheet of six separate game props on a flat, solid, uniform pure magenta ${KIT_KEY_COLOUR} backdrop, laid out in a grid of three across and two down, each prop whole and centred in its own cell with clear flat magenta all round it, no prop touching another prop or the edge of the frame, each cell the same size. Along the top row from left to right: ${items.slice(0, 3).join('; ')}. Along the bottom row from left to right: ${items.slice(3).join('; ')}. Every prop is seen straight from the side as in a side-scrolling platform game, standing on nothing, with no ground, no cast shadow and no glow painted on the magenta. ${KIT_STYLE}`];
}));

/** Every shipped piece key with its logical size (the sheet's unless the piece says otherwise). */
export const KIT_PIECES = Object.entries(KIT.sheets).flatMap(([name, sheet]) => sheet.pieces.map((p, i) => ({
  key: `kit-${p.name}`, sheet: `kit-sheet-${name}`, cell: i, w: p.w ?? sheet.w, h: p.h ?? sheet.h,
})));

export function kitJobs(seedBase = 7000) {
  const textures = KIT_TEXTURE_KEYS.map((key, i) => ({
    key, kind: 'texture', realm: 'kit', size: `${2 * KIT.texture_size}x${2 * KIT.texture_size}`, seed: seedBase + i * 4, variants: 3,
    providers: { fal: { output_format: 'png' } }, prompt: KIT_TEXTURE_PROMPTS[key],
  }));
  const sheets = KIT_SHEET_KEYS.map((key, i) => ({
    key, kind: 'sheet', realm: 'kit', size: SHEET_SIZE, seed: seedBase + 100 + i * 4, variants: 4, key_colour: KIT_KEY_COLOUR,
    derives: KIT_PIECES.filter((p) => p.sheet === key).map((p) => p.key),
    providers: { fal: { output_format: 'png' } }, prompt: KIT_SHEET_PROMPTS[key],
  }));
  return [...textures, ...sheets];
}
