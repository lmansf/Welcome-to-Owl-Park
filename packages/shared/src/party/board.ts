/**
 * The Old Stump's board (OP-314, the party game's design): a loop of 30 spaces carved into the top of
 * an old stump, seen from above. Two forks each split the way into a short risky way (a bramble) and a
 * long safe way (berries), and one hollow space has a shortcut through the trunk to the far side of the
 * loop. Space 0 is where every owl starts. Pure data and rules, shared by the room server and the page.
 */

export type SpaceKind = 'berry' | 'bramble' | 'updraft' | 'downdraft' | 'fact' | 'knot' | 'hollow';
export const SPACE_KINDS: readonly SpaceKind[] = ['berry', 'bramble', 'updraft', 'downdraft', 'fact', 'knot', 'hollow'];

export interface Space {
  n: number;
  kind: SpaceKind;
  /** Where the way goes on: one space, or at a fork two, the short way first and the long way second. */
  next: readonly number[];
  /** Where it is drawn on the stump, in board units (BOARD_W x BOARD_H). */
  at: { x: number; y: number };
  /** A hollow space: where the shortcut through the trunk comes out. */
  hollowTo?: number;
}

/** The board drawn in these units; the page scales it to the stump on the screen. */
export const BOARD_W = 1000;
export const BOARD_H = 640;

/** What a space does, in the few words a ten year old reads on it. */
export const SPACE_WORDS: Readonly<Record<SpaceKind, { name: string; does: string }>> = {
  berry: { name: 'Berries', does: '+3 Glowberries' },
  bramble: { name: 'Bramble', does: '-3 Glowberries' },
  updraft: { name: 'Updraft', does: 'Fly 3 spaces on' },
  downdraft: { name: 'Downdraft', does: 'Sink 2 spaces back' },
  fact: { name: 'Owl Fact', does: 'True or false?' },
  knot: { name: 'Knot-hole', does: 'A surprise!' },
  hollow: { name: 'Hollow', does: 'Shortcut for 5' },
};

/** Glowberries a berry space gives and a bramble takes. */
export const BERRY_GAIN = 3;
export const BRAMBLE_LOSS = 3;
/** Spaces an updraft carries an owl on, and a downdraft takes it back. */
export const UPDRAFT_SPACES = 3;
export const DOWNDRAFT_SPACES = 2;
/** Glowberries a right Owl Fact gives. */
export const FACT_GAIN = 5;
/** What the hollow's shortcut costs. */
export const HOLLOW_COST = 5;
/** Glowberries a knot-hole's gift gives every owl. */
export const KNOT_GIFT = 2;
/** Glowberries one Moonstone costs at the Moon Perch. */
export const MOONSTONE_COST = 10;

// The loop, space by space: kinds by number, and the ways on from each.
const KINDS: readonly SpaceKind[] = [
  'berry', 'berry', 'fact', 'bramble', 'knot', 'berry', // 0-5, a fork at 5
  'bramble', 'updraft', // 6-7: the first fork's short way
  'berry', 'fact', 'berry', // 8-10: its long way
  'berry', 'downdraft', 'hollow', 'berry', 'fact', 'knot', 'berry', 'bramble', 'berry', // 11-19, a fork at 19
  'bramble', 'updraft', // 20-21: the second fork's short way
  'berry', 'knot', 'berry', // 22-24: its long way
  'fact', 'berry', 'bramble', 'downdraft', 'berry', // 25-29, then round to 0
];

const NEXT: Readonly<Record<number, readonly number[]>> = {
  5: [6, 8],
  7: [11],
  10: [11],
  19: [20, 22],
  21: [25],
  24: [25],
  29: [0],
};

/** The hollow's way through the trunk: from space 13 out at space 26, across the loop. */
export const HOLLOW_FROM = 13;
export const HOLLOW_TO = 26;

/** The order spaces go round the loop for drawing, the long ways counted (each short way is drawn inside its long one). */
const RING = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 23, 24, 25, 26, 27, 28, 29];
const SHORT_WAYS: ReadonlyArray<{ from: number; to: number; spaces: readonly number[] }> = [
  { from: 5, to: 11, spaces: [6, 7] },
  { from: 19, to: 25, spaces: [20, 21] },
];

function ringPoint(i: number, scale: number): { x: number; y: number } {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / RING.length;
  return { x: Math.round(BOARD_W / 2 + 420 * scale * Math.cos(a)), y: Math.round(BOARD_H / 2 + 255 * scale * Math.sin(a)) };
}

function placeOf(n: number): { x: number; y: number } {
  const i = RING.indexOf(n);
  if (i >= 0) return ringPoint(i, 1);
  for (const way of SHORT_WAYS) {
    const k = way.spaces.indexOf(n);
    if (k < 0) continue;
    const a = RING.indexOf(way.from);
    const b = RING.indexOf(way.to);
    return ringPoint(a + ((b - a) * (k + 1)) / (way.spaces.length + 1), 0.72);
  }
  throw new Error(`space ${n} has no place`);
}

export const BOARD: readonly Space[] = KINDS.map((kind, n) => ({
  n,
  kind,
  next: NEXT[n] ?? [n + 1],
  at: placeOf(n),
  ...(n === HOLLOW_FROM ? { hollowTo: HOLLOW_TO } : {}),
}));

export const START_SPACE = 0;

export function space(n: number): Space {
  return BOARD[n] ?? BOARD[0]!;
}

/** Whether a space is a fork: two ways on. */
export function isFork(n: number): boolean {
  return space(n).next.length > 1;
}

/** Where the Moon Perch may stand: a berry space that is no fork and not the start. */
export const PERCH_SPACES: readonly number[] = BOARD.filter((s) => s.kind === 'berry' && s.next.length === 1 && s.n !== START_SPACE).map((s) => s.n);

/** The fewest hops from one space to another going on round the loop (either way at a fork). */
export function hopsBetween(from: number, to: number): number {
  const seen = new Map<number, number>([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    const d = seen.get(at)!;
    if (at === to) return d;
    for (const n of space(at).next) {
      if (!seen.has(n)) {
        seen.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return Number.POSITIVE_INFINITY;
}
