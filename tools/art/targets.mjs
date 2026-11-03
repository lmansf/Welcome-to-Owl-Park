/**
 * The art targets (OP-249): one finished screen each for the tree, the plaza and a realm, painted as
 * one picture in the park's palette under one light (the moon, upper right), from which the kit is
 * recut (OP-251) and the value bands are taken (OP-250). Each is a helper key (never shipped to
 * players): its approved candidate is kept as reference art under tools/art/targets/ by
 * `art:finish target <key>`, with a provenance line of its own.
 */
import { KIT } from './kit.mjs';

export const TARGET_SIZE = '1600x900';
export const TARGET_SEED = 9800;

const LIGHT = 'One light source only: a full moon, small, in the upper right corner of the sky, lighting everything from the upper right: a cool cream rim light along every upper-right edge, shadows falling down and to the left, and warm lantern gold only close around each lantern; no sun, no second moon, no glowing sky.';
const BANDS = 'Value bands from the back to the front: the sky and the far distance are the darkest, softest and lowest in contrast, hazed toward the sky colour with a little blur; the middle distance is a step lighter but still quiet and soft, with nothing in it that looks like a ledge to stand on; the walkable floor and the ledges are the brightest, sharpest and highest in contrast, with the strongest rim light, their tops clear and bare so a visitor can read where to stand.';
const STYLE = `Clean cel-shaded shapes with soft painted gradients, no outlines, large flat areas, the same brush in every layer. The park's palette only: ${KIT.palette}. No text, letters or numbers anywhere. No owls, birds, animals, people or characters; the plain pale marker in the reference is where a visitor stands, so leave bare floor there.`;
const KEEP = 'The first reference is this screen as the game draws it today from separate pieces; repaint it as one picture, keeping its layout exactly: the floor at the same height, every ledge, doorway, stair and prop at the same place and size. The second reference is the layout in greys: the blue line is the floor, the gold outlines are doorways, the pale marks are where a visitor stands.';

export const TARGETS = {
  'target-l4': {
    title: "level 4 of the great tree, the sky landing: its stair screen",
    revise: 'the plank walkway is one continuous railed walkway across the whole width, its planks running on without any cut ends or repeated copies; the square hatch is set flush into the walkway surface at the trunk\'s foot, left of the doorway, with its stair going down through it; the sign board and the lantern pole stand on the walkway; the trunk keeps its rounded shape and the rim light on its right edge',
    scene: 'A finished screen for a side-scrolling 2D game, 1600 by 900: level 4 of a single great tree, the sky landing, high off the ground in clear blue-navy night air with a light mist. One great trunk about 680 pixels wide stands at the centre of the screen and runs off the top and the bottom, drawn as a rounded, shaped trunk with soft bark edges, lichen and moss, never a flat box. A plank walkway with a rope rail runs across the whole width at the floor line, 130 pixels above the bottom edge. In the trunk\'s foot, left of centre, a square hatch in the walkway with a stair going down; right of centre a tall knothole doorway in the trunk with a stair going up, warm lantern light inside. On the left third a dark iron pole with one round amber paper lantern; a bare wooden sign board on a post left of the hatch; a rope barrier at the far left end of the walkway; a soft cloud bench at the far right; hanging moss and a leaf cluster where the trunk leaves the top of the frame. Behind: thin cloud level with the walkway, the crowns of neighbouring trees well below in soft moonlit mist, and a clear night sky with small stars.',
  },
  'target-plaza': {
    title: 'the Realm Gate plaza at the top of the canopy: its west end',
    revise: 'the stair head left of centre is a stone stair going down into the plaza floor with a low rail, its top treads visible, not a tub; the plaza floor is one continuous run of pale fitted stone with one carved edge, no repeated copies; the far boughs and leaf tops below are softer and darker than the plaza; the moon is a little larger and clearly the only light',
    scene: 'A finished screen for a side-scrolling 2D game, 1600 by 900: the Realm Gate plaza at the top of the canopy, its west end, in full open night sky. A wide paved plaza floor of pale fitted stone with a carved stone edge runs across the whole width at the floor line, 130 pixels above the bottom edge. At the far left a brass turnstile gate leads off the screen. Left of centre the head of a stair going down into the great tree, a stone stair head with a rail. Along the floor between the stair and the centre: a planter with a small round tree, a bare wooden map board on two posts, a plaza bench and a stone bird bath. Right of centre a tall stone portal arch boarded over with planks, lantern light glowing through the gaps between the boards, with a pennant pole of plain bunting beside it; a second boarded arch begins at the right edge. Behind and below: the sea of leaf tops of the canopy and the tops of the great tree\'s boughs with lantern strings, far below in soft mist; open night sky with small stars above.',
  },
  'target-clearing': {
    title: "the Treehouse Clearing's Commons",
    revise: 'the hut at the left stands clear of the portal arch with its own round roof of leaves; the floor is one continuous run of ferns and soft earth without repeated copies; the stall\'s goods are simpler and fewer; the boughs behind are a step darker and softer than the floor and the idol',
    scene: 'A finished screen for a side-scrolling 2D game, 1600 by 900: the Treehouse Clearing\'s Commons, a calm clearing under the lower boughs of great trees at night, lit by dappled moonlight through the leaves and small pools of lantern gold. A floor of ferns and soft earth runs across the whole width at the floor line, 130 pixels above the bottom edge. At the centre a round wooden pedestal with a carved wooden owl idol standing on it, leaves and moss on its shoulders, the idol lit from the upper right; open bare floor on both sides of it. At the left a small round hut of planks and leaves with a lit window and a lantern by its door; at the far left a wooden portal arch glowing softly, the way back. At the right a small merch stall with a striped awning and a bare counter; a rope swing hanging from a bough at the far right; a hammock slung between two posts under the boughs behind the hut; a few mushrooms by the path. Behind: the thick lower boughs with small huts and lantern strings, a step darker and softer; the forest floor and trunks beyond in mist; the leaf canopy overhead with the moon\'s light coming through a gap at the upper right.',
  },
};

export const TARGET_KEYS = Object.keys(TARGETS);

/** Round 1 paints from the kit's preview and the greybox; a later round (ART_TARGET_ROUND=2, 3)
 * repaints the round before (its SELECTED candidate) with the target's revision notes, so the
 * picture is refined rather than started again. */
export const TARGET_ROUND = Math.max(1, Number.parseInt(process.env.ART_TARGET_ROUND ?? '1', 10) || 1);
const REVISE = (key) => `This is a revision of the first reference, a painting of this very screen: keep its composition, light, colour and every element where it is, and change only this: ${TARGETS[key].revise}.`;
export const TARGET_PROMPTS = Object.fromEntries(TARGET_KEYS.map((key) => [key,
  TARGET_ROUND > 1 ? `${TARGETS[key].scene} ${REVISE(key)} ${LIGHT} ${BANDS} ${STYLE}` : `${TARGETS[key].scene} ${KEEP} ${LIGHT} ${BANDS} ${STYLE}`]));

export function targetJobs(seedBase = TARGET_SEED) {
  return TARGET_KEYS.map((key, i) => ({
    key, kind: 'anchor', realm: 'kit', size: TARGET_SIZE, seed: seedBase + i * 4 + (TARGET_ROUND - 1) * 100, variants: 4,
    refs: TARGET_ROUND > 1
      ? [
        { ref: `@raw:${key}`, role: 'the round before, the painting this one revises', optional: false },
        { ref: `@guide:${key}-greybox`, role: 'the layout in greys: floor, doorways, where a visitor stands', optional: false },
      ]
      : [
        { ref: `@guide:${key}-preview`, role: 'the screen as the game draws it today, whose layout the painting keeps', optional: false },
        { ref: `@guide:${key}-greybox`, role: 'the layout in greys: floor, doorways, where a visitor stands', optional: false },
      ],
    providers: { fal: { output_format: 'png' } }, prompt: TARGET_PROMPTS[key],
  }));
}
