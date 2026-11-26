/**
 * The realm rebuild (owner, November 2026): every realm's art repainted from its new reference
 * screen (`realm-ref-<area>` in gemini-pass.mjs, painted from the main area's approved targets
 * only), never from the realm's current art. Run with
 *
 *   NODE_USE_ENV_PROXY=1 node tools/art/generate.mjs --prompts tools/art/gemini-realms.mjs --provider gemini --only '<realm keys>'
 *
 * after `select`ing the four references. Each job is the realm's existing job (same key, kind,
 * size, key colour and derived pieces, so the finish stage cuts it as before) with:
 *   - one reference, "Image 1": the realm's new reference screen (rooms add their layout guide,
 *     "Image 2", the floor and doorways in greys);
 *   - a gemini_prompt in the formula, its content taken from config/kit.json's descriptions (or,
 *     for a room or set piece, the job's own scene sentences), with every negative clause dropped.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from './prompts.mjs';
import * as G from './gemini-pass.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const KIT = JSON.parse(fs.readFileSync(path.join(TOOLS, 'config', 'kit.json'), 'utf8'));
const ASSETS = JSON.parse(fs.readFileSync(path.join(TOOLS, 'config', 'assets.json'), 'utf8')).keys;

export const DEFAULTS = G.DEFAULTS;
export const BLOCKS = G.BLOCKS;
export const HELPER_KEYS = G.HELPER_KEYS;
export const NEGATIVE_PROMPT = null;
export const REALMS = ['clearing', 'glass', 'neon', 'ink'];

/** Sentences with no negative in them, and none about the old references or the style blocks. */
export function sceneSentences(prompt) {
  const body = prompt.split(/\b(?:STYLE|PALETTE|AVOID)\b\s*[:(]/)[0];
  return body.split(/(?<=\.)\s+/)
    .filter((s) => !/\b(no|not|never|without|nothing|avoid|reference|copy)\b/i.test(s))
    .map((s) => G.positive(s))
    .filter((s) => s.length > 3)
    .join('. ').replace(/\.\.+/g, '.').trim();
}

const plain = (d) => G.positive(d);
const list = (pieces) => pieces.map((p, i) => `${i + 1}) ${plain(p.desc)}`).join('; ');

/**
 * Rooms and set pieces get fresh scene text in the new reference's world: the old prompts describe the
 * realms as they were (a cyberpunk city, mosaic skyscrapers), which is what the owner asked to leave.
 * The foreground overlay and the seam edit keep their own pipelines and are not rebuilt here.
 */
export const SCENES = {
  market: { area: 'neon', what: "the Neon Street screen: a narrow street of dark navy wooden shopfronts built into the great tree at dusk, wet dark paving across the whole width reflecting the light, a tall arched doorway glowing pink at floor level at the far left, a row of small market stalls with striped awnings along the back, one larger gift shop front at the centre with a wide glowing window full of small bright goods and a chrome doorway at floor level, neon tubes bent into simple rings, stars and arrows over blank sign boards, paper lanterns strung between the eaves, the great tree's bark rising behind into the violet-navy sky" },
  'market-east': { area: 'neon', what: "the east end of Neon Street, continuing the same wet paving and dark navy shopfronts, paper lanterns strung between the eaves, neon rings and stars over blank sign boards, and at the right a round-topped doorway glowing cyan at floor level" },
  glass: { area: 'glass', what: "the stained-glass realm's street high in the great tree: a terrace of pale fitted stone across the whole width, tall pointed stained-glass windows in dark stone frames set into the trunk behind, glowing from within in jewel panes between dark lead lines, a tall stone portal arch glowing with jewel light at floor level at the left, slender glass-paned lamp posts, neighbouring tree crowns far below in mist" },
  'glass-east': { area: 'glass', what: "the east screen of the stained-glass terrace, continuing the same pale fitted stone and the tall pointed stained-glass windows set in the trunk behind, a lamp post with a glass lantern, the terrace ending at the right at a low stone balustrade above the misty tree crowns" },
  'glass-idol': { area: 'glass', what: "the realm's idol: an owl made of leaded stained glass, standing upright and facing the viewer, calm and monumental, its jewel panes lit from within between dark lead lines" },
  'robot-owl': { area: 'neon', what: 'a giant robot owl, full body, standing upright on two heavy legs with chrome talons, built in the shape of a barred owl: a big round smooth-domed head, a wide facial disc framed by concentric chrome rings, two large round eyes glowing cyan, barred chrome plates across the chest, its wings folded close at its sides, pink and cyan neon seams along its plates' },
  'climb-sky': { area: 'glass', what: 'the stained-glass face of a great tower seen close while climbing it: a wall of leaded panes in deep sapphire and navy with a few lit in gold, ruby and emerald, dark lead lines between them, the pattern continuing from the bottom edge to the top edge so it tiles upward, filling the whole canvas' },
  'climb-column': { area: 'glass', what: 'one slender column of leaded stained glass in a dark stone frame, lit panes of gold and rose running up it, its pattern continuing from the bottom edge to the top edge so it tiles upward' },
  'climb-ledge-a': { area: 'glass', what: 'a short balcony ledge of pale stone edged with a strip of lit stained glass, its top flat and level across the whole width, a small dark bracket under each end' },
  'climb-ledge-b': { area: 'glass', what: 'a narrow ledge of pale stone on two dark lead brackets, one lit pane of gold glass set in its front, its top flat and level across the whole width' },
  'climb-balcony': { area: 'glass', what: 'a full-width balcony of pale stone with a low balustrade of small lit stained-glass panes along its front, its top flat and level across the whole width, a coloured-glass lantern at each end' },
  ink: { area: 'ink', what: "the ink-wash realm's garden screen on a broad branch of the great tree: a floor of pale stepping stones and raked gravel across the whole width, misty pines and tall rock pillars rising behind in layered washes, a curved wooden bridge over a narrow stream at the left, a stone lantern and a tea stall with a tiled roof, hanging blank paper scrolls, a round gateway in a pale wall at floor level at the far left" },
  'ink-east': { area: 'ink', what: 'the east screen of the same paper garden, continuing its stepping stones and raked gravel, misty pines and rock pillars behind, a small pavilion with a curved tiled roof and paper lanterns, a stone basin by the path' },
  'ink-idol': { area: 'ink', what: 'the realm\'s idol: an owl painted in soft grey ink washes on cream, standing upright and calm on a plain carved stone pedestal, facing the viewer, its feathers drawn in flowing brushstrokes' },
  'climb-cloud-cap': { area: 'glass', what: "the very top of the tower meeting the clouds: a flat rooftop terrace of pale stone with a low balustrade of lit panes across the whole width along the bottom third, its top flat and level, soft moonlit clouds all round it" },
};

/** Which realm a job belongs to, and what it paints (positive text), or null when it is not a realm's. */
export function realmContent(job) {
  const k = job.key;
  let m = /^kit-sheet-(clearing|glass|neon|ink)-(.+)$/.exec(k);
  if (m) {
    const sheet = KIT.areas[m[1]].sheets?.[m[2]] ?? KIT.courses?.[m[1]]?.[m[2]];
    if (sheet?.pieces) return { area: m[1], what: `these props, in this order: ${list(sheet.pieces)}` };
  }
  m = /^kit-sheet-landmark-(.+)$/.exec(k);
  if (m && REALMS.includes(KIT.landmarks[m[1]]?.area) && !m[1].startsWith('hall-')) return { area: KIT.landmarks[m[1]].area, what: plain(KIT.landmarks[m[1]].desc) };
  m = /^kit-(clearing|glass|neon|ink)-((?:sky|far|mid)-[a-c])$/.exec(k);
  if (m) return { area: m[1], what: plain(KIT.areas[m[1]].layers[m[2]]) };
  m = /^kit-tex-(clearing|glass|neon|ink)-(.+)$/.exec(k);
  if (m && KIT.areas[m[1]].textures?.[m[2]]) return { area: m[1], what: plain(KIT.areas[m[1]].textures[m[2]]) };
  m = /^kit-sheet-cut-run-(neon-deck|ink-bank)$/.exec(k);
  if (m) {
    const run = KIT.recut.runs[m[1]];
    return { area: run.area, what: `three runs, from the top down: ${run.rows.map((r, i) => `${i + 1}) ${plain(r.desc)}`).join('; ')}` };
  }
  return SCENES[k] ?? null;
}

const LAYER_CANVAS = (job) => {
  const [w, h] = job.size.split('x').map(Number);
  if (/-sky-/.test(job.key)) return `A full-bleed ${w}x${h} sky plate, its left edge continuing into its right edge so it repeats sideways.`;
  // A keyed layer must leave open sky to show the layers behind it (opaque middles flattened the parallax).
  const k = job.key_colour ?? '#FF00FF';
  return `A ${w}x${h} backdrop band filling the lower ${/-far-/.test(job.key) ? 'half' : 'two thirds'} of the canvas, its left edge continuing into its right edge so it repeats sideways, its top a soft broken skyline; everything above that skyline, the whole upper part of the canvas, is one unbroken flat solid ${k} field from edge to edge.`;
};

function realmJob(base, { area, what }) {
  const roomLike = base.kind === 'room' || base.kind === 'wing' || (base.kind === 'anchor' && !base.key.startsWith('climb-'));
  const guide = { market: 'market', glass: 'glass', ink: 'ink' }[base.key];
  const refs = [{ ref: `@guide:realm-ref-${area}`, role: "the realm's new reference screen (gemini_pass_refs.py)", optional: false }];
  if (guide) refs.push({ ref: `@guide:${guide}`, role: 'layout guide: the floor and doorways in greys', optional: true });
  const job = { ...base, kind: base.kind === 'wing' ? 'room' : base.kind, refs, variants: 2, batch: `realm-${area}` };
  if (job.kind === 'room' && job.size !== '3200x1800') job.size = '3200x1800';
  const subject = job.kind === 'sheet' ? 'the sheet' : job.kind === 'layer' ? 'the layer' : job.kind === 'texture' ? 'the texture' : roomLike ? 'the screen' : 'the asset';
  const lock = `Image 1 (reference image) is this realm's reference screen: paint ${subject} in its exact brush, palette, light and materials${guide ? ', and Image 2 (layout guide) gives the floor line and doorways in greys' : ''}.`;
  const canvas = job.kind === 'layer' ? LAYER_CANVAS(job) : G.canvasFor({ ...job, kind: roomLike ? 'room' : job.kind }).replace('every element in the place Scene 1 has it', 'every doorway where Image 2 places it');
  const context = job.kind === 'layer' ? `A ${/-sky-/.test(job.key) ? 'sky plate' : /-far-/.test(job.key) ? 'far backdrop layer' : 'middle backdrop layer'} for a 2D side-scrolling game.` : G.contextFor({ ...job, kind: roomLike ? 'room' : job.kind });
  job.gemini_prompt = G.formula({ context, lock, action: `Paint ${what.replace(/\.$/, '')}.`, style: G.styleFor(area), canvas });
  return job;
}

const withJobs = new Set(P.JOBS.map((j) => j.key));
// Realm keys painted outside the job list get one built from the assets table.
const built = Object.keys(SCENES).filter((k) => !withJobs.has(k) && k in ASSETS).map((k) => G.builtJob(k));
export const JOBS = [...P.JOBS, ...built].map((j) => [j, realmContent(j)]).filter(([, c]) => c).map(([j, c]) => realmJob(j, c));
JOBS.push(...G.REALM_REF_JOBS);
export const REALM_KEYS = Object.fromEntries(REALMS.map((a) => [a, JOBS.filter((j) => j.batch === `realm-${a}`).map((j) => j.key)]));

// ---------------------------------------------------------------------------------------------
// One prop per image: a sheet's props shuffled between cells came out under each other's names, so
// the props still on their old art are painted alone, each from its realm's reference and its own
// description in kit.json, and finished with `art:finish piece <key>` straight to the key.

function pieceDesc(key) {
  for (const job of P.JOBS) {
    const m = /^kit-sheet-(clearing|glass|neon|ink)-(.+)$/.exec(job.key);
    if (!m || !job.derives?.includes(key)) continue;
    const sheet = KIT.areas[m[1]].sheets?.[m[2]] ?? KIT.courses?.[m[1]]?.[m[2]];
    const piece = sheet?.pieces?.[job.derives.indexOf(key)];
    if (piece) return { area: m[1], what: plain(piece.desc), w: piece.w ?? sheet.w, h: piece.h ?? sheet.h };
  }
  return null;
}

export function singleJob(key) {
  const d = pieceDesc(key);
  const a = ASSETS[key];
  if (!d || !a) throw new Error(`gemini-realms: no sheet description for ${key}`);
  const W = a.w * 2; const H = a.h * 2;
  const job = { key, kind: 'piece', realm: d.area, size: `${W}x${H}`, seed: 21000, variants: 2, key_colour: '#FF00FF', refs: [{ ref: `@guide:realm-ref-${d.area}`, role: "the realm's new reference screen", optional: false }], prompt: `single prop: ${key}`, batch: `single-${d.area}` };
  job.gemini_prompt = G.formula({
    context: 'A single prop for a 2D side-scrolling game.',
    lock: "Image 1 (reference image) is this realm's reference screen: paint the prop in its exact brush, palette, light and materials.",
    action: `Paint ${d.what.replace(/\.$/, '')}, seen straight from the side.`,
    style: G.styleFor(d.area),
    canvas: G.canvasFor(job),
  });
  return job;
}

/** The realm props still on their old art after the sheet passes (work/art/singles.txt), minus the seal stamp. */
export const SINGLE_KEYS = (() => {
  const f = path.join(TOOLS, '..', '..', 'work', 'art', 'singles.txt');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').map((s) => s.trim()).filter((k) => k && k !== 'kit-ink-seal-red' && k in ASSETS) : [];
})();
JOBS.push(...SINGLE_KEYS.map(singleJob));
