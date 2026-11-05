import { kitPerches, kitRoom } from '../src/kit';
import { ROOM_W, type KitBackdrop, type RoomDef, type RoomKit } from '../src/room';
import { ROOMS, TREE_GROUND } from './index';

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
    { key: 'kit-hero-l4-far-a', rate: 0.6, screens: [0, 1], fade: { left: MID_FADE, right: MID_FADE } },
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

/** A walk along the ground line from x0 to x1, as the tree's floors are (TREE_STRIP 4 each side). */
const floor = (x0: number, x1: number) => [
  [
    { x: x0, y: TREE_GROUND - 4 },
    { x: x1, y: TREE_GROUND - 4 },
    { x: x1, y: TREE_GROUND + 4 },
    { x: x0, y: TREE_GROUND + 4 },
  ],
];

/**
 * Level 1, the ground (docs/TREE_STYLE.md section 2: warm late dusk, the forest floor running away,
 * other great trunks rising out of frame), four screens west to east as the painted level has them:
 * the path to the closed gate, the lobby at the trunk's foot, the market square and the way to the
 * market's arch. The ledges are the painted level's, drawn from the kit: the boulder, the log and the
 * old stone wall behind them on the path; the lintel over the way down and the shelf fungus over it
 * on the trunk; the market's crates, plinth, steps, stone block and the boarded roof over its stall.
 */
const L1_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    { key: 'kit-ground-sky-b', rate: 0.5, screens: [2, 3] },
    { key: 'kit-ground-sky-a', rate: 0.5, screens: [0, 1], fade: { right: SKY_FADE } },
    { key: 'kit-ground-far-b', rate: 0.6, screens: [2, 3], fade: { left: MID_FADE, right: MID_FADE } },
    { key: 'kit-ground-far-a', rate: 0.6, screens: [0, 1], fade: { left: MID_FADE, right: MID_FADE } },
    { key: 'kit-ground-mid-a', rate: 0.75, screens: [0, 0], fade: { left: MID_FADE, right: MID_FADE } },
    { key: 'kit-ground-mid-b', rate: 0.75, screens: [2, 2], fade: { left: MID_FADE, right: MID_FADE } },
    { key: 'kit-ground-mid-c', rate: 0.75, screens: [3, 3], fade: { left: MID_FADE, right: MID_FADE } },
  ],
  // The trunk at its widest, about 900 across, centred at x 800 of the lobby's screen and running off its top.
  columns: [{ id: 'trunk', x0: ROOM_W + 350, x1: ROOM_W + 1250, y0: -40, y1: 900, left: 'kit-cut-trunk-edge-left', mid: 'kit-cut-trunk-mid', right: 'kit-cut-trunk-edge-right' }],
  // The old stone wall along the west path, behind the boulder and the log: its face down to the path.
  surfaces: [{ id: 'wall-face', texture: 'kit-tex-stone', rect: { x: 700, y: TREE_GROUND - 176, w: 740, h: 176 } }],
  paths: [{ id: 'path', x0: 0, x1: 4 * ROOM_W, top: 0, row: 'kit-cut-earth-path', mids: ['kit-cut-earth-path-mid-480', 'kit-cut-earth-path-mid-640'], mid: 'kit-tex-ground-forest-floor' }],
  ledges: [
    { id: 'boulder', x0: 680, x1: 850, top: 110, cap: 'kit-ground-mossy-boulder' },
    { id: 'log', x0: 1010, x1: 1210, top: 85, cap: 'kit-clearing-log-bridge' },
    { id: 'wall', x0: 700, x1: 1440, top: 190, row: 'kit-cut-stone-thin' },
    { id: 'lintel', x0: ROOM_W + 582, x1: ROOM_W + 730, top: 196, cap: 'kit-stone-thin-mid' },
    { id: 'fungus', x0: ROOM_W + 508, x1: ROOM_W + 641, top: 282, cap: 'kit-clearing-fungus-shelf' },
    { id: 'crates-low', x0: 2 * ROOM_W + 105, x1: 2 * ROOM_W + 275, top: 125, cap: 'kit-boulder' },
    { id: 'crates-high', x0: 2 * ROOM_W + 60, x1: 2 * ROOM_W + 240, top: 225, cap: 'kit-crate-stack' },
    { id: 'block', x0: 2 * ROOM_W + 1120, x1: 2 * ROOM_W + 1270, top: 155, cap: 'kit-stone-single', mid: 'kit-tex-stone', depth: 145 },
    { id: 'crate', x0: 2 * ROOM_W + 1165, x1: 2 * ROOM_W + 1240, top: 205, cap: 'kit-plank-single', mid: 'kit-tex-planks', depth: 50 },
    { id: 'stall-roofs', x0: 2 * ROOM_W + 465, x1: 2 * ROOM_W + 1240, top: 350, row: 'kit-cut-plank-thin' },
    { id: 'plinth', x0: 2 * ROOM_W + 425, x1: 2 * ROOM_W + 590, top: 152, cap: 'kit-stone-single', mid: 'kit-tex-stone', depth: 142 },
    { id: 'steps-1', x0: 2 * ROOM_W + 397, x1: 2 * ROOM_W + 462, top: 190, cap: 'kit-step-stone', mid: 'kit-tex-stone', depth: 180 },
    { id: 'steps-2', x0: 2 * ROOM_W + 412, x1: 2 * ROOM_W + 476, top: 238, cap: 'kit-step-stone', mid: 'kit-tex-stone', depth: 228 },
    { id: 'steps-3', x0: 2 * ROOM_W + 434, x1: 2 * ROOM_W + 496, top: 285, cap: 'kit-step-stone', mid: 'kit-tex-stone', depth: 275 },
  ],
  doors: [
    { door: 'closed-west', piece: 'kit-ground-sign-board', scale: 0.75 },
    { door: 'stair-l1-l0', piece: 'kit-doorway-stone', scale: 0.85 },
    { door: 'stair-l2-l1', piece: 'kit-stair-spiral' },
    { door: 'to-market', piece: 'kit-ground-gate-arch' },
  ],
  barriers: [
    // The locked gate where the path ends in the west, and a low wall past the arch in the east.
    { id: 'west-gate', x0: 420, x1: 640, top: 0, piece: 'kit-gate-locked' },
    { id: 'east-wall', x0: 4 * ROOM_W - 40, x1: 4 * ROOM_W + 260, top: 0, piece: 'kit-wall-low-stone' },
  ],
  props: [
    { id: 'gate-lantern', piece: 'kit-ground-lantern-post', x: 935, top: 0, front: true },
    { id: 'lobby-lantern', piece: 'kit-ground-lantern-post', x: ROOM_W + 60, top: 0 },
    { id: 'lobby-bench', piece: 'kit-ground-bench', x: ROOM_W + 200, top: 0 },
    { id: 'signpost', piece: 'kit-signpost', x: ROOM_W + 830, top: 0, scale: 0.8 },
    { id: 'barrel', piece: 'kit-ground-water-barrel', x: 2 * ROOM_W + 5, top: 0 },
    { id: 'plinth-lantern', piece: 'kit-ground-lantern-post', x: 2 * ROOM_W + 530, top: 152, scale: 0.6 },
    { id: 'stall', piece: 'kit-ground-market-stall', x: 2 * ROOM_W + 855, top: 0, scale: 1.15 },
    { id: 'sacks', piece: 'kit-sack-pile', x: 2 * ROOM_W + 1060, top: 0, scale: 0.7 },
    { id: 'cart', piece: 'kit-ground-hand-cart', x: 3 * ROOM_W + 500, top: 0 },
    { id: 'cart-crates', piece: 'kit-ground-crate-stack', x: 3 * ROOM_W + 670, top: 0, scale: 0.8 },
    { id: 'arch-lantern-west', piece: 'kit-ground-lantern-post', x: 3 * ROOM_W + 1150, top: 0 },
    { id: 'arch-lantern-east', piece: 'kit-ground-lantern-post', x: 3 * ROOM_W + 1520, top: 0, flip: true },
  ],
  scenes: [
    {
      id: 'closed-gate',
      story: 'A lantern still burns on the path to the locked gate, whose board says the way west is not open yet.',
      props: ['gate-lantern'],
      about: ['closed-west', 'west-gate'],
    },
    {
      id: 'waiting-bench',
      story: 'A bench under a lantern at the foot of the trunk, where owls wait for each other before the climb.',
      props: ['lobby-lantern', 'lobby-bench'],
    },
    {
      id: 'two-ways',
      story: 'Between the trunk\'s two doors a signpost points both ways: down through the stone arch, up the spiral stair.',
      props: ['signpost'],
      about: ['stair-l1-l0', 'stair-l2-l1'],
    },
    {
      id: 'unloading',
      story: 'Crates just unloaded where the path comes in from the lobby, with a water barrel beside them.',
      props: ['barrel'],
      about: ['crates-high'],
    },
    {
      id: 'plinth-steps',
      story: 'A lantern on the plinth lights the stone steps up to the boarded stall roofs.',
      props: ['plinth-lantern'],
      about: ['plinth', 'steps-1'],
    },
    {
      id: 'market-stall',
      story: 'The square\'s stall trades under the boarded roof, its sacks piled by the counter.',
      props: ['stall', 'sacks'],
    },
    {
      id: 'hand-cart',
      story: 'A hand cart left half unloaded on the way to the market, its crates stacked beside it.',
      props: ['cart', 'cart-crates'],
    },
    {
      id: 'market-arch',
      story: 'Lanterns either side of the archway light the way through into the market.',
      props: ['arch-lantern-west', 'arch-lantern-east'],
      about: ['to-market'],
    },
  ],
  decals: [
    { piece: 'kit-ground-fern-clump', x: 300, y: TREE_GROUND - 40, front: true },
    { piece: 'kit-ground-fern-clump', x: 1520, y: TREE_GROUND - 40, front: true, flip: true },
    { piece: 'kit-trim-moss-hanging', x: ROOM_W + 420, y: 160 },
    { piece: 'kit-trim-moss-hanging', x: ROOM_W + 1180, y: 120, flip: true },
    { piece: 'kit-ground-fern-clump', x: 3 * ROOM_W + 120, y: TREE_GROUND - 40, front: true },
  ],
};


/** A backdrop layer of an area on a stretch of screens, faded at its edges as the painted tree's middle layers are. */
const layer = (key: string, rate: number, screens: readonly [number, number], fade?: KitBackdrop['fade']): KitBackdrop => ({ key, rate, screens, ...(fade ? { fade } : {}) });
const FADES = { left: MID_FADE, right: MID_FADE };

/**
 * A level of the tree drawn from the kit with the painted level's layout as it stands: its size, floor,
 * doorways, spawns and everything else the room server checks taken from the painted room, its ledges
 * from the kit's (kit.test.ts holds them to the painted perches). Moving it over for good is giving the
 * painted entry this kit.
 */
function fromPainted(id: string, kit: RoomKit): RoomDef {
  const p = ROOMS[id]!;
  return kitRoom({
    id,
    ...(p.map ? { map: p.map } : {}),
    ...(p.gated ? { gated: p.gated } : {}),
    ...(p.owlScale ? { owlScale: p.owlScale } : {}),
    size: p.size,
    mood: p.mood,
    walkable: p.walkable,
    ...(p.perches ? { perches: kitPerches(kit) } : {}),
    spawns: p.spawns,
    doors: p.doors,
    // The ways not open yet keep their signs; the kit draws each barrier itself (RoomKit.barriers).
    ...(p.barriers ? { barriers: p.barriers } : {}),
    ...(p.spots ? { spots: p.spots } : {}),
    ...(p.places ? { places: p.places } : {}),
    kit,
  });
}

/**
 * Level 2, Hoot Hollow (low off the ground: amber light through thick leaves, the lower boughs of the
 * neighbouring trees): the branch's reach with the treetop diner and the tip's round perch in the west,
 * the grove's common area, left open for its idol, guardian and game, and the trunk's landing in the
 * east, the hatch down to level 1 west of the trunk and the knothole up to level 3 in its foot. The
 * branch runs on behind the trunk's east side, roped off before steps that lead nowhere yet.
 */
const L2_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    layer('kit-low-sky-b', 0.5, [0, 1]),
    layer('kit-low-sky-a', 0.5, [2, 2], { left: SKY_FADE }),
    layer('kit-low-far-b', 0.6, [0, 1], FADES),
    layer('kit-low-far-a', 0.6, [2, 2], FADES),
    layer('kit-low-mid-a', 0.75, [0, 0], FADES),
    layer('kit-low-mid-b', 0.75, [1, 1], FADES),
  ],
  columns: [{ id: 'trunk', x0: 2 * ROOM_W + 410, x1: 2 * ROOM_W + 1190, y0: -40, y1: 900, left: 'kit-cut-trunk-edge-left', mid: 'kit-cut-trunk-mid', right: 'kit-cut-trunk-edge-right' }],
  paths: [{ id: 'boardwalk', x0: 150, x1: 3 * ROOM_W, top: 0, row: 'kit-cut-plank', trim: 'kit-trim-moss-a' }],
  ledges: [{ id: 'tip', x0: 82, x1: 168, top: 64, cap: 'kit-cut-branch-mossy-cap-left' }],
  doors: [
    { door: 'stair-l2-l1', piece: 'kit-hatch-down', scale: 1.3 },
    { door: 'stair-l3-l2', piece: 'kit-low-knothole-door-open' },
  ],
  barriers: [{ id: 'trunk-east', x0: 2 * ROOM_W + 1060, x1: 2 * ROOM_W + 1300, top: 0, piece: 'kit-low-rope-barrier' }],
  props: [
    { id: 'table', piece: 'kit-table-round', x: 760, top: 0 },
    { id: 'stool-west', piece: 'kit-stool', x: 610, top: 0, scale: 0.8 },
    { id: 'stool-east', piece: 'kit-stool', x: 910, top: 0, scale: 0.8 },
    { id: 'diner-lantern', piece: 'kit-low-branch-lantern', x: 1060, top: 0 },
    { id: 'common-bench', piece: 'kit-low-log-bench', x: ROOM_W + 900, top: 0 },
    { id: 'common-lantern', piece: 'kit-low-branch-lantern', x: ROOM_W + 1080, top: 0 },
    { id: 'landing-sign', piece: 'kit-low-signpost-blank', x: 2 * ROOM_W + 345, top: 0, scale: 0.8 },
    { id: 'landing-lantern', piece: 'kit-low-branch-lantern', x: 2 * ROOM_W + 120, top: 0 },
  ],
  scenes: [
    {
      id: 'diner',
      story: 'The treetop diner on the reach: a table and two stools under a lantern, set for owls in off the branch.',
      props: ['table', 'stool-west', 'stool-east', 'diner-lantern'],
    },
    {
      id: 'common-bench',
      story: 'A log bench under a lantern at the edge of the common, left open for what the grove will hold.',
      props: ['common-bench', 'common-lantern'],
    },
    {
      id: 'landing',
      story: 'On the trunk\'s landing a lantern lights the hatch down, and a signpost points on up through the knothole.',
      props: ['landing-lantern', 'landing-sign'],
      about: ['stair-l2-l1', 'stair-l3-l2'],
    },
  ],
  decals: [
    { piece: 'kit-low-leaf-clump', x: 1420, y: 120 },
    { piece: 'kit-low-hanging-basket', x: ROOM_W + 420, y: 300 },
    { piece: 'kit-low-leaf-clump', x: ROOM_W + 1500, y: 90, flip: true },
  ],
};

/**
 * Level 3, the stained-glass branch (high off the ground: cool moonlight, crowns well below, clouds
 * level with the walk): the trunk's landing in the west, the hatch down to level 2 at the boardwalk's
 * west end and the knothole up to level 4 in the trunk's foot, the common area, and the reach with the
 * stained-glass doorway into the glass street, roped off past it.
 */
const L3_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    layer('kit-high-sky-b', 0.5, [1, 2]),
    layer('kit-high-sky-a', 0.5, [0, 0], { right: SKY_FADE }),
    layer('kit-high-far-b', 0.6, [1, 2], FADES),
    layer('kit-high-far-a', 0.6, [0, 0], FADES),
    layer('kit-high-mid-a', 0.75, [1, 1], FADES),
    layer('kit-high-mid-c', 0.75, [2, 2], FADES),
  ],
  columns: [{ id: 'trunk', x0: 440, x1: 1160, y0: -40, y1: 900, left: 'kit-cut-trunk-edge-left', mid: 'kit-cut-trunk-mid', right: 'kit-cut-trunk-edge-right' }],
  paths: [{ id: 'boardwalk', x0: 0, x1: 3 * ROOM_W, top: 0, row: 'kit-cut-plank' }],
  doors: [
    { door: 'stair-l3-l2', piece: 'kit-hatch-down', scale: 1.3 },
    { door: 'stair-l4-l3', piece: 'kit-high-knothole-door-open' },
    { door: 'to-glass', piece: 'kit-glass-door-glass-open' },
  ],
  barriers: [
    { id: 'west-rope', x0: -112, x1: 150, top: 0, piece: 'kit-high-rope-barrier' },
    { id: 'reach', x0: 2 * ROOM_W + 860, x1: 2 * ROOM_W + 1122, top: 0, piece: 'kit-high-rope-barrier' },
  ],
  props: [
    { id: 'sign-down', piece: 'kit-high-sign-board', x: 330, top: 0, scale: 0.8 },
    { id: 'pole-down', piece: 'kit-high-lantern-pole', x: 40, top: 0, front: true },
    { id: 'bench', piece: 'kit-high-cloud-bench', x: ROOM_W + 640, top: 0 },
    { id: 'bench-lantern', piece: 'kit-high-lantern-pole', x: ROOM_W + 820, top: 0, front: true },
    { id: 'glass-lantern-west', piece: 'kit-high-hook-lantern', x: 2 * ROOM_W + 410, top: 0, flip: true },
    { id: 'glass-lantern-east', piece: 'kit-high-hook-lantern', x: 2 * ROOM_W + 670, top: 0 },
  ],
  scenes: [
    {
      id: 'way-down',
      story: 'A lantern and a sign by the hatch at the boardwalk\'s west end: the way down to level 2.',
      props: ['pole-down', 'sign-down'],
      about: ['stair-l3-l2'],
    },
    {
      id: 'view-bench',
      story: 'A bench under a lantern in the middle of the branch, looking out over the crowns below.',
      props: ['bench', 'bench-lantern'],
    },
    {
      id: 'glass-door',
      story: 'Lanterns hang either side of the stained-glass door, the way into the glass street.',
      props: ['glass-lantern-west', 'glass-lantern-east'],
      about: ['to-glass'],
    },
  ],
  decals: [
    { piece: 'kit-high-hanging-moss', x: 1180, y: 110, flip: true },
    { piece: 'kit-high-wind-chime', x: 2 * ROOM_W + 1000, y: 300 },
    { piece: 'kit-high-cloud-tuft', x: ROOM_W + 300, y: 860, front: true },
    { piece: 'kit-high-cloud-tuft', x: 2 * ROOM_W + 1300, y: 870, front: true, flip: true },
  ],
};

/**
 * The nests street on level 5 (the top of the canopy: open sky, a sea of leaf tops below): from the
 * fallen branch at the foot of bough 6 in the west, where a closed doorway waits for the places beyond
 * Owl Park, along the nest doors (the owl's own, door 0, nearest the gate; the westmost still to hatch,
 * boarded), round the trunk's crown, to the front gate's turnstiles in the east.
 */
const L5_STREET_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    layer('kit-canopy-sky-b', 0.5, [0, 1]),
    layer('kit-canopy-sky-a', 0.5, [2, 2], { left: SKY_FADE }),
    layer('kit-canopy-far-b', 0.6, [0, 1], FADES),
    layer('kit-canopy-far-a', 0.6, [2, 2], FADES),
    layer('kit-canopy-mid-a', 0.75, [0, 0], FADES),
    layer('kit-canopy-mid-b', 0.75, [1, 1], FADES),
  ],
  columns: [{ id: 'trunk', x0: 2 * ROOM_W + 500, x1: 2 * ROOM_W + 1100, y0: -40, y1: 900, left: 'kit-cut-trunk-edge-left', mid: 'kit-cut-trunk-mid', right: 'kit-cut-trunk-edge-right' }],
  paths: [{ id: 'street', x0: 0, x1: 3 * ROOM_W, top: 0, row: 'kit-cut-plank' }],
  doors: [
    { door: 'gate', piece: 'kit-turnstile' },
    { door: 'nest-door-0', piece: 'kit-canopy-door-nest-open' },
    { door: 'nest-door-1', piece: 'kit-canopy-door-nest-open' },
    { door: 'nest-door-2', piece: 'kit-canopy-door-nest-open' },
    { door: 'nest-door-3', piece: 'kit-canopy-door-nest-open' },
    { door: 'nest-door-4', piece: 'kit-canopy-door-nest-open', scale: 0.9 },
    { door: 'nest-door-5', piece: 'kit-canopy-door-nest-open', scale: 0.9 },
    { door: 'spare-nest', piece: 'kit-canopy-door-nest-closed', scale: 0.9 },
    { door: 'closed-beyond', piece: 'kit-canopy-sign-board', scale: 0.8 },
  ],
  barriers: [
    { id: 'closed-beyond', x0: 420, x1: 600, top: 0, piece: 'kit-barrier-branch' },
    { id: 'spare-nest', x0: 760, x1: 880, top: 0, piece: 'kit-barrier-boards' },
  ],
  props: [
    { id: 'home-lantern', piece: 'kit-canopy-nest-lantern', x: 3160, top: 0 },
    { id: 'street-bench', piece: 'kit-canopy-twig-bench', x: 2420, top: 0 },
    { id: 'street-planter', piece: 'kit-canopy-planter-wicker', x: 2580, top: 0, scale: 0.8 },
    { id: 'gate-sign', piece: 'kit-canopy-sign-board', x: 2 * ROOM_W + 1330, top: 0 },
    { id: 'gate-lantern', piece: 'kit-canopy-nest-lantern', x: 2 * ROOM_W + 1440, top: 0 },
  ],
  scenes: [
    {
      id: 'home',
      story: 'A lantern by the owl\'s own nest, the door nearest the gate, so it always finds its way home.',
      props: ['home-lantern'],
      about: ['nest-door-0'],
    },
    {
      id: 'neighbours',
      story: 'A twig bench and a planter halfway along the street, where neighbours sit outside their nests.',
      props: ['street-bench', 'street-planter'],
    },
    {
      id: 'front-gate',
      story: 'The front gate\'s sign and lantern, where an owl with a ticket goes on through the turnstiles.',
      props: ['gate-sign', 'gate-lantern'],
      about: ['gate'],
    },
  ],
  decals: [
    { piece: 'kit-canopy-lantern-string', x: 1530, y: 400 },
    { piece: 'kit-canopy-leaf-cluster', x: 200, y: 140 },
    { piece: 'kit-canopy-hanging-basket', x: 2 * ROOM_W + 220, y: 330 },
  ],
};

/**
 * The canopy on level 5, inside the front gate: in through the turnstiles from the street, past the
 * hatch down to level 4, the lounge and the gift shop, out to the end of the pier, where a fallen branch
 * shuts bough 7 for now.
 */
const L5_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    layer('kit-canopy-sky-a', 0.5, [0, 0], { right: SKY_FADE }),
    layer('kit-canopy-sky-b', 0.5, [1, 2]),
    layer('kit-canopy-far-a', 0.6, [0, 0], FADES),
    layer('kit-canopy-far-b', 0.6, [1, 2], FADES),
    layer('kit-canopy-mid-c', 0.75, [1, 1], FADES),
    layer('kit-canopy-mid-a', 0.75, [2, 2], FADES),
  ],
  paths: [{ id: 'pier', x0: 0, x1: 4100, top: 0, row: 'kit-cut-plank' }],
  doors: [
    { door: 'to-street', piece: 'kit-turnstile' },
    { door: 'stair-l5-l4', piece: 'kit-hatch-down', scale: 1.3 },
  ],
  barriers: [{ id: 'bough-7', x0: 3860, x1: 4100, top: 0, piece: 'kit-barrier-branch' }],
  props: [
    { id: 'arch-sign', piece: 'kit-canopy-sign-board', x: 340, top: 0 },
    { id: 'stair-lantern', piece: 'kit-canopy-nest-lantern', x: 1420, top: 0 },
    { id: 'lounge-bench', piece: 'kit-canopy-twig-bench', x: ROOM_W + 300, top: 0 },
    { id: 'lounge-planter', piece: 'kit-canopy-planter-wicker', x: ROOM_W + 500, top: 0, scale: 0.8 },
    { id: 'lounge-lantern', piece: 'kit-canopy-nest-lantern', x: ROOM_W + 110, top: 0 },
    { id: 'shop-stand', piece: 'kit-entrance-shop-stand', x: ROOM_W + 1150, top: 0 },
    { id: 'shop-hats', piece: 'kit-entrance-shop-shelf-hats', x: ROOM_W + 1330, top: 0, scale: 0.9 },
    { id: 'pier-coil', piece: 'kit-canopy-rope-coil', x: 3700, top: 0, scale: 0.8 },
  ],
  scenes: [
    {
      id: 'welcome',
      story: 'Just through the turnstiles from the street, a sign welcomes owls into the canopy.',
      props: ['arch-sign'],
      about: ['to-street'],
    },
    {
      id: 'way-down',
      story: 'A lantern burns by the hatch down to level 4, the way into the tree.',
      props: ['stair-lantern'],
      about: ['stair-l5-l4'],
    },
    {
      id: 'lounge',
      story: 'The lounge: a twig bench between a lantern and a planter, facing out over the leaf tops.',
      props: ['lounge-lantern', 'lounge-bench', 'lounge-planter'],
    },
    {
      id: 'gift-shop',
      story: 'The gift shop\'s stand on the pier, its hats set out on the shelf beside it.',
      props: ['shop-stand', 'shop-hats'],
    },
    {
      id: 'pier-end',
      story: 'A rope coiled at the pier\'s end, by the fallen branch that shuts the bough beyond for now.',
      props: ['pier-coil'],
      about: ['bough-7'],
    },
  ],
  decals: [
    { piece: 'kit-canopy-lantern-string', x: ROOM_W + 400, y: 380 },
    { piece: 'kit-canopy-leaf-cluster', x: 2 * ROOM_W + 900, y: 120, flip: true },
  ],
};

/**
 * Level 0, the cavern under the tree (no moonlight: lantern gold on cool violet-navy, earth and roots
 * overhead, never any sky): the low stone wall where the floor ends in the west, the boarded stairwell
 * down to the realm challenge, then the trunk's base widening into roots, with the find's way up the
 * great root (the stone shelf, two root knobs, the high root ledge), the root stair up to the lobby
 * ring, and the mouth of the arcade cave in the east.
 */
const L0_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    layer('kit-under-sky-a', 0.5, [0, 0], { right: SKY_FADE }),
    layer('kit-under-sky-b', 0.5, [1, 1]),
    layer('kit-under-far-a', 0.6, [0, 1], FADES),
    layer('kit-under-mid-a', 0.75, [0, 0], FADES),
  ],
  columns: [{ id: 'trunk', x0: ROOM_W + 350, x1: ROOM_W + 1250, y0: -40, y1: 900, left: 'kit-cut-trunk-edge-left', mid: 'kit-cut-trunk-mid', right: 'kit-cut-trunk-edge-right' }],
  paths: [{ id: 'floor', x0: 0, x1: 2 * ROOM_W, top: 0, row: 'kit-cut-stone', mid: 'kit-tex-under-cave-stone' }],
  ledges: [
    { id: 'low-wall', x0: 62, x1: 270, top: 118, cap: 'kit-wall-low-stone' },
    { id: 'shelf', x0: 2070, x1: 2210, top: 46, cap: 'kit-under-root-ledge-mid' },
    { id: 'knob-low', x0: 1980, x1: 2070, top: 93, cap: 'kit-under-root-knot' },
    { id: 'knob-high', x0: 2080, x1: 2160, top: 128, cap: 'kit-under-root-knot' },
    { id: 'root-ledge', x0: 1930, x1: 2210, top: 264, cap: 'kit-under-root-ledge-mid' },
  ],
  doors: [
    { door: 'stair-challenge', piece: 'kit-hatch-down', scale: 1.3 },
    { door: 'stair-l1-l0', piece: 'kit-under-stair-root-right' },
    { door: 'to-arcade', piece: 'kit-under-root-arch' },
  ],
  barriers: [
    { id: 'wall-foot', x0: 240, x1: 330, top: 0, piece: 'kit-under-stone-pile' },
    { id: 'stair-challenge', x0: 590, x1: 770, top: 0, piece: 'kit-barrier-boards' },
  ],
  props: [
    { id: 'challenge-sign', piece: 'kit-under-sign-root', x: 900, top: 0, scale: 0.8 },
    { id: 'stair-lantern', piece: 'kit-under-lantern-post', x: ROOM_W + 1180, top: 0 },
  ],
  scenes: [
    {
      id: 'boarded-stair',
      story: 'A root-carved sign by the boarded stairwell: the challenge below is not open yet.',
      props: ['challenge-sign'],
      about: ['stair-challenge'],
    },
    {
      id: 'stair-foot',
      story: 'A lantern at the foot of the root stair lights the way up to the lobby ring.',
      props: ['stair-lantern'],
      about: ['stair-l1-l0'],
    },
  ],
  decals: [
    { piece: 'kit-under-stalactites', x: 420, y: 60 },
    { piece: 'kit-under-root-hang', x: 1260, y: 150, flip: true },
    { piece: 'kit-under-mushroom-cluster', x: 1500, y: TREE_GROUND - 30, front: true },
    { piece: 'kit-under-lantern-hang', x: ROOM_W + 1420, y: 200 },
  ],
};

/**
 * Neon Roost, the arcade cave off level 0's east end (underground; its neon kept inside its three bays):
 * the mouth back to the cavern in the west, then a bay a screen, each with its cabinet: Crossing, Flight
 * and Sling. Roots close the cave in the east.
 */
const ARCADE_KIT: RoomKit = {
  ground: TREE_GROUND,
  backdrops: [
    layer('kit-under-sky-b', 0.5, [0, 2]),
    layer('kit-under-far-b', 0.6, [0, 2], FADES),
    layer('kit-under-mid-b', 0.75, [0, 0], FADES),
    layer('kit-under-mid-c', 0.75, [2, 2], FADES),
  ],
  paths: [{ id: 'floor', x0: 0, x1: 3 * ROOM_W, top: 0, row: 'kit-cut-stone', mid: 'kit-tex-under-cave-stone' }],
  doors: [
    { door: 'to-l0', piece: 'kit-under-root-arch' },
    { door: 'cabinet-crossing', piece: 'kit-landmark-cabinet-miniature', scale: 1.4 },
    { door: 'cabinet-flight', piece: 'kit-landmark-cabinet-miniature', scale: 1.4 },
    { door: 'cabinet-sling', piece: 'kit-landmark-cabinet-miniature', scale: 1.4 },
  ],
  barriers: [{ id: 'east-roots', x0: 4560, x1: 4880, top: 0, piece: 'kit-under-barrier-roots' }],
  props: [
    { id: 'crossing-lantern', piece: 'kit-under-lantern-post', x: 1010, top: 0 },
    { id: 'robot', piece: 'kit-landmark-robot-owl', x: 2560, top: 0, scale: 0.8 },
    { id: 'sling-bench', piece: 'kit-bench-stone', x: 4050, top: 0 },
    { id: 'sling-lantern', piece: 'kit-under-lantern-post', x: 4230, top: 0 },
  ],
  scenes: [
    {
      id: 'crossing-bay',
      story: 'A lantern lights the first bay\'s cabinet, Crossing, just inside the cave\'s mouth.',
      props: ['crossing-lantern'],
      about: ['cabinet-crossing'],
    },
    {
      id: 'flight-bay',
      story: 'Neon Roost\'s robot owl keeps watch by the Flight cabinet in the middle bay.',
      props: ['robot'],
      about: ['cabinet-flight'],
    },
    {
      id: 'sling-bay',
      story: 'A stone bench under a lantern by the Sling cabinet, for owls waiting their turn.',
      props: ['sling-bench', 'sling-lantern'],
      about: ['cabinet-sling'],
    },
  ],
  decals: [
    { piece: 'kit-under-stalactites', x: 1600, y: 60 },
    { piece: 'kit-under-stalactites', x: 3200, y: 50, flip: true },
    { piece: 'kit-under-root-hang', x: 400, y: 160 },
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
  l1: kitRoom({
    id: 'l1',
    map: 2,
    gated: true,
    owlScale: 1.25,
    size: { w: 4 * ROOM_W, h: 900 },
    mood: 'hub',
    walkable: floor(600, 4 * ROOM_W - 24),
    perches: kitPerches(L1_KIT),
    spawns: {
      default: { x: ROOM_W + 800, y: TREE_GROUND },
      west: { x: 720, y: TREE_GROUND },
      east: { x: 3 * ROOM_W + 1100, y: TREE_GROUND },
      market: { x: 3 * ROOM_W + 1230, y: TREE_GROUND },
      'from-l2': { x: ROOM_W + 900, y: TREE_GROUND },
      'from-l0': { x: ROOM_W + 760, y: TREE_GROUND },
    },
    doors: [
      { id: 'closed-west', rect: { x: 630, y: 750, w: 60, h: 40 }, closedSign: 'Not Yet Fledged', top: 0, marker: { x: 415, y: TREE_GROUND } },
      { id: 'stair-l1-l0', rect: { x: ROOM_W + 610, y: 750, w: 90, h: 40 }, to: { room: 'l0', spawn: 'from-l1' }, top: 0, way: 'down', markAt: { x: ROOM_W + 653, y: 640 } },
      { id: 'stair-l2-l1', rect: { x: ROOM_W + 960, y: 750, w: 110, h: 40 }, to: { room: 'l2', spawn: 'from-l1' }, top: 0, way: 'up', markAt: { x: ROOM_W + 1015, y: 560 } },
      { id: 'to-market', rect: { x: 3 * ROOM_W + 1300, y: 750, w: 90, h: 40 }, to: { room: 'market', spawn: 'default' }, top: 0, markAt: { x: 3 * ROOM_W + 1365, y: 462 } },
    ],
    // The closed gate's sign over the kit's locked gate. The painted roof run's rope has no kit
    // counterpart: the kit draws nothing there that looks like a way up.
    barriers: [{ id: 'closed-west', kind: 'gate', x: 570, w: 90, sign: 'Not Yet Fledged' }],
    kit: L1_KIT,
  }),
  l2: fromPainted('l2', L2_KIT),
  l3: fromPainted('l3', L3_KIT),
  'l5-street': fromPainted('l5-street', L5_STREET_KIT),
  l5: fromPainted('l5', L5_KIT),
  l0: fromPainted('l0', L0_KIT),
  'l0-arcade': fromPainted('l0-arcade', ARCADE_KIT),
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
    { key: 'kit-hero-plaza-far-a', rate: 0.6, screens: [0, 1], fade: { left: MID_FADE, right: MID_FADE } },
    { key: 'kit-hero-plaza-mid-a', rate: 0.75, screens: [0, 1], fade: { left: MID_FADE, right: MID_FADE } },
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
