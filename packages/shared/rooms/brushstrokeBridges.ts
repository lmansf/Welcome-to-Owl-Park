/**
 * Brushstroke Bridges (OP-235), the ink-wash realm's course, laid out from docs/levels/brushstroke-bridges.md
 * and drawn from the ink-wash kit. Seen from the side, as the tree is: through the paper garden's ponds
 * (act 1, `brush-1`), across the river in the rain (act 2, `brush-2`, with the cave behind the falls)
 * and up the mountain painted on a hanging scroll, panel by panel (act 3, `brush-3a` and `brush-3b`), to
 * the summit pavilion, where the finish shrine takes the four red seals. Its mechanic is the brush stone
 * (brush.ts): land on one and it paints a bridge or treads of ink the way its arrow points, and the ink
 * fades. In the rain it fades in half the time, unless the stone stands under a temple eave.
 *
 * It is open to every owl (OP-285): its trail gate is the middle arch of the paper Commons in the
 * hollow hall (hollowHall.ts). Not built yet, from the plan: the three
 * shortcuts (the bamboo, the ferry raft and the crane), the painter's lines and the unfinished
 * painting's last stroke, and the misty stair past the pavilion.
 *
 * Every ledge is the plan's: `x` its west end, `w` its width, `top` its height over the ground line,
 * but for the dash gap's far ledge `n3`, 10 px nearer `n2` (350 px) so the route check's counted dash
 * (routes.ts) makes it, still past a glide's best at that rise (345 px, the plan's section 9).
 */
import { RAIN_BRIDGE_MS, brushPerches, type BrushArrow, type BrushStone } from '../src/brush';
import type { CourseDef, CoursePiece, CourseThorns, RoomCourse } from '../src/course';
import { kitPerches, kitRoom } from '../src/kit';
import { ROOM_W, type DoorDef, type KitBackdrop, type KitDecal, type KitLedge, type RoomDef, type RoomKit } from '../src/room';
import { inRealmKit } from '../src/kitSlots';
import { withCourseAir } from './courseAir';

export const BRUSH_COURSE_ID = 'brush';
/** The tree's ground line (TREE_GROUND in rooms/index.ts, which this file cannot import: index.ts imports it). */
export const BRUSH_GROUND = 770;
const G = BRUSH_GROUND;

/** A walk along the ground line. */
function floor(x0: number, x1: number) {
  return [
    { x: x0, y: G - 4 },
    { x: x1, y: G - 4 },
    { x: x1, y: G + 4 },
    { x: x0, y: G + 4 },
  ];
}

/** A ledge of the plan: `x` its west end, `w` its width, `top` its height. */
function ledge(id: string, x: number, w: number, top: number, look: Omit<KitLedge, 'id' | 'x0' | 'x1' | 'top'>): KitLedge {
  return { id, x0: x, x1: x + w, top, ...look };
}

/** The looks of the course's ledges, from the ink-wash kit. */
const STONE = { cap: 'kit-ink-brush-stone' };
/** A dry stone: a plain stone where a brush stone would be, its ink long gone. */
const DRY = { row: 'kit-cut-stone' };
const ROCK = { row: 'kit-cut-stone' };
const CLIFF = { cap: 'kit-ink-paper-cliff' };
const REED = { cap: 'kit-ink-reed-tuft' };
const PINE = { cap: 'kit-ink-pine-bough' };
const PLANK = { row: 'kit-cut-plank-thin' };
/**
 * A rock that stands up out of the water: its head, and stone down to the ground line. Like every ledge
 * of a room seen from the side it is jumped up through, not a wall: a wall on the ground line's thin
 * floor would cut the floor in two.
 */
const pillar = (top: number) => ({ cap: 'kit-ink-rock-pillar', mid: 'kit-tex-ink-ink-stone', depth: top });
/** A terrace of planks, down to the ground line. */
const terrace = (top: number) => ({ row: 'kit-cut-plank', mid: 'kit-tex-planks', depth: top });

/** A brush stone: its ledge, and the stone itself (what it paints and for how long). */
function stone(id: string, x: number, w: number, top: number, arrow: BrushArrow, ms?: number): { ledge: KitLedge; stone: BrushStone } {
  return { ledge: ledge(id, x, w, top, STONE), stone: { id, x0: x, x1: x + w, top, arrow, ...(ms ? { ms } : {}) } };
}

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

/** A hazard in the air over `x0` to `x1`, from `z0` up (z 940: higher than an owl may be): the waterfall, a cloud bank. */
function hazard(id: string, x0: number, x1: number, z0: number, look: NonNullable<CourseThorns['look']>, z1 = 940): CourseThorns {
  return { id, x0, x1, z0, z1, look };
}

/** Ink-wash water over a stretch of the ground line, half see-through so the floor still reads: the game marks the hazard. */
function water(x0: number, x1: number, step = 320): KitDecal[] {
  const out: KitDecal[] = [];
  for (let x = x0 + step / 2, i = 0; x < x1; x += step, i++) out.push({ piece: i % 3 === 1 ? 'kit-ink-lotus-pads' : 'kit-ink-pond-edge', x, y: G - 20, alpha: 0.45, ...(i % 2 ? { flip: true } : {}) });
  return out;
}

const layer = (key: string, rate: number, screens: readonly [number, number], fade?: KitBackdrop['fade']): KitBackdrop => ({ key, rate, screens, ...(fade ? { fade } : {}) });
const EDGE_FADE = 230;

/**
 * The ink-wash realm's air, screen by screen: the clouded sky drifting slowest, the far hills in turn
 * standing with the screen (the layer the room's own tiles paint), and the scroll's mountains between
 * them. Every sky is drawn first, then every far layer, then every middle one, so a neighbouring screen's
 * layer never draws over a nearer one. The clouded sky is the one whose rim stays under the walkway's,
 * and the mountains (mid-a) the one middle layer that hides its blue-grey clouds enough to keep the
 * palette (tools/kit preview.py --check). The mountains fade where they meet the next screen's, not at
 * the room's own ends, where none drifts in over the fade.
 */
function inkAir(screens: number): KitBackdrop[] {
  const at = Array.from({ length: screens }, (_, s) => s);
  const fade = (s: number) => ({ ...(s > 0 ? { left: EDGE_FADE } : {}), ...(s < screens - 1 ? { right: EDGE_FADE } : {}) });
  return [
    ...at.map((s) => layer('kit-ink-sky-b', 0.5, [s, s])),
    ...at.map((s) => layer(s % 2 ? 'kit-ink-far-b' : 'kit-ink-far-a', 1, [s, s])),
    ...at.map((s) => layer('kit-ink-mid-a', 0.75, [s, s], fade(s))),
  ];
}

const COURSE_ROOM = { map: 2 as const, owlScale: 1.25, mood: 'dusk' as const };

function brushRoom(
  id: string,
  screens: number,
  kit: RoomKit,
  rest: Pick<RoomDef, 'spawns' | 'doors'> & { course: Omit<RoomCourse, 'id'>; stones?: BrushStone[]; spawnTops?: Record<string, number>; weather?: 'rain' },
): RoomDef {
  const w = screens * ROOM_W;
  const stones = rest.stones ?? [];
  return kitRoom({
    id,
    ...COURSE_ROOM,
    size: { w, h: 900 },
    walkable: [floor(8, w - 8)],
    perches: [...kitPerches(kit), ...brushPerches(stones, G)],
    spawns: rest.spawns,
    ...(rest.spawnTops ? { spawnTops: rest.spawnTops } : {}),
    doors: rest.doors,
    course: { id: BRUSH_COURSE_ID, ...rest.course },
    ...(stones.length ? { brushStones: stones } : {}),
    ...(rest.weather ? { weather: rest.weather } : {}),
    kit,
  });
}

/**
 * The ground line's walk, drawn: a path along the whole room over ink-washed stone, the water over its
 * hazards laid on as decals. Up the mountain (act 3) the path is mossy stone.
 */
const groundPath = (w: number, row = 'kit-cut-earth-path') => ({ id: 'ground', x0: 0, x1: w, top: 0, row, mid: 'kit-tex-ink-ink-stone' });
const MOUNTAIN_PATH = 'kit-cut-stone-mossy';

// ---------- Act 1: the paper garden ----------

const S1 = [stone('k1', 480, 140, 100, 'R'), stone('k2', 1700, 140, 140, 'R'), stone('k3', 2360, 140, 120, 'R'), stone('k4', 4100, 160, 100, 'U')];

const GARDEN: RoomKit = {
  ground: G,
  backdrops: inkAir(3),
  paths: [groundPath(3 * ROOM_W)],
  ledges: [
    ledge('g1', 300, 120, 70, ROCK),
    ...S1.map((s) => s.ledge),
    ledge('reed1', 1060, 80, 450, REED),
    ledge('c1', 1260, 340, 400, CLIFF),
    ledge('crane-rock', 2050, 160, 40, ROCK),
    ledge('reed2', 2000, 80, 250, REED),
    ledge('c2', 3100, 300, 420, CLIFF),
    ledge('c3', 4540, 260, 540, PINE),
    ledge('t1', 4300, 500, 160, terrace(160)),
  ],
  doors: [
    { door: 'to-commons', piece: 'kit-ink-door-paper-open', scale: 0.7 },
    { door: 'to-rain', piece: 'kit-ink-moon-gate', scale: 0.6 },
  ],
  props: [
    { id: 'gate-lantern', piece: 'kit-ink-stone-lantern', x: 180, top: 0, scale: 0.7 },
    { id: 'crane', piece: 'kit-landmark-crane-paper', x: 2130, top: 40, scale: 0.55 },
    { id: 'easel', piece: 'kit-ink-easel-blank', x: 4420, top: 160, scale: 0.6 },
    { id: 'tea', piece: 'kit-ink-tea-stall', x: 4580, top: 160, scale: 0.55 },
  ],
  scenes: [
    { id: 'gate', story: 'A stone lantern lights the paper door back to the Commons, where the garden path begins.', props: ['gate-lantern'], about: ['to-commons'] },
    { id: 'crane', story: 'A paper crane sleeps on a rock in the middle of the pond, its head tucked under a wing.', props: ['crane'], about: ['crane-rock'] },
    { id: 'painting', story: 'On the tea terrace an easel holds an ink painting of this very garden, one stroke short of finished.', props: ['easel', 'tea'], about: ['t1'] },
  ],
  decals: water(700, 4300),
};

// ---------- Act 2: the washing rain ----------

const S2 = [
  stone('k6', 560, 120, 90, 'R', RAIN_BRIDGE_MS),
  // Under the temple eaves: sheltered from the rain, their ink keeps its four seconds.
  stone('k7', 1500, 120, 120, 'R'),
  stone('k8', 2240, 120, 40, 'R'),
  stone('k9', 3260, 120, 200, 'R', RAIN_BRIDGE_MS),
  stone('k10', 4040, 120, 540, 'R', RAIN_BRIDGE_MS),
  stone('kE', 4440, 120, 60, 'U', RAIN_BRIDGE_MS),
];

const RIVER: RoomKit = {
  ground: G,
  backdrops: inkAir(3),
  paths: [groundPath(3 * ROOM_W)],
  ledges: [
    ...S2.map((s) => s.ledge),
    ledge('r1', 1280, 140, 390, pillar(390)),
    ledge('porch', 2100, 100, 60, PLANK),
    ledge('post', 2960, 60, 380, pillar(380)),
    ledge('r2', 3060, 140, 260, pillar(260)),
    ledge('falls-ledge', 4180, 180, 540, ROCK),
  ],
  doors: [
    { door: 'back', piece: 'kit-ink-moon-gate', scale: 0.6 },
    { door: 'falls', piece: 'kit-ink-waterfall-curtain', scale: 0.5 },
    { door: 'to-mountain', piece: 'kit-ink-door-paper-open', scale: 0.7 },
  ],
  props: [
    { id: 'dock-lantern', piece: 'kit-ink-paper-lantern', x: 340, top: 0, scale: 0.7 },
    { id: 'heron', piece: 'kit-landmark-heron-ink', x: 2150, top: 60, scale: 0.5 },
  ],
  scenes: [
    { id: 'west-dock', story: 'A paper lantern burns on the west dock for travellers waiting out the rain.', props: ['dock-lantern'], about: ['back'] },
    { id: 'porch', story: 'Under the temple eave a grey heron in a straw hat waits out the rain on the one dry step.', props: ['heron'], about: ['porch'] },
  ],
  decals: [
    ...water(500, 4400),
    // The temple across the river: its eaves keep the rain off the stones under them, painted far behind, never stood on.
    { piece: 'kit-ink-temple-eave', x: 1560, y: G - 330, alpha: 0.7 },
    { piece: 'kit-ink-eave-shelter', x: 2260, y: G - 260, alpha: 0.7 },
    // The waterfall from the cliff top to the river, with the dry band behind it where the ledge runs.
    { piece: 'kit-ink-waterfall-curtain', x: 4270, y: G - 640, alpha: 0.85 },
    { piece: 'kit-ink-waterfall-curtain', x: 4270, y: G - 220, alpha: 0.85 },
  ],
};

const FALLS_CAVE: RoomKit = {
  ground: G,
  backdrops: [layer('kit-ink-sky-b', 1, [0, 0])],
  surfaces: [{ id: 'cave', texture: 'kit-tex-ink-ink-stone', rect: { x: 0, y: 0, w: ROOM_W, h: G } }],
  paths: [groundPath(ROOM_W, MOUNTAIN_PATH)],
  ledges: [ledge('seal-shelf', 700, 200, 200, ROCK), ledge('high-shelf', 1150, 160, 380, ROCK)],
  doors: [{ door: 'out', piece: 'kit-ink-waterfall-curtain', scale: 0.5 }],
  props: [{ id: 'tower-scroll', piece: 'kit-landmark-scroll-tower', x: 1000, top: 0, scale: 0.6 }],
  scenes: [{ id: 'scroll', story: 'Hung on the cave wall, dry behind the falls, a scroll shows a tall tower of coloured glass, painted in ink.', props: ['tower-scroll'] }],
};

// ---------- Act 3: the mountain scroll ----------

const S3A = [stone('k11', 420, 120, 100, 'R'), stone('k12', 1060, 120, 150, 'L'), stone('k13', 440, 120, 150, 'U'), stone('k14', 1200, 120, 60, 'R'), stone('k15', 2080, 120, 260, 'R')];

const PANEL_1: RoomKit = {
  ground: G,
  backdrops: inkAir(2),
  paths: [groundPath(2 * ROOM_W, MOUNTAIN_PATH)],
  ledges: [
    ...S3A.map((s) => s.ledge),
    ledge('pine', 40, 100, 540, PINE),
    ledge('m1', 640, 200, 520, ROCK),
    ledge('m2', 1900, 160, 260, ROCK),
    ledge('m3', 2870, 150, 540, pillar(540)),
    ledge('m4', 3040, 160, 520, CLIFF),
  ],
  doors: [
    { door: 'back', piece: 'kit-ink-door-paper-open', scale: 0.6 },
    { door: 'fold', piece: 'kit-ink-door-paper-open', scale: 0.6 },
  ],
  props: [{ id: 'foot-lantern', piece: 'kit-ink-stone-lantern', x: 300, top: 0, scale: 0.5 }],
  scenes: [{ id: 'foot', story: "A stone lantern marks the mountain's foot, where the scroll's first panel begins.", props: ['foot-lantern'], about: ['back'] }],
  decals: water(400, 2 * ROOM_W),
};

const S3B = [stone('k16', 360, 160, 110, 'U'), stone('k18', 1000, 120, 60, 'R')];

const PANEL_2: RoomKit = {
  ground: G,
  backdrops: inkAir(2),
  paths: [groundPath(2 * ROOM_W, MOUNTAIN_PATH)],
  ledges: [...S3B.map((s) => s.ledge), ledge('n1', 620, 200, 520, ROCK), ledge('n2', 1700, 160, 200, DRY), ledge('n3', 2210, 200, 540, CLIFF), ledge('n4', 2610, 590, 540, terrace(540))],
  doors: [
    { door: 'back', piece: 'kit-ink-door-paper-open', scale: 0.7 },
    { door: 'home', piece: 'kit-ink-moon-gate', scale: 0.5 },
  ],
  props: [{ id: 'summit-lantern', piece: 'kit-ink-paper-lantern', x: 2700, top: 540, scale: 0.6 }],
  scenes: [{ id: 'pavilion', story: "A paper lantern hangs by the pavilion's moon gate, the way home down the mountain.", props: ['summit-lantern'], about: ['home'] }],
  decals: water(300, 2 * ROOM_W),
};

export const BRUSH_ROOMS: Record<string, RoomDef> = inRealmKit('ink', withCourseAir('ink', {
  'brush-1': brushRoom('brush-1', 3, GARDEN, {
    spawns: { default: { x: 120, y: G }, 'from-gate': { x: 120, y: G }, 'from-rain': { x: 4620, y: G } },
    spawnTops: { 'from-rain': 160 },
    doors: [door('to-commons', 40, { room: 'commons-ink', spawn: 'from-course' }, { way: 'down' }), door('to-rain', 4720, { room: 'brush-2', spawn: 'from-back' }, { top: 160, way: 'up' })],
    stones: S1.map((s) => s.stone),
    course: {
      act: 1,
      pits: [floor(700, 4300)],
      benches: [piece('bench-1', 1500, 400)],
      parts: [piece('seal-1', 4670, 540)],
      feathers: [piece('feather-1', 1100, 450), piece('feather-2', 2040, 250)],
    },
  }),
  'brush-2': brushRoom('brush-2', 3, RIVER, {
    spawns: { default: { x: 120, y: G }, 'from-back': { x: 120, y: G }, 'from-falls': { x: 4300, y: G }, 'from-mountain': { x: 4660, y: G } },
    spawnTops: { 'from-falls': 540 },
    doors: [
      door('back', 40, { room: 'brush-1', spawn: 'from-rain' }, { way: 'down' }),
      door('falls', 4260, { room: 'brush-falls', spawn: 'from-falls' }, { top: 540, w: 60 }),
      door('to-mountain', 4740, { room: 'brush-3a', spawn: 'from-back' }, { w: 60, way: 'up' }),
    ],
    stones: S2.map((s) => s.stone),
    weather: 'rain',
    course: {
      act: 2,
      pits: [floor(500, 4400)],
      thorns: [hazard('falls-low', 4180, 4360, 0, 'falls', 430), hazard('falls-high', 4180, 4360, 600, 'falls')],
      benches: [piece('bench-2', 200)],
      feathers: [piece('feather-4', 2990, 380)],
    },
  }),
  'brush-falls': brushRoom('brush-falls', 1, FALLS_CAVE, {
    spawns: { default: { x: 220, y: G }, 'from-falls': { x: 220, y: G } },
    doors: [door('out', 100, { room: 'brush-2', spawn: 'from-falls' }, { w: 60, way: 'down' })],
    course: { act: 2, parts: [piece('seal-2', 800, 200)], feathers: [piece('feather-3', 1230, 380)] },
  }),
  'brush-3a': brushRoom('brush-3a', 2, PANEL_1, {
    spawns: { default: { x: 120, y: G }, 'from-back': { x: 120, y: G }, 'from-fold': { x: 3060, y: G } },
    spawnTops: { 'from-fold': 520 },
    doors: [door('back', 40, { room: 'brush-2', spawn: 'from-mountain' }, { way: 'down' }), door('fold', 3140, { room: 'brush-3b', spawn: 'from-back' }, { top: 520, w: 60, way: 'up' })],
    stones: S3A.map((s) => s.stone),
    course: {
      act: 3,
      pits: [floor(400, 2 * ROOM_W)],
      thorns: [hazard('cloud', 1450, 1750, 100, 'mist')],
      benches: [piece('bench-3', 200)],
      feathers: [piece('feather-5', 90, 540)],
    },
  }),
  'brush-3b': brushRoom('brush-3b', 2, PANEL_2, {
    spawns: { default: { x: 120, y: G }, 'from-back': { x: 120, y: G } },
    doors: [door('back', 40, { room: 'brush-3a', spawn: 'from-fold' }, { way: 'down' }), door('home', 2700, { room: 'commons-ink', spawn: 'from-course' }, { top: 540, w: 80, way: 'down' })],
    stones: S3B.map((s) => s.stone),
    course: {
      act: 3,
      pits: [floor(300, 2 * ROOM_W)],
      thorns: [hazard('cloud', 1150, 1500, 100, 'mist')],
      benches: [piece('bench-4', 780, 520)],
      parts: [piece('seal-3', 680, 520), piece('seal-4', 2310, 540)],
      shrine: piece('shrine', 3050, 540),
    },
  }),
}));

export const BRUSH_COURSE: CourseDef = inRealmKit('ink', {
  id: BRUSH_COURSE_ID,
  objective: 'seals',
  acts: ['brush-1', 'brush-2', 'brush-3a'],
  rooms: ['brush-falls', 'brush-3b'],
  gate: { room: 'commons-ink', door: 'to-course', spawn: 'from-gate' },
  exit: { room: 'brush-3b', door: 'home' },
  // Stand-ins from the catalogue until the ink-wash scarf is made; clearing every course pays the Golden Mouse (coursebook.ts).
  item: 'knit-scarf~3',
  emote: 'preen',
  gold: { ms: 115_000, item: 'sparkle~4' },
  floorMs: 45_000,
  art: {
    bench: { key: 'kit-ink-checkpoint-bench', scale: 0.6 },
    part: { key: 'kit-ink-seal-red', lift: 20, scale: 0.5 },
    feather: { key: 'kit-ink-feather-lost', scale: 0.6 },
    shrine: { key: 'kit-ink-finish-shrine', scale: 0.6 },
  },
});
