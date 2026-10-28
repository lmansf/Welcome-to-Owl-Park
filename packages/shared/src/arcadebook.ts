/**
 * The arcade's book (C40): each owl's best score of the day in each game, kept in a store (the
 * collections object's SQLite on the server, this browser's storage in the local mode), the score
 * wall made from them, and a finished run's pay through the collection book: its feathers under the
 * activities' shared daily cap, and its step on today's tasks. Written without platform APIs so the
 * room server and the local mode run the same rules.
 *
 * Scores belong to a park day and reset at its midnight. A row keeps the owl's colours as they were
 * for its best run, for its portrait on the wall; the wall never carries a collector id or a name.
 *
 * The run under way is kept here too, one per collector, not on the page's connection: a page back
 * from a dropped connection still has its run, and a run's best is kept as it is reached, so a run
 * cut short (a tab closed, a page that died) still leaves its best on the wall (OP-137).
 */
import type { CollectionBook, PlayResult } from './book';
import { isHexColour } from './look';
import { parkDay } from './parktime';
import { isSpecies } from './species';
import { isObj } from './validate';
import {
  ARCADE_GAMES,
  DAY_BEST_FEATHERS,
  RUN_MAX_MS,
  WALL_SIZE,
  isArcadeGame,
  plausibleRun,
  runFeathers,
  type ArcadeGame,
  type GameWall,
  type OwnBests,
  type PortraitLook,
  type RunPaid,
  type RunResult,
} from './arcade';

/** One owl's best run of a park day in one game. */
export interface ScoreRow {
  day: string;
  game: ArcadeGame;
  cid: string;
  score: number;
  /** The owl's colours at its best run, for its portrait on the wall. */
  look: PortraitLook;
  /** When the best run ended, ms: of two equal scores the earlier ranks first. */
  at: number;
  /** The day's-best feathers were paid to this owl for this game today. */
  bonus: boolean;
}

/** A collector's run under way: its game and the seed of its course, when it started, and the owl's best in the game as it did. */
export interface ArcadeRunRow {
  cid: string;
  game: ArcadeGame;
  seed: number;
  startedAt: number;
  /** The owl's best of the day in the run's game when the run started (null: none yet). */
  bestBefore: number | null;
}

export interface ScoreStore {
  /** The collector's rows of the day, one per game it played. */
  bests(day: string, cid: string): ScoreRow[];
  /** The day's best rows of a game with a score above 0: the highest first, the earlier first among equals. */
  top(day: string, game: ArcadeGame, limit: number): ScoreRow[];
  /** Insert or replace the row for (day, game, cid); rows of earlier days go. */
  putScore(row: ScoreRow): void;
  /** The collector's run under way, if it has one. */
  openRun(cid: string): ArcadeRunRow | null;
  /** Keep a collector's run, in place of any before it. */
  putRun(run: ArcadeRunRow): void;
  /** Forget a collector's run. */
  dropRun(cid: string): void;
}

/** Why a run's result was not taken: it is not the run the collector has under way, or it could not be true for the time the run took. */
export type RunRefused = { ok: false; reason: 'idle' | 'unknown' };

/** A run's best so far, kept: the game's column on the wall and the owl's own bests after it. */
export interface RunRecorded {
  ok: true;
  wall: GameWall;
  mine: OwnBests;
  /** The record changed the game's column on the wall: everyone in the arcade should see it. */
  changed: boolean;
}

/** A portrait's colours and kind from untrusted data; null when they are not colours. */
export function sanitizePortrait(v: unknown): PortraitLook | null {
  if (!isObj(v) || !isHexColour(v['body']) || !isHexColour(v['belly']) || !isHexColour(v['accent'])) return null;
  const out: PortraitLook = { body: v['body'], belly: v['belly'], accent: v['accent'] };
  if (isSpecies(v['species'])) out.species = v['species'];
  return out;
}

/** A finished run as the book settled it; `tasks` and `changed` stay with the room server. */
export interface RunSettled {
  paid: RunPaid;
  /** Today's tasks when the run moved them (as `CollectionBook.play` returns them). */
  tasks?: PlayResult['tasks'];
  /** The run changed the game's column on the wall: everyone in the arcade should see it. */
  changed: boolean;
}

const sameWall = (a: GameWall, b: GameWall) =>
  a.top.length === b.top.length && a.top.every((e, i) => e.score === b.top[i]!.score && JSON.stringify(e.look) === JSON.stringify(b.top[i]!.look));

export class ArcadeBook {
  constructor(
    private readonly store: ScoreStore,
    private readonly book: CollectionBook,
  ) {}

  /** One game's column on the wall today. */
  wall(game: ArcadeGame, now: number): GameWall {
    return { game, top: this.store.top(parkDay(now), game, WALL_SIZE).map((r) => ({ score: r.score, look: { ...r.look } })) };
  }

  /** Every game's column, in cabinet order. */
  walls(now: number): GameWall[] {
    return ARCADE_GAMES.map((g) => this.wall(g, now));
  }

  /** The collector's own best today in each game it played. */
  mine(cid: string, now: number): OwnBests {
    const out: OwnBests = {};
    for (const r of this.store.bests(parkDay(now), cid)) if (isArcadeGame(r.game)) out[r.game] = r.score;
    return out;
  }

  /**
   * A run starts at its cabinet (the room server checked the owl stands there): it takes the place of
   * any run of the collector's before it, which is never paid, and notes the owl's best as it starts.
   */
  start(cid: string, game: ArcadeGame, seed: number, now: number): ArcadeRunRow {
    const own = this.store.bests(parkDay(now), cid).find((r) => r.game === game);
    const run: ArcadeRunRow = { cid, game, seed, startedAt: now, bestBefore: own ? own.score : null };
    this.store.putRun(run);
    return run;
  }

  /** The collector's run a result is for: `idle` when it is not that run, `unknown` when the result could not be true for the time the run took. */
  private runFor(cid: string, result: RunResult, seed: number, now: number): ArcadeRunRow | RunRefused['reason'] {
    const run = this.store.openRun(cid);
    if (!run || run.game !== result.game || run.seed !== seed || now - run.startedAt > RUN_MAX_MS) return 'idle';
    return plausibleRun(result, now - run.startedAt) ? run : 'unknown';
  }

  /**
   * A run's score so far, as the run goes: kept as the owl's best of the day when it beats it, so the
   * best is on the wall whether or not the page lives to see the run end. Pays nothing; the run goes
   * on, and its end pays.
   */
  record(cid: string, result: RunResult, seed: number, look: PortraitLook, now: number): RunRecorded | RunRefused {
    const run = this.runFor(cid, result, seed, now);
    if (typeof run === 'string') return { ok: false, reason: run };
    const day = parkDay(now);
    const game = result.game;
    const score = Math.max(0, Math.floor(result.score));
    const before = this.wall(game, now);
    const own = this.store.bests(day, cid).find((r) => r.game === game);
    if (score > 0 && (!own || score > own.score)) this.store.putScore({ day, game, cid, score, look: { ...look }, at: now, bonus: !!own?.bonus });
    const wall = this.wall(game, now);
    return { ok: true, wall, mine: this.mine(cid, now), changed: !sameWall(before, wall) };
  }

  /**
   * A run's end: its result is checked against the collector's run under way and the time it took,
   * and the run is over whether or not the result holds up (one result per run). A result that holds
   * pays its band's feathers, and DAY_BEST_FEATHERS more the first time today this owl beats the day's
   * best in that game, all under the activities' shared cap; keeps the owl's best for the wall; moves
   * today's tasks. A new best, and the day's best, are judged against the standings as the run
   * started, so the bests the run kept as it went do not count against it.
   */
  finish(cid: string, result: RunResult, seed: number, look: PortraitLook, now: number): ({ ok: true } & RunSettled) | RunRefused {
    const run = this.runFor(cid, result, seed, now);
    if (run === 'idle') return { ok: false, reason: 'idle' };
    this.store.dropRun(cid);
    if (run === 'unknown') return { ok: false, reason: 'unknown' };
    const day = parkDay(now);
    const game = result.game;
    const score = Math.max(0, Math.floor(result.score));
    const before = this.wall(game, now);
    const own = this.store.bests(day, cid).find((r) => r.game === game);
    // The owl's own best as the run started (none, when the park day turned meanwhile), and the day's
    // best before this run: the best of every other owl, and that.
    const prior = parkDay(run.startedAt) === day ? run.bestBefore : null;
    const others = this.store.top(day, game, 2).find((r) => r.cid !== cid);
    const leader = Math.max(others?.score ?? 0, prior ?? 0);
    const best = score > 0 && (prior === null || score > prior);
    const top = score > 0 && score > leader;
    const bonus = top && !own?.bonus;
    // Beating the day's best beats the owl's own best too, so the bonus is always kept with a new best;
    // the run may have kept its score already as it went, and then only the bonus is new.
    if (score > 0 && (!own || score > own.score)) this.store.putScore({ day, game, cid, score, look: { ...look }, at: now, bonus: bonus || !!own?.bonus });
    else if (bonus && own) this.store.putScore({ ...own, bonus: true });
    const played = this.book.play(cid, runFeathers(game, score) + (bonus ? DAY_BEST_FEATHERS : 0), { kind: 'arcade' }, now);
    const wall = this.wall(game, now);
    return {
      ok: true,
      paid: { game, score, added: played.added, total: played.total, best, top, wall, mine: this.mine(cid, now) },
      ...(played.tasks ? { tasks: played.tasks } : {}),
      changed: !sameWall(before, wall),
    };
  }
}

// ---------- in memory ----------

/** A plain-JSON copy of a memory store (the local mode keeps one in this browser). */
export interface MemoryScoreSnapshot {
  scores: ScoreRow[];
  runs?: ArcadeRunRow[];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** A stored row from untrusted JSON, cleaned; null when it is not one. */
function cleanScoreRow(v: unknown): ScoreRow | null {
  if (!isObj(v) || typeof v['day'] !== 'string' || !isArcadeGame(v['game']) || typeof v['cid'] !== 'string' || !v['cid']) return null;
  const look = sanitizePortrait(v['look']);
  const score = num(v['score']);
  if (!look || !Number.isInteger(score) || score < 0) return null;
  return { day: v['day'], game: v['game'], cid: v['cid'], score, look, at: num(v['at']), bonus: v['bonus'] === true };
}

/** A stored run from untrusted JSON, cleaned; null when it is not one. */
function cleanRunRow(v: unknown): ArcadeRunRow | null {
  if (!isObj(v) || typeof v['cid'] !== 'string' || !v['cid'] || !isArcadeGame(v['game'])) return null;
  const seed = num(v['seed']);
  const best = v['bestBefore'];
  if (!Number.isInteger(seed) || seed < 0) return null;
  return { cid: v['cid'], game: v['game'], seed, startedAt: num(v['startedAt']), bestBefore: typeof best === 'number' && Number.isInteger(best) && best >= 0 ? best : null };
}

/** In-memory store for tests and the local mode. */
export class MemoryScoreStore implements ScoreStore {
  private rows: ScoreRow[] = [];
  private readonly runs = new Map<string, ArcadeRunRow>();

  snapshot(): MemoryScoreSnapshot {
    return { scores: this.rows.map((r) => ({ ...r, look: { ...r.look } })), runs: [...this.runs.values()].map((r) => ({ ...r })) };
  }

  /** Rebuild from a snapshot; anything malformed is skipped rather than trusted. */
  static from(input: unknown): MemoryScoreStore {
    const store = new MemoryScoreStore();
    const snap = isObj(input) ? input : {};
    for (const v of Array.isArray(snap['scores']) ? snap['scores'] : []) {
      const row = cleanScoreRow(v);
      if (row) store.putScore(row);
    }
    for (const v of Array.isArray(snap['runs']) ? snap['runs'] : []) {
      const run = cleanRunRow(v);
      if (run) store.putRun(run);
    }
    return store;
  }

  openRun(cid: string) {
    const run = this.runs.get(cid);
    return run ? { ...run } : null;
  }
  putRun(run: ArcadeRunRow) {
    this.runs.set(run.cid, { ...run });
  }
  dropRun(cid: string) {
    this.runs.delete(cid);
  }

  bests(day: string, cid: string) {
    return this.rows.filter((r) => r.day === day && r.cid === cid).map((r) => ({ ...r, look: { ...r.look } }));
  }
  top(day: string, game: ArcadeGame, limit: number) {
    return this.rows
      .filter((r) => r.day === day && r.game === game && r.score > 0)
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, Math.max(0, limit))
      .map((r) => ({ ...r, look: { ...r.look } }));
  }
  putScore(row: ScoreRow) {
    this.rows = this.rows.filter((r) => r.day === row.day && !(r.game === row.game && r.cid === row.cid));
    this.rows.push({ ...row, look: { ...row.look } });
  }
}
