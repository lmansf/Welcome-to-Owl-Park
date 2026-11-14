/**
 * Puzzle quests (OP-255, design OP-253): escape-room quests of locks and keys. A puzzle is a set of
 * locks; a lock may need other locks open first, and several are open from the start, so owls can
 * split up or work one lock together. Two kinds of lock:
 *
 * - a code lock: a short code of owl symbols, each symbol carved on a clue hidden in the park;
 * - a key lock: a key hidden at a spot in another room, carried to the lock.
 *
 * A run is one attempt at a puzzle. Every run has its own seed, so the codes, the clue spots and the
 * key spots differ from run to run: nothing learnt in one run opens a lock in another. Up to
 * PUZZLE_RUN_MAX owls share a run (start one at the quest's giver, or join the owl next to you).
 *
 * Progress is per player (OP-253 rule 5): each owl keeps its own list of the locks it opened. A lock
 * that opens counts for every member of the run; locks a run opened before an owl joined do not count
 * for it. A run an owl starts carries the locks it already opened, so it can pick the puzzle back up
 * with friends later; an owl that joins a run further behind redoes those locks with it (rule 7).
 * The puzzle's quest is ready to hand in when the owl's own list holds every lock.
 *
 * Pure and platform-free like the rest of the quest rules: the collections object runs it over its
 * SQLite, the local mode and the tests over the memory store. Every string here is shown to
 * visitors: public-safe words only, places by their public names (PLACE_NAMES).
 */
import { distance } from './geometry';
import { INTERACTABLES } from './interactables';
import { NPCS, placeName } from './npcs';
import { sameLevel, type Raised } from './perches';
import { rotationRandom } from './parktime';
import type { Vec2 } from './protocol';

export const PUZZLE_SYMBOLS = ['moon', 'leaf', 'feather', 'acorn', 'star', 'mushroom'] as const;
export type PuzzleSymbol = (typeof PUZZLE_SYMBOLS)[number];

export type LockKind = 'code' | 'key';

export interface LockDef {
  id: string;
  /** Shown to visitors. */
  name: string;
  kind: LockKind;
  /** Where the lock stands. */
  room: string;
  /** Where its clues (a code lock) or its key (a key lock) are hidden. */
  hideRoom: string;
  /** Symbols in the code (a code lock); 1 for a key lock. */
  length: number;
  /** Locks that must be open in the run before this one shows its clues or key and can be opened. */
  requires: readonly string[];
}

export interface PuzzleDef {
  id: string;
  title: string;
  locks: readonly LockDef[];
}

/** Most owls in one run (OP-115's party size). */
export const PUZZLE_RUN_MAX = 4;
/** How close (room pixels, feet to the spot) an owl must stand to read a clue, take a key or work a lock. */
export const PUZZLE_REACH = 96;
/** Wrong codes in a row before a lock jams, and how long it stays jammed: guessing a code is slower than finding it. */
export const PUZZLE_JAM_TRIES = 5;
export const PUZZLE_JAM_MS = 20_000;
/** Puzzle pieces keep this far from NPC owls and interactables, so none hides under one. */
const PIECE_CLEARANCE = 90;

export const PUZZLES: readonly PuzzleDef[] = [
  {
    id: 'lockbox',
    title: "The tinker's lockbox",
    locks: [
      { id: 'bark-latch', name: 'The bark latch', kind: 'code', room: 'grove', hideRoom: 'grove', length: 3, requires: [] },
      { id: 'lantern-lock', name: 'The lantern lock', kind: 'key', room: 'hub', hideRoom: 'market', length: 1, requires: [] },
      { id: 'star-dial', name: 'The star dial', kind: 'code', room: 'market', hideRoom: 'hub', length: 4, requires: ['bark-latch'] },
      { id: 'lockbox', name: 'The lockbox', kind: 'code', room: 'market', hideRoom: 'grove', length: 4, requires: ['lantern-lock', 'star-dial'] },
    ],
  },
  {
    id: 'moon-gate',
    title: 'The moonlit gate',
    locks: [
      { id: 'root-door', name: 'The root door', kind: 'key', room: 'grove', hideRoom: 'hub', length: 1, requires: [] },
      { id: 'moth-dial', name: 'The moth dial', kind: 'code', room: 'hub', hideRoom: 'market', length: 3, requires: [] },
      // Its last lock stands in the ink garden, by the round moon gate painted in its wall (OP-402).
      { id: 'moon-gate', name: 'The moon gate', kind: 'code', room: 'ink', hideRoom: 'grove', length: 3, requires: ['root-door', 'moth-dial'] },
    ],
  },
];

const BY_ID: Readonly<Record<string, PuzzleDef>> = Object.fromEntries(PUZZLES.map((p) => [p.id, p]));

export function getPuzzle(id: unknown): PuzzleDef | undefined {
  return typeof id === 'string' && Object.hasOwn(BY_ID, id) ? BY_ID[id] : undefined;
}

/** The words for a puzzle quest's one step. */
export function puzzleGoalText(id: string): string {
  const p = getPuzzle(id);
  return p ? `Open every lock of ${p.title.charAt(0).toLowerCase()}${p.title.slice(1)} (${p.locks.length} locks)` : 'Open every lock';
}

// ---------- where a run puts things ----------

/** Hiding spots by room (room data's `spots`). */
export type PuzzleSpots = Readonly<Record<string, ReadonlyArray<Vec2 & Raised>>>;

export interface PuzzlePiece extends Vec2 {
  room: string;
  top?: number;
}

export interface LockLayout {
  lock: string;
  post: PuzzlePiece;
  /** A code lock's code, one symbol per clue. Never sent to a page. */
  code: PuzzleSymbol[];
  /** A code lock's clues, clue i carving symbol i of the code; a key lock's one key. */
  hidden: PuzzlePiece[];
}

function shuffled<T>(list: readonly T[], rnd: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * Everything a run's seed decides: for each lock its post, its code and where its clues or key are.
 * Each room's spots are dealt out without repeats, away from NPC owls and interactables.
 */
export function layoutRun(puzzle: PuzzleDef, seed: string, spots: PuzzleSpots): LockLayout[] {
  const rnd = rotationRandom(`owl-park-puzzle|${puzzle.id}|${seed}`);
  const decks = new Map<string, Array<Vec2 & Raised>>();
  const deal = (room: string): PuzzlePiece => {
    let deck = decks.get(room);
    if (!deck || deck.length === 0) {
      const blockers = [...NPCS.filter((x) => x.room === room).map((x) => x.pos), ...INTERACTABLES.filter((x) => x.room === room).map((x) => x.pos)];
      const all = spots[room] ?? [];
      const free = all.filter((p) => blockers.every((b) => distance(p, b) >= PIECE_CLEARANCE));
      deck = shuffled(free.length ? free : all, rnd);
      decks.set(room, deck);
    }
    const p = deck.pop() ?? { x: 0, y: 0 };
    return { room, x: p.x, y: p.y, ...(p.top ? { top: p.top } : {}) };
  };
  return puzzle.locks.map((l) => {
    const post = deal(l.room);
    const hidden = Array.from({ length: l.kind === 'code' ? l.length : 1 }, () => deal(l.hideRoom));
    const code = l.kind === 'code' ? hidden.map(() => PUZZLE_SYMBOLS[Math.floor(rnd() * PUZZLE_SYMBOLS.length)]!) : [];
    return { lock: l.id, post, code, hidden };
  });
}

// ---------- rows ----------

export interface PuzzleRunRow {
  id: string;
  puzzle: string;
  /** The park week or month the run belongs to (its quest's period). */
  period: string;
  /** The seed every placement and code comes from: fresh for every run, never shown to a page. */
  seed: string;
  /** Who started it. */
  host: string;
  members: string[];
  /** Locks open in this run. */
  opened: string[];
  /** Clues read, as `lock:n`. */
  found: string[];
  /** Key locks whose key the run has picked up. */
  keys: string[];
  /** Wrong codes in a row, and until when it is jammed, by lock. */
  misses: Record<string, { n: number; until: number }>;
  createdAt: number;
}

export interface PuzzleProgressRow {
  cid: string;
  puzzle: string;
  period: string;
  /** The locks this owl opened itself, in any run. */
  opened: string[];
  /** The run it is in now, if any. */
  run: string | null;
}

export interface PuzzleStore {
  run(id: string): PuzzleRunRow | null;
  putRun(row: PuzzleRunRow): void;
  dropRun(id: string): void;
  progress(cid: string, puzzle: string, period: string): PuzzleProgressRow | null;
  putProgress(row: PuzzleProgressRow): void;
  /** Forget every row from periods other than `keep` for a puzzle (expired weeks and months). */
  dropStale(puzzle: string, keep: string): void;
}

export class MemoryPuzzleStore implements PuzzleStore {
  private readonly runs = new Map<string, PuzzleRunRow>();
  private readonly rows = new Map<string, PuzzleProgressRow>();
  private key = (cid: string, puzzle: string, period: string) => `${cid}|${puzzle}|${period}`;
  run(id: string) {
    const r = this.runs.get(id);
    return r ? structuredClone(r) : null;
  }
  putRun(row: PuzzleRunRow) {
    this.runs.set(row.id, structuredClone(row));
  }
  dropRun(id: string) {
    this.runs.delete(id);
  }
  progress(cid: string, puzzle: string, period: string) {
    const r = this.rows.get(this.key(cid, puzzle, period));
    return r ? structuredClone(r) : null;
  }
  putProgress(row: PuzzleProgressRow) {
    this.rows.set(this.key(row.cid, row.puzzle, row.period), structuredClone(row));
  }
  dropStale(puzzle: string, keep: string) {
    for (const [k, r] of this.rows) if (r.puzzle === puzzle && r.period !== keep) this.rows.delete(k);
    for (const [k, r] of this.runs) if (r.puzzle === puzzle && r.period !== keep) this.runs.delete(k);
  }
  /** Everything, as plain JSON (the local mode keeps it in browser storage). */
  snapshot(): { runs: PuzzleRunRow[]; rows: PuzzleProgressRow[] } {
    return { runs: [...this.runs.values()].map((r) => structuredClone(r)), rows: [...this.rows.values()].map((r) => structuredClone(r)) };
  }
  /** Rebuilt from a snapshot; anything malformed is dropped. */
  static from(raw: unknown): MemoryPuzzleStore {
    const store = new MemoryPuzzleStore();
    const o = raw && typeof raw === 'object' ? (raw as { runs?: unknown; rows?: unknown }) : {};
    const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;
    for (const r of Array.isArray(o.runs) ? o.runs.slice(0, 200) : []) {
      if (!r || typeof r !== 'object') continue;
      const v = r as Record<string, unknown>;
      if (!str(v['id']) || !str(v['puzzle']) || !str(v['period']) || !str(v['seed']) || !str(v['host']) || typeof v['createdAt'] !== 'number') continue;
      const misses: PuzzleRunRow['misses'] = {};
      const m = v['misses'];
      if (m && typeof m === 'object' && !Array.isArray(m)) {
        for (const [k, x] of Object.entries(m as Record<string, unknown>)) {
          const { n, until } = (x ?? {}) as { n?: unknown; until?: unknown };
          if (typeof n === 'number' && typeof until === 'number') misses[k] = { n, until };
        }
      }
      store.putRun({ id: v['id'], puzzle: v['puzzle'], period: v['period'], seed: v['seed'], host: v['host'], members: cleanIds(v['members']), opened: cleanIds(v['opened']), found: cleanIds(v['found']), keys: cleanIds(v['keys']), misses, createdAt: v['createdAt'] });
    }
    for (const r of Array.isArray(o.rows) ? o.rows.slice(0, 200) : []) {
      if (!r || typeof r !== 'object') continue;
      const v = r as Record<string, unknown>;
      if (!str(v['cid']) || !str(v['puzzle']) || !str(v['period'])) continue;
      store.putProgress({ cid: v['cid'], puzzle: v['puzzle'], period: v['period'], opened: cleanIds(v['opened']), run: str(v['run']) ? v['run'] : null });
    }
    return store;
  }
}

/** A stored list of strings, cleaned: anything else reads as empty. */
export function cleanIds(v: unknown, max = 64): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 64).slice(0, max) : [];
}

// ---------- what a page sees ----------

export interface LockView {
  id: string;
  name: string;
  kind: LockKind;
  room: string;
  place: string;
  /** Its requirements are open in this run: its clues or key show and it can be worked. */
  available: boolean;
  open: boolean;
  /** This owl has opened this lock itself (in any run). */
  mine: boolean;
  post: PuzzlePiece;
  /** Code length (a code lock). */
  length: number;
  /** A code lock's clues: where each is and, once read, its symbol. Only while available. */
  clues: Array<PuzzlePiece & { n: number; symbol: PuzzleSymbol | null }>;
  /** A key lock's key, while available and not yet picked up. */
  key: PuzzlePiece | null;
  hasKey: boolean;
  /** Jammed until (ms), 0 when not. */
  jammedUntil: number;
  /** What the panel says about where to look. */
  hint: string;
}

export interface PuzzleView {
  puzzle: string;
  title: string;
  /** In a run, or null when the owl has none (it starts or joins one). */
  run: { id: string; members: number; host: boolean } | null;
  locks: LockView[];
  /** Locks this owl opened itself, of the total. */
  mine: number;
  total: number;
  /** Every lock is on this owl's own list: the quest can be handed in. */
  complete: boolean;
}

export type PuzzleRefusal = 'unknown' | 'no-run' | 'full' | 'far' | 'locked' | 'open' | 'no-key' | 'jammed' | 'self' | 'their-run';

export type PuzzleAnswer = { ok: true; view: PuzzleView; credited: string[]; completed: string[] } | { ok: false; reason: PuzzleRefusal; view?: PuzzleView };

/** The outcome of a code try: wrong tells the page how many tries are left before the jam. */
export type OpenAnswer = PuzzleAnswer | { ok: false; reason: 'wrong'; left: number; view: PuzzleView };

// ---------- the book ----------

export interface PuzzleBookDeps {
  /** A fresh random seed for a new run: never derived from the period or the owl, and never shown to a page. */
  newSeed(): string;
  /** A fresh id for a new run (shown to its members' pages, so never the seed). */
  newId(): string;
}

/**
 * Each owl's puzzle progress and the runs it plays in. Every method is told the puzzle's current
 * period by its caller (the quest's park week or month) and forgets rows from older periods.
 */
export class PuzzleBook {
  // Plain fields, not parameter properties: Node's type stripping loads this module (tools/chaos).
  private readonly store: PuzzleStore;
  private readonly spots: PuzzleSpots;
  private readonly deps: PuzzleBookDeps;

  constructor(store: PuzzleStore, spots: PuzzleSpots, deps: PuzzleBookDeps) {
    this.store = store;
    this.spots = spots;
    this.deps = deps;
  }

  private mine(cid: string, p: PuzzleDef, period: string): PuzzleProgressRow {
    return this.store.progress(cid, p.id, period) ?? { cid, puzzle: p.id, period, opened: [], run: null };
  }

  private runOf(row: PuzzleProgressRow): PuzzleRunRow | null {
    if (!row.run) return null;
    const run = this.store.run(row.run);
    return run && run.period === row.period && run.members.includes(row.cid) ? run : null;
  }

  private available(p: PuzzleDef, run: PuzzleRunRow, lock: LockDef): boolean {
    return lock.requires.every((id) => run.opened.includes(id));
  }

  view(cid: string, puzzleId: string, period: string, now: number): PuzzleView | null {
    const p = getPuzzle(puzzleId);
    if (!p) return null;
    const row = this.mine(cid, p, period);
    return this.viewOf(p, row, this.runOf(row), now);
  }

  private viewOf(p: PuzzleDef, row: PuzzleProgressRow, run: PuzzleRunRow | null, now: number): PuzzleView {
    const layout = run ? layoutRun(p, run.seed, this.spots) : null;
    const locks: LockView[] = p.locks.map((l, i) => {
      const lay = layout?.[i];
      const available = !!run && this.available(p, run, l);
      const open = !!run && run.opened.includes(l.id);
      const show = available && !open && !!lay;
      const jam = run?.misses[l.id];
      return {
        id: l.id,
        name: l.name,
        kind: l.kind,
        room: l.room,
        place: placeName(l.room),
        available,
        open,
        mine: row.opened.includes(l.id),
        post: lay?.post ?? { room: l.room, x: 0, y: 0 },
        length: l.kind === 'code' ? l.length : 0,
        clues:
          show && l.kind === 'code'
            ? lay.hidden.map((h, n) => ({ ...h, n, symbol: run.found.includes(`${l.id}:${n}`) ? lay.code[n]! : null }))
            : [],
        key: show && l.kind === 'key' && !run.keys.includes(l.id) ? lay.hidden[0]! : null,
        hasKey: !!run && run.keys.includes(l.id),
        jammedUntil: jam && jam.until > now ? jam.until : 0,
        hint:
          l.kind === 'code'
            ? `${l.length} carvings hidden at ${placeName(l.hideRoom)}; the lock is at ${placeName(l.room)}`
            : `A key hidden at ${placeName(l.hideRoom)}; the lock is at ${placeName(l.room)}`,
      };
    });
    const mine = p.locks.filter((l) => row.opened.includes(l.id)).length;
    return {
      puzzle: p.id,
      title: p.title,
      run: run ? { id: run.id, members: run.members.length, host: run.host === row.cid } : null,
      locks,
      mine,
      total: p.locks.length,
      complete: mine === p.locks.length,
    };
  }

  private leaveRun(row: PuzzleProgressRow): void {
    const run = this.runOf(row);
    row.run = null;
    if (!run) return;
    run.members = run.members.filter((m) => m !== row.cid);
    if (run.members.length === 0) this.store.dropRun(run.id);
    else {
      if (run.host === row.cid) run.host = run.members[0]!;
      this.store.putRun(run);
    }
  }

  /**
   * Start a run (or come back to the one this owl is in). A new run has a fresh seed and carries the
   * locks the owl opened itself, so its progress is where it left it.
   */
  start(cid: string, puzzleId: unknown, period: string, now: number): PuzzleAnswer {
    const p = getPuzzle(puzzleId);
    if (!p) return { ok: false, reason: 'unknown' };
    this.store.dropStale(p.id, period);
    const row = this.mine(cid, p, period);
    let run = this.runOf(row);
    if (!run) {
      const seed = this.deps.newSeed();
      run = { id: this.deps.newId(), puzzle: p.id, period, seed, host: cid, members: [cid], opened: p.locks.filter((l) => row.opened.includes(l.id)).map((l) => l.id), found: [], keys: [], misses: {}, createdAt: now };
      row.run = run.id;
      this.store.putRun(run);
      this.store.putProgress(row);
    }
    return { ok: true, view: this.viewOf(p, row, run, now), credited: [], completed: [] };
  }

  /** Whether an owl is in a run of this puzzle, and how far that run is (for the "join" list). */
  runInfo(cid: string, puzzleId: string, period: string): { members: number; opened: number } | null {
    const p = getPuzzle(puzzleId);
    if (!p) return null;
    const run = this.runOf(this.mine(cid, p, period));
    return run ? { members: run.members.length, opened: run.opened.length } : null;
  }

  /** The collectors in this owl's run (server-side only: the room refreshes their pages after a move). */
  members(cid: string, puzzleId: string, period: string): string[] {
    const p = getPuzzle(puzzleId);
    return p ? (this.runOf(this.mine(cid, p, period))?.members ?? []) : [];
  }

  /**
   * Join the run of the owl `other` (the room checked it stands next to this one). Leaves any run
   * this owl was in; nothing of this owl's own list moves into the run (OP-253 rule 7).
   */
  join(cid: string, other: string, puzzleId: unknown, period: string, now: number): PuzzleAnswer {
    const p = getPuzzle(puzzleId);
    if (!p) return { ok: false, reason: 'unknown' };
    if (other === cid) return { ok: false, reason: 'self' };
    this.store.dropStale(p.id, period);
    const theirs = this.runOf(this.mine(other, p, period));
    if (!theirs) return { ok: false, reason: 'no-run' };
    const row = this.mine(cid, p, period);
    if (row.run === theirs.id) return { ok: true, view: this.viewOf(p, row, theirs, now), credited: [], completed: [] };
    if (theirs.members.length >= PUZZLE_RUN_MAX) return { ok: false, reason: 'full' };
    this.leaveRun(row);
    const run = this.store.run(theirs.id)!;
    run.members.push(cid);
    row.run = run.id;
    this.store.putRun(run);
    this.store.putProgress(row);
    return { ok: true, view: this.viewOf(p, row, run, now), credited: [], completed: [] };
  }

  leave(cid: string, puzzleId: unknown, period: string, now: number): PuzzleAnswer {
    const p = getPuzzle(puzzleId);
    if (!p) return { ok: false, reason: 'unknown' };
    const row = this.mine(cid, p, period);
    this.leaveRun(row);
    this.store.putProgress(row);
    return { ok: true, view: this.viewOf(p, row, null, now), credited: [], completed: [] };
  }

  private context(cid: string, puzzleId: unknown, lockId: unknown, period: string) {
    const p = getPuzzle(puzzleId);
    if (!p) return null;
    const i = p.locks.findIndex((l) => l.id === lockId);
    if (i < 0) return null;
    const row = this.mine(cid, p, period);
    const run = this.runOf(row);
    return { p, i, lock: p.locks[i]!, row, run };
  }

  private reach(piece: PuzzlePiece, room: string, pos: Vec2, ground: number): boolean {
    return piece.room === room && distance(pos, piece) <= PUZZLE_REACH && sameLevel(ground, piece);
  }

  /** Read clue `n` of a code lock, standing at `pos` in `room` over `ground`: its symbol shows for the whole run. */
  look(cid: string, puzzleId: unknown, lockId: unknown, n: number, room: string, pos: Vec2, ground: number, period: string, now: number): PuzzleAnswer {
    const c = this.context(cid, puzzleId, lockId, period);
    if (!c) return { ok: false, reason: 'unknown' };
    const { p, i, lock, row, run } = c;
    if (!run) return { ok: false, reason: 'no-run' };
    if (lock.kind !== 'code' || !Number.isInteger(n) || n < 0 || n >= lock.length) return { ok: false, reason: 'unknown' };
    if (run.opened.includes(lock.id)) return { ok: false, reason: 'open', view: this.viewOf(p, row, run, now) };
    if (!this.available(p, run, lock)) return { ok: false, reason: 'locked', view: this.viewOf(p, row, run, now) };
    const clue = layoutRun(p, run.seed, this.spots)[i]!.hidden[n]!;
    if (!this.reach(clue, room, pos, ground)) return { ok: false, reason: 'far' };
    const id = `${lock.id}:${n}`;
    if (!run.found.includes(id)) {
      run.found.push(id);
      this.store.putRun(run);
    }
    return { ok: true, view: this.viewOf(p, row, run, now), credited: [], completed: [] };
  }

  /** Pick up a key lock's key: the run carries it to the lock. */
  take(cid: string, puzzleId: unknown, lockId: unknown, room: string, pos: Vec2, ground: number, period: string, now: number): PuzzleAnswer {
    const c = this.context(cid, puzzleId, lockId, period);
    if (!c) return { ok: false, reason: 'unknown' };
    const { p, i, lock, row, run } = c;
    if (!run) return { ok: false, reason: 'no-run' };
    if (lock.kind !== 'key') return { ok: false, reason: 'unknown' };
    if (run.opened.includes(lock.id)) return { ok: false, reason: 'open', view: this.viewOf(p, row, run, now) };
    if (!this.available(p, run, lock)) return { ok: false, reason: 'locked', view: this.viewOf(p, row, run, now) };
    if (!run.keys.includes(lock.id)) {
      if (!this.reach(layoutRun(p, run.seed, this.spots)[i]!.hidden[0]!, room, pos, ground)) return { ok: false, reason: 'far' };
      run.keys.push(lock.id);
      this.store.putRun(run);
    }
    return { ok: true, view: this.viewOf(p, row, run, now), credited: [], completed: [] };
  }

  /**
   * Work a lock at its post: a key lock opens once the run holds its key, a code lock with the run's
   * own code (`code`, symbols in order). Opening credits every member of the run; `completed` lists the
   * owls whose own list became whole with it (their quest is now ready to hand in).
   */
  open(cid: string, puzzleId: unknown, lockId: unknown, code: readonly string[] | undefined, room: string, pos: Vec2, ground: number, period: string, now: number): OpenAnswer {
    const c = this.context(cid, puzzleId, lockId, period);
    if (!c) return { ok: false, reason: 'unknown' };
    const { p, i, lock, row, run } = c;
    if (!run) return { ok: false, reason: 'no-run' };
    const view = () => this.viewOf(p, this.mine(cid, p, period), run, now);
    if (run.opened.includes(lock.id)) return { ok: false, reason: 'open', view: view() };
    if (!this.available(p, run, lock)) return { ok: false, reason: 'locked', view: view() };
    const lay = layoutRun(p, run.seed, this.spots)[i]!;
    if (!this.reach(lay.post, room, pos, ground)) return { ok: false, reason: 'far' };
    if (lock.kind === 'key') {
      if (!run.keys.includes(lock.id)) return { ok: false, reason: 'no-key', view: view() };
    } else {
      const jam = run.misses[lock.id] ?? { n: 0, until: 0 };
      if (jam.until > now) return { ok: false, reason: 'jammed', view: view() };
      const right = Array.isArray(code) && code.length === lay.code.length && code.every((s, k) => s === lay.code[k]);
      if (!right) {
        jam.n = jam.until && jam.until <= now ? 1 : jam.n + 1;
        jam.until = 0;
        if (jam.n >= PUZZLE_JAM_TRIES) {
          jam.n = 0;
          jam.until = now + PUZZLE_JAM_MS;
        }
        run.misses[lock.id] = jam;
        this.store.putRun(run);
        return { ok: false, reason: 'wrong', left: jam.until ? 0 : PUZZLE_JAM_TRIES - jam.n, view: view() };
      }
      delete run.misses[lock.id];
    }
    run.opened.push(lock.id);
    this.store.putRun(run);
    const credited: string[] = [];
    const completed: string[] = [];
    for (const m of run.members) {
      const mr = this.mine(m, p, period);
      if (mr.run !== run.id || mr.opened.includes(lock.id)) continue;
      const wasWhole = p.locks.every((l) => mr.opened.includes(l.id));
      mr.opened.push(lock.id);
      this.store.putProgress(mr);
      credited.push(m);
      if (!wasWhole && p.locks.every((l) => mr.opened.includes(l.id))) completed.push(m);
    }
    return { ok: true, view: view(), credited, completed };
  }
}
