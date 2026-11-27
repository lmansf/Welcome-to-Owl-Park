/**
 * The minigames' pieces (the owner, November 2026: "they're barely cutouts of games right now"): the
 * sealed hollow's pieces, bowling's pins and pinecone and feather tag's feather, which drew size boxes
 * and shapes in code until now (the Great Hollow's stump, seats, station and lane have their own art, #336). A job list for
 *
 *   NODE_USE_ENV_PROXY=1 node tools/art/generate.mjs --prompts tools/art/gemini-minigames.mjs --provider gemini --model gemini-3.1-flash-image
 *
 * finished with `art:finish piece <key>`. Each prompt is the pass's formula (gemini-pass.mjs): context,
 * the piece and its view, the house style for the Great Hollow's lantern light, and the canvas on flat
 * magenta. No reference image: a scene as reference paints a scene behind a cut-out.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from './gemini-pass.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = JSON.parse(fs.readFileSync(path.join(TOOLS, 'config', 'assets.json'), 'utf8')).keys;

export const DEFAULTS = G.DEFAULTS;
export const BLOCKS = G.BLOCKS;
export const HELPER_KEYS = G.HELPER_KEYS;
export const NEGATIVE_PROMPT = null;

const ABOVE = 'seen from above at a high three-quarter angle, as the game shows a room from overhead';
const STRAIGHT = 'seen from directly above';

export const PIECES = {
  'escape-root': `a gnarled tree root arching up out of packed earth, a smooth flat patch on its top where a symbol could be carved, ${ABOVE}`,
  'escape-moon': `a round wooden panel set in a bark wall, carved with a crescent moon and small stars around a smooth pale disc at its centre, ${ABOVE}`,
  'escape-vine': 'a single long hanging vine with small leaves along it and a knotted end, hanging straight down, seen from the front',
  'escape-old-owl': `an old grey owl with a long shawl of soft feathers and small round spectacles, sitting calmly on a low root, kindly and wise, ${ABOVE}`,
  'escape-chest': `a small wooden keeper's chest with dark iron bands and a round brass lock plate, its lid closed, ${ABOVE}`,
  'escape-dial': `a round brass moon dial on a short wooden post, its face showing the phases of the moon in a ring around a central pointer, ${ABOVE}`,
  'escape-root-door': `a low door woven of thick living roots, closed, set into an earthen bank, ${ABOVE}`,
  'escape-round-door': `a round wooden door with a large brass keyhole at its centre, set in a ring of fitted stones, closed, ${ABOVE}`,
  'escape-stump': `an old tree stump with a flat ring-marked top wide enough to sit on and moss round its base, ${ABOVE}`,
  'escape-shelf': `a sturdy shelf of stacked wooden planks on two short posts, its flat top bare, ${ABOVE}`,
  'bowl-pin': `one small wooden bowling pin, ${STRAIGHT}: a round cream top with a red band round it`,
  'bowl-pinecone': `one round brown pinecone, its scales spiralling out from the middle, ${STRAIGHT}`,
  'tag-feather': 'one bright golden feather, gently curved, glowing softly at its edges',
};

function job(key, i) {
  const a = ASSETS[key];
  if (!a) throw new Error(`gemini-minigames: ${key} is not in config/assets.json`);
  const j = { key, kind: 'piece', realm: 'minigames', size: `${a.w * 2}x${a.h * 2}`, seed: 24000 + i * 10, variants: 2, key_colour: a.key_colour ?? '#FF00FF', refs: [], prompt: `minigame piece: ${key}` };
  j.gemini_prompt = G.formula({
    context: 'A game asset for a cozy 2D owl game, one piece drawn on its own.',
    lock: '',
    action: `Paint ${PIECES[key]}.`,
    style: G.styleFor('house'),
    canvas: G.canvasFor(j),
  });
  return j;
}

export const JOBS = Object.keys(PIECES).map(job);
