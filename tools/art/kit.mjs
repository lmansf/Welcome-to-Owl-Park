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

/** The sheets (eighteen core, four slope sheets from top-up G2b, OP-240): six props each on the key colour, in a grid of three across and two down. */
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

/** The area sets: accent textures, prop sheets and backdrop layers, each repeating sideways. */
export const KIT_AREAS = KIT.areas ?? {};
export const LAYER_SIZES = KIT.layer_sizes ?? { sky: [1600, 900], far: [1600, 900], mid: [800, 450] };

function areaTexturePrompt(area, desc) {
  return `A seamless, tileable texture of ${desc}, filling the whole square evenly from edge to edge so that it repeats with no visible seam: the pattern continues across the left and right edges and across the top and bottom edges, even lighting with no vignette, no hot spot, no large single feature, no border, no frame, no shadow, the same scale of detail everywhere, seen flat on. The light of this area: ${area.light}. ${KIT_STYLE}`;
}

function areaSheetPrompt(area, sheet) {
  const items = sheet.pieces.map((p, i) => `${i + 1}) ${p.desc}`);
  return `A sheet of six separate game props on a flat, solid, uniform pure magenta ${KIT_KEY_COLOUR} backdrop, laid out in a grid of three across and two down, each prop whole and centred in its own cell with clear flat magenta all round it, no prop touching another prop or the edge of the frame, each cell the same size. Along the top row from left to right: ${items.slice(0, 3).join('; ')}. Along the bottom row from left to right: ${items.slice(3).join('; ')}. Every prop is seen straight from the side as in a side-scrolling platform game, standing on nothing, with no ground, no cast shadow and no glow painted on the magenta. The light of this area: ${area.light}. ${KIT_STYLE}`;
}

function areaLayerPrompt(area, name, desc) {
  const kind = name.split('-')[0];
  const repeat = 'Its left edge and its right edge continue into each other exactly, so that the painting repeats sideways with no visible seam: every shape, band and line that runs off the right edge comes back in at the same height on the left. Because it repeats, it holds no single large feature: no moon, no sun, no one big building; the moon is drawn separately by the game.';
  if (kind === 'sky') return `Background plate for a side-scrolling 2D game, the farthest layer, which the game scrolls at half speed behind the others: ${desc}. Paint edge to edge with no empty areas, no ground, no trees in front, nothing nearer than the sky and clouds. ${repeat} The light of this area: ${area.light}. ${KIT_STYLE}`;
  if (kind === 'far') return `Far layer for a side-scrolling 2D game, between the sky and the middle distance, which the game scrolls at a little over half speed, isolated on a flat, solid, uniform pure magenta ${KIT_KEY_COLOUR} background that fills every part of the canvas not covered by the painting, with no gradient, no vignette, no glow and no cast shadows on the magenta: ${desc}, the open sky above it left as flat magenta. ${repeat} The light of this area: ${area.light}. ${KIT_STYLE}`;
  return `Middle-distance layer for a side-scrolling 2D game, the layer between the far distance and the playfield, which the game scrolls at three quarters of the camera's pace, isolated on a flat, solid, uniform pure magenta ${KIT_KEY_COLOUR} background that fills every part of the canvas not covered by the painting, with no gradient, no vignette, no glow and no cast shadows on the magenta: ${desc}. Paint only middle-distance shapes, quieter and a step darker than a playfield would be, nothing that looks like a ledge to stand on. ${repeat} The light of this area: ${area.light}. ${KIT_STYLE}`;
}

export const KIT_AREA_TEXTURE_KEYS = [];
export const KIT_AREA_SHEET_KEYS = [];
export const KIT_AREA_LAYER_KEYS = [];
export const KIT_AREA_PROMPTS = {};
export const KIT_AREA_PIECES = [];
export const KIT_AREA_LAYERS = [];
for (const [areaName, area] of Object.entries(KIT_AREAS)) {
  for (const [name, desc] of Object.entries(area.textures)) {
    const key = `kit-tex-${areaName}-${name}`;
    KIT_AREA_TEXTURE_KEYS.push(key); KIT_AREA_PROMPTS[key] = areaTexturePrompt(area, desc);
  }
  for (const [name, sheet] of Object.entries(area.sheets)) {
    const key = `kit-sheet-${areaName}-${name}`;
    KIT_AREA_SHEET_KEYS.push(key); KIT_AREA_PROMPTS[key] = areaSheetPrompt(area, sheet);
    sheet.pieces.forEach((p, i) => KIT_AREA_PIECES.push({ key: `kit-${areaName}-${p.name}`, sheet: key, cell: i, w: p.w ?? sheet.w, h: p.h ?? sheet.h }));
  }
  for (const [name, desc] of Object.entries(area.layers)) {
    const key = `kit-${areaName}-${name}`;
    const [w, h] = LAYER_SIZES[name.split('-')[0]];
    KIT_AREA_LAYER_KEYS.push(key); KIT_AREA_PROMPTS[key] = areaLayerPrompt(area, name, desc);
    KIT_AREA_LAYERS.push({ key, area: areaName, name, w, h, keyed: !name.startsWith('sky') });
  }
}

/** The jobs of one area set (about 49 images at four variants a sheet and layer, three a texture). */
export function areaJobs(areaName, seedBase) {
  const area = KIT_AREAS[areaName];
  const jobs = [];
  let n = 0;
  for (const name of Object.keys(area.textures)) {
    const key = `kit-tex-${areaName}-${name}`;
    jobs.push({ key, kind: 'texture', realm: 'kit', size: `${2 * KIT.texture_size}x${2 * KIT.texture_size}`, seed: seedBase + (n += 4), variants: 3, providers: { fal: { output_format: 'png' } }, prompt: KIT_AREA_PROMPTS[key] });
  }
  for (const name of Object.keys(area.sheets)) {
    const key = `kit-sheet-${areaName}-${name}`;
    jobs.push({ key, kind: 'sheet', realm: 'kit', size: SHEET_SIZE, seed: seedBase + (n += 4), variants: 4, key_colour: KIT_KEY_COLOUR, derives: KIT_AREA_PIECES.filter((p) => p.sheet === key).map((p) => p.key), providers: { fal: { output_format: 'png' } }, prompt: KIT_AREA_PROMPTS[key] });
  }
  for (const name of Object.keys(area.layers)) {
    const key = `kit-${areaName}-${name}`;
    const keyed = !name.startsWith('sky');
    jobs.push({ key, kind: 'layer', realm: 'kit', size: name.startsWith('mid') ? '2048x1152' : '2048x1152', seed: seedBase + (n += 4), variants: 4, ...(keyed ? { key_colour: KIT_KEY_COLOUR } : {}), providers: { fal: { output_format: 'png' } }, prompt: KIT_AREA_PROMPTS[key] });
  }
  return jobs;
}

export const AREA_SEEDS = { entrance: 7400, clearing: 7500 };

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
  const areas = Object.keys(KIT_AREAS).flatMap((a) => areaJobs(a, AREA_SEEDS[a] ?? seedBase + 400));
  return [...textures, ...sheets, ...areas];
}
