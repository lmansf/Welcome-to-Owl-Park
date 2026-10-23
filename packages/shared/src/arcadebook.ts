/**
 * The arcade's book (C40): each owl's best score of the day in each game, kept in a store (the
 * collections object's SQLite on the server, this browser's storage in the local mode), the score
 * wall made from them, and a finished run's pay through the collection book: its feathers under the
 * activities' shared daily cap, and its step on today's tasks. Written without platform APIs so the
 * room server and the local mode run the same rules.
 *
 * Scores belong to a park day and reset at its midnight. A row keeps the owl's colours as they were
 * for its best run, for its portrait on the wall; the wall never carries a collector id or a name.
 */
import type { CollectionBook, PlayResult } from './book';
import { isHexColour } from './look';
import { parkDay } from './parktime';
import { isSpecies } from './species';
import { isObj } from './validate';
import {
  ARCADE_GAMES,
  DAY_BEST_FEATHERS,
  WALL_SIZE,
  isArcadeGame,
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

export interface ScoreStore {
  /** The collector's rows of the day, one per game it played. */
  bests(day: string, cid: string): ScoreRow[];
  /** The day's best rows of a game with a score above 0: the highest first, the earlier first among equals. */
  top(day: string, game: ArcadeGame, limit: number): ScoreRow[];
  /** Insert or replace the row for (day, game, cid); rows of earlier days go. */
  putScore(row: ScoreRow): void;
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
   * A finished run, already checked against its time by the room server: pays its band's feathers,
   * and DAY_BEST_FEATHERS more the first time today this owl beats the day's best in that game, all
   * under the activities' shared cap; keeps the owl's best for the wall; moves today's tasks.
   */
  finish(cid: string, run: RunResult, look: PortraitLook, now: number): RunSettled {
    const day = parkDay(now);
    const game = run.game;
    const score = Math.max(0, Math.floor(run.score));
    const before = this.wall(game, now);
    const own = this.store.bests(day, cid).find((r) => r.game === game);
    const leader = this.store.top(day, game, 1)[0];
    const best = score > 0 && (!own || score > own.score);
    const top = score > 0 && (!leader || score > leader.score);
    const bonus = top && !own?.bonus;
    // Beating the day's best beats the owl's own best too, so the bonus is always kept with a new best.
    if (best) this.store.putScore({ day, game, cid, score, look: { ...look }, at: now, bonus: bonus || !!own?.bonus });
    const played = this.book.play(cid, runFeathers(game, score) + (bonus ? DAY_BEST_FEATHERS : 0), { kind: 'arcade' }, now);
    const wall = this.wall(game, now);
    return {
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

/** In-memory store for tests and the local mode. */
export class MemoryScoreStore implements ScoreStore {
  private rows: ScoreRow[] = [];

  snapshot(): MemoryScoreSnapshot {
    return { scores: this.rows.map((r) => ({ ...r, look: { ...r.look } })) };
  }

  /** Rebuild from a snapshot; anything malformed is skipped rather than trusted. */
  static from(input: unknown): MemoryScoreStore {
    const store = new MemoryScoreStore();
    const snap = isObj(input) ? input : {};
    for (const v of Array.isArray(snap['scores']) ? snap['scores'] : []) {
      const row = cleanScoreRow(v);
      if (row) store.putScore(row);
    }
    return store;
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
