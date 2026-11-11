/**
 * The Great Hollow's oval (Nov 8, the owner's word: "can we go more top down, like almost completely top
 * down, but offset in this room, and make it a huge oval with realms kind of all the way around"): the
 * shape of the hollow's floor and where every way out stands on its rim, as plain numbers, so the room
 * (rooms/hollowHall.ts), its leaf piles and moonbeams (interactables.ts) and its drawing all take them
 * from one place.
 *
 * The floor is one big oval seen from almost straight above, tipped a little toward the viewer: the far
 * wall shows its face, tallest at the back and nothing at the two ends, and the near wall only its top.
 * The ways out are spaced evenly round the rim, clockwise from the knothole at the back: each realm's
 * doorway beside its course's gate, its idol between the two, and the trunk's door out to the Party
 * Grove and the hatch down to the arcade at the front.
 */
import type { Vec2 } from './protocol';

/** The room: four screens wide (as the hollow always was) and a little over three screens high. */
export const HALL_W = 6400;
export const HALL_H = 2800;
/** The oval's middle and its half widths: the rim is where the floor meets the wall's foot. */
export const HALL_CX = HALL_W / 2;
export const HALL_CY = 1480;
export const HALL_RX = 2950;
export const HALL_RY = 1150;
/** The middle of the hollow, along it. */
export const HALL_MIDDLE = HALL_CX;
/** How tall the far wall's face is drawn at the very back (room px), less toward the ends, none at them. */
export const WALL_FACE = 260;
/** How deep the near wall's top is drawn past the rim at the front. */
export const WALL_LIP = 70;
/**
 * How much floor an owl at a gathering takes (room px²): an owl is drawn about 100 by 120, and stood
 * among others it wants about 140 across by 110 deep, so names and bubbles don't pile up.
 */
export const OWL_ROOM_PX2 = 140 * 110;

/** The rim at angle `t` (0 east, growing clockwise on screen: -π/2 is the back, π/2 the front). */
export function rimPoint(t: number): Vec2 {
  return { x: HALL_CX + HALL_RX * Math.cos(t), y: HALL_CY + HALL_RY * Math.sin(t) };
}

/** The rim's outward normal at angle `t`, of length 1. */
export function rimNormal(t: number): Vec2 {
  const nx = Math.cos(t) / HALL_RX;
  const ny = Math.sin(t) / HALL_RY;
  const l = Math.hypot(nx, ny);
  return { x: nx / l, y: ny / l };
}

/** The rim measured along its length from the back, clockwise: SAMPLES points, angle and length so far. */
const SAMPLES = 2880;
const ANGLES: number[] = [];
const LENGTHS: number[] = [];
{
  let s = 0;
  let prev = rimPoint(-Math.PI / 2);
  for (let i = 0; i <= SAMPLES; i++) {
    const t = -Math.PI / 2 + (i / SAMPLES) * 2 * Math.PI;
    const p = rimPoint(t);
    s += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
    ANGLES.push(t);
    LENGTHS.push(s);
  }
}
/** How long the rim is, round (room px). */
export const RIM_LENGTH = LENGTHS[SAMPLES]!;

/** The angle of the rim `s` px clockwise from the back along it (any `s`: it wraps round). */
export function angleAt(s: number): number {
  const w = ((s % RIM_LENGTH) + RIM_LENGTH) % RIM_LENGTH;
  let lo = 0;
  let hi = SAMPLES;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LENGTHS[mid]! <= w) lo = mid;
    else hi = mid;
  }
  const a = LENGTHS[lo]!;
  const b = LENGTHS[hi]!;
  const k = b > a ? (w - a) / (b - a) : 0;
  return ANGLES[lo]! + k * (ANGLES[hi]! - ANGLES[lo]!);
}

/** The point `inset` px in from the rim (straight in, along its normal), `s` px round it from the back. */
export function rimAt(s: number, inset = 0): Vec2 {
  const t = angleAt(s);
  const p = rimPoint(t);
  const n = rimNormal(t);
  return { x: Math.round(p.x - n.x * inset), y: Math.round(p.y - n.y * inset) };
}

/** The point on the oval `k` of the way out from the middle toward the rim, `s` px round it (rings of the floor). */
export function ringAt(s: number, k: number): Vec2 {
  const p = rimPoint(angleAt(s));
  return { x: Math.round(HALL_CX + (p.x - HALL_CX) * k), y: Math.round(HALL_CY + (p.y - HALL_CY) * k) };
}

/** Whether a point is on the oval's floor, `margin` px in from the rim at least (roughly: by the oval's own measure). */
export function inOval(p: Vec2, margin = 0): boolean {
  const dx = (p.x - HALL_CX) / Math.max(1, HALL_RX - margin);
  const dy = (p.y - HALL_CY) / Math.max(1, HALL_RY - margin);
  return dx * dx + dy * dy <= 1;
}

export type HallLevel = 'glass' | 'ink' | 'grove' | 'market';

/** The ways out round the rim, clockwise from the back, a step apart. */
export const HALL_WAYS = [
  'up',
  'to-grove',
  'course-grove',
  'to-market',
  'course-market',
  'to-party',
  'down',
  'course-ink',
  'to-ink',
  'course-glass',
  'to-glass',
] as const;
export type HallWay = (typeof HALL_WAYS)[number];
/** How far apart two ways stand along the rim. */
export const WAY_STEP = RIM_LENGTH / HALL_WAYS.length;
/** Where a way stands round the rim (px from the back, clockwise). */
export const wayS = (id: HallWay): number => HALL_WAYS.indexOf(id) * WAY_STEP;
/** A way's point on the rim, or `inset` px in from it. */
export const wayAt = (id: HallWay, inset = 0): Vec2 => rimAt(wayS(id), inset);

/**
 * The ways with nothing behind them yet (OP-337; OP-286, the owner's "arches with nothing behind them
 * come down"): the ink-wash realm has no room and the glass realm no course. No doorway, blockade or
 * closed sign stands at one: the tree has grown over it (rooms/hollowHall.ts, HALL_GROWN, which a test
 * holds to what each Commons leads to). A way opens by coming off this list and its Commons gaining the room.
 */
export const GROWN_WAYS: readonly HallWay[] = ['to-ink', 'course-glass'];

/** Each Commons' middle round the rim: between its realm's doorway and its course's gate, where its idol stands. */
export const commonsS = (level: HallLevel): number => (wayS(`to-${level}` as HallWay) + wayS(`course-${level}` as HallWay)) / 2;

/** How the floor is cut in round an idol's base: how deep at its middle, and how far along the rim either way. */
export const IDOL_BASE = 190;
export const IDOL_HALF = 240;
/**
 * A way with nothing behind it yet is no doorway (OP-337): the tree has grown over it, a mound of roots
 * over the knothole painted there. The knotholes are painted about 30 px above their points on the rim
 * and a little out past it where the rim runs up the room's ends, so the mound's foot stands GROWN_DROP
 * below the point and GROWN_OUT out along the rim's lean, and its middle falls on the hole's. The floor
 * is cut in round it as round an idol's base, so owls walk up to the roots and never stand behind them.
 */
export const GROWN_DROP = 105;
export const GROWN_OUT = 50;
export const GROWN_BASE = 190;
export const GROWN_HALF = 240;
/** How far in from the rim the floor runs at `s`: round each idol's base and each grown-over way, eased in and out. */
export function floorInset(s: number, idols: readonly HallLevel[], grown: readonly HallWay[] = []): number {
  const cut = (at: number, base: number, half: number): number => {
    let d = Math.abs(s - at);
    d = Math.min(d, RIM_LENGTH - d);
    return d < half ? (base * (1 + Math.cos((Math.PI * d) / half))) / 2 : 0;
  };
  let inset = 0;
  for (const level of idols) inset = Math.max(inset, cut(commonsS(level), IDOL_BASE, IDOL_HALF));
  for (const id of grown) inset = Math.max(inset, cut(wayS(id), GROWN_BASE, GROWN_HALF));
  return inset;
}
/** Where an idol's foot stands: on its base, in from the rim, off the floor. */
export const idolAt = (level: HallLevel): Vec2 => rimAt(commonsS(level), 70);
/** Its Realm Vote spot: on the floor just in front of its base. */
export const voteAt = (level: HallLevel): Vec2 => rimAt(commonsS(level), 300);

/** Each Commons' plaza: out from its idol toward the middle, where its moonbeam falls. */
export const plazaAt = (level: HallLevel): Vec2 => ringAt(commonsS(level), 0.62);
/** The hollow's heart: the middle of the floor, where the light falls brightest. */
export const HALL_HEART: Vec2 = { x: HALL_CX, y: HALL_CY - 340 };

/**
 * The root runs (OP-308) stand in a line across the middle of the floor, where it is widest: the same
 * runs as ever, in the same order along the hollow, glide for glide, the Commons round the rim either side.
 */
export const RUN_Y = HALL_CY;

/** The moonbeams: one in each Commons' plaza and one at the heart. */
export const HALL_MOONBEAMS: ReadonlyArray<{ id: string; pos: Vec2 }> = [
  ...(['glass', 'ink', 'grove', 'market'] as const).map((level) => ({ id: `moonbeam-${level}`, pos: plazaAt(level) })),
  { id: 'moonbeam-heart', pos: HALL_HEART },
];

/**
 * The leaf piles: blown in at the knothole, they drift round the rim, so two lie in each Commons either
 * side of its plaza, clear of its two doorways' signs and landing spots, one by the hatch, one by the trunk's door, two by the knothole, two either side of
 * the heart and one out in front of it, between the trunk's door and the hatch; and one drifted up by
 * the roots over each grown-over way.
 */
export const HALL_LEAVES: ReadonlyArray<{ id: string; pos: Vec2 }> = [
  ...(['glass', 'ink', 'grove', 'market'] as const).flatMap((level) => [
    { id: `leaves-${level}`, pos: ringAt(commonsS(level) - 600, 0.74) },
    { id: `leaves-${level}-far`, pos: ringAt(commonsS(level) + 600, 0.74) },
  ]),
  { id: 'leaves-hatch', pos: rimAt(wayS('down') + 380, 260) },
  { id: 'leaves-party', pos: rimAt(wayS('to-party') - 380, 260) },
  // A drift of leaves by the roots grown over each way with nothing behind it (OP-337): with no doorway
  // there, that stretch of the rim still has something to do within a few seconds' walk.
  ...GROWN_WAYS.map((id) => ({ id: `leaves-${id}-roots`, pos: rimAt(wayS(id) - 150, 180) })),
  { id: 'leaves-knothole-west', pos: rimAt(wayS('up') - 420, 220) },
  { id: 'leaves-knothole-east', pos: rimAt(wayS('up') + 420, 220) },
  { id: 'leaves-heart-west', pos: { x: HALL_CX - 760, y: HALL_CY + 160 } },
  { id: 'leaves-heart-east', pos: { x: HALL_CX + 760, y: HALL_CY + 160 } },
  { id: 'leaves-front', pos: { x: HALL_CX, y: HALL_CY + 700 } },
];
