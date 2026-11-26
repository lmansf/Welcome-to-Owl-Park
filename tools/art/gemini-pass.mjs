/**
 * The Gemini repaint pass (2026-11): a job list for `generate.mjs --prompts tools/art/gemini-pass.mjs
 * --provider gemini`, covering the art the November audit flagged. Every job is the existing job
 * for its key (or, where a published key has none, one built from config/assets.json) with a
 * `gemini_prompt` written to one formula:
 *
 *   [Context/Format] + [Reference Lock] + [Action] + [Style & Canvas]
 *
 * - Reference lock: the first reference is the art as it is today (the published file, or for a
 *   kit sheet its published pieces laid back on the sheet by `gemini_pass_refs.py`), named only as
 *   "Asset 1", "Sheet 1" or "Scene 1" and never re-described, so the model keeps its design; the
 *   second is an approved target screen, "Image 2", for the house style.
 * - Positive framing only: the prompt says what to paint, never what to leave out, and no negative
 *   prompt is sent.
 * - One style string per batch, word for word, so a batch does not drift.
 * - The canvas is stated: its size, where the subject sits, and the flat key colour around it.
 *
 * A follow-up fix is not a new prompt: `generate.mjs revise <key> <hash16> "Keep ... identical, but ..."`.
 * Nothing here publishes; the owner picks every candidate (CLAUDE.md, docs/ART-PIPELINE.md).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from './prompts.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = JSON.parse(fs.readFileSync(path.join(TOOLS, 'config', 'assets.json'), 'utf8')).keys;
const KIT = JSON.parse(fs.readFileSync(path.join(TOOLS, 'config', 'kit.json'), 'utf8'));

export const DEFAULTS = { ...P.DEFAULTS, provider: 'gemini' };
export const BLOCKS = P.BLOCKS;
export const HELPER_KEYS = [...new Set([...(P.HELPER_KEYS ?? []), ...P.JOBS.map((j) => j.key).filter((k) => !(k in ASSETS))])];
export const NEGATIVE_PROMPT = null;

// ---------------------------------------------------------------------------------------------
// What the audit flagged, by batch. Kit pieces are repainted through the sheet they were cut from.

export const BATCHES = {
  fixes: ['market', 'ink-idol', 'kit-sheet-ink-course-a', 'kit-sheet-ink-commons-a', 'icon-hop', 'kit-sheet-glass-tower-a', 'kit-sheet-entrance-plaza-a', 'kit-sheet-stalls-a', 'kit-sheet-barriers-a', 'commons', 'glass-east'],
  rooms: ['hub', 'hub-west', 'hub-east', 'lobby', 'lobby-west', 'market-east', 'grove', 'grove-west', 'grove-east', 'glass', 'homes', 'homes-west', 'nest', 'commons-west', 'commons-east', 'arcade', 'arcade-mid', 'arcade-end'],
  kit: [
    'kit-sheet-entrance-shop-a', 'kit-sheet-entrance-shop-b', 'kit-sheet-cut-run-neon-deck', 'kit-sheet-platform-stone-a', 'kit-sheet-platform-stone-b',
    'kit-sheet-slopes-stone', 'kit-sheet-stairs-a', 'kit-sheet-doors-a', 'kit-sheet-shelves-a', 'kit-sheet-barriers-b', 'kit-sheet-clearing-course-c',
    'kit-sheet-clearing-commons-a', 'kit-sheet-cut-run-ink-bank', 'kit-sheet-high-walkway-a', 'kit-sheet-high-boughs-a', 'kit-sheet-landmark-lever-brass',
    'kit-sheet-neon-course-c', 'kit-sheet-ink-course-c', 'kit-sheet-cut-trunk-b', 'kit-sheet-cut-run-plank', 'kit-high-hook-lantern', 'kit-high-leaf-cluster',
  ],
  textures: ['kit-tex-high-silvered-planks', 'kit-tex-planks', 'kit-tex-clearing-hollow-wood', 'kit-tex-ground-forest-floor', 'kit-tex-ink-river', 'kit-tex-low-walkway-planks', 'kit-tex-neon-lit-wall', 'kit-tex-clearing-meadow'],
  icons: ['icon-confetti', 'icon-surprise', 'icon-bow', 'icon-sneeze', 'icon-laugh', 'icon-fireflies'],
  items: Object.keys(ASSETS).filter((k) => k.startsWith('item-')),
};

/** The one change each job is for, in positive terms; the rest of the asset stays as Asset 1 has it. */
const FIX = {
  market: 'Every sign and storefront carries a plain glowing neon shape: rings, arrows, stars and abstract tubes.',
  'ink-idol': "The owl's chest is plain ink-washed feathers from throat to feet.",
  'kit-sheet-ink-course-a': 'Every rock and cliff face is plain grey ink wash, its surface marked only by brushed texture, every surface unstamped.',
  'kit-sheet-ink-commons-a': 'The pedestal top is a plain ring of carved stone, every surface unstamped.',
  'icon-hop': 'A round owl caught mid-hop: its body in the air, wings half raised, its two feet tucked under it, and a short curved motion arc beneath.',
  'kit-sheet-glass-tower-a': 'Prop 4 is a stone buttress: a tall tapering wedge of grey stone set against a wall, standing on its own base, as tall as its cell.',
  'kit-sheet-entrance-plaza-a': 'The pennant pole is a tall iron pole as tall as its cell with a plain cream and navy cloth pennant at its top.',
  'kit-sheet-stalls-a': 'Prop 3 is a ticket booth: a small wooden kiosk with a counter at the front, an open ticket window above the counter and a little brass bell on it.',
  'kit-sheet-barriers-a': 'The locked gate stands between warm grey stone pillars, its iron bars dark against flat magenta, and the boarded doorway sits in an arch of warm grey stone.',
  commons: 'Scene 1 becomes the Commons screen of the great hollow, its own painting, with the same floor line and doorways.',
  'glass-east': 'The floor is laid in cobbles and flagstones with worn edges, as detailed as the floor in Image 2.',
  'kit-sheet-cut-run-neon-deck': 'Each run is lit by neon: glowing pink and cyan tubes along its edges and soft neon light on its top surface.',
  'kit-sheet-platform-stone-a': 'Every stone is warm grey with lavender shadows, seen straight from the side.',
  'kit-sheet-platform-stone-b': 'Every stone is warm grey with lavender shadows, seen straight from the side.',
  'kit-sheet-slopes-stone': 'Every slope is warm grey stone with lavender shadows, seen straight from the side.',
  'kit-sheet-stairs-a': 'Every stair is seen straight from the side, its treads stepping up in profile.',
};

// ---------------------------------------------------------------------------------------------
// The formula's parts.

const PALETTE = KIT.palette;
/** A description with its negative clauses removed. */
export function positive(text) {
  return text.split(/[,;]\s*/).filter((c) => !/\b(no|not|never|nothing|without|nor)\b/i.test(c)).join(', ').replace(/[.\s]+$/, '');
}
const HOUSE = 'Hand-painted 2D side-scrolling game art in one house style: clean cel-shaded shapes with soft painted gradients, large flat colour areas, every edge drawn by colour and value alone, a clean matte finish.';
const LIGHT = {
  house: 'One light: a cool cream moon in the upper right, a soft cream rim along every upper-right edge, shadows falling down and to the left, warm lantern gold close around each lantern.',
  // The kit's area lights, with their "no ..." and "never ..." clauses dropped: positive framing only.
  ...Object.fromEntries(Object.entries(KIT.areas).map(([a, v]) => [a, `Light: ${positive(v.light)}.`])),
};
// The ink realm keeps its washes but takes the park's night light; its seal stamps read as lettering (audit).
LIGHT.ink = 'Light: a soft cool moon through drifting mist, the scene painted in layered grey-navy ink washes on warm paper cream #F6F1E3, the far layers fading into the mist, lantern gold #C9A227 and #FFD36A only inside paper lanterns, vermilion #C8322B only on small cord tassels.';
/** The style string for a batch: identical in every prompt that shares the light. */
export function styleFor(light) {
  return `${HOUSE} ${LIGHT[light] ?? LIGHT.house} Palette: ${PALETTE}.`;
}
const ITEM_STYLE = 'Clean 2D cel-shaded game art for a cozy owl game: bold flat colour shapes with simple soft shading and one gentle highlight, every edge drawn by colour and value alone, crisp opaque silhouette, readable at a small size, a soft painted matte finish.';
const ICON_STYLE = 'A single bold emblem painted in pure white and soft pale greys only, gentle cel-shaded modelling and one crisp highlight, every edge drawn by value alone, a crisp opaque silhouette, readable at 32 pixels, the owl drawn as a simple round chibi owl with a round facial disc and two short ear tufts.';

const AREA_OF = (key) => {
  const m = /^kit-(?:sheet-|tex-)?([a-z]+)-/.exec(key);
  if (m && KIT.areas[m[1]]) return m[1];
  if (/ink/.test(key)) return 'ink';
  if (/neon/.test(key)) return 'neon';
  return 'house';
};
const ROOM_LIGHT = { market: 'neon', 'market-east': 'neon', arcade: 'neon', 'arcade-mid': 'neon', 'arcade-end': 'neon', glass: 'glass', 'glass-east': 'glass', lobby: 'entrance', 'lobby-west': 'entrance', homes: 'canopy', 'homes-west': 'canopy', nest: 'canopy', grove: 'clearing', 'grove-west': 'clearing', 'grove-east': 'clearing' };
/** The approved target each light paints toward (tools/art/targets, copied under the reference limit by gemini_pass_refs.py). */
const TARGET_OF = { neon: '@final:kit-neon-mid-b', glass: '@guide:target-l4-ref', high: '@guide:target-l4-ref', canopy: '@guide:target-plaza-ref', entrance: '@guide:target-plaza-ref', clearing: '@guide:target-clearing-ref', low: '@guide:target-clearing-ref', ground: '@guide:target-clearing-ref', ink: '@final:kit-ink-paper-cliff', house: '@guide:target-l4-ref', under: '@guide:target-clearing-ref' };

export function canvasFor(job) {
  const [w, h] = job.size.split('x').map(Number);
  const bg = job.key_colour ? `isolated on one unbroken flat solid ${job.key_colour} field running from edge to edge, the same flat ${job.key_colour} between and around every shape, every light and glow held inside its own shape, each shape floating with a crisp clean edge where it meets the flat field` : '';
  if (job.kind === 'room' || job.kind === 'anchor' || job.kind === 'wing') return `Full-bleed ${w}x${h} 16:9 scene, the walkable floor running across the whole width along the bottom with its top edge level, clear and bare, doorways at floor level, every element in the place Scene 1 has it.`;
  if (job.kind === 'texture') return `A seamless tileable square texture, ${w}x${h}, the pattern continuing across all four edges, even light and the same scale of detail everywhere, seen flat on.`;
  if (job.kind === 'sheet' && /cut-run/.test(job.key)) return `A ${w}x${h} canvas with three long horizontal runs stacked with clear space between them, each run spanning from near the left edge to near the right edge, ${bg}.`;
  if (job.kind === 'sheet') {
    const n = job.derives?.length ?? 6;
    return n === 1 ? `One prop centred in a ${w}x${h} frame with even empty padding around it, ${bg}.` : `A ${w}x${h} sheet of ${n} separate props spaced three across and ${Math.ceil(n / 3)} down, each prop whole with wide clear space all round it, in the same order as Sheet 1, ${bg}.`;
  }
  return `The asset alone, centred in a ${w}x${h} frame with even empty padding around the edges, ${job.realm === 'items' ? 'its bottom resting near the bottom edge' : 'standing on the bottom edge'}, ${bg}.`;
}

export function contextFor(job) {
  if (job.kind === 'room' || job.kind === 'wing' || job.kind === 'anchor') return 'A 2D side-scrolling game background screen.';
  if (job.kind === 'texture') return 'A tileable 2D game texture.';
  if (job.kind === 'sheet') return /cut-run/.test(job.key) ? 'A sheet of platform runs for a 2D side-scrolling game.' : 'A sheet of props for a 2D side-scrolling game.';
  if (job.realm === 'icons') return 'A collection-menu emote icon for a 2D game.';
  if (job.realm === 'items') return 'A wearable cosmetic item for a small round cartoon owl in a 2D game.';
  return 'A 2D side-scrolling game asset.';
}

/** Jobs whose subject itself changes: no "keep its design". */
const REDRAW = new Set(['icon-hop', 'commons']);
const SUBJECT = (job) => (job.kind === 'room' || job.kind === 'wing' || job.kind === 'anchor' ? 'Scene 1' : job.kind === 'sheet' ? 'Sheet 1' : 'Asset 1');

/** The formula, assembled. */
export function formula({ context, lock, action, style, canvas }) {
  return [context, lock, action, style, canvas].map((s) => s.trim()).join(' ');
}

function geminiPrompt(job, style, hasStyleRef = true) {
  const subject = SUBJECT(job);
  const lock = `${subject} (reference image)${hasStyleRef ? ', painted in the style of Image 2 (style reference)' : ''}.`;
  const keep = REDRAW.has(job.key) ? `Paint a new ${subject} in the same style.` : job.kind === 'sheet' ? `Repaint ${subject}, keeping every prop's design, proportions and place.` : job.kind === 'texture' ? `Repaint ${subject} as an even, seamless tile of the same material.` : `Repaint ${subject}, keeping its design, proportions, pose and placement.`;
  // The collectibles' one defect (audit): thick dark outlines, which the identity lock would carry over.
  const itemFix = job.realm === 'items' ? 'Its shapes are painted in soft cel shading, each edge defined by a change of colour and shade, its rim catching a soft highlight.' : '';
  const action = [keep, FIX[job.key] ?? itemFix].filter(Boolean).join(' ');
  return formula({ context: contextFor(job), lock, action, style, canvas: canvasFor(job) });
}


// ---------------------------------------------------------------------------------------------
// New realm references (the owner, November 2026: the realms differ too much in style and quality
// from the main area to want to explore them). Each realm gets a fresh reference screen painted from
// the three approved main-area targets only, never from the realm's current art; the realm's rooms,
// kit and layers are then repainted with that screen as their reference (REALM_REF_OF).

export const REALM_REFS = {
  clearing: 'the Commons of the Treehouse Clearing: a calm round clearing under the lower boughs of great trees, a floor of soft earth and ferns across the whole width, small round huts of planks and leaves on the boughs behind with lit windows, rope bridges and lantern strings between them, a carved wooden owl idol on a round pedestal at the centre with open floor either side, a striped merch stall at the right, a glowing wooden portal arch at the far left',
  glass: 'the Commons of the stained-glass realm: a terrace of pale fitted stone high in the great tree in cool haze, across the whole width, tall pointed stained-glass windows set in dark stone frames along the back glowing from within in jewel panes between dark lead lines, a slender glass-paned lamp post, a stone owl idol with stained-glass wings on a round pedestal at the centre with open floor either side, a tall stone portal arch at the right glowing with jewel light, neighbouring tree crowns far below in mist',
  neon: 'the Commons of Neon Street: a narrow street of dark navy wooden shopfronts built into the great tree at dusk, wet dark paving across the whole width reflecting the light, paper lanterns in warm gold strung between the eaves, neon tubes in pink and cyan bent into simple shapes (rings, stars, arrows) over blank sign boards, a chrome owl idol on a round pedestal at the centre with open floor either side, a small market stall with a striped awning at the left, an arched doorway glowing pink at the right',
  ink: 'the Commons of the ink-wash realm: a paper garden on a broad branch in soft grey mist, a floor of pale stepping stones and raked gravel across the whole width, misty pines and tall rock pillars rising behind in layered grey washes, a curved wooden bridge over a narrow stream at the left, a stone lantern and a tea stall with a tiled roof, an ink-wash owl idol on a round stone pedestal at the centre with open floor either side, hanging blank paper scrolls',
};
export const REALM_REF_KEYS = Object.keys(REALM_REFS).map((a) => `realm-ref-${a}`);
const REF_CANVAS = 'Full-bleed 1600x900 16:9 screen for a side-scrolling game, the walkable floor running across the whole width with its top edge level 130 pixels above the bottom, its top clear and bare, the backdrop darker, softer and lower in contrast than the floor, the floor the brightest and sharpest band.';
function realmRefJob(area, i) {
  const prompt = formula({
    context: 'A finished reference screen for a realm of a 2D side-scrolling game.',
    lock: 'Images 1, 2 and 3 (style references) are approved screens of the same game: match their brush, palette, light and value bands exactly.',
    action: `Paint ${REALM_REFS[area]}.`,
    style: styleFor(area),
    canvas: REF_CANVAS,
  });
  return {
    key: `realm-ref-${area}`, kind: 'anchor', realm: area, size: '1600x900', seed: 13000 + i * 10, variants: 3,
    refs: ['target-l4', 'target-plaza', 'target-clearing'].map((t) => ({ ref: `@guide:${t}-ref`, role: 'an approved main-area target: the house style', optional: false })),
    prompt: `realm reference: ${area}`, gemini_prompt: prompt, batch: 'realm-refs',
  };
}
export const REALM_REF_JOBS = Object.keys(REALM_REFS).map(realmRefJob);

// ---------------------------------------------------------------------------------------------
// The jobs.

const existing = new Map(P.JOBS.map((j) => [j.key, j]));

/** A job for a published key the job list never had (painted outside it, or copied from another key). */
export function builtJob(key) {
  const a = ASSETS[key];
  if (!a) throw new Error(`gemini-pass: ${key} is neither a job nor a published key`);
  const kind = a.kind === 'room' ? 'room' : a.kind === 'texture' ? 'texture' : 'piece';
  const scale = kind === 'room' ? 2 : 2;
  return { key, kind, realm: key.startsWith('item-') ? 'items' : 'kit', size: `${a.w * scale}x${a.h * scale}`, seed: 12000, variants: 3, ...(kind === 'piece' ? { key_colour: a.key_colour ?? '#FF00FF' } : {}), refs: [], prompt: `repaint of ${key}` };
}

function identityRef(job) {
  if (job.kind === 'sheet') return { ref: `@guide:${job.key}-current`, role: 'the sheet as published today, its pieces laid back in their cells', optional: false };
  return { ref: `@final:${job.key}`, role: 'the art as published today', optional: false };
}

function styleRef(job, light) {
  if (job.realm === 'items') return { ref: '@final:decor-armchair', role: 'the house finish for small props', optional: false };
  if (job.realm === 'icons') return { ref: '@final:icon-tilt', role: 'the emote set as drawn', optional: false };
  return { ref: TARGET_OF[light] ?? TARGET_OF.house, role: 'an approved target screen: the house style', optional: false };
}

function passJob(key, batch) {
  const base = existing.get(key) ?? builtJob(key);
  const light = base.kind === 'room' || ['commons', 'commons-west', 'commons-east', 'hub', 'hub-west', 'hub-east'].includes(key) ? ROOM_LIGHT[key] ?? 'clearing' : AREA_OF(key);
  const style = base.realm === 'items' ? ITEM_STYLE : base.realm === 'icons' ? ICON_STYLE : styleFor(light);
  // A cut-out on a key colour gets the identity lock only: a scene as style reference makes the model
  // paint a scene behind the props (first run, November 2026). Rooms and textures keep the target.
  const keyed = Boolean(base.key_colour);
  const refs = keyed ? [identityRef(base)] : [identityRef(base), styleRef(base, light)];
  const job = { ...base, refs, variants: batch === 'items' || batch === 'kit' || batch === 'textures' || batch === 'icons' ? 2 : 3, providers: { ...(base.providers ?? {}) }, batch };
  // A room is generated at the size the post stage expects (3200x1800 for a screen).
  if (job.kind === 'room' && job.size === '1600x900') job.size = '3200x1800';
  job.gemini_prompt = geminiPrompt(job, style, !keyed);
  return job;
}

export const JOBS = Object.entries(BATCHES).flatMap(([batch, keys]) => [...new Set(keys)].map((k) => passJob(k, batch)))
  // A key flagged in two batches is generated once, in the first.
  .filter((j, i, all) => all.findIndex((x) => x.key === j.key) === i);
export const PASS_KEYS = JOBS.map((j) => j.key);
JOBS.push(...REALM_REF_JOBS);
HELPER_KEYS.push(...REALM_REF_KEYS);
