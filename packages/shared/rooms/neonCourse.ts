/**
 * The neon realm's course, laid out from docs/levels/neon-course.md and drawn from the neon kit. Seen
 * from the side, as the tree is: across the rooftops of the neon city at night (act 1, `circuit-1`),
 * through a block where the power is out (act 2, `circuit-2`) and up the tallest roof to its antenna
 * (act 3, `circuit-3`), where the finish shrine takes the run once the three breakers are on. Its
 * mechanic is the neon sign on a circuit (circuit.ts): the signs are wired on two circuits that take
 * turns, and a sign is stood on only while it is lit. In the power cut the circuits stutter faster,
 * and live wires hang over the street, under the signs and above them, so the signs are the way across.
 *
 * It is open to every owl (OP-285): its trail gate is the middle arch of the neon Commons in the
 * hollow hall (hollowHall.ts). Every ledge is the plan's: `x` its west end,
 * `w` its width, `top` its height over the ground line. The ground line is the roofs' own deck; where
 * it stops, between two buildings, is the drop to the street, a fall.
 */
import { HALL_ID, courseDoor, fromCourse } from './hollowHall';
import { BROWNOUT_PACE, neonSign, signPerches, type Circuit, type CircuitPace, type NeonSign } from '../src/circuit';
import type { CourseDef, CoursePiece, CourseThorns, RoomCourse } from '../src/course';
import { kitPerches, kitRoom } from '../src/kit';
import { ROOM_W, type DoorDef, type KitBackdrop, type KitDecal, type KitLedge, type RoomDef, type RoomKit } from '../src/room';
import { inRealmKit } from '../src/kitSlots';
import { withCourseAir } from './courseAir';

export const CIRCUIT_COURSE_ID = 'circuit';
/** The tree's ground line (TREE_GROUND in rooms/index.ts, which this file cannot import: index.ts imports it). */
export const CIRCUIT_GROUND = 770;
const G = CIRCUIT_GROUND;

/** A walk along the ground line. */
function floor(x0: number, x1: number) {
  return [
    { x: x0, y: G - 4 },
    { x: x1, y: G - 4 },
    { x: x1, y: G + 4 },
    { x: x0, y: G + 4 },
  ];
}

/** How far below the roof decks the street lies, as far as the room shows (room px). */
const STREET_SUNK = 70;

/** A ledge of the plan: `x` its west end, `w` its width, `top` its height. */
function ledge(id: string, x: number, w: number, top: number, look: Omit<KitLedge, 'id' | 'x0' | 'x1' | 'top'>): KitLedge {
  return { id, x0: x, x1: x + w, top, ...look };
}

/**
 * A building whose roof is a ledge: its parapet, and brick down to the ground line, or for one that
 * stands in a drop (`street`), down to the street. Like every ledge of a room seen from the side it is
 * jumped up through, not a wall.
 */
const roof = (top: number, street = false) => ({ cap: 'kit-neon-rooftop-ledge', mid: 'kit-tex-high-silvered-planks', depth: top + (street ? STREET_SUNK : 0) });
/** A footbridge strung between towers, over the street. */
const FOOTBRIDGE = { cap: 'kit-neon-sky-bridge-mid' };
/** A billboard on its legs: stood on along its top. */
const BILLBOARD = { cap: 'kit-neon-billboard-blank' };
/** An air unit on the roof deck: a box to hop up on. */
const AIR_UNIT = { cap: 'kit-neon-air-unit' };

/** A sign of the plan on a circuit: `x` its west end, `w` its width, `top` its height. */
function sign(id: string, x: number, w: number, top: number, circuit: Circuit, pace?: CircuitPace): NeonSign {
  return neonSign(id, x, x + w, top, circuit, pace);
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

/** Live wires over `x0` to `x1`, from `z0` up to `z1` over the ground line: a fall to touch. */
function wires(id: string, x0: number, x1: number, z0: number, z1 = 940): CourseThorns {
  return { id, x0, x1, z0, z1, look: 'wires' };
}

/** The roof deck along the ground line from `x0` to `x1`, its edge stone over brick. */
const deck = (id: string, x0: number, x1: number) => ({ id, x0, x1, top: 0, row: 'kit-cut-stone', mid: 'kit-tex-neon-corrugated-tin' });
/**
 * The drop between two buildings, from `x0` to `x1`, the course's pit (OP-343): no deck over it, the
 * night between the walls, and the wet street far below with nothing to stand on.
 */
const drop = (id: string, x0: number, x1: number) => ({ id, x0, x1, top: 0, mid: 'kit-tex-neon-corrugated-tin', sunk: STREET_SUNK, shade: 0x4a4470 });

/** Live neon tubes standing up out of the street between two buildings, too close together to land among, their tops over the line of the decks: the drop is a fall. */
function tubes(x0: number, x1: number, step = 140): KitDecal[] {
  const out: KitDecal[] = [];
  for (let x = x0 + step / 2, i = 0; x < x1; x += step, i++) out.push({ piece: 'kit-neon-neon-tube-hazard', x, y: G + STREET_SUNK - 74, scale: 0.7, ...(i % 2 ? { flip: true } : {}) });
  return out;
}

const layer = (key: string, rate: number, screens: readonly [number, number], fade?: KitBackdrop['fade']): KitBackdrop => ({ key, rate, screens, ...(fade ? { fade } : {}) });
const EDGE_FADE = 230;

/**
 * The neon city's night, screen by screen: the one violet sky drifting slowest, the far towers in turn standing
 * with the screen (the layer the room's own tiles paint), and the nearer blocks between them. Every sky
 * is drawn first, then every far layer, then every middle one, so a neighbouring screen's layer never
 * draws over a nearer one (as the ink-wash course's air, brushstrokeBridges.ts).
 */
function cityAir(screens: number): KitBackdrop[] {
  const at = Array.from({ length: screens }, (_, s) => s);
  const fade = (s: number) => ({ ...(s > 0 ? { left: EDGE_FADE } : {}), ...(s < screens - 1 ? { right: EDGE_FADE } : {}) });
  return [
    ...at.map((s) => layer('kit-neon-sky-a', 0.5, [s, s])),
    ...at.map((s) => layer(s % 2 ? 'kit-neon-far-b' : 'kit-neon-far-a', 1, [s, s])),
    ...at.map((s) => layer(s % 2 ? 'kit-neon-mid-b' : 'kit-neon-mid-c', 0.75, [s, s], fade(s))),
  ];
}

const COURSE_ROOM = { map: 2 as const, owlScale: 1.25, mood: 'neon' as const };

function circuitRoom(id: string, screens: number, kit: RoomKit, rest: Pick<RoomDef, 'spawns' | 'doors'> & { course: Omit<RoomCourse, 'id'>; signs: NeonSign[]; spawnTops?: Record<string, number> }): RoomDef {
  const w = screens * ROOM_W;
  return kitRoom({
    id,
    ...COURSE_ROOM,
    size: { w, h: 900 },
    walkable: [floor(8, w - 8)],
    perches: [...kitPerches(kit), ...signPerches(rest.signs, G)],
    spawns: rest.spawns,
    ...(rest.spawnTops ? { spawnTops: rest.spawnTops } : {}),
    doors: rest.doors,
    course: { id: CIRCUIT_COURSE_ID, ...rest.course },
    neonSigns: rest.signs,
    kit,
  });
}

// ---------- Act 1: the rooftops ----------

const SIGNS_1 = [sign('s1', 700, 180, 230, 'a'), sign('s2', 3000, 180, 200, 'a'), sign('s3', 3300, 180, 380, 'b')];

const ROOFTOPS: RoomKit = {
  ground: G,
  backdrops: cityAir(3),
  paths: [deck('deck-a', 0, 1400), drop('street', 1400, 2700), deck('deck-b', 2700, 3 * ROOM_W)],
  ledges: [
    ledge('ac1', 300, 200, 120, AIR_UNIT),
    ledge('b1', 1000, 400, 420, roof(420)),
    ledge('bridge1', 1900, 240, 300, FOOTBRIDGE),
    ledge('b2', 3620, 360, 540, roof(540)),
    ledge('board1', 4200, 200, 400, BILLBOARD),
  ],
  doors: [
    { door: 'to-commons', piece: 'kit-neon-rooftop-door-open', scale: 0.7 },
    { door: 'to-cut', piece: 'kit-neon-rooftop-door-open', scale: 0.7 },
  ],
  props: [
    { id: 'vending', piece: 'kit-neon-vending-machine', x: 200, top: 0, scale: 0.6 },
    { id: 'coop', piece: 'kit-neon-pigeon-coop', x: 1300, top: 420, scale: 0.55 },
    { id: 'noodles', piece: 'kit-neon-noodle-stall', x: 4520, top: 0, scale: 0.55 },
  ],
  scenes: [
    { id: 'gate', story: 'A vending machine hums beside the rooftop door back down to the Commons, where the run over the roofs begins.', props: ['vending'], about: ['to-commons'] },
    { id: 'coop', story: 'On the high roof a pigeon coop faces the street, its pigeons watching the signs blink on and off.', props: ['coop'], about: ['b1'] },
    { id: 'noodles', story: 'A noodle stall on the far roof keeps its lanterns lit on its own battery, by the door to the dark block.', props: ['noodles'], about: ['to-cut'] },
  ],
  decals: tubes(1400, 2700),
};

// ---------- Act 2: the power cut ----------

const SIGNS_2 = [
  sign('s4', 450, 160, 220, 'a', BROWNOUT_PACE),
  sign('s5', 1350, 160, 470, 'b', BROWNOUT_PACE),
  sign('s6', 1750, 160, 500, 'a', BROWNOUT_PACE),
  sign('s7', 2550, 160, 200, 'a', BROWNOUT_PACE),
  sign('s8', 2850, 160, 380, 'b', BROWNOUT_PACE),
];

const POWER_CUT: RoomKit = {
  ground: G,
  backdrops: cityAir(3),
  paths: [deck('deck-a', 0, 600), drop('street-1', 600, 2300), deck('deck-b', 2300, 2700), drop('street-2', 2700, 4300), deck('deck-c', 4300, 3 * ROOM_W)],
  ledges: [
    ledge('r1', 800, 300, 420, roof(420, true)),
    ledge('r2', 2050, 250, 540, roof(540, true)),
    ledge('bridge2', 2750, 160, 100, FOOTBRIDGE),
    ledge('r3', 3500, 260, 540, roof(540, true)),
    ledge('board2', 4500, 200, 480, BILLBOARD),
  ],
  doors: [
    { door: 'back', piece: 'kit-neon-rooftop-door-open', scale: 0.7 },
    { door: 'to-mast', piece: 'kit-neon-rooftop-door-open', scale: 0.7 },
  ],
  props: [
    { id: 'tank', piece: 'kit-neon-water-tank', x: 950, top: 420, scale: 0.6 },
    { id: 'dish', piece: 'kit-neon-satellite-dish', x: 3630, top: 540, scale: 0.6 },
  ],
  scenes: [
    { id: 'tank', story: 'The water tank on the first dark roof, its little lantern the only light left on the block.', props: ['tank'], about: ['r1'] },
    { id: 'dish', story: 'A satellite dish on the tall roof still points at the sky, though nothing in the block has power to watch it.', props: ['dish'], about: ['r3'] },
  ],
  decals: [...tubes(600, 2300), ...tubes(2700, 4300)],
};

// ---------- Act 3: the antenna ----------

const SIGNS_3 = [sign('s9', 500, 160, 180, 'a'), sign('s10', 1250, 160, 470, 'b'), sign('s11', 1600, 160, 520, 'a'), sign('s12', 1950, 160, 540, 'b')];

const ANTENNA: RoomKit = {
  ground: G,
  backdrops: cityAir(2),
  paths: [deck('deck-a', 0, 700), drop('street', 700, 2 * ROOM_W)],
  ledges: [
    ledge('m1', 800, 200, 380, roof(380, true)),
    ledge('board3', 1500, 200, 260, BILLBOARD),
    ledge('m2', 2250, 120, 540, roof(540, true)),
    ledge('summit', 2600, 600, 540, roof(540, true)),
  ],
  doors: [
    { door: 'back', piece: 'kit-neon-rooftop-door-open', scale: 0.7 },
    { door: 'home', piece: 'kit-neon-rooftop-door-open', scale: 0.6 },
  ],
  props: [{ id: 'antenna', piece: 'kit-neon-antenna-mast', x: 3140, top: 540, scale: 0.7 }],
  scenes: [{ id: 'summit', story: "The antenna on the city's tallest roof blinks red over the shrine, and the rooftop door beside it leads home.", props: ['antenna'], about: ['home'] }],
  decals: tubes(700, 2600),
};

export const CIRCUIT_ROOMS: Record<string, RoomDef> = inRealmKit('neon', withCourseAir('neon', {
  'circuit-1': circuitRoom('circuit-1', 3, ROOFTOPS, {
    spawns: { default: { x: 120, y: G }, 'from-gate': { x: 120, y: G }, 'from-cut': { x: 4640, y: G } },
    doors: [door('to-commons', 40, { room: HALL_ID, spawn: fromCourse('market') }, { way: 'down' }), door('to-cut', 4740, { room: 'circuit-2', spawn: 'from-back' }, { way: 'up' })],
    signs: SIGNS_1,
    course: {
      act: 1,
      pits: [floor(1400, 2700)],
      benches: [piece('bench-1', 1150, 420)],
      parts: [piece('breaker-1', 3800, 540)],
      feathers: [piece('feather-1', 2020, 300), piece('feather-2', 4300, 400)],
    },
  }),
  'circuit-2': circuitRoom('circuit-2', 3, POWER_CUT, {
    spawns: { default: { x: 120, y: G }, 'from-back': { x: 120, y: G }, 'from-mast': { x: 4640, y: G } },
    doors: [door('back', 40, { room: 'circuit-1', spawn: 'from-cut' }, { way: 'down' }), door('to-mast', 4740, { room: 'circuit-3', spawn: 'from-back' }, { way: 'up' })],
    signs: SIGNS_2,
    course: {
      act: 2,
      pits: [floor(600, 2300), floor(2700, 4300)],
      // The street's live wires under the signs over the dark block, and more strung above them: a single jump between the signs, not a glide over.
      thorns: [wires('wires-low', 1110, 2040, 0, 420), wires('wires-high', 1110, 2040, 680)],
      benches: [piece('bench-2', 200), piece('bench-3', 2500)],
      parts: [piece('breaker-2', 2180, 540)],
      feathers: [piece('feather-3', 2830, 100), piece('feather-4', 4600, 480)],
    },
  }),
  'circuit-3': circuitRoom('circuit-3', 2, ANTENNA, {
    spawns: { default: { x: 120, y: G }, 'from-back': { x: 120, y: G } },
    doors: [door('back', 40, { room: 'circuit-2', spawn: 'from-mast' }, { way: 'down' }), door('home', 2800, { room: HALL_ID, spawn: fromCourse('market') }, { top: 540, way: 'down' })],
    signs: SIGNS_3,
    course: {
      act: 3,
      pits: [floor(700, 2 * ROOM_W)],
      // Sparks off the antenna's guy wires, over the climb: the signs are taken one at a time, not glided past.
      thorns: [wires('sparks', 1170, 2240, 700)],
      // A second bench up on the first roof, by its breaker (OP-343): a fall from the signs beyond it
      // comes back here, where before it cost the whole climb from the deck.
      benches: [piece('bench-4', 250), piece('bench-5', 840, 380)],
      parts: [piece('breaker-3', 900, 380)],
      feathers: [piece('feather-5', 1600, 260)],
      shrine: piece('shrine', 3000, 540),
    },
  }),
}));

export const CIRCUIT_COURSE: CourseDef = inRealmKit('neon', {
  id: CIRCUIT_COURSE_ID,
  objective: 'breakers',
  acts: ['circuit-1', 'circuit-2', 'circuit-3'],
  gate: { room: HALL_ID, door: courseDoor('market'), spawn: 'from-gate' },
  exit: { room: 'circuit-3', door: 'home' },
  // Stand-ins from the catalogue until the neon realm's own reward is made.
  item: 'bandana~3',
  emote: 'flip',
  gold: { ms: 100_000, item: 'sparkle~4' },
  floorMs: 35_000,
  art: {
    bench: { key: 'kit-neon-checkpoint-bench', scale: 0.55 },
    feather: { key: 'kit-neon-feather-lost', scale: 0.6 },
    shrine: { key: 'kit-neon-finish-shrine', scale: 0.6 },
  },
});
