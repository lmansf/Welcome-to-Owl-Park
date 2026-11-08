/**
 * The Great Hollow (Nov 7, the owner's word: "this room is supposed to be top down with all the commons
 * like one super server room", and his "Build the big room"): the inside of the tree as one room seen
 * from above, the four Commons side by side in it, in place of the tall hall seen from the side with a
 * Commons behind a door on each landing (his camera rule: inside the tree is seen from above).
 *
 * Four screens wide, a Commons a screen, west to east in the order the tree stacks them top to bottom:
 * the stained-glass realm's, the ink-wash realm's, the Treehouse Clearing's and the neon realm's. Each
 * has, along its back wall, the doorway out to its realm (left) and the gate to its parkour course
 * (right), its realm's idol between them over the Realm Vote spot (the ink-wash realm has none yet), and
 * a leaf pile at the front. In the middle of the hollow, between the ink-wash and the clearing's
 * Commons, the knothole up to the Treetop Commons and the trunk's door out to the Party Grove stand on
 * the back wall, and the hatch down the root stair to the cavern is in the floor at the front.
 *
 * The floor is one strip along the room, as the hub's is, curving forward round each idol's mound: a
 * ten year old walks it left and right, and every way out is a doorway on the back wall or the hatch at
 * the front. It is built from the art kit's textures and pieces, each realm's own wall and floor, until
 * the hollow is painted (a file swap: the size list has each piece's size).
 */
import { shapedFloor, type EdgePlacement } from '../src/edges';
import type { Polygon } from '../src/geometry';
import type { Vec2 } from '../src/protocol';
import { ROOM_W, type DoorDef, type RoomDef, type RoomKit, type RoomPiece } from '../src/room';

export const HALL_ID = 'm3-hall';
/**
 * The hollow's size: four screens wide, a Commons a screen, and 1500 high, a screen and two thirds (Nov 8: each
 * Commons a town square where about 80 owls can gather, not a room), so the camera follows the owl
 * down its plaza as well as along it.
 */
export const HALL_W = 4 * ROOM_W;
export const HALL_H = 1500;
/** The floor's back edge, where the doorways and the idols stand, and its front edge. */
export const HALL_BACK = 600;
export const HALL_FRONT = HALL_H - 15;
/**
 * The middle of each Commons' plaza, where its moonbeam falls through the canopy into a worn ring:
 * far enough out from the wall that a crowd round it leaves the way along the doorways open.
 */
export const PLAZA_Y = 1060;
/**
 * How much floor an owl at a gathering takes (room px²): an owl is drawn about 100 by 120, and stood
 * among others it wants about 140 across by 110 deep, so names and bubbles don't pile up.
 */
export const OWL_ROOM_PX2 = 140 * 110;
/** The middle of the hollow: the knothole, the trunk's door and the root stair's hatch. */
export const HALL_MIDDLE = 2 * ROOM_W;

export type HallLevel = 'glass' | 'ink' | 'grove' | 'market';

/** What a Commons opens on: its realm (closed while the realm has no room) and its parkour course. */
export interface CommonsOf {
  level: HallLevel;
  /** Its realm's room and spawn, or none yet (a "Hatching Soon" blockade). */
  realm?: { room: string; spawn: string };
  /** Its course's first room and spawn, or none yet (a "Not Yet Fledged" blockade). */
  course?: { room: string; spawn: string };
  /** The realm its idol takes the Realm Vote for, where it has one. */
  votesFor?: 'glass' | 'grove' | 'market';
  /** The doorway's art (a kit piece) and the wall and floor textures of its realm. */
  door: string;
  wall: string;
  floor: string;
}

/** The Commons, west to east. */
export const HALL_COMMONS: readonly CommonsOf[] = [
  { level: 'glass', realm: { room: 'glass', spawn: 'from-hub' }, votesFor: 'glass', door: 'kit-glass-door-glass-open', wall: 'kit-tex-glass-lead-lattice', floor: 'kit-tex-glass-pale-stone' },
  // The ink-wash realm has no room yet: its Commons leads only to its course, Brushstroke Bridges.
  { level: 'ink', course: { room: 'brush-1', spawn: 'from-gate' }, door: 'kit-ink-door-paper-open', wall: 'kit-tex-ink-woven-reed', floor: 'kit-tex-ink-paper-grain' },
  {
    level: 'grove',
    realm: { room: 'grove', spawn: 'default' },
    course: { room: 'canopy-1', spawn: 'from-gate' },
    votesFor: 'grove',
    door: 'kit-clearing-vine-curtain',
    wall: 'kit-tex-clearing-hollow-wood',
    floor: 'kit-tex-clearing-fern-floor',
  },
  {
    level: 'market',
    realm: { room: 'market', spawn: 'default' },
    course: { room: 'circuit-1', spawn: 'from-gate' },
    votesFor: 'market',
    door: 'kit-neon-rooftop-door-open',
    wall: 'kit-tex-neon-neon-brick',
    floor: 'kit-tex-neon-wet-pavement',
  },
];

/** Where a Commons begins (its west edge). */
export const commonsX = (level: HallLevel) => HALL_COMMONS.findIndex((c) => c.level === level) * ROOM_W;
/** Its realm's doorway, its course's gate and its idol, along its back wall (room x). */
export const realmDoorX = (level: HallLevel) => commonsX(level) + 330;
export const courseDoorX = (level: HallLevel) => commonsX(level) + 1270;
export const idolX = (level: HallLevel) => commonsX(level) + 800;
/** The front of the mound under an idol (the edge piece edge-hollow-idol-mound, 300 wide): the Realm Vote spot is just in front of it. */
export const IDOL_FRONT = 700;
/** Where the idol's foot stands. */
export const idolAt = (level: HallLevel): Vec2 => ({ x: idolX(level), y: IDOL_FRONT - 20 });

/** The door ids: each Commons' way to its realm, its course's gate and its Realm Vote spot. */
export const realmDoor = (level: HallLevel) => `to-${level}`;
export const courseDoor = (level: HallLevel) => `course-${level}`;
export const voteDoor = (level: HallLevel) => `idol-${level}`;
/** The spawns: in front of a Commons' realm doorway, and in front of its course's gate. */
export const fromRealm = (level: HallLevel) => `from-${level}`;
export const fromCourse = (level: HallLevel) => `from-${level}-course`;

/** The floor's west and east ends (its side walls). */
const HALL_WEST = 40;
const HALL_EAST = HALL_W - 40;

/**
 * The hollow's edges (edges.ts; the owner's ask, Nov 8: the map should not read as big rectangles):
 * roots out of the wall's foot between the doorways, a mossy mound under each idol, root buttresses
 * rounding the back corners, ferns end to end along the front with the root stair's hatch left clear,
 * and over each seam between two Commons a bark pillar, its roots flaring into the floor and leaf
 * litter across the floor. A ragged rim of bark runs along the top. The bumps are cut out of the
 * floor below, so the floor's edge line runs round each of them.
 */
function hallEdges(): EdgePlacement[] {
  const back = (id: string, key: string, x: number, flip?: boolean): EdgePlacement => ({ id, key, x, y: HALL_BACK, ...(flip ? { flip: true as const } : {}) });
  const front = (id: string, key: string, x: number, flip?: boolean): EdgePlacement => ({ id, key, x, y: HALL_FRONT, ...(flip ? { flip: true as const } : {}) });
  const seams = [ROOM_W, 2 * ROOM_W, 3 * ROOM_W];
  // The front, west to east: a corner, ferns to the hatch, ferns from it, a corner.
  const ferns = (from: number, keys: string[], side: string): EdgePlacement[] => {
    let x = from;
    return keys.map((key, i) => {
      const at = x;
      x += key.endsWith('-a') ? 420 : key.endsWith('-b') ? 520 : 300;
      return front(`ferns-${side}-${i}`, key, at, i % 2 === 1);
    });
  };
  const A = 'edge-hollow-ferns-a';
  const B = 'edge-hollow-ferns-b';
  const C = 'edge-hollow-ferns-c';
  return [
    // Leaf litter over the floors' seams first: everything else is drawn over it.
    ...seams.map((x, i) => ({ id: `litter-${i}`, key: 'edge-hollow-litter', x: x - 190, y: HALL_BACK })),
    // Each plaza's worn ring, round the moonbeam in its middle.
    ...HALL_COMMONS.map((c) => ({ id: `ring-${c.level}`, key: 'edge-hollow-plaza-ring', x: commonsX(c.level) + 800 - 380, y: PLAZA_Y - 190 })),
    ...seams.map((x, i) => ({ id: `pillar-${i}`, key: 'edge-hollow-pillar', x: x - 60, y: -30 })),
    ...[0, 1, 2, 3].map((i) => ({ id: `rim-${i}`, key: 'edge-hollow-rim', x: i * ROOM_W, y: 0, ...(i % 2 ? { flip: true as const } : {}) })),
    back('corner-west', 'edge-hollow-corner-back', HALL_WEST),
    back('roots-glass-1', 'edge-hollow-roots-a', 460),
    ...HALL_COMMONS.filter((c) => c.votesFor).map((c) => back(`mound-${c.level}`, 'edge-hollow-idol-mound', idolX(c.level) - 150)),
    back('roots-glass-2', 'edge-hollow-roots-a', 980, true),
    back('flare-0', 'edge-hollow-root-flare', seams[0]! - 160),
    // The ink-wash Commons keeps the middle of its wall clear for the idol it will have.
    back('roots-ink-1', 'edge-hollow-roots-a', 2060),
    back('roots-ink-2', 'edge-hollow-roots-a', 2560, true),
    // Between the knothole and the trunk's door there is only room for a few roots.
    back('flare-1', 'edge-hollow-roots-small', seams[1]! - 60),
    back('roots-grove-1', 'edge-hollow-roots-a', 3660),
    back('roots-grove-2', 'edge-hollow-roots-a', 4180, true),
    back('flare-2', 'edge-hollow-root-flare', seams[2]! - 160, true),
    back('roots-market-1', 'edge-hollow-roots-a', 5260),
    back('roots-market-2', 'edge-hollow-roots-a', 5780, true),
    back('corner-east', 'edge-hollow-corner-back', HALL_EAST - 180, true),
    front('corner-front-west', 'edge-hollow-corner-front', HALL_WEST),
    ...ferns(HALL_WEST + 140, [A, B, C, A, B, C, A], 'west'),
    // The hatch down to the root stair, its floor left plain (HALL_MIDDLE - 120 to + 120).
    ...ferns(HALL_MIDDLE + 120, [B, A, C, B, A, C, A], 'east'),
    front('corner-front-east', 'edge-hollow-corner-front', HALL_EAST - 140, true),
  ];
}

export const HALL_EDGES: readonly EdgePlacement[] = hallEdges();

/**
 * The floor owls walk on: one strip from the hollow's west wall to its east, its edges shaped by the
 * hollow's edge pieces: in round each idol's mound and each knot of roots at the wall's foot, in at
 * the rounded corners, and up a little where the ferns curl over its front.
 */
function hollowFloor(): Polygon {
  return shapedFloor(HALL_WEST, HALL_EAST, HALL_BACK, HALL_FRONT, HALL_EDGES);
}

/** A doorway on the back wall, `w` wide, centred on `x`: its strip straddles the floor's back edge. */
function wallDoor(id: string, x: number, to: DoorDef['to'], closedSign?: DoorDef['closedSign'], w = 200): DoorDef {
  return {
    id,
    rect: { x: x - w / 2, y: HALL_BACK - 10, w, h: 50 },
    ...(to ? { to } : {}),
    ...(closedSign ? { closedSign } : {}),
    marker: { x, y: HALL_BACK + 8 },
  };
}

const DOORS: DoorDef[] = [
  ...HALL_COMMONS.flatMap((c): DoorDef[] => [
    wallDoor(realmDoor(c.level), realmDoorX(c.level), c.realm, c.realm ? undefined : 'Hatching Soon'),
    wallDoor(courseDoor(c.level), courseDoorX(c.level), c.course, c.course ? undefined : 'Not Yet Fledged'),
    ...(c.votesFor ? [{ id: voteDoor(c.level), rect: { x: idolX(c.level) - 110, y: IDOL_FRONT + 5, w: 220, h: 70 }, marker: { x: idolX(c.level), y: IDOL_FRONT + 40 } }] : []),
  ]),
  // Up through the knothole: the Treetop Commons, before the turnstiles.
  wallDoor('up', HALL_MIDDLE - 170, { room: 'lobby', spawn: 'from-hub' }, undefined, 180),
  // Out through the trunk's door: the Party Grove at the tree's foot.
  wallDoor('to-party', HALL_MIDDLE + 170, { room: 'hub', spawn: 'default' }, undefined, 200),
  // Down the hatch in the floor at the front: the root stair to the cavern.
  { id: 'down', rect: { x: HALL_MIDDLE - 90, y: HALL_FRONT - 45, w: 180, h: 45 }, to: { room: 'm3-under', spawn: 'from-l1' }, marker: { x: HALL_MIDDLE, y: HALL_FRONT - 20 } },
];

const PIECES: RoomPiece[] = [
  ...HALL_COMMONS.flatMap((c): RoomPiece[] => [
    // An open way has its doorway's art; a closed one its blockade, which the scene draws.
    ...(c.realm ? [{ id: `${c.level}-realm-door`, key: c.door, x: realmDoorX(c.level), y: HALL_BACK }] : []),
    ...(c.course
      ? [
          { id: `${c.level}-course-door`, key: c.door, x: courseDoorX(c.level), y: HALL_BACK, flip: true as const },
          { id: `${c.level}-course-sign`, key: 'kit-sign-arrow', x: courseDoorX(c.level) - 190, y: HALL_BACK + 30 },
        ]
      : []),
  ]),
  { id: 'knothole', key: 'kit-doorway-knothole', x: HALL_MIDDLE - 170, y: HALL_BACK },
  { id: 'trunk-door', key: 'kit-clearing-trunk-entrance', x: HALL_MIDDLE + 170, y: HALL_BACK },
  { id: 'root-hatch', key: 'kit-hatch-down', x: HALL_MIDDLE, y: HALL_FRONT + 15 },
];

/** Each Commons' realm wall and floor. */
const HALL_KIT: RoomKit = {
  ground: HALL_FRONT,
  surfaces: HALL_COMMONS.flatMap((c) => [
    { id: `${c.level}-wall`, texture: c.wall, rect: { x: commonsX(c.level), y: 0, w: ROOM_W, h: HALL_BACK } },
    { id: `${c.level}-floor`, texture: c.floor, rect: { x: commonsX(c.level), y: HALL_BACK, w: ROOM_W, h: HALL_H - HALL_BACK } },
  ]),
};

export const HALL_ROOM: RoomDef = {
  id: HALL_ID,
  size: { w: HALL_W, h: HALL_H },
  background: 'kit-tex-inner-wood',
  backgrounds: [],
  foregrounds: [],
  mood: 'hub',
  walkable: [hollowFloor()],
  spawns: {
    default: { x: HALL_MIDDLE, y: PLAZA_Y - 120 },
    'from-lobby': { x: HALL_MIDDLE - 170, y: HALL_BACK + 90 },
    'from-party': { x: HALL_MIDDLE + 170, y: HALL_BACK + 90 },
    'from-under': { x: HALL_MIDDLE, y: HALL_FRONT - 110 },
    ...Object.fromEntries(
      HALL_COMMONS.flatMap((c) => [
        [fromRealm(c.level), { x: realmDoorX(c.level), y: HALL_BACK + 90 }],
        [fromCourse(c.level), { x: courseDoorX(c.level), y: HALL_BACK + 90 }],
      ]),
    ),
  },
  doors: DOORS,
  pieces: PIECES,
  edges: [...HALL_EDGES],
  // A Realm Vote idol in each Commons of a realm that has one, each over its own spot (RoomDef.idols).
  idols: HALL_COMMONS.flatMap((c) => (c.votesFor ? [{ realm: c.votesFor, door: voteDoor(c.level) }] : [])),
  // Hiding spots up by the wall and out across the plaza, so a find can be anywhere a crowd stands.
  spots: HALL_COMMONS.flatMap((c) => [
    { x: commonsX(c.level) + 160, y: 840 },
    { x: commonsX(c.level) + 560, y: 820 },
    { x: commonsX(c.level) + 1050, y: 840 },
    { x: commonsX(c.level) + 1450, y: 820 },
    { x: commonsX(c.level) + 300, y: 1180 },
    { x: commonsX(c.level) + 1300, y: 1150 },
    { x: commonsX(c.level) + 700, y: 1360 },
  ]),
  kit: HALL_KIT,
};

/** The idols' anchors (ANCHORS), under the names the scene draws each realm's idol at. */
export const HALL_ANCHORS: Record<string, Vec2> = {
  idol: idolAt('glass'),
  guardian: idolAt('grove'),
  gathering: { x: idolX('grove'), y: IDOL_FRONT + 40 },
  robot: idolAt('market'),
};
