/**
 * Things owls can use in the rooms, and the small items quests ask them to gather. Two sorts of
 * interactable: shared ones with state the whole room sees (a leaf pile vanishes for everyone
 * when someone flops into it, then grows back), and plain ones that only count toward quests
 * (browsing a stall, looking through a telescope). The room server checks reach and state.
 *
 * No prop does two unrelated jobs (the owner's rule, Nov 18): the moonbeams were a thing to bask in
 * and, at the Great Hollow's heart and in the Treetop Commons, the light the warm air rises in. They
 * are only the rising air's light now (thermal.ts, drawn by the park), and there is no basking.
 *
 * TODO-DOCS (Nov 18, no basking): docs/QUESTS.md's interactables table loses the moonbeam row; its
 * templates list says stargaze for bask (a look through the Party Grove's telescope), and the quests
 * that basked ask for the telescope, a leaf pile (Volt) or a flap (Lumen) instead; the Great Hollow gains
 * a fifth leaf pile by the trunk's door and the arcade's vending machine stands toward its east ring.
 * docs/GLOSSARY.md's Interactable and docs/ARCHITECTURE.md's spectator notes drop "the moonbeam".
 */
import { HALL_LEAVES } from './hollowOval';
import type { Raised } from './perches';
import { FLOOR_INTERACTABLES } from './plazaFloor';
import type { Vec2 } from './protocol';
import { START_LEAVES, START_STALL } from './realmStart';

/** Leaf piles and stalls; and out on the plazas' floors (plazaFloor.ts), bird baths, mushrooms, telescopes and shiny things. */
export type InteractableKind = 'leaf-pile' | 'stall' | 'bird-bath' | 'mushroom' | 'telescope' | 'shiny';

/** A thing to use; one with a `top` sits up on that perch (OP-084), and only an owl standing on it reaches it. */
export interface InteractableDef extends Raised {
  id: string;
  kind: InteractableKind;
  room: string;
  /** Where the owl stands to use it. */
  pos: Vec2;
  /** Its art (a kit key), drawn with its foot just behind `pos` (plazaFloor.ts); none for a thing the game draws itself. */
  piece?: string;
  flip?: true;
  /** The action button's words for this one where its kind's would be wrong: "Splash in the fountain" (OP-416). */
  label?: string;
  /**
   * Where the painting draws it, for a thing the painting has (plazaFloor.ts, PAINTED_THINGS): a tap
   * anywhere on what the player sees walks the owl over and uses it (OP-436), not only a tap on the
   * floor in front of it.
   */
  tap?: { x: number; y: number; w: number; h: number };
}

export interface KindRules {
  /** The action button's words. */
  label: string;
  /** Shown in quest steps: "Flop into 3 leaf piles". */
  noun: string;
  plural: string;
  verb: string;
  /** How close the owl's feet must be (room pixels). */
  reach: number;
  /** Shared state: after a use the thing is gone for everyone for a while. */
  shared: boolean;
}

export const KIND_RULES: Readonly<Record<InteractableKind, KindRules>> = {
  'leaf-pile': { label: 'Flop into the leaves', noun: 'leaf pile', plural: 'leaf piles', verb: 'Flop into', reach: 90, shared: true },
  stall: { label: 'Browse the stall', noun: 'market stall', plural: 'market stalls', verb: 'Browse', reach: 110, shared: false },
  'bird-bath': { label: 'Splash in the bird bath', noun: 'bird bath', plural: 'bird baths', verb: 'Splash in', reach: 110, shared: false },
  mushroom: { label: 'Bounce on the mushrooms', noun: 'mushroom patch', plural: 'mushroom patches', verb: 'Bounce on', reach: 100, shared: false },
  telescope: { label: 'Look through the telescope', noun: 'telescope', plural: 'telescopes', verb: 'Look through', reach: 110, shared: false },
  // Shared like a leaf pile: picked up, it is gone for everyone until another turns up, and it may be a feather's worth.
  shiny: { label: 'Pick up the shiny thing', noun: 'shiny thing', plural: 'shiny things', verb: 'Pick up', reach: 90, shared: true },
};

export const INTERACTABLES: readonly InteractableDef[] = [
  // Leaves blow in through the storybook arch and pile up just inside the great tree...
  { id: 'hub-leaves-1', kind: 'leaf-pile', room: 'hub', pos: { x: 1930, y: 820 } },
  // ...and some blown off the lantern beam in the west wing to the floor past the root bench's east end. The Party
  // Grove is seen from above (plaza.ts), so the pile that sat up on the beam read as one no owl could reach (OP-414);
  // it lies clear of the floor under the beam, so an owl there is offered a lantern, not the leaves.
  { id: 'hub-leaves-beam', kind: 'leaf-pile', room: 'hub', pos: { x: 1440, y: 770 } },
  // ...and drift against the roots at the foot of the tree outside, past its doorway (OP-417: three piles a room, each where the wind would leave it).
  { id: 'grove-leaves-2', kind: 'leaf-pile', room: 'grove', pos: { x: 2890, y: 845 } },
  // ...and drift off the east wing's treehouses to the foot of their trees: under the porch, at the
  // ladder's foot, and under the left tree's treehouse. The clearing is seen from above (plaza.ts), so a
  // pile up on a platform read as one no owl could reach (OP-423); down here each is on the walk's floor.
  { id: 'grove-leaves-porch', kind: 'leaf-pile', room: 'grove', pos: { x: 4300, y: 740 } },
  { id: 'grove-leaves-hut', kind: 'leaf-pile', room: 'grove', pos: { x: 3645, y: 725 } },
  // The new map's stairs (map 3): leaves fall down the tree and come to rest where each way runs out, so
  // every climb and every far end of a boardwalk has a pile to flop into. Pip's stair quest asks for three.
  // On the high boardwalk the wind chime's draught sweeps them east past the coloured door, against the last rope post.
  { id: 'm3-stair-1-leaves-end', kind: 'leaf-pile', room: 'm3-stair-1', pos: { x: 4020, y: 770 } },
  // On the quiet landing they catch on the lookout at the top of the climb up the trunk...
  { id: 'm3-stair-2-leaves-lookout', kind: 'leaf-pile', room: 'm3-stair-2', pos: { x: 2740, y: 770 }, top: 431 },
  // ...and the ones that miss it drift to the trunk's foot, where the boardwalk stops.
  { id: 'm3-stair-2-leaves-end', kind: 'leaf-pile', room: 'm3-stair-2', pos: { x: 2870, y: 770 } },
  // At the treetop diner a few land on the log end west of the table, a hop up past the stools...
  { id: 'm3-stair-3-leaves-log', kind: 'leaf-pile', room: 'm3-stair-3', pos: { x: 125, y: 770 }, top: 64 },
  // ...and the rest blow round the trunk to the rope posts at the boardwalk's east end.
  { id: 'm3-stair-3-leaves-end', kind: 'leaf-pile', room: 'm3-stair-3', pos: { x: 4240, y: 770 } },
  // On the forest path the trunk's shelf fungus holds a pile at the top of its climb...
  { id: 'm3-ground-leaves-fungus', kind: 'leaf-pile', room: 'm3-ground', pos: { x: 2175, y: 770 }, top: 282 },
  // ...and the boarded stall roofs by the market square gather the ones the fence lets through.
  { id: 'm3-ground-leaves-roof', kind: 'leaf-pile', room: 'm3-ground', pos: { x: 3900, y: 770 }, top: 350 },
  // The Great Hollow (hollowOval.ts): leaves blown in at the knothole drift round the oval's rim, two
  // in each Commons either side of its plaza, and more by the ways at the back and front and round the
  // heart, so no stretch of the floor is an empty walk.
  ...HALL_LEAVES.map((l): InteractableDef => ({ id: `m3-hall-${l.id}`, kind: 'leaf-pile', room: 'm3-hall', pos: { ...l.pos } })),
  // A realm's start (OP-276, realmStart.ts): the wind off its course blows leaves in at the way on, and
  // they pile against the trading nest, where an owl can browse what the realm has.
  { id: 'glass-leaves-start', kind: 'leaf-pile', room: 'glass', pos: { ...START_LEAVES } },
  { id: 'glass-nest', kind: 'stall', room: 'glass', pos: { ...START_STALL } },
  // The street's stall row. The first stood so near the doorway in from the tree that "Browse the stall"
  // came up the moment an owl arrived (the Nov 25 QA walk); it is a booth further along the row.
  { id: 'market-stall-1', kind: 'stall', room: 'market', pos: { x: 500, y: 705 } },
  { id: 'market-stall-2', kind: 'stall', room: 'market', pos: { x: 640, y: 705 } },
  { id: 'market-stall-3', kind: 'stall', room: 'market', pos: { x: 780, y: 705 } },
  // The Treetop Commons (OP-306, OP-417): leaves blown off the lantern trees settle under the bench by the
  // balustrade and at the foot of the ticket booth, and nowhere out on the open cobbles. A free guest's flop
  // turns up nothing (OP-243).
  { id: 'lobby-leaves-bench', kind: 'leaf-pile', room: 'lobby', pos: { x: 1100, y: 775 } },
  { id: 'lobby-leaves-booth', kind: 'leaf-pile', room: 'lobby', pos: { x: 1650, y: 765 } },
  // The arcade (OP-306, OP-417): leaves fall down the hatch from the Great Hollow and pile at the foot of
  // the stair; the draught carries a few along the wet tiles until something stops them: the chrome pillar
  // in the passage past Hoot & Hop and the wall under the scoreboard. None out on the hall's open floor.
  { id: 'arcade-leaves-stair', kind: 'leaf-pile', room: 'arcade', pos: { x: 150, y: 850 } },
  { id: 'arcade-leaves-pillar', kind: 'leaf-pile', room: 'arcade', pos: { x: 1250, y: 780 } },
  { id: 'arcade-leaves-scoreboard', kind: 'leaf-pile', room: 'arcade', pos: { x: 2550, y: 790 } },
  // The lane under the nests, grown into a plaza (Nov 8): leaves blown under the banks and along its front.
  { id: 'homes-leaves-bank', kind: 'leaf-pile', room: 'homes', pos: { x: 560, y: 1080 } },
  { id: 'homes-leaves-mound', kind: 'leaf-pile', room: 'homes', pos: { x: 1250, y: 1240 } },
  { id: 'homes-leaves-front', kind: 'leaf-pile', room: 'homes', pos: { x: 2950, y: 1220 } },
  // The night market's street (Nov 8): leaves washed to its kerbs.
  { id: 'market-leaves-west', kind: 'leaf-pile', room: 'market', pos: { x: 260, y: 1230 } },
  { id: 'market-leaves-middle', kind: 'leaf-pile', room: 'market', pos: { x: 1650, y: 1240 } },
  { id: 'market-leaves-east', kind: 'leaf-pile', room: 'market', pos: { x: 3000, y: 1230 } },
  // The ink garden (OP-402): the leaves blown in through the moon gate, against the wall at the east end
  // and in the west corner (OP-417: none out in the plaza's middle).
  { id: 'ink-leaves-gate', kind: 'leaf-pile', room: 'ink', pos: { x: 2560, y: 820 } },
  { id: 'ink-leaves-east', kind: 'leaf-pile', room: 'ink', pos: { x: 3040, y: 840 } },
  { id: 'ink-leaves-west', kind: 'leaf-pile', room: 'ink', pos: { x: 420, y: 1110 } },
  // The glass street (Nov 8): leaves caught at the lanterns' feet.
  { id: 'glass-leaves-lantern-west', kind: 'leaf-pile', room: 'glass', pos: { x: 230, y: 1010 } },
  { id: 'glass-leaves-lantern-east', kind: 'leaf-pile', room: 'glass', pos: { x: 1380, y: 1010 } },
  // The Party Grove's plaza (Nov 8): leaves blown into its east corner.
  { id: 'hub-leaves-plaza-east', kind: 'leaf-pile', room: 'hub', pos: { x: 4480, y: 1140 } },
  // Out on the plazas' floors (Nov 8): a few little scenes in each, things to splash in, bounce on, look through and pick up.
  ...FLOOR_INTERACTABLES,
];

const BY_ID: Readonly<Record<string, InteractableDef>> = Object.fromEntries(INTERACTABLES.map((i) => [i.id, i]));

export function getInteractable(id: string): InteractableDef | undefined {
  return Object.hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
}

export function interactablesIn(room: string): InteractableDef[] {
  return INTERACTABLES.filter((i) => i.room === room);
}

// ---------- leaf piles (defaults the owner may change) ----------

/** A flopped pile grows back after a random time in this range (ms). */
// About half as many piles as before OP-417 (three a room), so each grows back in about half the time:
// the feathers an owl can find in a day stay about where they were.
export const LEAF_RESPAWN_MS: readonly [number, number] = [50_000, 80_000];

/** At most this many leaf piles in a room, each where the wind would leave it (OP-417); the Great Hollow, the size of a town square, a few more. */
export const LEAF_PILES_A_ROOM = 3;
export const LEAF_PILES_IN_THE_HOLLOW = 5;
/** The chance that a flop turns up feathers, and how many. */
export const LEAF_FEATHER_CHANCE = 0.4;
export const LEAF_FEATHERS: readonly [number, number] = [1, 3];
/** At most this many feathers a park day from leaf piles, per collector. */
export const LEAF_FEATHERS_PER_DAY = 40;
/** One flop per visitor this often (ms). */
export const USE_COOLDOWN_MS = 1_200;
/** Reach checks allow this much more (room pixels): the owl may have moved a little since the tap. */
export const REACH_SLACK = 40;

/** What a flop turns up, from a uniform random source. */
export function leafFeathers(rnd: () => number): number {
  if (rnd() >= LEAF_FEATHER_CHANCE) return 0;
  const [lo, hi] = LEAF_FEATHERS;
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

export function leafRespawnMs(rnd: () => number): number {
  const [lo, hi] = LEAF_RESPAWN_MS;
  return Math.round(lo + rnd() * (hi - lo));
}

// ---------- quest items ----------

/** Small things quests hide around the park; only the owl on that quest sees them. */
export type QuestItemKind = 'acorn' | 'gear' | 'moonstone';

export const QUEST_ITEMS: Readonly<Record<QuestItemKind, { noun: string; plural: string }>> = {
  acorn: { noun: 'acorn', plural: 'acorns' },
  gear: { noun: 'lost gear', plural: 'lost gears' },
  moonstone: { noun: 'moonstone', plural: 'moonstones' },
};

export function isQuestItemKind(k: unknown): k is QuestItemKind {
  return typeof k === 'string' && Object.hasOwn(QUEST_ITEMS, k);
}

/** A quest item waiting for one collector: on the floor, or up on a perch with its `top` (OP-084). */
export interface QuestItemSpot extends Raised {
  n: number;
  /** The quest step it belongs to (it shows, and counts, only while that step is current). */
  step: number;
  room: string;
  x: number;
  y: number;
  kind: QuestItemKind;
  taken: boolean;
}
