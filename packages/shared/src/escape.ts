/**
 * The sealed hollow (OP-310): a co-op escape room, one of the park's mini games, for two to four owls
 * at once. A doorway on the front edge of the grove's clearing (ESCAPE_DOOR, shown only with the
 * `friends` preview flag) leads into an old owl hollow whose last keeper sealed it behind four locks
 * and left notes about them. Each group gets a room of its own, `escape-<8 letters>` (ESCAPE_ROOM is
 * the template, as NEST_ROOM is the nests'), made fresh for every group.
 *
 * Inside, the owls wait in the hollow's lobby for their friends (or owls who came to the door with
 * them) and start when ready: two owls at least, four at most, and no bots fill a seat. Once started,
 * nobody new comes in. The four locks open one after the other, built from the puzzle quests' pieces
 * (puzzles.ts: the owl symbols, the reach, the jam after wrong tries; the lock post, carving and key
 * art of OP-256):
 *
 * 1. the keeper's chest: three carvings on the hollow's roots each show one symbol of its code and its
 *    place in it (owls split up to read them sooner);
 * 2. the moon dial: its code is carved on the east wall, and the carving glows (can be read) only
 *    while another owl perches on the old stump across the hollow: one sits, one reads;
 * 3. the root door: two vines hang at opposite ends of the hollow, and it opens only when two owls tug
 *    them within ESCAPE_VINE_WINDOW_MS of each other;
 * 4. the way out: its key lies up on one of the keeper's shelves (an owl hops up), carried to the old
 *    round door in the north wall.
 *
 * Everything a run's seed decides (the codes, which roots carry the carvings, which shelf holds the
 * key) changes from run to run, as a puzzle run's does. A minute without progress and the hint owl
 * by the lobby offers a hint. Out through the way out, each owl with a ticket earns ESCAPE_FEATHERS,
 * once a park day, and the Hollow Moth the first time it ever escapes; a spectator (OP-191) plays
 * for nothing. The night's restart (OP-181) closes every socket, which ends a run in progress.
 *
 * Pure and platform-free: the room object keeps each run in memory (and in its storage), the tests
 * run it as it is. Every string here is shown to visitors.
 */
import type { CollectionBook } from './book';
import { distance, pointInPolygon, type Polygon, type Rect } from './geometry';
import { sameLevel, type Perch } from './perches';
import { PUZZLE_JAM_MS, PUZZLE_JAM_TRIES, PUZZLE_REACH, PUZZLE_SYMBOLS, type PuzzleSymbol } from './puzzles';
import { rotationRandom } from './parktime';
import type { Vec2 } from './protocol';
import type { RoomDef } from './room';

// ---------- the rooms ----------

/** The letters a sealed hollow's id is made of: lower case and digits, as a nest's. */
const ESCAPE_ID_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789';
export const ESCAPE_ID_LENGTH = 8;
const ESCAPE_ROOM_ID = /^escape-([a-z0-9]{8})$/;

/** Whether a room id is one group's sealed hollow: `escape-` and eight letters or digits. */
export function isEscapeRoom(id: unknown): id is string {
  return typeof id === 'string' && ESCAPE_ROOM_ID.test(id);
}

/** A fresh room id for a new group, from a uniform random source (the room object's is cryptographic). */
export function randomEscapeRoom(random: () => number): string {
  let id = '';
  for (let i = 0; i < ESCAPE_ID_LENGTH; i++) id += ESCAPE_ID_CHARS[Math.min(ESCAPE_ID_CHARS.length - 1, Math.floor(random() * ESCAPE_ID_CHARS.length))];
  return `escape-${id}`;
}

/** The key every sealed hollow is counted and capped under, so no public count names a group's room. */
export const ESCAPE_COUNT = 'escapes';

// ---------- the rules the owner may change (named constants) ----------

/** Owls a group needs to start, and the most it holds (a party, as a puzzle run: PUZZLE_RUN_MAX). */
export const ESCAPE_MIN_OWLS = 2;
export const ESCAPE_MAX_OWLS = 4;
/** A minute with nothing found, tugged or opened, and the hint owl offers a hint. */
export const ESCAPE_HINT_AFTER_MS = 60_000;
/** The two vines must be tugged this close together (ms) to open the root door. */
export const ESCAPE_VINE_WINDOW_MS = 2_500;
/** What an escape pays each owl with a ticket, once a park day (a hard daily quest pays 40, a course's first clear 50). */
export const ESCAPE_FEATHERS = 60;
/** The room's own collectible: given the first time an owl escapes, never sold, never a ticket's worth. */
export const ESCAPE_ITEM = 'hollow-moth~0';
/** A run's aim, for whoever tunes it: a group of ten year olds out in this many minutes, in a few tries. */
export const ESCAPE_TARGET_MINUTES = { least: 8, most: 12 } as const;

// ---------- the doorway in the plaza ----------

/**
 * The doorway into the sealed hollow: on the front edge of the grove's clearing, below the lantern
 * mound, between the west moonbeam and the mound's leaf pile, clear of the floor's scenes (plazaFloor.ts),
 * the leaf piles and the owls who live there. The page draws it (and its sign) only with the `friends`
 * preview flag; the room server answers its frames from that plaza only, near it.
 */
export const ESCAPE_DOOR = {
  room: 'grove',
  rect: { x: 1235, y: 1100, w: 130, h: 90 } satisfies Rect,
  /** The doorway's middle: where its sign stands and where the owl is asked to stand. */
  at: { x: 1300, y: 1145 } satisfies Vec2,
  label: 'The sealed hollow',
  /** Where an owl comes back out (the grove's `from-escape` spawn), a step up the clearing from the doorway. */
  spawn: { x: 1300, y: 1040 } satisfies Vec2,
} as const;
/** The grove's spawn an owl comes out of the hollow at. */
export const ESCAPE_BACK_SPAWN = 'from-escape';

// ---------- the hollow, seen from above ----------

const W = 2400;
const H = 1200;

/** The hollow's floor: an octagon inside its round wall. */
const FLOOR: Polygon = [
  { x: 300, y: 190 },
  { x: 2100, y: 190 },
  { x: 2290, y: 380 },
  { x: 2290, y: 980 },
  { x: 2100, y: 1140 },
  { x: 300, y: 1140 },
  { x: 110, y: 980 },
  { x: 110, y: 380 },
];

const boxAt = (cx: number, cy: number, w: number, h: number): Polygon => [
  { x: cx - w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy - h / 2 },
  { x: cx + w / 2, y: cy + h / 2 },
  { x: cx - w / 2, y: cy + h / 2 },
];

/** How high the stump and the shelves stand: a hop up, as the plazas' mounds. */
export const ESCAPE_PERCH_TOP = 36;

/** The old stump the keeper sat on (the pressure plate): an owl perched on it lights the moon carving. */
export const ESCAPE_STUMP: Perch = { id: 'escape-stump', area: boxAt(640, 1020, 160, 80), top: ESCAPE_PERCH_TOP };
/** The keeper's three shelves: the key to the way out lies up on one of them (the seed says which). */
export const ESCAPE_SHELVES: readonly Perch[] = [
  { id: 'escape-shelf-0', area: boxAt(1000, 910, 140, 60), top: ESCAPE_PERCH_TOP },
  { id: 'escape-shelf-1', area: boxAt(1500, 430, 140, 60), top: ESCAPE_PERCH_TOP },
  { id: 'escape-shelf-2', area: boxAt(2000, 300, 140, 60), top: ESCAPE_PERCH_TOP },
];

/** Where things stand in the hollow (room px, feet on the floor). */
export const ESCAPE_PLACES = {
  spawn: { x: 330, y: 770 },
  /** The keeper's old friend, who gives hints: by the lobby, where the owls wait. */
  hintOwl: { x: 430, y: 560 },
  /** The five roots the keeper might have carved; a run's seed picks three. */
  roots: [
    { x: 520, y: 300 },
    { x: 1000, y: 260 },
    { x: 1560, y: 270 },
    { x: 2150, y: 560 },
    { x: 1400, y: 1080 },
  ],
  /** The moon carving on the east wall, far across the hollow from the stump. */
  moon: { x: 2190, y: 820 },
  vines: [
    { id: 'west', x: 200, y: 450 },
    { id: 'east', x: 2200, y: 1000 },
  ],
} as const;

/** The way back out to the clearing, in the west wall: always open (leaving ends the owl's part in the run). */
const OUT_DOOR = { id: 'to-grove', rect: { x: 110, y: 690, w: 70, h: 150 }, marker: { x: 145, y: 640 }, label: 'Back to the clearing' };

export type EscapeLockId = 'chest' | 'dial' | 'roots' | 'way-out';
export type EscapeLockKind = 'code' | 'vines' | 'key';

export interface EscapeLockDef {
  id: EscapeLockId;
  /** Shown to visitors. */
  name: string;
  kind: EscapeLockKind;
  /** Symbols in its code (a code lock). */
  length: number;
  requires: readonly EscapeLockId[];
  /** Where it stands. */
  post: Vec2;
  /** What the hint owl says about it, for ten year olds. */
  hint: string;
  /** The keeper's note about it, read in the panel. */
  note: string;
}

/** The four locks, in the order they open. */
export const ESCAPE_LOCKS: readonly EscapeLockDef[] = [
  {
    id: 'chest',
    name: "The keeper's chest",
    kind: 'code',
    length: 3,
    requires: [],
    post: { x: 1200, y: 680 },
    hint: 'Three roots have the keeper’s carvings. Split up and read all three. Each one shows a symbol and its number: put them in the chest in that order.',
    note: 'I carved the chest’s code into my roots, one symbol to a root, so I would never forget it.',
  },
  {
    id: 'dial',
    name: 'The moon dial',
    kind: 'code',
    length: 3,
    requires: ['chest'],
    post: { x: 1750, y: 640 },
    hint: 'The moon carving on the east wall only glows while an owl sits on the old stump. One of you perches on the stump, another reads the carving.',
    note: 'The moon carving shows itself only while someone rests on my old stump.',
  },
  {
    id: 'roots',
    name: 'The root door',
    kind: 'vines',
    length: 0,
    requires: ['dial'],
    post: { x: 760, y: 240 },
    hint: 'The two hanging vines must be tugged together. One owl at each vine: say "Let\'s go!" and tug at the same time.',
    note: 'My root door needs two tugs at once, one on each vine. It always took two of us.',
  },
  {
    id: 'way-out',
    name: 'The way out',
    kind: 'key',
    length: 1,
    requires: ['roots'],
    post: { x: 1200, y: 215 },
    hint: 'The last key is up on one of the keeper’s shelves. Hop up onto the shelves to find it, then bring it to the round door in the north wall.',
    note: 'I left the key to the round door up on a shelf, out of reach of mice.',
  },
];

const LOCK_BY_ID: Readonly<Record<string, EscapeLockDef>> = Object.fromEntries(ESCAPE_LOCKS.map((l) => [l.id, l]));

export function escapeLock(id: unknown): EscapeLockDef | undefined {
  return typeof id === 'string' && Object.hasOwn(LOCK_BY_ID, id) ? LOCK_BY_ID[id] : undefined;
}

/**
 * The sealed hollow every group plays, as a template: each group's room is this under its own id, as
 * roomFor gives it. Drawn in plain size boxes (`drawn`) until its art is made: the floor and the wall,
 * and each piece (the stump, the vines, the shelves, the round door) a box with its size written on it.
 */
export const ESCAPE_ROOM: RoomDef = {
  id: 'escape',
  size: { w: W, h: H },
  background: 'escape',
  mood: 'hub',
  view: 'top',
  drawn: true,
  walkable: [FLOOR],
  perches: [ESCAPE_STUMP, ...ESCAPE_SHELVES],
  spawns: { default: ESCAPE_PLACES.spawn },
  doors: [{ id: OUT_DOOR.id, rect: OUT_DOOR.rect, to: { room: ESCAPE_DOOR.room, spawn: ESCAPE_BACK_SPAWN }, marker: OUT_DOOR.marker, label: OUT_DOOR.label }],
};

// ---------- a run's seed ----------

export interface EscapeLayout {
  /** The chest's code, and the root each of its carvings is on (carving n shows symbol n). */
  chest: { code: PuzzleSymbol[]; carvings: Vec2[] };
  /** The moon dial's code, all of it on the moon carving. */
  dial: { code: PuzzleSymbol[] };
  /** Which shelf the key lies on. */
  shelf: number;
}

function shuffled<T>(list: readonly T[], rnd: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Everything a run's seed decides. Never sent to a page: the page sees only what the owls found. */
export function escapeLayout(seed: string): EscapeLayout {
  const rnd = rotationRandom(`owl-park-escape|${seed}`);
  const sym = () => PUZZLE_SYMBOLS[Math.floor(rnd() * PUZZLE_SYMBOLS.length)]!;
  const carvings = shuffled(ESCAPE_PLACES.roots, rnd).slice(0, 3);
  return {
    chest: { code: carvings.map(sym), carvings: carvings.map((c) => ({ x: c.x, y: c.y })) },
    dial: { code: [sym(), sym(), sym()] },
    shelf: Math.floor(rnd() * ESCAPE_SHELVES.length),
  };
}

/** A shelf's middle, where its key lies. */
function shelfAt(i: number): Vec2 & { top: number } {
  const a = ESCAPE_SHELVES[i]!.area;
  return { x: (a[0]!.x + a[2]!.x) / 2, y: (a[0]!.y + a[2]!.y) / 2, top: ESCAPE_PERCH_TOP };
}

// ---------- a run ----------

export type EscapePhase = 'lobby' | 'running' | 'escaped';

export interface EscapeMember {
  /** The owl's id in the room. */
  owl: string;
  /** Its collector, when it has one: what pays it. */
  cid: string | null;
  /** A spectator (OP-191): plays along, earns nothing. */
  spec: boolean;
}

/** One group's run of the hollow, as the room object keeps it (plain JSON). */
export interface EscapeState {
  room: string;
  /** Every code and placement comes from it: fresh for every group, never sent to a page. */
  seed: string;
  phase: EscapePhase;
  createdAt: number;
  startedAt: number | null;
  endedAt: number | null;
  /** The group, in the order it came in. Once started it is closed: nobody new joins. */
  members: EscapeMember[];
  opened: EscapeLockId[];
  /** Clues read: `chest:n` for the chest's carvings, `dial` for the moon carving. */
  found: string[];
  hasKey: boolean;
  /** The last tug of each vine. */
  tugs: Record<string, { owl: string; at: number }>;
  /** Wrong codes in a row, and until when it is jammed, by lock. */
  misses: Record<string, { n: number; until: number }>;
  /** The last time anything moved (found, tugged, taken, opened, a hint): a minute after, a hint is offered. */
  progressAt: number;
  hints: number;
  /** Owls whose escape was settled (paid, or told they played for nothing). */
  settled: string[];
}

/** Where each owl of the room stands now, as the room server sees it: its feet and what it stands on. */
export type EscapeStanding = ReadonlyMap<string, { pos: Vec2; ground: number }>;

export function newEscape(room: string, seed: string, now: number): EscapeState {
  return { room, seed, phase: 'lobby', createdAt: now, startedAt: null, endedAt: null, members: [], opened: [], found: [], hasKey: false, tugs: {}, misses: {}, progressAt: now, hints: 0, settled: [] };
}

export type EscapeRefusal =
  | 'unknown'
  | 'not-member'
  | 'full'
  | 'started'
  | 'few'
  | 'not-started'
  | 'over'
  | 'far'
  | 'locked'
  | 'open'
  | 'dark'
  | 'no-key'
  | 'jammed'
  | 'wrong'
  | 'not-yet';

export type EscapeAnswer = { ok: true; moved: boolean; opened?: EscapeLockId; escaped?: boolean; hint?: string } | { ok: false; reason: EscapeRefusal; left?: number };

const no = (reason: EscapeRefusal, left?: number): EscapeAnswer => ({ ok: false, reason, ...(left !== undefined ? { left } : {}) });

function memberOf(s: EscapeState, owl: string): EscapeMember | undefined {
  return s.members.find((m) => m.owl === owl);
}

function available(s: EscapeState, l: EscapeLockDef): boolean {
  return l.requires.every((r) => s.opened.includes(r));
}

/** The lock the group works on now: the first one not open. */
export function currentLock(s: Pick<EscapeState, 'opened'>): EscapeLockDef | null {
  return ESCAPE_LOCKS.find((l) => !s.opened.includes(l.id)) ?? null;
}

/** Whether an owl standing so reaches a point on the floor (or up on a perch `top` high). */
function reaches(at: { pos: Vec2; ground: number } | undefined, p: Vec2, top = 0): boolean {
  return !!at && distance(at.pos, p) <= PUZZLE_REACH && sameLevel(at.ground, { top });
}

/** The owls of the group perched on the old stump now. */
export function onStump(s: EscapeState, standing: EscapeStanding): string[] {
  return s.members.filter((m) => {
    const at = standing.get(m.owl);
    return !!at && at.ground === ESCAPE_STUMP.top && pointInPolygon(at.pos, ESCAPE_STUMP.area);
  }).map((m) => m.owl);
}

/** An owl comes into the room: into the group while it waits in the lobby; back into it once started, only if it was in it. */
export function escapeJoin(s: EscapeState, m: EscapeMember): EscapeAnswer {
  if (memberOf(s, m.owl)) return { ok: true, moved: false };
  if (s.phase !== 'lobby') return no('started');
  if (s.members.length >= ESCAPE_MAX_OWLS) return no('full');
  s.members.push({ owl: m.owl, cid: m.cid, spec: m.spec });
  return { ok: true, moved: true };
}

/** An owl left the room: out of the group while it waits; once started it keeps its place (it may come back). */
export function escapeLeave(s: EscapeState, owl: string): boolean {
  if (s.phase !== 'lobby' || !memberOf(s, owl)) return false;
  s.members = s.members.filter((m) => m.owl !== owl);
  return true;
}

/** Start the run: any owl of the group, once ESCAPE_MIN_OWLS of it are in the room. */
export function escapeStart(s: EscapeState, owl: string, here: number, now: number): EscapeAnswer {
  if (!memberOf(s, owl)) return no('not-member');
  if (s.phase !== 'lobby') return no('started');
  if (here < ESCAPE_MIN_OWLS || s.members.length < ESCAPE_MIN_OWLS) return no('few');
  s.phase = 'running';
  s.startedAt = now;
  s.progressAt = now;
  return { ok: true, moved: true };
}

/** The checks every step of a run shares: the owl is in the group, the run is under way. */
function inRun(s: EscapeState, owl: string): EscapeAnswer | null {
  if (!memberOf(s, owl)) return no('not-member');
  if (s.phase === 'lobby') return no('not-started');
  if (s.phase === 'escaped') return no('over');
  return null;
}

function lockReady(s: EscapeState, id: EscapeLockId): EscapeAnswer | EscapeLockDef {
  const l = escapeLock(id)!;
  if (s.opened.includes(id)) return no('open');
  if (!available(s, l)) return no('locked');
  return l;
}

const isAnswer = (v: EscapeAnswer | EscapeLockDef): v is EscapeAnswer => 'ok' in v;

/**
 * Read a clue: carving `n` of the chest, or the moon carving (`dial`). The moon carving can be read only
 * while another owl of the group perches on the stump: the reader can never hold it alone.
 */
export function escapeLook(s: EscapeState, owl: string, lock: unknown, n: number, standing: EscapeStanding, now: number): EscapeAnswer {
  const bad = inRun(s, owl);
  if (bad) return bad;
  if (lock !== 'chest' && lock !== 'dial') return no('unknown');
  const l = lockReady(s, lock);
  if (isAnswer(l)) return l;
  const at = standing.get(owl);
  const lay = escapeLayout(s.seed);
  let id: string;
  if (lock === 'chest') {
    if (!Number.isInteger(n) || n < 0 || n >= l.length) return no('unknown');
    if (!reaches(at, lay.chest.carvings[n]!)) return no('far');
    id = `chest:${n}`;
  } else {
    if (!reaches(at, ESCAPE_PLACES.moon)) return no('far');
    if (!onStump(s, standing).some((o) => o !== owl)) return no('dark');
    id = 'dial';
  }
  if (s.found.includes(id)) return { ok: true, moved: false };
  s.found.push(id);
  s.progressAt = now;
  return { ok: true, moved: true };
}

/** Tug a vine (`west` or `east`). The root door opens when the other vine was tugged by another owl within the window. */
export function escapeTug(s: EscapeState, owl: string, vine: unknown, standing: EscapeStanding, now: number): EscapeAnswer {
  const bad = inRun(s, owl);
  if (bad) return bad;
  const v = ESCAPE_PLACES.vines.find((x) => x.id === vine);
  if (!v) return no('unknown');
  const l = lockReady(s, 'roots');
  if (isAnswer(l)) return l;
  if (!reaches(standing.get(owl), v)) return no('far');
  s.tugs[v.id] = { owl, at: now };
  s.progressAt = now;
  const other = ESCAPE_PLACES.vines.find((x) => x.id !== v.id)!;
  const t = s.tugs[other.id];
  if (t && t.owl !== owl && now - t.at <= ESCAPE_VINE_WINDOW_MS) {
    s.opened.push('roots');
    s.tugs = {};
    return { ok: true, moved: true, opened: 'roots' };
  }
  return { ok: true, moved: true };
}

/** Pick up the key to the way out from its shelf: the owl must be up on that shelf. */
export function escapeTake(s: EscapeState, owl: string, standing: EscapeStanding, now: number): EscapeAnswer {
  const bad = inRun(s, owl);
  if (bad) return bad;
  const l = lockReady(s, 'way-out');
  if (isAnswer(l)) return l;
  if (s.hasKey) return { ok: true, moved: false };
  const shelf = shelfAt(escapeLayout(s.seed).shelf);
  if (!reaches(standing.get(owl), shelf, shelf.top)) return no('far');
  s.hasKey = true;
  s.progressAt = now;
  return { ok: true, moved: true };
}

/** Work a lock at its post: a code lock with its code (wrong tries jam it, as a puzzle's lock); the way out with its key. */
export function escapeOpen(s: EscapeState, owl: string, lock: unknown, code: readonly string[] | undefined, standing: EscapeStanding, now: number): EscapeAnswer {
  const bad = inRun(s, owl);
  if (bad) return bad;
  const def = escapeLock(lock);
  if (!def || def.kind === 'vines') return no('unknown');
  const l = lockReady(s, def.id);
  if (isAnswer(l)) return l;
  if (!reaches(standing.get(owl), l.post)) return no('far');
  if (l.kind === 'key') {
    if (!s.hasKey) return no('no-key');
  } else {
    const jam = s.misses[l.id] ?? { n: 0, until: 0 };
    if (jam.until > now) return no('jammed');
    const lay = escapeLayout(s.seed);
    const want = l.id === 'chest' ? lay.chest.code : lay.dial.code;
    const right = Array.isArray(code) && code.length === want.length && code.every((c, i) => c === want[i]);
    if (!right) {
      jam.n = jam.until && jam.until <= now ? 1 : jam.n + 1;
      jam.until = 0;
      if (jam.n >= PUZZLE_JAM_TRIES) {
        jam.n = 0;
        jam.until = now + PUZZLE_JAM_MS;
      }
      s.misses[l.id] = jam;
      return no('wrong', jam.until ? 0 : PUZZLE_JAM_TRIES - jam.n);
    }
    delete s.misses[l.id];
  }
  s.opened.push(l.id);
  s.progressAt = now;
  if (l.id === 'way-out') {
    s.phase = 'escaped';
    s.endedAt = now;
    return { ok: true, moved: true, opened: l.id, escaped: true };
  }
  return { ok: true, moved: true, opened: l.id };
}

/** Whether the hint owl has a hint ready: a minute after the last progress (or the start, or the last hint). */
export function hintReady(s: Pick<EscapeState, 'phase' | 'progressAt'>, now: number): boolean {
  return s.phase === 'running' && now - s.progressAt >= ESCAPE_HINT_AFTER_MS;
}

/** Ask the hint owl, standing by it: the hint for the lock the group is on, once a stuck minute has gone by. */
export function escapeHint(s: EscapeState, owl: string, standing: EscapeStanding, now: number): EscapeAnswer {
  const bad = inRun(s, owl);
  if (bad) return bad;
  if (!reaches(standing.get(owl), ESCAPE_PLACES.hintOwl)) return no('far');
  if (!hintReady(s, now)) return no('not-yet');
  const l = currentLock(s);
  if (!l) return no('over');
  s.hints += 1;
  s.progressAt = now;
  return { ok: true, moved: true, hint: l.hint };
}

// ---------- what a page sees ----------

export interface EscapeClueView extends Vec2 {
  n: number;
  /** The symbol once the group read it, else null. */
  symbol: PuzzleSymbol | null;
}

export interface EscapeLockView {
  id: EscapeLockId;
  name: string;
  kind: EscapeLockKind;
  note: string;
  post: Vec2;
  length: number;
  /** Its locks before it are open: it can be worked. */
  available: boolean;
  open: boolean;
  /** A code lock's clues where they are and, once read, their symbols (only while it can be worked). */
  clues: EscapeClueView[];
  jammedUntil: number;
}

export interface EscapeView {
  room: string;
  phase: EscapePhase;
  /** Owls in the group, and how many it needs and holds. */
  owls: number;
  min: number;
  max: number;
  /** This owl is in the group. */
  member: boolean;
  /** This owl plays for nothing (a spectator). */
  practice: boolean;
  startedAt: number | null;
  endedAt: number | null;
  locks: EscapeLockView[];
  /** An owl of the group perches on the stump now: the moon carving glows. */
  lit: boolean;
  /** The vines, and when each was last tugged (0: not lately). */
  vines: Array<{ id: string; x: number; y: number; tuggedAt: number }>;
  /** The key on its shelf, while it can be found and before it is picked up. */
  key: (Vec2 & { top: number }) | null;
  hasKey: boolean;
  /** The hint owl has a hint ready. */
  hint: boolean;
  /** When the next hint is ready (0 when not running). */
  hintAt: number;
}

export function escapeView(s: EscapeState, owl: string, standing: EscapeStanding, now: number): EscapeView {
  const lay = escapeLayout(s.seed);
  const me = memberOf(s, owl);
  const running = s.phase === 'running';
  const locks: EscapeLockView[] = ESCAPE_LOCKS.map((l) => {
    const open = s.opened.includes(l.id);
    const avail = available(s, l);
    const show = running && avail && !open;
    let clues: EscapeClueView[] = [];
    if (show && l.id === 'chest') clues = lay.chest.carvings.map((c, n) => ({ x: c.x, y: c.y, n, symbol: s.found.includes(`chest:${n}`) ? lay.chest.code[n]! : null }));
    if (show && l.id === 'dial') {
      const read = s.found.includes('dial');
      clues = lay.dial.code.map((sym, n) => ({ x: ESCAPE_PLACES.moon.x, y: ESCAPE_PLACES.moon.y, n, symbol: read ? sym : null }));
    }
    const jam = s.misses[l.id];
    return { id: l.id, name: l.name, kind: l.kind, note: l.note, post: l.post, length: l.length, available: avail, open, clues, jammedUntil: jam && jam.until > now ? jam.until : 0 };
  });
  const keyShows = running && available(s, escapeLock('way-out')!) && !s.hasKey;
  return {
    room: s.room,
    phase: s.phase,
    owls: s.members.length,
    min: ESCAPE_MIN_OWLS,
    max: ESCAPE_MAX_OWLS,
    member: !!me,
    practice: me?.spec === true,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    locks,
    lit: running && onStump(s, standing).length > 0,
    vines: ESCAPE_PLACES.vines.map((v) => ({ id: v.id, x: v.x, y: v.y, tuggedAt: s.tugs[v.id] && now - s.tugs[v.id]!.at <= ESCAPE_VINE_WINDOW_MS ? s.tugs[v.id]!.at : 0 })),
    key: keyShows ? shelfAt(lay.shelf) : null,
    hasKey: s.hasKey,
    hint: hintReady(s, now),
    hintAt: running ? s.progressAt + ESCAPE_HINT_AFTER_MS : 0,
  };
}

/** A stored run, cleaned: null for anything that is not one. */
export function cleanEscape(raw: unknown): EscapeState | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const str = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64;
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  if (!isEscapeRoom(v['room']) || !str(v['seed']) || !num(v['createdAt']) || !num(v['progressAt'])) return null;
  const phase = v['phase'];
  if (phase !== 'lobby' && phase !== 'running' && phase !== 'escaped') return null;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter(str).slice(0, 16) : []);
  const members = (Array.isArray(v['members']) ? v['members'] : [])
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object' && str((m as Record<string, unknown>)['owl']))
    .slice(0, ESCAPE_MAX_OWLS)
    .map((m) => ({ owl: m['owl'] as string, cid: str(m['cid']) ? m['cid'] : null, spec: m['spec'] === true }));
  const record = <T>(x: unknown, ok: (y: unknown) => y is T): Record<string, T> => {
    const out: Record<string, T> = {};
    if (x && typeof x === 'object' && !Array.isArray(x)) for (const [k, y] of Object.entries(x)) if (ok(y)) out[k] = y;
    return out;
  };
  const isTug = (y: unknown): y is { owl: string; at: number } => !!y && typeof y === 'object' && str((y as { owl?: unknown }).owl) && num((y as { at?: unknown }).at);
  const isMiss = (y: unknown): y is { n: number; until: number } => !!y && typeof y === 'object' && num((y as { n?: unknown }).n) && num((y as { until?: unknown }).until);
  return {
    room: v['room'],
    seed: v['seed'],
    phase,
    createdAt: v['createdAt'],
    startedAt: num(v['startedAt']) ? v['startedAt'] : null,
    endedAt: num(v['endedAt']) ? v['endedAt'] : null,
    members,
    opened: list(v['opened']).filter((id): id is EscapeLockId => !!escapeLock(id)),
    found: list(v['found']),
    hasKey: v['hasKey'] === true,
    tugs: record(v['tugs'], isTug),
    misses: record(v['misses'], isMiss),
    progressAt: v['progressAt'],
    hints: num(v['hints']) ? v['hints'] : 0,
    settled: list(v['settled']),
  };
}

// ---------- the pay ----------

/** What an escape paid one owl: feathers (0 once today's are paid), the Hollow Moth the first time, the balance. */
export interface EscapePaid {
  feathers: number;
  total: number;
  /** The room's collectible, when this escape gave it (only ever once). */
  item?: string;
  /** Why fewer feathers than ESCAPE_FEATHERS: today's escape already paid. */
  why?: 'paid-today';
  /** A spectator's escape (OP-191): nothing earned. */
  practice?: true;
}

/** Pay an owl with a ticket for its escape: ESCAPE_FEATHERS once a park day, and the Hollow Moth once ever. */
export function payEscape(book: CollectionBook, cid: string, now: number): EscapePaid {
  const earned = book.earnCapped(cid, 'escape', ESCAPE_FEATHERS, ESCAPE_FEATHERS, now);
  const g = book.grant(cid, ESCAPE_ITEM, 'granted', now);
  return {
    feathers: earned.added,
    total: book.feathers(cid, now),
    ...(g.ok && g.added ? { item: ESCAPE_ITEM } : {}),
    ...(earned.added === 0 ? { why: 'paid-today' as const } : {}),
  };
}
