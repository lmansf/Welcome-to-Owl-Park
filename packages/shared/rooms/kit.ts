import { kitPerches, kitRoom } from '../src/kit';
import { ROOM_W, type RoomDef, type RoomKit } from '../src/room';
import { TREE_GROUND } from './index';

/**
 * Rooms built from the art kit (OP-234) that stand in for a painted room only when the page asks
 * (`?kit=1`), so the park looks as it does until the owner moves a room over. Each is the painted
 * room's layout again, drawn from the kit: the same size, floor, ledges (its perches come from its
 * kit's ledges), doorways and spawns, which kit.test.ts holds it to. The room server never sees
 * these: an owl walks the painted room's geometry, which is the same.
 *
 * Moving a room over for good: give its entry in ROOMS this kit (through kitRoom) and drop it here.
 */

/** Pixels over which the kit's backdrops fade at their edges, as the painted tree's layers do. */
const SKY_FADE = 220;
const MID_FADE = 230;

/**
 * Level 4, the sky landing, from the published kit (OP-241) and its recut (OP-251): high off the ground
 * (docs/TREE_STYLE.md: clear blue-navy air, crowns below), the high area's sky and far layer behind
 * (no middle layer on screen 0, as the approved target has none), the trunk on screen 0 with its stairs taken from the floor (the hatch down on the left, the knothole up into the
 * trunk on the right, OP-220), and the overlook's perches up the bough on screen 1: a stump, two mist
 * platforms and a stub off the bough. The boardwalk is drawn edge to edge over the air, and a
 * rope barrier closes it at each end of the walk (the barrier rule).
 */
const L4_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    { key: 'kit-high-sky-b', rate: 0.5, screens: [1, 1] },
    { key: 'kit-high-sky-a', rate: 0.5, screens: [0, 0], fade: { right: SKY_FADE } },
    { key: 'kit-high-far-a', rate: 0.6, screens: [0, 1], fade: { left: MID_FADE, right: MID_FADE } },
    { key: 'kit-high-mid-b', rate: 0.75, screens: [1, 1], fade: { left: MID_FADE, right: MID_FADE } },
  ],
  // The trunk, about 660 wide at this height, centred at x 800 of screen 0 and running off its top: the
  // regenerated column (OP-259), its bark edges either side of its middle (the right one in the moon's
  // rim light), stacked in courses that meet with no seam.
  columns: [{ id: 'trunk', x0: 470, x1: 1130, y0: -40, y1: 900, left: 'kit-cut-trunk-edge-left', mid: 'kit-cut-trunk-mid', right: 'kit-cut-trunk-edge-right' }],
  surfaces: [
    // The bough the overlook climbs, rising behind the lookout.
    { id: 'bough', texture: 'kit-tex-bark', rect: { x: ROOM_W + 1150, y: 0, w: 200, h: TREE_GROUND } },
    { id: 'bough-moss', texture: 'kit-tex-moss', rect: { x: ROOM_W + 1150, y: 0, w: 200, h: 60 } },
  ],
  paths: [{ id: 'boardwalk', x0: 0, x1: 2 * ROOM_W, top: 0, row: 'kit-cut-plank' }],
  ledges: [
    { id: 'stump', x0: ROOM_W + 352, x1: ROOM_W + 520, top: 111, cap: 'kit-ground-tree-stump' },
    { id: 'board', x0: ROOM_W + 584, x1: ROOM_W + 732, top: 233, cap: 'kit-high-mist-platform' },
    { id: 'mushroom', x0: ROOM_W + 800, x1: ROOM_W + 1056, top: 330, cap: 'kit-high-mist-platform' },
    { id: 'lookout', x0: ROOM_W + 1124, x1: ROOM_W + 1224, top: 431, cap: 'kit-branch-stub' },
  ],
  doors: [
    { door: 'stair-l4-l3', piece: 'kit-hatch-down', scale: 1.3 },
    { door: 'stair-l5-l4', piece: 'kit-doorway-knothole' },
  ],
  barriers: [
    // The boardwalk's ends: a rope between two posts, the near post where the walk ends.
    { id: 'west-rope', x0: -112, x1: 150, top: 0, piece: 'kit-high-rope-barrier' },
    { id: 'overlook-rope', x0: ROOM_W + 1310, x1: ROOM_W + 1572, top: 0, piece: 'kit-high-rope-barrier' },
  ],
  props: [
    // The way down: a lantern on the walk to the trunk, the sign beside the hatch it names.
    { id: 'pole-0', piece: 'kit-high-lantern-pole', x: 330, top: 0, front: true },
    { id: 'sign-down', piece: 'kit-high-sign-board', x: 545, top: 0, scale: 0.8 },
    // The rest stop at the foot of the climb: a bench under its lantern, facing out over the crowns.
    { id: 'bench', piece: 'kit-high-cloud-bench', x: ROOM_W + 120, top: 0 },
    { id: 'pole-1', piece: 'kit-high-lantern-pole', x: ROOM_W + 220, top: 0, front: true },
  ],
  scenes: [
    {
      id: 'way-down',
      story: 'A lantern lights the boardwalk to the trunk, and a sign stands by the hatch it names: the way down.',
      props: ['pole-0', 'sign-down'],
      about: ['stair-l4-l3'],
    },
    {
      id: 'rest-stop',
      story: 'Where the walk leaves the trunk, a bench under a lantern looks out over the crowns, at the foot of the climb.',
      props: ['bench', 'pole-1'],
    },
  ],
  decals: [
    { piece: 'kit-high-hanging-moss', x: 560, y: 120 },
    { piece: 'kit-high-hanging-moss', x: 1050, y: 90, flip: true },
    { piece: 'kit-high-leaf-cluster', x: 1130, y: 40 },
    { piece: 'kit-high-wind-chime', x: ROOM_W + 1290, y: 200 },
    { piece: 'kit-high-cloud-tuft', x: 1400, y: 860, front: true },
    { piece: 'kit-high-cloud-tuft', x: ROOM_W + 640, y: 870, front: true, flip: true },
  ],
};

export const KIT_DEMOS: Readonly<Record<string, RoomDef>> = {
  l4: kitRoom({
    id: 'l4',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 2 * ROOM_W, h: 900 },
    mood: 'hub',
    walkable: [
      [
        { x: 130, y: TREE_GROUND - 4 },
        { x: ROOM_W + 1330, y: TREE_GROUND - 4 },
        { x: ROOM_W + 1330, y: TREE_GROUND + 4 },
        { x: 130, y: TREE_GROUND + 4 },
      ],
    ],
    perches: kitPerches(L4_KIT),
    spawns: {
      default: { x: 800, y: TREE_GROUND },
      west: { x: 220, y: TREE_GROUND },
      east: { x: ROOM_W + 1240, y: TREE_GROUND },
      'from-l3': { x: 780, y: TREE_GROUND },
      'from-l5': { x: 840, y: TREE_GROUND },
    },
    doors: [
      { id: 'stair-l4-l3', rect: { x: 640, y: 750, w: 100, h: 40 }, to: { room: 'l3', spawn: 'from-l4' }, top: 0, way: 'down', markAt: { x: 690, y: 560 } },
      { id: 'stair-l5-l4', rect: { x: 880, y: 750, w: 100, h: 40 }, to: { room: 'l5', spawn: 'from-l4' }, top: 0, way: 'up', markAt: { x: 930, y: 600 } },
    ],
    kit: L4_KIT,
  }),
};

/**
 * The Realm Gate plaza (docs/TREE_STYLE.md, section 4), laid out from the kit ahead of the room itself
 * (OP-241): past the Gift Shop Gate's turnstiles, at the top of the canopy, in full sky. Its west edge
 * is the way back to the Gift Shop Gate, the trunk stair down into the tree stands at its left end
 * (down is left), and along it one portal arch per realm: an open one glows, one not open yet is
 * boarded with light behind. A stone balustrade closes it in the east. No room of the park uses it
 * yet: its doorways lead nowhere until the remap builds the plaza, and only the preview tools draw it.
 */
const PLAZA_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    { key: 'kit-entrance-sky-b', rate: 0.5, screens: [1, 1] },
    { key: 'kit-entrance-sky-a', rate: 0.5, screens: [0, 0], fade: { right: SKY_FADE } },
    { key: 'kit-entrance-far-a', rate: 0.6, screens: [0, 1], fade: { left: MID_FADE, right: MID_FADE } },
    { key: 'kit-entrance-mid-c', rate: 0.75, screens: [0, 1], fade: { left: MID_FADE, right: MID_FADE } },
  ],
  paths: [{ id: 'plaza', x0: 0, x1: 2 * ROOM_W, top: 0, row: 'kit-cut-stone', mid: 'kit-tex-entrance-plaza-stone' }],
  doors: [
    { door: 'stair-down', piece: 'kit-entrance-stair-head' },
    { door: 'realm-ink', piece: 'kit-arch-portal-boarded' },
    { door: 'realm-clearing', piece: 'kit-arch-portal-boarded' },
    { door: 'realm-neon', piece: 'kit-arch-portal-boarded' },
    { door: 'realm-glass', piece: 'kit-arch-portal-open' },
  ],
  barriers: [{ id: 'balustrade', x0: ROOM_W + 1380, x1: ROOM_W + 1680, top: 0, piece: 'kit-wall-low-stone' }],
  // Three little scenes, not a row (docs/TREE_STYLE.md section 8), each with room around it.
  props: [
    // The crossroads at the gate: the map where an owl first stands, a lantern at the head of the stair.
    { id: 'map', piece: 'kit-entrance-map-board', x: 140, top: 0 },
    { id: 'stair-lantern', piece: 'kit-post-lantern', x: 555, top: 0 },
    // A rest under the little tree: the birdbath in its shade, the bench beside it.
    { id: 'planter', piece: 'kit-entrance-planter-tree', x: 735, top: 0 },
    { id: 'bath', piece: 'kit-entrance-bird-bath', x: 860, top: 0 },
    { id: 'bench', piece: 'kit-entrance-plaza-bench', x: 1060, top: 0 },
    // The one open arch, its lanterns hung toward it; the boarded ones wait dark.
    { id: 'glass-lantern-west', piece: 'kit-post-lantern', x: ROOM_W + 910, top: 0, flip: true },
    { id: 'glass-lantern-east', piece: 'kit-post-lantern', x: ROOM_W + 1310, top: 0 },
  ],
  scenes: [
    {
      id: 'crossroads',
      story: 'Just through the gate, the map shows where every arch leads, and a lantern marks the stair down into the tree.',
      props: ['map', 'stair-lantern'],
      about: ['stair-down'],
    },
    {
      id: 'rest',
      story: 'A bench beside a little potted tree, with the birdbath in its shade, for a rest before choosing an arch.',
      props: ['planter', 'bath', 'bench'],
    },
    {
      id: 'open-arch',
      story: 'Only the glass realm is open: lanterns burn either side of its arch while the boarded arches wait dark.',
      props: ['glass-lantern-west', 'glass-lantern-east'],
      about: ['realm-glass'],
    },
  ],
};

/** A walk along the ground line from x0 to x1, as the tree's floors are (TREE_STRIP 4 each side). */
const floor = (x0: number, x1: number) => [
  [
    { x: x0, y: TREE_GROUND - 4 },
    { x: x1, y: TREE_GROUND - 4 },
    { x: x1, y: TREE_GROUND + 4 },
    { x: x0, y: TREE_GROUND + 4 },
  ],
];

/** A realm's arch on the plaza: its trigger at the floor, closed with the approved sign until the realm opens. */
const arch = (id: string, x: number, open: boolean) => ({
  id,
  rect: { x: x - 80, y: TREE_GROUND - 20, w: 160, h: 40 },
  top: 0,
  markAt: { x, y: TREE_GROUND - 450 },
  ...(open ? {} : { closedSign: 'Hatching Soon' }),
});

/** Kit rooms laid out ahead of a room of the park: drawn only by the preview tools (tools/kit). */
export const KIT_PREVIEWS: Readonly<Record<string, RoomDef>> = {
  plaza: kitRoom({
    id: 'plaza',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 2 * ROOM_W, h: 900 },
    mood: 'hub',
    walkable: floor(0, ROOM_W + 1390),
    perches: [],
    spawns: {
      default: { x: 900, y: TREE_GROUND },
      'from-gate': { x: 120, y: TREE_GROUND },
      'from-stair': { x: 380, y: TREE_GROUND },
    },
    doors: [
      { id: 'to-gate', rect: { x: 0, y: TREE_GROUND - 60, w: 60, h: 120 }, top: 0 },
      { id: 'stair-down', rect: { x: 330, y: TREE_GROUND - 20, w: 120, h: 40 }, top: 0, way: 'down', markAt: { x: 390, y: TREE_GROUND - 260 } },
      arch('realm-ink', 1390, false),
      arch('realm-clearing', ROOM_W + 230, false),
      arch('realm-neon', ROOM_W + 670, false),
      arch('realm-glass', ROOM_W + 1110, true),
    ],
    kit: PLAZA_KIT,
  }),
};

/** The kit room that stands in for a room when the page asks for kit rooms, if there is one. */
export function kitDemoFor(id: string): RoomDef | undefined {
  return Object.hasOwn(KIT_DEMOS, id) ? KIT_DEMOS[id] : undefined;
}
