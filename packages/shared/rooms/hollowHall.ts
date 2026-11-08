/**
 * The Great Hollow (Nov 7, the owner's word: "this room is supposed to be top down with all the commons
 * like one super server room"; Nov 8: "can we go more top down, like almost completely top down, but
 * offset in this room, and make it a huge oval with realms kind of all the way around"): the inside of
 * the tree as one huge oval floor seen from almost straight above, its four Commons round the rim.
 *
 * Every way out stands on the rim, a step apart (src/hollowOval.ts, HALL_WAYS): clockwise from the
 * knothole up to the Treetop Commons at the back, the treehouse clearing's doorway and its course's
 * gate, the neon street's, the trunk's door out to the Party Grove and the hatch down to the arcade at
 * the front, the ink-wash realm's course gate and its doorway (shut till the realm is built), and the
 * glass realm's. Each Commons' idol stands on its base between its two ways, over its Realm Vote spot,
 * and its plaza, where its moonbeam falls, lies out toward the middle. Every open way has a sign on the
 * floor in front of it naming where it leads, so a ten year old finds the Party Grove without a map.
 *
 * The root runs (OP-308) cross the middle, where the oval is widest. The floor is built from the art
 * kit's textures until the hollow is painted (a file swap: the size list has each piece's size); the
 * scene draws the wall round it with height (RoomDef.bowl), so it reads as a room and not a painting.
 */
import {
  ringAt,
  rimAt,
  rimNormal,
  angleAt,
  floorInset,
  HALL_CX,
  HALL_CY,
  HALL_H,
  HALL_RX,
  HALL_RY,
  HALL_W,
  HALL_HEART,
  HALL_LEAVES,
  HALL_MOONBEAMS,
  HALL_WAYS,
  RIM_LENGTH,
  RUN_Y,
  WALL_FACE,
  WALL_LIP,
  WAY_STEP,
  commonsS,
  idolAt,
  voteAt,
  wayAt,
  wayS,
  type HallLevel,
  type HallWay,
} from '../src/hollowOval';
import type { EdgePlacement } from '../src/edges';
import type { Polygon } from '../src/geometry';
import type { Perch } from '../src/perches';
import type { Vec2 } from '../src/protocol';
import type { DoorDef, RoomBowl, RoomDef, RoomKit, RoomPiece } from '../src/room';
import { KIT_ART } from '../src/kitArt';

export {
  HALL_CX,
  HALL_CY,
  HALL_H,
  HALL_MIDDLE,
  HALL_RX,
  HALL_RY,
  HALL_W,
  OWL_ROOM_PX2,
  RUN_Y,
  commonsS,
  idolAt,
  plazaAt,
  voteAt,
  wayAt,
  wayS,
  type HallLevel,
  type HallWay,
} from '../src/hollowOval';

export const HALL_ID = 'm3-hall';

/** What a Commons opens on: its realm (closed while the realm has no room) and its parkour course. */
export interface CommonsOf {
  level: HallLevel;
  /** Its realm's room and spawn, or none yet (a "Hatching Soon" blockade). */
  realm?: { room: string; spawn: string };
  /** Its course's first room and spawn, or none yet (a "Not Yet Fledged" blockade). */
  course?: { room: string; spawn: string };
  /** The realm its idol takes the Realm Vote for, where it has one. */
  votesFor?: 'glass' | 'grove' | 'market';
  /** What the signs at its two open doorways say: its realm's public name, and its course's name. */
  realmName?: string;
  courseName?: string;
  /** The doorway's art (a kit piece), and its realm's colour, pooled softly on the floor by its ways. */
  door: string;
  colour: number;
}

/** The Commons, clockwise round the rim from the back: the clearing's, the neon street's, the ink-wash realm's and the glass realm's. */
export const HALL_COMMONS: readonly CommonsOf[] = [
  {
    level: 'grove',
    realm: { room: 'grove', spawn: 'default' },
    course: { room: 'canopy-1', spawn: 'from-gate' },
    votesFor: 'grove',
    realmName: 'The treehouse clearing',
    courseName: 'Updraft Canopy',
    door: 'kit-clearing-vine-curtain',
    colour: 0x7fd46a,
  },
  {
    level: 'market',
    realm: { room: 'market', spawn: 'default' },
    course: { room: 'circuit-1', spawn: 'from-gate' },
    votesFor: 'market',
    realmName: 'The neon street',
    courseName: 'Blackout Circuit',
    door: 'kit-neon-rooftop-door-open',
    colour: 0xff4fb8,
  },
  // The ink-wash realm has no room yet: its Commons leads only to its course, Brushstroke Bridges.
  {
    level: 'ink',
    course: { room: 'brush-1', spawn: 'from-gate' },
    courseName: 'Brushstroke Bridges',
    door: 'kit-ink-door-paper-open',
    colour: 0xe8dcc0,
  },
  {
    level: 'glass',
    realm: { room: 'glass', spawn: 'from-hub' },
    votesFor: 'glass',
    realmName: 'The glass realm',
    door: 'kit-glass-door-glass-open',
    colour: 0x9fd0ff,
  },
];

/** The door ids: each Commons' way to its realm, its course's gate and its Realm Vote spot. */
export const realmDoor = (level: HallLevel) => `to-${level}` as HallWay;
export const courseDoor = (level: HallLevel) => `course-${level}` as HallWay;
export const voteDoor = (level: HallLevel) => `idol-${level}`;
/** The spawns: in front of a Commons' realm doorway, and in front of its course's gate. */
export const fromRealm = (level: HallLevel) => `from-${level}`;
export const fromCourse = (level: HallLevel) => `from-${level}-course`;

/** The Commons with an idol: the floor is cut in round each one's base. */
const IDOL_LEVELS: readonly HallLevel[] = HALL_COMMONS.filter((c) => c.votesFor).map((c) => c.level);

/** Whether a way stands on the front half of the rim, where an owl sees the near wall's top and not its face. */
export const atFront = (id: HallWay) => rimNormal(angleAt(wayS(id))).y > 0.7;
/** Whether a way stands at one of the oval's two ends, the rim running up and down beside it. */
const atEnd = (id: HallWay) => {
  const n = rimNormal(angleAt(wayS(id)));
  return Math.abs(n.x) > Math.abs(n.y);
};

/**
 * The floor owls walk on: the oval, measured round its rim every 40 px, cut in round each idol's base
 * so owls walk round the idol and never through it.
 */
function hollowFloor(): Polygon {
  const out: Polygon = [];
  const n = Math.round(RIM_LENGTH / 40);
  for (let i = 0; i < n; i++) {
    const s = (i / n) * RIM_LENGTH;
    out.push(rimAt(s, floorInset(s, IDOL_LEVELS)));
  }
  return out;
}

/** How far in from the rim a way's arrivals stand, and its marker. */
const ARRIVE = 190;
const MARK = 24;

/** The art standing at each way: its realm's doorway, the knothole, the trunk's door, the hatch. */
function wayArt(id: HallWay): string | null {
  if (id === 'up') return 'kit-doorway-knothole';
  if (id === 'to-party') return 'kit-clearing-trunk-entrance';
  if (id === 'down') return 'kit-hatch-down';
  const level = id.replace(/^(to|course)-/, '') as HallLevel;
  const c = HALL_COMMONS.find((x) => x.level === level)!;
  const open = id.startsWith('to-') ? c.realm : c.course;
  // A shut way has the scene's blockade instead.
  return open ? c.door : null;
}

/**
 * How big a doorway in the near wall is drawn: seen from almost straight above, it stands low over the
 * floor's front edge, and on a phone it never fills the screen's foot (Nov 8, the trunk's door did).
 */
export const FRONT_ART = 0.6;

/** How tall a way's doorway art is drawn (room px). */
function artTall(id: HallWay): number {
  const art = wayArt(id);
  return (art ? (KIT_ART[art]?.h ?? 320) : 320) * (atFront(id) ? FRONT_ART : 1);
}

/**
 * Where a way's sign stands: on the floor in front of it, where an owl walking up to it reads it. At
 * the front its doorway's art stands up over the floor before it, so its sign stands clear above that.
 */
export function signInset(id: HallWay): number {
  if (id === 'down') return 200;
  // At an end the doorway's art stands beside the floor: its sign stands out from under it.
  if (atEnd(id)) return 260;
  if (!atFront(id)) return 150;
  return Math.min(300, artTall(id) + 20);
}

/**
 * How far in from the rim an owl coming in by a way lands: at the front just inside its doorway's
 * sign, close enough that the sign shows (hints.ts SIGN_REACH, 300 from the doorway's middle).
 */
const arriveAt = (id: HallWay) => (atFront(id) ? Math.min(280, signInset(id) + 30) : ARRIVE);

/** A way's doorway on the rim: its strip straddles the rim, across it at the back and front, down it at the two ends. */
function rimDoor(id: HallWay, to: DoorDef['to'], closedSign?: DoorDef['closedSign'], label?: string): DoorDef {
  const s = wayS(id);
  const p = rimAt(s);
  const n = rimNormal(angleAt(s));
  const across = Math.abs(n.y) >= Math.abs(n.x);
  const [w, h] = across ? [220, 80] : [80, 220];
  return {
    id,
    rect: { x: p.x - w / 2, y: p.y - h / 2, w, h },
    ...(to ? { to } : {}),
    ...(closedSign ? { closedSign } : {}),
    marker: rimAt(s, MARK),
    ...(to && label ? { label, labelAt: rimAt(s, signInset(id)) } : {}),
  };
}

/** The hatch lies in the floor, just in from the rim at the front. */
const HATCH_IN = 70;

const DOORS: DoorDef[] = [
  // Up through the knothole at the very back: the Treetop Commons, before the turnstiles.
  rimDoor('up', { room: 'lobby', spawn: 'from-hub' }, undefined, 'Up to the Treetop Commons'),
  ...HALL_COMMONS.flatMap((c): DoorDef[] => [
    rimDoor(realmDoor(c.level), c.realm, c.realm ? undefined : 'Hatching Soon', c.realmName),
    rimDoor(courseDoor(c.level), c.course, c.course ? undefined : 'Not Yet Fledged', c.courseName),
    ...(c.votesFor
      ? [{ id: voteDoor(c.level), rect: { x: voteAt(c.level).x - 110, y: voteAt(c.level).y - 35, w: 220, h: 70 }, marker: voteAt(c.level) }]
      : []),
  ]),
  // Out through the trunk's door at the front: the Party Grove at the tree's foot.
  rimDoor('to-party', { room: 'hub', spawn: 'default' }, undefined, 'Out to the Party Grove'),
  // Down the hatch in the floor at the front: straight into the arcade (OP-306, the root stair folded into it).
  (() => {
    const at = wayAt('down', HATCH_IN);
    return {
      id: 'down',
      rect: { x: at.x - 90, y: at.y - 40, w: 180, h: 80 },
      to: { room: 'arcade', spawn: 'from-cavern' },
      marker: at,
      label: 'Down to the arcade',
      // Over the hatch, not under it: the hatch's art stands over the floor's edge.
      labelAt: wayAt('down', signInset('down')),
    } satisfies DoorDef;
  })(),
];

/**
 * Each way's art, its foot on the rim: at the back against the far wall's foot, at the two ends
 * against the side walls, at the front out on the near wall's top so it stands in the wall's opening.
 */
const PIECES: RoomPiece[] = HALL_WAYS.flatMap((id): RoomPiece[] => {
  const key = wayArt(id);
  if (!key) return [];
  if (id === 'down') {
    const at = wayAt('down', HATCH_IN);
    return [{ id: 'root-hatch', key, x: at.x, y: at.y + 50 }];
  }
  const foot = wayAt(id, atFront(id) ? -40 : -6);
  const p = wayAt(id);
  // Course gates face their realm's doorway along the rim.
  return [
    {
      id: id === 'up' ? 'knothole' : id === 'to-party' ? 'trunk-door' : `${id}-door`,
      key,
      x: foot.x,
      y: foot.y,
      ...(id.startsWith('course-') && p.x < HALL_CX ? { flip: true as const } : {}),
      ...(atFront(id) ? { scale: FRONT_ART } : {}),
    },
  ];
});

/**
 * The root runs (OP-308, travel as play): roots come up through the floor across the middle of the
 * hollow, each run a fallen root to step up on, a knot of roots and a cut stump, every one a single
 * jump above the last. Climb a run from near the middle and glide off its stump over the gap to the
 * next run out, climb that and glide off the end onto the floor: west toward the glass realm's end,
 * east toward the neon street's. Each glide is one a kid lands every other try or better (the bots fly
 * it, bots/sim/hollowRuns.test.ts). Walking is the same as ever; a fall lands on the floor with
 * nothing lost. The pieces are the arcade's root art, standing on the floor where an owl walks round
 * them.
 *
 * Each perch is a strip of the plan RUN_HALF either side of RUN_Y, its top the art's cut surface
 * measured off the art plus RUN_HALF, its piece's foot at the strip's back edge: an owl stood anywhere
 * on it is drawn over the root, its feet on the cut surface in the strip's middle.
 */
export const RUN_HALF = 20;

export type RootKind = 'log' | 'knot' | 'stump';

/** Each root's art, how high its standing surface is over its foot (measured off the art) and that surface's ends from the piece's middle. */
export const ROOT_ART: Readonly<Record<RootKind, { key: string; stands: number; span: readonly [number, number] }>> = {
  log: { key: 'kit-under-root-ledge-mid', stands: 112, span: [-150, 150] },
  knot: { key: 'kit-under-root-knot', stands: 162, span: [-64, 56] },
  stump: { key: 'kit-under-root-buttress-right', stands: 275, span: [-120, -20] },
};

export interface RootRun {
  /** The Commons whose side of the hollow it stands on. */
  level: HallLevel;
  /** Its roots from the middle outward, by kind and the piece's middle (room x). */
  steps: ReadonlyArray<readonly [RootKind, number]>;
  /** West of the middle the runs climb west: the art turned round. */
  flip?: true;
}

/** West of the middle, then east, each from the middle outward: the inner west run glides to the outer one, the inner east run to the outer east one. */
export const ROOT_RUNS: readonly RootRun[] = [
  {
    level: 'ink',
    flip: true,
    steps: [
      ['log', 2620],
      ['knot', 2400],
      ['stump', 2200],
    ],
  },
  {
    level: 'glass',
    flip: true,
    steps: [
      ['log', 1220],
      ['knot', 1000],
      ['stump', 800],
    ],
  },
  {
    level: 'grove',
    steps: [
      ['log', 3780],
      ['knot', 4000],
      ['stump', 4200],
    ],
  },
  {
    level: 'market',
    steps: [
      ['log', 5180],
      ['knot', 5400],
      ['stump', 5600],
    ],
  },
];

export const rootId = (level: HallLevel, kind: RootKind) => `root-${level}-${kind}`;

/** A root's standing surface along the room (room x), its art turned round west of the middle. */
export function rootSpan(kind: RootKind, x: number, flip?: boolean): [number, number] {
  const [a, b] = ROOT_ART[kind].span;
  return flip ? [x - b, x - a] : [x + a, x + b];
}

export const ROOT_PERCHES: readonly Perch[] = ROOT_RUNS.flatMap((run) =>
  run.steps.map(([kind, x]): Perch => {
    const [x0, x1] = rootSpan(kind, x, run.flip);
    return {
      id: rootId(run.level, kind),
      area: [
        { x: x0, y: RUN_Y - RUN_HALF },
        { x: x1, y: RUN_Y - RUN_HALF },
        { x: x1, y: RUN_Y + RUN_HALF },
        { x: x0, y: RUN_Y + RUN_HALF },
      ],
      top: ROOT_ART[kind].stands + RUN_HALF,
      solid: true,
    };
  }),
);

const ROOT_PIECES: RoomPiece[] = ROOT_RUNS.flatMap((run) =>
  run.steps.map(
    ([kind, x]): RoomPiece => ({
      id: rootId(run.level, kind),
      key: ROOT_ART[kind].key,
      x,
      y: RUN_Y - RUN_HALF,
      ...(run.flip ? { flip: true as const } : {}),
    }),
  ),
);

/** Each plaza's worn ring round its moonbeam, and the heart's (edges.ts: walked across, drawn on the floor). */
export const HALL_EDGES: readonly EdgePlacement[] = HALL_MOONBEAMS.map((m) => ({
  id: `ring-${m.id.replace('moonbeam-', '')}`,
  key: 'edge-hollow-plaza-ring',
  x: m.pos.x - 380,
  y: m.pos.y - 190,
}));

/** The floor: one texture under the whole room (the scene draws the wall over everything past the rim). */
const HALL_KIT: RoomKit = {
  ground: HALL_CY + HALL_RY,
  surfaces: [{ id: 'floor', texture: 'kit-tex-ground-forest-floor', rect: { x: 0, y: 0, w: HALL_W, h: HALL_H } }],
};

/** The wall round the oval, and each Commons' colour pooled on the floor by its two ways. */
export const HALL_BOWL: RoomBowl = {
  cx: HALL_CX,
  cy: HALL_CY,
  rx: HALL_RX,
  ry: HALL_RY,
  face: WALL_FACE,
  lip: WALL_LIP,
  pools: [
    ...HALL_COMMONS.map((c) => ({ ...ringAt(commonsS(c.level), 0.84), r: 900, color: c.colour })),
    { ...HALL_HEART, r: 1100, color: 0xffe2a8 },
  ],
  gaps: HALL_WAYS.filter((id) => atFront(id) && id !== 'down').map((id) => ({ ...wayAt(id), w: 220 })),
};

/** Whether a point is clear of every root's art (and a little round it), where a visitor can see it. */
export function clearOfRoots(p: Vec2): boolean {
  return ROOT_PIECES.every((q) => {
    const a = KIT_ART[q.key];
    if (!a) return true;
    return !(p.x > q.x - a.w / 2 - 40 && p.x < q.x + a.w / 2 + 40 && p.y > q.y - a.h && p.y < q.y + RUN_HALF * 2);
  });
}

/**
 * Hiding spots round the rim between the ways, out across each plaza and round the heart, so a find
 * can be anywhere a crowd stands.
 */
const SPOTS: Vec2[] = [
  // A third of the way on from each way (clear of the idols midway between a Commons' two), or a third
  // of the way back from the next where the roots across the middle would hide it.
  ...HALL_WAYS.map((id) => [rimAt(wayS(id) + WAY_STEP * 0.3, 260), rimAt(wayS(id) + WAY_STEP * 0.7, 260)].find(clearOfRoots)!),
  ...HALL_COMMONS.flatMap((c) => [ringAt(commonsS(c.level) - 300, 0.55), ringAt(commonsS(c.level) + 300, 0.55)]),
  { x: HALL_CX - 420, y: HALL_CY - 520 },
  { x: HALL_CX + 420, y: HALL_CY - 520 },
  { x: HALL_CX, y: HALL_CY + 420 },
];

export const HALL_ROOM: RoomDef = {
  id: HALL_ID,
  size: { w: HALL_W, h: HALL_H },
  background: 'kit-tex-inner-wood',
  backgrounds: [],
  foregrounds: [],
  mood: 'hub',
  walkable: [hollowFloor()],
  spawns: {
    default: { x: HALL_CX, y: HALL_CY + 260 },
    'from-lobby': wayAt('up', ARRIVE),
    'from-party': wayAt('to-party', arriveAt('to-party')),
    'from-under': wayAt('down', 330),
    ...Object.fromEntries(
      HALL_COMMONS.flatMap((c) => [
        [fromRealm(c.level), wayAt(realmDoor(c.level), arriveAt(realmDoor(c.level)))],
        [fromCourse(c.level), wayAt(courseDoor(c.level), arriveAt(courseDoor(c.level)))],
      ]),
    ),
  },
  doors: DOORS,
  pieces: [...PIECES, ...ROOT_PIECES],
  perches: [...ROOT_PERCHES],
  edges: [...HALL_EDGES],
  bowl: HALL_BOWL,
  // A Realm Vote idol in each Commons of a realm that has one, each over its own spot (RoomDef.idols).
  idols: HALL_COMMONS.flatMap((c) => (c.votesFor ? [{ realm: c.votesFor, door: voteDoor(c.level) }] : [])),
  spots: SPOTS,
  kit: HALL_KIT,
};

/** The leaf piles and moonbeams (interactables.ts) are src/hollowOval.ts's: HALL_LEAVES, HALL_MOONBEAMS. */
export { HALL_LEAVES, HALL_MOONBEAMS };

/** The idols' anchors (ANCHORS), under the names the scene draws each realm's idol at. */
export const HALL_ANCHORS: Record<string, Vec2> = {
  idol: idolAt('glass'),
  guardian: idolAt('grove'),
  gathering: voteAt('grove'),
  robot: idolAt('market'),
};
