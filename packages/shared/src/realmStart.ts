/**
 * Every realm's start, one screen seen from above (OP-276), laid out as the realm kit's wireframe 1
 * (owl-park/realm-asset-list/wireframes/1-realm-start-top-down.png) draws it. The floor, the two
 * openings and the vote spot are the map's and stay where they are in every realm; the artist paints
 * the start screen (slot S01) around them and leaves the pieces' spots clear, and the game draws the
 * pieces (S02 to S05) over it at their feet. The visit reads left to right: in from the tree at the
 * knot-hole, a job from the quest owl at the post, a vote at the guardian, the realm's hat and pet at
 * the trading nest, then on to the course.
 *
 * Every number here is a room pixel of the 1600 x 900 screen: the wireframe's own, less its margin.
 */
import type { Polygon } from './geometry';
import type { Vec2 } from './protocol';
import { ROOM_H, ROOM_W, type DoorDef, type RoomDef, type RoomPiece } from './room';

/** The openings the start screen paints, each a box whose foot is the floor's back edge. */
export const START_OPENINGS = {
  /** The knot-hole back to the tree, on the left. */
  back: { x: 60, y: 380, w: 140, h: 180 },
  /** The way on to the course, on the right. */
  on: { x: 1440, y: 380, w: 120, h: 180 },
} as const;

/** Where each piece stands (the middle of its foot) and how big its slot's box is. */
export const START_SPOTS = {
  idol: { x: 830, y: 700, w: 520, h: 416 },
  questPost: { x: 480, y: 620, w: 240, h: 300 },
  tradingNest: { x: 1270, y: 620, w: 320, h: 320 },
  /** Three to five decor pieces: the first by the post, then one each side at the front, the right one mirrored. */
  decor: [
    { x: 280, y: 620, w: 160, h: 200 },
    { x: 200, y: 870, w: 160, h: 200 },
    { x: 1460, y: 870, w: 160, h: 200, flip: true },
  ],
} as const;

/** The vote spot, front and centre under the guardian: an owl standing in it may vote. */
export const START_VOTE = { x: 720, y: 705, w: 220, h: 55 } as const;

/** Where the quest owl stands, at the foot of the post, in the realm's hat. */
export const START_QUEST_OWL: Vec2 = { x: 520, y: 760 };
/** Where the leaf pile drifts: blown in on the course's wind, against the trading nest by the way on. */
export const START_LEAVES: Vec2 = { x: 1330, y: 790 };
/** Where the trading nest is browsed from, in front of it. */
export const START_STALL: Vec2 = { x: 1270, y: 680 };
/** Where an owl arrives from the tree: just in, clear of the knot-hole, and in front of the guardian's base so a straight walk east passes it. */
export const START_ARRIVAL: Vec2 = { x: 320, y: 770 };

/** The floor's back edge, where the pieces and the openings stand. */
const BACK = 560;
/** Between the openings the floor stops this far forward, where the pieces' feet are. */
const FEET = 625;
const FRONT = 880;

/**
 * The floor owls walk on: the wireframe's floor, less what stands on it. Its back edge runs along the
 * pieces' feet except in front of the two openings, it goes round the guardian's base, and it stops
 * short of the two front decor pieces' bases.
 */
export const START_FLOOR: Polygon = [
  { x: 60, y: BACK },
  { x: 200, y: BACK },
  { x: 200, y: FEET },
  { x: 570, y: FEET },
  { x: 570, y: 705 },
  { x: 1090, y: 705 },
  { x: 1090, y: FEET },
  { x: 1440, y: FEET },
  { x: 1440, y: BACK },
  { x: 1560, y: BACK },
  { x: 1560, y: FRONT },
  { x: 1530, y: FRONT },
  { x: 1530, y: 840 },
  { x: 1390, y: 840 },
  { x: 1390, y: FRONT },
  { x: 270, y: FRONT },
  { x: 270, y: 840 },
  { x: 130, y: 840 },
  { x: 130, y: FRONT },
  { x: 60, y: FRONT },
];

/** Hiding spots for finds: on the floor, clear of the doorways, each a straight walk from the arrival. */
const START_FIND_SPOTS: Vec2[] = [
  { x: 420, y: 850 },
  { x: 640, y: 830 },
  { x: 860, y: 840 },
  { x: 1000, y: 860 },
  { x: 1200, y: 780 },
  { x: 1300, y: 860 },
];

/** What a realm's start needs of its own: where its two ways lead, its look, and its decor pieces' art. */
export interface RealmStartOf {
  /** The knot-hole: back to the tree (and on the side-on tree, `toTree`). */
  back: Pick<DoorDef, 'to' | 'toTree'>;
  /** The way on to the course: a doorway to its first act, or the portal a realm's solo course opens from. */
  on: { id: string; to?: DoorDef['to'] };
  mood: RoomDef['mood'];
  gated?: boolean;
  /** One art key for each decor spot in START_SPOTS.decor, in order (3 to 5). */
  decor: ReadonlyArray<{ key: string }>;
}

/** The kit slot key of a realm's piece (OP-275): kit-<realm>-<slot>. */
const slotKey = (realm: string, slot: string) => `kit-${realm}-${slot}`;

/** The pieces a realm's start draws over its screen: the quest post, the trading nest and its decor (the guardian is the room's idol, ANCHORS). */
export function startPieces(realm: string, decor: RealmStartOf['decor']): RoomPiece[] {
  const { questPost, tradingNest } = START_SPOTS;
  return [
    { id: 'quest-post', key: slotKey(realm, 'quest-post'), x: questPost.x, y: questPost.y },
    { id: 'trading-nest', key: slotKey(realm, 'trading-nest'), x: tradingNest.x, y: tradingNest.y },
    ...decor.map((d, i): RoomPiece => {
      const at = START_SPOTS.decor[i]!;
      return { id: `decor-${i + 1}`, key: d.key, x: at.x, y: at.y, ...('flip' in at ? { flip: true as const } : {}) };
    }),
  ];
}

/** A realm's start room (its room id is the realm's), laid out on the template. */
export function realmStart(realm: string, of: RealmStartOf): RoomDef {
  if (of.decor.length < 1 || of.decor.length > START_SPOTS.decor.length) throw new Error(`realmStart(${realm}): ${of.decor.length} decor pieces; the template has ${START_SPOTS.decor.length} spots`);
  const { back, on } = START_OPENINGS;
  // Each opening's doorway is the floor just in front of it.
  const threshold = (o: { x: number; w: number }) => ({ x: o.x, y: BACK, w: o.w, h: FEET - BACK + 5 });
  const doors: DoorDef[] = [
    { id: 'to-hub', rect: threshold(back), ...of.back, marker: { x: back.x + back.w / 2, y: BACK + 40 } },
    { id: 'idol', rect: { ...START_VOTE }, marker: { x: START_VOTE.x + START_VOTE.w / 2, y: START_VOTE.y + START_VOTE.h / 2 } },
    { id: of.on.id, rect: threshold(on), ...(of.on.to ? { to: of.on.to } : {}), marker: { x: on.x + on.w / 2, y: on.y + on.h / 2 } },
  ];
  const screen = slotKey(realm, 'start-screen');
  return {
    id: realm,
    ...(of.gated ? { gated: true } : {}),
    size: { w: ROOM_W, h: ROOM_H },
    background: screen,
    backgrounds: [{ key: screen, x: 0, y: 0 }],
    foregrounds: [],
    mood: of.mood,
    walkable: [START_FLOOR.map((p) => ({ ...p }))],
    spawns: { default: { ...START_ARRIVAL }, 'from-hub': { ...START_ARRIVAL } },
    doors,
    spots: START_FIND_SPOTS.map((p) => ({ ...p })),
    pieces: startPieces(realm, of.decor),
  };
}

/** A realm start's anchors: its guardian over the vote spot. */
export function realmStartAnchors(): Record<string, Vec2> {
  const { idol } = START_SPOTS;
  return { idol: { x: idol.x, y: idol.y } };
}
