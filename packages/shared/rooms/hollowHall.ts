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
 * a leaf pile at the front. Every open doorway has a sign on the floor in front of it naming where it
 * leads, so a ten year old finds the Party Grove without a map. In the middle of the hollow, between
 * the ink-wash and the clearing's Commons, the knothole up to the Treetop Commons and the trunk's door out to the Party Grove stand on
 * the back wall, and the hatch down the root stair to the cavern is in the floor at the front.
 *
 * The floor is one strip along the room, as the hub's is, stepping forward round each idol's base: a
 * ten year old walks it left and right, and every way out is a doorway on the back wall or the hatch at
 * the front. It is built from the art kit's textures and pieces, each realm's own wall and floor, until
 * the hollow is painted (a file swap: the size list has each piece's size).
 */
import type { Polygon } from '../src/geometry';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, ROOM_W, type DoorDef, type RoomDef, type RoomKit, type RoomPiece } from '../src/room';

export const HALL_ID = 'm3-hall';
/** The hollow's size: four screens wide, a Commons a screen, one high. */
export const HALL_W = 4 * ROOM_W;
export const HALL_H = ROOM_H;
/** The floor's back edge, where the doorways and the idols stand, and its front edge. */
export const HALL_BACK = 600;
export const HALL_FRONT = 885;
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
  /** What the signs at its two open doorways say: its realm's public name, and its course's name. */
  realmName?: string;
  courseName?: string;
  /** The doorway's art (a kit piece) and the wall and floor textures of its realm. */
  door: string;
  wall: string;
  floor: string;
}

/** The Commons, west to east. */
export const HALL_COMMONS: readonly CommonsOf[] = [
  { level: 'glass', realm: { room: 'glass', spawn: 'from-hub' }, votesFor: 'glass', realmName: 'The glass realm', door: 'kit-glass-door-glass-open', wall: 'kit-tex-glass-lead-lattice', floor: 'kit-tex-glass-pale-stone' },
  // The ink-wash realm has no room yet: its Commons leads only to its course, Brushstroke Bridges.
  { level: 'ink', course: { room: 'brush-1', spawn: 'from-gate' }, courseName: 'Brushstroke Bridges', door: 'kit-ink-door-paper-open', wall: 'kit-tex-ink-woven-reed', floor: 'kit-tex-ink-paper-grain' },
  {
    level: 'grove',
    realm: { room: 'grove', spawn: 'default' },
    course: { room: 'canopy-1', spawn: 'from-gate' },
    votesFor: 'grove',
    realmName: 'The treehouse clearing',
    courseName: 'Updraft Canopy',
    door: 'kit-clearing-vine-curtain',
    wall: 'kit-tex-clearing-hollow-wood',
    floor: 'kit-tex-clearing-fern-floor',
  },
  {
    level: 'market',
    realm: { room: 'market', spawn: 'default' },
    course: { room: 'circuit-1', spawn: 'from-gate' },
    votesFor: 'market',
    realmName: 'The neon street',
    courseName: 'Blackout Circuit',
    door: 'kit-neon-rooftop-door-open',
    wall: 'kit-tex-neon-neon-brick',
    floor: 'kit-tex-neon-wet-pavement',
  },
];

/** Where a Commons begins (its west edge). */
export const commonsX = (level: HallLevel) => HALL_COMMONS.findIndex((c) => c.level === level) * ROOM_W;
/**
 * Its realm's doorway, its course's gate and its idol, along its back wall (room x). The two doorways
 * stand in from the Commons' edges, so the doorways either side of the hollow's middle (the ink-wash
 * course's gate, the knothole, the trunk's door, the clearing's vine curtain) stand apart and their
 * signs don't run into each other.
 */
export const realmDoorX = (level: HallLevel) => commonsX(level) + 500;
export const courseDoorX = (level: HallLevel) => commonsX(level) + 1100;
export const idolX = (level: HallLevel) => commonsX(level) + 800;
/** The idol's base: the floor steps forward round it, IDOL_HALF either side of it, to IDOL_FRONT. */
const IDOL_HALF = 150;
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

/**
 * The floor owls walk on: one strip from the hollow's west wall to its east, its back edge along the
 * back wall but where it steps forward round each idol's base.
 */
function hollowFloor(): Polygon {
  const back: Vec2[] = [{ x: 40, y: HALL_BACK }];
  for (const c of HALL_COMMONS) {
    if (!c.votesFor) continue;
    const x = idolX(c.level);
    back.push({ x: x - IDOL_HALF, y: HALL_BACK }, { x: x - IDOL_HALF + 20, y: IDOL_FRONT }, { x: x + IDOL_HALF - 20, y: IDOL_FRONT }, { x: x + IDOL_HALF, y: HALL_BACK });
  }
  back.push({ x: HALL_W - 40, y: HALL_BACK });
  return [...back, { x: HALL_W - 40, y: HALL_FRONT }, { x: 40, y: HALL_FRONT }];
}

/** Where a back-wall doorway's sign stands: on the floor just in front of it, where an owl walks up to it. */
const SIGN_Y = HALL_BACK + 36;

/**
 * A doorway on the back wall, `w` wide, centred on `x`: its strip straddles the floor's back edge. An
 * open one has a sign naming where it leads.
 */
function wallDoor(id: string, x: number, to: DoorDef['to'], closedSign?: DoorDef['closedSign'], w = 200, label?: string): DoorDef {
  return {
    id,
    rect: { x: x - w / 2, y: HALL_BACK - 10, w, h: 50 },
    ...(to ? { to } : {}),
    ...(closedSign ? { closedSign } : {}),
    marker: { x, y: HALL_BACK + 8 },
    ...(to && label ? { label, labelAt: { x, y: SIGN_Y } } : {}),
  };
}

const DOORS: DoorDef[] = [
  ...HALL_COMMONS.flatMap((c): DoorDef[] => [
    wallDoor(realmDoor(c.level), realmDoorX(c.level), c.realm, c.realm ? undefined : 'Hatching Soon', 200, c.realmName),
    wallDoor(courseDoor(c.level), courseDoorX(c.level), c.course, c.course ? undefined : 'Not Yet Fledged', 200, c.courseName),
    ...(c.votesFor ? [{ id: voteDoor(c.level), rect: { x: idolX(c.level) - 110, y: IDOL_FRONT + 5, w: 220, h: 70 }, marker: { x: idolX(c.level), y: IDOL_FRONT + 40 } }] : []),
  ]),
  // Up through the knothole: the Treetop Commons, before the turnstiles.
  wallDoor('up', HALL_MIDDLE - 170, { room: 'lobby', spawn: 'from-hub' }, undefined, 180, 'Up to the Treetop Commons'),
  // Out through the trunk's door: the Party Grove at the tree's foot.
  wallDoor('to-party', HALL_MIDDLE + 170, { room: 'hub', spawn: 'default' }, undefined, 200, 'Out to the Party Grove'),
  // Down the hatch in the floor at the front: the root stair to the cavern.
  {
    id: 'down',
    rect: { x: HALL_MIDDLE - 90, y: HALL_FRONT - 45, w: 180, h: 45 },
    to: { room: 'm3-under', spawn: 'from-l1' },
    marker: { x: HALL_MIDDLE, y: HALL_FRONT - 20 },
    label: 'Down to the arcade',
    // Over the hatch, not under it: the hatch's art stands over the floor's front edge.
    labelAt: { x: HALL_MIDDLE, y: HALL_FRONT - 165 },
  },
];

const PIECES: RoomPiece[] = [
  ...HALL_COMMONS.flatMap((c): RoomPiece[] => [
    // An open way has its doorway's art; a closed one its blockade, which the scene draws.
    ...(c.realm ? [{ id: `${c.level}-realm-door`, key: c.door, x: realmDoorX(c.level), y: HALL_BACK }] : []),
    ...(c.course
      ? [
          { id: `${c.level}-course-door`, key: c.door, x: courseDoorX(c.level), y: HALL_BACK, flip: true as const },
          { id: `${c.level}-course-sign`, key: 'kit-sign-arrow', x: courseDoorX(c.level) + 190, y: HALL_BACK + 30, flip: true as const },
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
    default: { x: HALL_MIDDLE, y: 760 },
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
  // A Realm Vote idol in each Commons of a realm that has one, each over its own spot (RoomDef.idols).
  idols: HALL_COMMONS.flatMap((c) => (c.votesFor ? [{ realm: c.votesFor, door: voteDoor(c.level) }] : [])),
  spots: HALL_COMMONS.flatMap((c) => [
    { x: commonsX(c.level) + 160, y: 840 },
    { x: commonsX(c.level) + 560, y: 820 },
    { x: commonsX(c.level) + 1050, y: 840 },
    { x: commonsX(c.level) + 1450, y: 820 },
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
