/**
 * Updraft Canopy (OP-226), the Treehouse Clearing's course, laid out from docs/levels/updraft-canopy.md
 * and drawn from the clearing's kit. Seen from the side, as the tree is: up through the fern floor
 * (act 1, `canopy-1`, with the hidden room under its roots), inside the hollow trunk a storey a room
 * (act 2, `canopy-2a` to `canopy-2c`) and out along the crown to the lookout hut (act 3, `canopy-3`
 * and the hut, where the finish shrine stands). Its mechanic is the updraft (updraft.ts): a column of
 * leaves that lifts a gliding owl. Thorns hang between the high ledges so a long glide cannot skip a
 * column, and bramble, thorn roots and the drop under the crown are its pits.
 *
 * For now it is the keepers' (`keeperOnly`): its trail gate stands in the test course's trailhead,
 * until the clearing's course doorway is painted. Not built yet, from the plan: the wind of act 3, the
 * three shortcuts (the log, the vine and the bough), the sleeping owlet's lines and the telescope's view.
 *
 * Every ledge is the plan's: `x` its west end, `w` its width, `top` its height over the ground line.
 */
import type { CourseDef, CoursePiece, CourseThorns, RoomCourse } from '../src/course';
import { kitPerches, kitRoom } from '../src/kit';
import { ROOM_W, type KitBackdrop, type KitDecal, type KitLedge, type DoorDef, type RoomDef, type RoomKit } from '../src/room';
import type { Updraft } from '../src/updraft';

export const CANOPY_COURSE_ID = 'canopy';
/** The tree's ground line (TREE_GROUND in rooms/index.ts, which this file cannot import: index.ts imports it). */
export const CANOPY_GROUND = 770;
const G = CANOPY_GROUND;

/** A walk along the ground line, as the tree's floors are. */
function floor(x0: number, x1: number) {
  return [
    [
      { x: x0, y: G - 4 },
      { x: x1, y: G - 4 },
      { x: x1, y: G + 4 },
      { x: x0, y: G + 4 },
    ],
  ];
}

/** A stretch of the ground line that is a pit (bramble, thorn roots, the drop): standing on it is a fall. */
function pit(x0: number, x1: number) {
  return floor(x0, x1)[0]!;
}

/** A ledge of the plan: `x` its west end, `w` its width, `top` its height. */
function ledge(id: string, x: number, w: number, top: number, look: Omit<KitLedge, 'id' | 'x0' | 'x1' | 'top'>): KitLedge {
  return { id, x0: x, x1: x + w, top, ...look };
}

/** The looks of the course's ledges, from the kit. */
const BRANCH = { row: 'kit-cut-branch-mossy' };
const TWIG = { row: 'kit-cut-branch-thin' };
const FROND = { cap: 'kit-clearing-leaf-platform' };
const SHELF = { cap: 'kit-clearing-fungus-shelf' };
const stump = (top: number) => ({ cap: 'kit-ground-tree-stump', mid: 'kit-tex-bark', depth: top });

/** A doorway on the ground line or up on a ledge (`top`), `w` wide, centred on `x`. */
function door(id: string, x: number, to: DoorDef['to'], opts: { top?: number; w?: number; way?: DoorDef['way'] } = {}): DoorDef {
  const w = opts.w ?? 80;
  const top = opts.top ?? 0;
  return { id, rect: { x: x - w / 2, y: G - 20, w, h: 40 }, ...(to ? { to } : {}), top, ...(opts.way ? { way: opts.way } : {}), markAt: { x, y: G - top - 260 } };
}

/** A course piece on the ground line at `x`, up on a ledge `top` high. */
function piece(id: string, x: number, top = 0): CoursePiece {
  return { id, at: { x, y: G }, ...(top ? { top } : {}) };
}

/** Thorns over `x0` to `x1`, from `z0` up to past the room's top (z 940: higher than an owl may be). */
function thorns(id: string, x0: number, x1: number, z0: number, z1 = 940): CourseThorns {
  return { id, x0, x1, z0, z1 };
}

/** An updraft column: always on, or on `on` s and off `off` s, `phase` into its cycle at park time 0. */
function updraft(id: string, x: number, top: number, cycle?: { on: number; off: number; phase: number }): Updraft {
  return { id, x, w: 120, top, ...(cycle ? { onMs: cycle.on * 1000, offMs: cycle.off * 1000, phase: cycle.phase } : {}) };
}

/** The vent each column rises from, at its foot. */
const vents = (cols: readonly Updraft[]): KitDecal[] => cols.map((u) => ({ piece: 'kit-clearing-updraft-vent', x: u.x + u.w / 2, y: G - 60, scale: 0.8 }));

/** Bramble over a pit of the fern floor, patch by patch. */
function bramble(x0: number, x1: number, piece = 'kit-clearing-bramble-patch', step = 240): KitDecal[] {
  const out: KitDecal[] = [];
  for (let x = x0 + step / 2, i = 0; x < x1; x += step, i++) out.push({ piece, x, y: G - 30, front: true, ...(i % 2 ? { flip: true } : {}) });
  return out;
}

const layer = (key: string, rate: number, screens: readonly [number, number], fade?: KitBackdrop['fade']): KitBackdrop => ({ key, rate, screens, ...(fade ? { fade } : {}) });
const FADES = { left: 230, right: 230 };

/** The clearing's air, screen by screen: its two skies (each screen's own tile), far trees and middle layers in turn. */
function clearingAir(screens: number): KitBackdrop[] {
  const out: KitBackdrop[] = [];
  for (let s = 0; s < screens; s++) {
    out.push(layer(s % 2 ? 'kit-clearing-sky-b' : 'kit-clearing-sky-a', 1, [s, s]));
    out.push(layer(s % 2 ? 'kit-clearing-far-b' : 'kit-clearing-far-a', 0.6, [s, s], FADES));
    out.push(layer(['kit-clearing-mid-a', 'kit-clearing-mid-b', 'kit-clearing-mid-c'][s % 3]!, 0.75, [s, s], FADES));
  }
  return out;
}

/** Inside the trunk: its hollow wood all round, with the clearing's sky behind it (seen through no gap). */
function trunkInside(w: number): Pick<RoomKit, 'backdrops' | 'surfaces'> {
  return {
    backdrops: [layer('kit-clearing-sky-a', 1, [0, 0])],
    surfaces: [{ id: 'hollow', texture: 'kit-tex-clearing-hollow-wood', rect: { x: 0, y: 0, w, h: G } }],
  };
}

const KEEPERS = { map: 2 as const, owlScale: 1.25, mood: 'dusk' as const, keeperOnly: true as const };

function canopyRoom(
  id: string,
  screens: number,
  kit: RoomKit,
  rest: Pick<RoomDef, 'spawns' | 'doors'> & { course: Omit<RoomCourse, 'id'>; updrafts?: Updraft[] },
): RoomDef {
  const w = screens * ROOM_W;
  return kitRoom({
    id,
    ...KEEPERS,
    size: { w, h: 900 },
    walkable: floor(8, w - 8),
    perches: kitPerches(kit),
    spawns: rest.spawns,
    doors: rest.doors,
    course: { id: CANOPY_COURSE_ID, ...rest.course },
    ...(rest.updrafts ? { updrafts: rest.updrafts } : {}),
    kit,
  });
}

// ---------- Act 1: the fern floor ----------

const U_ACT1 = [
  updraft('U1', 1260, 580),
  updraft('U2', 2240, 560, { on: 3, off: 2, phase: 0 }),
  updraft('U3', 2800, 600, { on: 3, off: 2, phase: 0.5 }),
  updraft('U4', 3460, 580, { on: 2.5, off: 2.5, phase: 0 }),
  updraft('U5', 4060, 600, { on: 2.5, off: 2.5, phase: 0.5 }),
];

const CANOPY_1: RoomKit = {
  ground: G,
  backdrops: clearingAir(3),
  paths: [{ id: 'fern-floor', x0: 0, x1: 3 * ROOM_W, top: 0, row: 'kit-cut-earth', mid: 'kit-tex-clearing-fern-floor' }],
  ledges: [
    ledge('s1', 300, 160, 90, stump(90)),
    ledge('s2', 520, 140, 200, stump(200)),
    ledge('fern-hi', 40, 120, 330, FROND),
    ledge('f1', 760, 180, 160, FROND),
    ledge('f2', 1050, 160, 100, FROND),
    ledge('b1', 1480, 160, 480, BRANCH),
    ledge('fern-bench', 1840, 100, 540, FROND),
    ledge('s4', 2040, 140, 120, stump(120)),
    ledge('l5', 2420, 200, 500, BRANCH),
    ledge('l6', 3000, 200, 540, BRANCH),
    ledge('l7', 3250, 140, 120, TWIG),
    ledge('l8', 3640, 140, 540, BRANCH),
    ledge('l9', 3880, 120, 160, TWIG),
    ledge('b2', 4240, 200, 540, BRANCH),
  ],
  doors: [
    { door: 'to-commons', piece: 'kit-clearing-vine-curtain', scale: 0.8 },
    { door: 'roots', piece: 'kit-landmark-door-root-tiny' },
    { door: 'to-trunk', piece: 'kit-clearing-trunk-entrance', scale: 0.9 },
  ],
  props: [
    { id: 'gate-fern', piece: 'kit-clearing-fern-tall', x: 200, top: 0 },
    { id: 'roots-fern', piece: 'kit-clearing-fern-clump', x: 4470, top: 0, scale: 0.8 },
  ],
  scenes: [
    { id: 'gate', story: 'A tall fern leans over the curtain of vines where the course begins, the way back to the clearing.', props: ['gate-fern'], about: ['to-commons'] },
    { id: 'tiny-door', story: 'Half hidden by a fern among the roots, a tiny door with a warm light behind its crack.', props: ['roots-fern'], about: ['roots'] },
  ],
  decals: [...bramble(700, 1500), ...bramble(2000, 4200), ...vents(U_ACT1)],
};

const ROOT_DEN: RoomKit = {
  ground: G,
  backdrops: [layer('kit-under-sky-b', 1, [0, 0]), layer('kit-under-far-b', 0.6, [0, 0], FADES), layer('kit-under-mid-b', 0.75, [0, 0], FADES)],
  paths: [{ id: 'den', x0: 0, x1: ROOM_W, top: 0, row: 'kit-cut-earth', mid: 'kit-tex-under-packed-earth' }],
  ledges: [ledge('shelf', 900, 200, 200, { cap: 'kit-clearing-root-shelf' })],
  doors: [{ door: 'out', piece: 'kit-landmark-door-root-tiny' }],
  props: [
    { id: 'cabinet', piece: 'kit-landmark-cabinet-miniature', x: 600, top: 0 },
    { id: 'den-shrooms', piece: 'kit-clearing-mushroom-cluster', x: 420, top: 0, scale: 0.8 },
  ],
  scenes: [{ id: 'den', story: 'A dry den under the roots where someone keeps a tiny game cabinet, mushrooms glowing beside it.', props: ['cabinet', 'den-shrooms'] }],
  decals: [{ piece: 'kit-under-root-hang', x: 1200, y: 120 }],
};

// ---------- Act 2: inside the hollow trunk ----------

const U_2A = [updraft('U6', 920, 560, { on: 3, off: 2, phase: 0 })];
const TRUNK_A: RoomKit = {
  ground: G,
  ...trunkInside(ROOM_W),
  paths: [{ id: 'trunk-floor', x0: 0, x1: ROOM_W, top: 0, row: 'kit-cut-earth', mid: 'kit-tex-roots' }],
  ledges: [ledge('t1', 300, 220, 130, SHELF), ledge('t2', 600, 180, 200, SHELF), ledge('b3', 120, 120, 540, TWIG), ledge('t3', 1100, 200, 500, SHELF), ledge('t4', 1360, 200, 540, SHELF)],
  doors: [
    { door: 'down', piece: 'kit-doorway-knothole', scale: 0.8 },
    { door: 'hatch-up', piece: 'kit-doorway-knothole', scale: 0.6 },
  ],
  decals: vents(U_2A),
};

const U_2B = [updraft('U7', 640, 550, { on: 3, off: 2, phase: 0 }), updraft('U8', 1080, 600, { on: 3, off: 2, phase: 0.5 })];
const TRUNK_B: RoomKit = {
  ground: G,
  ...trunkInside(ROOM_W),
  paths: [{ id: 'trunk-floor', x0: 0, x1: ROOM_W, top: 0, row: 'kit-cut-earth', mid: 'kit-tex-roots' }],
  ledges: [
    ledge('u1', 420, 160, 120, SHELF),
    ledge('knot-shelf', 300, 100, 520, SHELF),
    ledge('u2', 820, 140, 490, SHELF),
    ledge('u2b', 880, 160, 120, SHELF),
    ledge('u3', 1260, 240, 540, SHELF),
  ],
  doors: [
    { door: 'down', piece: 'kit-hatch-down' },
    { door: 'hatch-up', piece: 'kit-doorway-knothole', scale: 0.6 },
  ],
  decals: [...bramble(400, ROOM_W, 'kit-clearing-thorn-roots', 360), ...vents(U_2B)],
};

const U_2C = [updraft('U9', 520, 540, { on: 2, off: 2, phase: 0 }), updraft('U10', 890, 600, { on: 2, off: 2, phase: 0.5 })];
const TRUNK_C: RoomKit = {
  ground: G,
  ...trunkInside(ROOM_W),
  paths: [{ id: 'trunk-floor', x0: 0, x1: ROOM_W, top: 0, row: 'kit-cut-earth', mid: 'kit-tex-roots' }],
  ledges: [ledge('v1', 320, 140, 110, SHELF), ledge('v2', 700, 120, 480, SHELF), ledge('v3', 1160, 180, 520, SHELF), ledge('v4', 1380, 200, 540, SHELF)],
  doors: [
    { door: 'down', piece: 'kit-hatch-down' },
    { door: 'hatch-up', piece: 'kit-doorway-knothole', scale: 0.6 },
  ],
  decals: [...bramble(300, ROOM_W, 'kit-clearing-thorn-roots', 360), ...vents(U_2C)],
};

// ---------- Act 3: the crown run ----------

const U_ACT3 = [
  updraft('U11', 1160, 600),
  updraft('U12', 2200, 600, { on: 3, off: 2, phase: 0.5 }),
  updraft('U13', 2920, 600, { on: 3, off: 2, phase: 0 }),
  updraft('U14', 4040, 600, { on: 3, off: 2, phase: 0.25 }),
];
const CROWN: RoomKit = {
  ground: G,
  backdrops: clearingAir(4),
  paths: [{ id: 'crown-floor', x0: 0, x1: 4 * ROOM_W, top: 0, row: 'kit-cut-earth', mid: 'kit-tex-clearing-fern-floor' }],
  ledges: [
    ledge('c1', 620, 160, 120, TWIG),
    ledge('c2', 920, 160, 160, TWIG),
    ledge('c3', 1340, 260, 540, BRANCH),
    ledge('c4', 1800, 260, 120, TWIG),
    ledge('pocket', 1640, 100, 40, FROND),
    ledge('c5', 2380, 160, 540, TWIG),
    ledge('snag', 2580, 40, 520, { row: 'kit-cut-branch-thin', mid: 'kit-tex-bark', depth: 520 }),
    ledge('c6', 2680, 160, 120, TWIG),
    ledge('c7', 3100, 140, 540, TWIG),
    ledge('c8', 3300, 300, 540, { row: 'kit-cut-branch-mossy', mid: 'kit-tex-bark', depth: 540 }),
    ledge('c9', 3780, 160, 140, TWIG),
    ledge('c10', 4240, 200, 540, BRANCH),
    ledge('c12', 4900, 200, 180, BRANCH),
    ledge('c13', 5460, 240, 520, BRANCH),
    ledge('c14', 5760, 180, 520, BRANCH),
    ledge('c15', 6020, 360, 540, { row: 'kit-cut-plank', mid: 'kit-tex-planks', depth: 540 }),
  ],
  doors: [
    { door: 'down', piece: 'kit-hatch-down' },
    { door: 'hut', piece: 'kit-landmark-hut-lookout', scale: 0.55 },
  ],
  decals: [...bramble(600, 4 * ROOM_W), ...vents(U_ACT3)],
};

const HUT: RoomKit = {
  ground: G,
  backdrops: [layer('kit-clearing-sky-b', 1, [0, 0])],
  surfaces: [{ id: 'walls', texture: 'kit-tex-planks', rect: { x: 0, y: 0, w: ROOM_W, h: G } }],
  paths: [{ id: 'hut-floor', x0: 0, x1: ROOM_W, top: 0, row: 'kit-cut-plank', mid: 'kit-tex-planks' }],
  ledges: [ledge('sill', 1100, 260, 130, { cap: 'kit-plank-single' })],
  doors: [{ door: 'out', piece: 'kit-clearing-hut-door-open', scale: 0.9 }],
  props: [{ id: 'telescope', piece: 'kit-landmark-telescope-brass', x: 1230, top: 130 }],
  scenes: [{ id: 'window-seat', story: 'On the window seat a brass telescope points out across the night, at a far-off glow of neon.', props: ['telescope'] }],
};

export const CANOPY_ROOMS: Record<string, RoomDef> = {
  'canopy-1': canopyRoom('canopy-1', 3, CANOPY_1, {
    spawns: { default: { x: 120, y: G }, 'from-gate': { x: 120, y: G }, 'from-roots': { x: 4480, y: G }, 'from-trunk': { x: 4660, y: G } },
    doors: [
      door('to-commons', 40, { room: 'trail-head', spawn: 'from-canopy' }, { way: 'down' }),
      door('roots', 4560, { room: 'canopy-roots', spawn: 'from-roots' }, { w: 60 }),
      door('to-trunk', 4740, { room: 'canopy-2a', spawn: 'from-below' }, { w: 60, way: 'up' }),
    ],
    updrafts: U_ACT1,
    course: {
      act: 1,
      pits: [pit(700, 1500), pit(2000, 4200)],
      thorns: [thorns('H1', 1960, 2020, 260), thorns('H2', 2700, 2760, 300), thorns('H3', 3400, 3450, 300), thorns('H4', 4000, 4050, 300)],
      benches: [piece('bench-1', 1800)],
      parts: [piece('bell-1', 1560, 480), piece('bell-2', 4340, 540)],
      feathers: [piece('feather-1', 100, 330), piece('feather-2', 1890, 540)],
    },
  }),
  'canopy-roots': canopyRoom('canopy-roots', 1, ROOT_DEN, {
    spawns: { default: { x: 180, y: G }, 'from-roots': { x: 180, y: G } },
    doors: [door('out', 80, { room: 'canopy-1', spawn: 'from-roots' }, { w: 60 })],
    course: { act: 1, feathers: [piece('feather-3', 1000, 200)] },
  }),
  'canopy-2a': canopyRoom('canopy-2a', 1, TRUNK_A, {
    spawns: { default: { x: 140, y: G }, 'from-below': { x: 140, y: G }, 'from-above': { x: 1400, y: G } },
    doors: [door('down', 40, { room: 'canopy-1', spawn: 'from-trunk' }, { w: 60, way: 'down' }), door('hatch-up', 1460, { room: 'canopy-2b', spawn: 'from-below' }, { top: 540, way: 'up' })],
    updrafts: U_2A,
    course: {
      act: 2,
      thorns: [thorns('vine', 820, 900, 200)],
      benches: [piece('bench-2', 200)],
      parts: [piece('bell-3', 180, 540)],
    },
  }),
  'canopy-2b': canopyRoom('canopy-2b', 1, TRUNK_B, {
    spawns: { default: { x: 180, y: G }, 'from-below': { x: 180, y: G }, 'from-above': { x: 300, y: G } },
    doors: [door('down', 80, { room: 'canopy-2a', spawn: 'from-above' }, { w: 60, way: 'down' }), door('hatch-up', 1420, { room: 'canopy-2c', spawn: 'from-below' }, { top: 540, way: 'up' })],
    updrafts: U_2B,
    course: {
      act: 2,
      pits: [pit(400, ROOM_W)],
      thorns: [thorns('stalk', 780, 810, 0, 500), thorns('curtain', 1000, 1060, 260)],
      feathers: [piece('feather-4', 350, 520)],
    },
  }),
  'canopy-2c': canopyRoom('canopy-2c', 1, TRUNK_C, {
    spawns: { default: { x: 150, y: G }, 'from-below': { x: 150, y: G }, 'from-above': { x: 200, y: G } },
    doors: [door('down', 60, { room: 'canopy-2b', spawn: 'from-above' }, { w: 60, way: 'down' }), door('hatch-up', 1520, { room: 'canopy-3', spawn: 'from-below' }, { top: 540, w: 60, way: 'up' })],
    updrafts: U_2C,
    course: {
      act: 2,
      pits: [pit(300, ROOM_W)],
      thorns: [thorns('stalk-west', 650, 680, 0, 500), thorns('hanging', 850, 880, 280), thorns('stalk-east', 1040, 1110, 0, 400)],
    },
  }),
  'canopy-3': canopyRoom('canopy-3', 4, CROWN, {
    spawns: { default: { x: 150, y: G }, 'from-below': { x: 150, y: G }, 'from-hut': { x: 400, y: G } },
    doors: [door('down', 40, { room: 'canopy-2c', spawn: 'from-above' }, { w: 60, way: 'down' }), door('hut', 6200, { room: 'canopy-hut', spawn: 'from-deck' }, { top: 540, w: 100 })],
    updrafts: U_ACT3,
    course: {
      act: 3,
      pits: [pit(600, 4 * ROOM_W)],
      thorns: [thorns('K1', 2140, 2180, 280), thorns('K2', 2880, 2910, 280), thorns('K3', 3970, 4020, 300), thorns('K4', 4800, 4860, 260)],
      benches: [piece('bench-3', 300), piece('bench-4', 3450, 540)],
      parts: [piece('bell-4', 1440, 540), piece('bell-5', 5930, 520)],
      feathers: [piece('feather-5', 1690, 40)],
    },
  }),
  'canopy-hut': canopyRoom('canopy-hut', 1, HUT, {
    spawns: { default: { x: 240, y: G }, 'from-deck': { x: 240, y: G } },
    doors: [door('out', 80, { room: 'trail-head', spawn: 'from-canopy' }, { w: 60, way: 'down' })],
    course: { act: 3, shrine: piece('shrine', 600) },
  }),
};

export const CANOPY_COURSE: CourseDef = {
  id: CANOPY_COURSE_ID,
  objective: 'bells',
  acts: ['canopy-1', 'canopy-2a', 'canopy-3'],
  rooms: ['canopy-roots', 'canopy-2b', 'canopy-2c', 'canopy-hut'],
  gate: { room: 'trail-head', door: 'canopy-gate', spawn: 'from-gate' },
  exit: { room: 'canopy-hut', door: 'out' },
  // Stand-ins from the catalogue until the Golden Mouse is made (the course's own reward, the owner's ask).
  item: 'leaf-crown~0',
  emote: 'twirl',
  gold: { ms: 105_000, item: 'sparkle~9' },
  floorMs: 40_000,
  keeper: true,
  art: {
    bench: { key: 'kit-clearing-checkpoint-bench', scale: 0.7 },
    part: { key: 'kit-landmark-bell-hanging', lift: 70, scale: 0.6 },
    feather: { key: 'kit-clearing-feather-lost', scale: 0.6 },
    shrine: { key: 'kit-clearing-finish-shrine', scale: 0.9 },
  },
};
