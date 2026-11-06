/**
 * The hollow hall (Nov 6, the owner's word: "travel up and down inside of the tree as a great hollow
 * hall that's vertical, with great common spaces at the different levels being hosted inside, and
 * realms and parkour being outside the tree on each level"). One room seen from the side, five screens
 * high, drawn from the clearing's kit: the inside of the trunk from the knothole under the Treetop
 * Commons down to the floor at the tree's foot.
 *
 * Up it, a zigzag of fungus shelves from landing to landing, and a column of rising air up the middle
 * that lifts a gliding owl all the way to the knothole. A landing a level, top to bottom: the
 * stained-glass realm's (west), the ink-wash realm's (east), the Treehouse Clearing's (west) and the
 * neon realm's (east), each with the doorway into its Commons (rooms/index.ts builds the four Commons
 * from the hub). On the floor, the hatch down the root stair to the cavern (west: down is left) and the
 * trunk's door out to the Party Grove (east).
 *
 * For now it is the keepers' (`keeperOnly`), as are its Commons: the live map walks the stairs until
 * the owner switches the hall on.
 */
import { kitPerches, kitRoom } from '../src/kit';
import { ROOM_H, ROOM_W, type DoorDef, type KitLedge, type KitProp, type KitScene, type RoomDef, type RoomKit } from '../src/room';
import type { Updraft } from '../src/updraft';

export const HALL_ID = 'm3-hall';
/** The hall's height: five screens. */
export const HALL_H = 5 * ROOM_H;
/** Its ground line, as far above its foot as a screen's is (TREE_GROUND 770 on a screen 900 high). */
export const HALL_GROUND = HALL_H - 130;
const G = HALL_GROUND;

/** The hall's levels, top to bottom: each landing's height, its side, its Commons and the doorway's look. */
export const HALL_LEVELS = [
  { level: 'glass', top: 3280, side: 'west', commons: 'commons-glass', piece: 'kit-glass-door-glass-open' },
  { level: 'ink', top: 2460, side: 'east', commons: 'commons-ink', piece: 'kit-ink-door-paper-open' },
  { level: 'grove', top: 1640, side: 'west', commons: 'commons-grove', piece: 'kit-clearing-vine-curtain' },
  { level: 'market', top: 820, side: 'east', commons: 'commons-market', piece: 'kit-neon-rooftop-door-open' },
] as const;
export type HallLevel = (typeof HALL_LEVELS)[number]['level'];
/** The knothole's landing at the top of the hall, under the Treetop Commons. */
export const KNOT_TOP = 4100;
/** How far apart the hall's shelves are: a jump and a flap up, each. */
const STEP = 205;

/** The shelves' spans: by the column of air and by the trunk's wall, on each side, and each side's landing. */
const SPANS = {
  west: { near: [440, 680], wall: [140, 400], landing: [40, 520] },
  east: { near: [920, 1160], wall: [1200, 1460], landing: [1080, 1560] },
} as const;
const other = (side: 'west' | 'east') => (side === 'west' ? 'east' : 'west');

const SHELF = { cap: 'kit-clearing-fungus-shelf' };
const LANDING = { row: 'kit-cut-plank', mid: 'kit-tex-planks', depth: 90 };

function ledge(id: string, [x0, x1]: readonly [number, number], top: number, look: Omit<KitLedge, 'id' | 'x0' | 'x1' | 'top'>): KitLedge {
  return { id, x0, x1, top, ...look };
}

/**
 * The climb from one landing to the next a level up (STEP four times): a shelf by the column on its own
 * side, across the column to the far side's, to the far side's by the wall, and onto the landing.
 */
function climb(name: string, from: 'west' | 'east', base: number, landing: string, landingTop: number): KitLedge[] {
  const to = other(from);
  return [
    ledge(`${name}-1`, SPANS[from].near, base + STEP, SHELF),
    ledge(`${name}-2`, SPANS[to].near, base + 2 * STEP, SHELF),
    ledge(`${name}-3`, SPANS[to].wall, base + 3 * STEP, SHELF),
    ledge(landing, SPANS[to].landing, landingTop, LANDING),
  ];
}

const LEDGES: KitLedge[] = [
  // From the floor up to the neon landing (east), and on up a level at a time.
  ...climb('up-market', 'west', 0, 'landing-market', 820),
  ...climb('up-grove', 'east', 820, 'landing-grove', 1640),
  ...climb('up-ink', 'west', 1640, 'landing-ink', 2460),
  ...climb('up-glass', 'east', 2460, 'landing-glass', 3280),
  ...climb('up-knot', 'west', 3280, 'landing-knot', KNOT_TOP),
  // Two nooks off the climb, each a dead end with a leaf pile in it (interactables.ts).
  ledge('nook-east', [1240, 1460], 1230, SHELF),
  ledge('nook-west', [140, 400], 2050, SHELF),
];

/** The column of rising air up the middle: always on, it lifts a gliding owl to just over the knothole's landing. */
export const HALL_LIFT: Updraft = { id: 'lift', x: 730, w: 140, top: KNOT_TOP + 60 };

/** A doorway on the floor or on a landing `top` high, `w` wide, centred on `x`. */
function door(id: string, x: number, top: number, to: NonNullable<DoorDef['to']>, opts: { w?: number; way?: DoorDef['way'] } = {}): DoorDef {
  const w = opts.w ?? 100;
  return { id, rect: { x: x - w / 2, y: G - 20, w, h: 40 }, to, top, ...(opts.way ? { way: opts.way } : {}), markAt: { x, y: G - top - 260 } };
}

/** Each landing's doorway: by the trunk's wall, on its side. */
const doorX = (side: 'west' | 'east') => (side === 'west' ? 140 : 1460);
/** Where an owl that came out of a Commons stands: on its landing, clear of the doorway. */
const spawnX = (side: 'west' | 'east') => (side === 'west' ? 330 : 1280);

const PROPS: KitProp[] = [
  { id: 'stair-lantern', piece: 'kit-under-lantern-post', x: 330, top: 0, scale: 0.8 },
  { id: 'party-arrow', piece: 'kit-sign-arrow', x: 1300, top: 0, scale: 0.6 },
  { id: 'neon-arrow', piece: 'kit-neon-neon-arrow-sign', x: 1250, top: 820, scale: 0.6 },
  { id: 'hive-lantern', piece: 'kit-clearing-beehive-lantern', x: 320, top: 1640, scale: 0.8 },
  { id: 'ink-lantern', piece: 'kit-ink-paper-lantern', x: 1330, top: 2460, scale: 0.8 },
  { id: 'ink-bench', piece: 'kit-ink-ink-bench', x: 1190, top: 2460, scale: 0.6 },
  { id: 'moth-lantern', piece: 'kit-glass-moth-lantern', x: 320, top: 3280, scale: 0.7 },
  { id: 'knot-lantern', piece: 'kit-high-hook-lantern', x: 1290, top: KNOT_TOP, scale: 0.8 },
];

const SCENES: KitScene[] = [
  { id: 'root-stair', story: 'A lantern post lights the hatch in the floor, the root stair down to the cavern.', props: ['stair-lantern'], about: ['down'] },
  { id: 'way-out', story: "An arrow by the trunk's door points out to the Party Grove at the tree's foot.", props: ['party-arrow'], about: ['to-party'] },
  { id: 'neon-landing', story: 'A neon arrow on the lowest landing flickers toward the rooftop door of the neon realm.', props: ['neon-arrow'], about: ['to-market'] },
  { id: 'grove-landing', story: 'A beehive lantern hums by the curtain of vines that opens on the Treehouse Clearing.', props: ['hive-lantern'], about: ['to-grove'] },
  { id: 'ink-landing', story: 'A paper lantern and an ink bench wait by the paper door, for an owl resting on the way up.', props: ['ink-lantern', 'ink-bench'], about: ['to-ink'] },
  { id: 'glass-landing', story: 'Moths circle a glass lantern by the stained-glass door, high in the hollow.', props: ['moth-lantern'], about: ['to-glass'] },
  { id: 'knothole', story: 'A lantern hangs on its hook under the knothole, where the light of the Treetop Commons comes down.', props: ['knot-lantern'], about: ['up'] },
];

const HALL_KIT: RoomKit = {
  ground: G,
  // The clearing's sky behind the hollow's wood, down every screen of the hall (seen through no gap).
  backdrops: [{ key: 'kit-clearing-sky-a', rate: 1, screens: [0, 0], rows: [0, 4] }],
  surfaces: [{ id: 'hollow', texture: 'kit-tex-clearing-hollow-wood', rect: { x: 0, y: 0, w: ROOM_W, h: G } }],
  paths: [{ id: 'hall-floor', x0: 0, x1: ROOM_W, top: 0, row: 'kit-cut-earth-path', mid: 'kit-tex-inner-wood' }],
  ledges: LEDGES,
  doors: [
    { door: 'down', piece: 'kit-hatch-down' },
    { door: 'to-party', piece: 'kit-clearing-trunk-entrance', scale: 0.8 },
    ...HALL_LEVELS.map((l) => ({ door: `to-${l.level}`, piece: l.piece, scale: 0.8 })),
    { door: 'up', piece: 'kit-doorway-knothole', scale: 0.8 },
  ],
  props: PROPS,
  scenes: SCENES,
  decals: [{ piece: 'kit-clearing-updraft-vent', x: HALL_LIFT.x + HALL_LIFT.w / 2, y: G - 40, scale: 0.6 }],
};

/** Where each Commons' way out leads into the hall: the spawn on its landing. */
export const hallSpawn = (level: HallLevel) => `from-${level}`;

export const HALL_ROOM: RoomDef = kitRoom({
  id: HALL_ID,
  map: 2,
  owlScale: 1.25,
  mood: 'hub',
  keeperOnly: true,
  size: { w: ROOM_W, h: HALL_H },
  walkable: [
    [
      { x: 8, y: G - 4 },
      { x: ROOM_W - 8, y: G - 4 },
      { x: ROOM_W - 8, y: G + 4 },
      { x: 8, y: G + 4 },
    ],
  ],
  perches: kitPerches(HALL_KIT),
  updrafts: [HALL_LIFT],
  spawns: {
    default: { x: 1000, y: G },
    'from-under': { x: 330, y: G },
    'from-party': { x: 1250, y: G },
    'from-lobby': { x: spawnX('east'), y: G },
    ...Object.fromEntries(HALL_LEVELS.map((l) => [hallSpawn(l.level), { x: spawnX(l.side), y: G }])),
  },
  spawnTops: {
    'from-lobby': KNOT_TOP,
    ...Object.fromEntries(HALL_LEVELS.map((l) => [hallSpawn(l.level), l.top])),
  },
  doors: [
    // Down the root stair to the cavern (level 0, as the new map's): down is left.
    door('down', 160, 0, { room: 'm3-under', spawn: 'from-l1' }, { w: 160, way: 'down' }),
    door('to-party', 1480, 0, { room: 'hub', spawn: 'default' }, { w: 120 }),
    ...HALL_LEVELS.map((l) => door(`to-${l.level}`, doorX(l.side), l.top, { room: l.commons, spawn: 'from-hall' })),
    // Up through the knothole: the Treetop Commons, before the turnstiles.
    door('up', 1460, KNOT_TOP, { room: 'lobby', spawn: 'from-hub' }, { way: 'up' }),
  ],
  kit: HALL_KIT,
});
