/**
 * Things owls can use in the rooms, and the small items quests ask them to gather. Two sorts of
 * interactable: shared ones with state the whole room sees (a leaf pile vanishes for everyone
 * when someone flops into it, then grows back), and plain ones that only count toward quests
 * (browsing a stall, basking in the moonbeam). The room server checks reach and state.
 */
import type { Raised } from './perches';
import type { Vec2 } from './protocol';
import { START_LEAVES, START_STALL } from './realmStart';

export type InteractableKind = 'leaf-pile' | 'stall' | 'moonbeam';

/** A thing to use; one with a `top` sits up on that perch (OP-084), and only an owl standing on it reaches it. */
export interface InteractableDef extends Raised {
  id: string;
  kind: InteractableKind;
  room: string;
  pos: Vec2;
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
  moonbeam: { label: 'Bask in the moonbeam', noun: 'moonbeam', plural: 'moonbeams', verb: 'Bask in', reach: 120, shared: false },
};

export const INTERACTABLES: readonly InteractableDef[] = [
  // Leaves blow in through the storybook arch and pile up just inside the great tree...
  { id: 'hub-leaves-1', kind: 'leaf-pile', room: 'hub', pos: { x: 1930, y: 820 } },
  // ...and some up on the lantern beam in the west wing, a jump and the second flap from the root bench (OP-084).
  { id: 'hub-leaves-beam', kind: 'leaf-pile', room: 'hub', pos: { x: 930, y: 696 }, top: 264 },
  // ...and drift around the hollow at the foot of the tree outside.
  { id: 'grove-leaves-1', kind: 'leaf-pile', room: 'grove', pos: { x: 2500, y: 835 } },
  { id: 'grove-leaves-2', kind: 'leaf-pile', room: 'grove', pos: { x: 2890, y: 845 } },
  { id: 'grove-leaves-3', kind: 'leaf-pile', room: 'grove', pos: { x: 2220, y: 820 } },
  // ...and up in the east wing's treehouses (OP-084): on the porch, at the top of the ladder, and on
  // the left tree's treehouse, which only a glide from the loft reaches (the glide's small extra).
  { id: 'grove-leaves-porch', kind: 'leaf-pile', room: 'grove', pos: { x: 4290, y: 708 }, top: 218 },
  { id: 'grove-leaves-hut', kind: 'leaf-pile', room: 'grove', pos: { x: 3645, y: 696 }, top: 345 },
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
  // Down the root stair, the leaves that fall through the roots settle on the log ledge on the trunk.
  { id: 'm3-under-leaves-ledge', kind: 'leaf-pile', room: 'm3-under', pos: { x: 2070, y: 770 }, top: 264 },
  // The hollow hall (keepers only): leaves blown in at the knothole come down the hollow, and the two
  // nooks off the climb catch them; each nook is a hop off the way up with nothing else in it.
  { id: 'm3-hall-leaves-nook-east', kind: 'leaf-pile', room: 'm3-hall', pos: { x: 1380, y: 4370 }, top: 1230 },
  { id: 'm3-hall-leaves-nook-west', kind: 'leaf-pile', room: 'm3-hall', pos: { x: 320, y: 4370 }, top: 2050 },
  // Each Commons has the hub's two piles, where its hub floor and root beam have them: one by the way
  // in from the west wing, one up on the beam.
  ...(['glass', 'ink', 'grove', 'market'] as const).flatMap((level): InteractableDef[] => [
    { id: `commons-${level}-leaves-1`, kind: 'leaf-pile', room: `commons-${level}`, pos: { x: 1930, y: 820 } },
    { id: `commons-${level}-leaves-beam`, kind: 'leaf-pile', room: `commons-${level}`, pos: { x: 930, y: 696 }, top: 264 },
  ]),
  // A realm's start (OP-276, realmStart.ts): the wind off its course blows leaves in at the way on, and
  // they pile against the trading nest, where an owl can browse what the realm has.
  { id: 'glass-leaves-start', kind: 'leaf-pile', room: 'glass', pos: { ...START_LEAVES } },
  { id: 'glass-nest', kind: 'stall', room: 'glass', pos: { ...START_STALL } },
  { id: 'market-stall-1', kind: 'stall', room: 'market', pos: { x: 400, y: 705 } },
  { id: 'market-stall-2', kind: 'stall', room: 'market', pos: { x: 640, y: 705 } },
  { id: 'market-stall-3', kind: 'stall', room: 'market', pos: { x: 780, y: 705 } },
  { id: 'hub-moonbeam', kind: 'moonbeam', room: 'hub', pos: { x: 2400, y: 690 } },
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
export const LEAF_RESPAWN_MS: readonly [number, number] = [90_000, 150_000];
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
