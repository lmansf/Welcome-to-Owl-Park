/**
 * The arcade's scores in the collections object's SQLite, behind the portable `ScoreStore`
 * (packages/shared/src/arcadebook.ts): each owl's best of the park day in each game, with its
 * colours for the portrait on the score wall. Only the day's rows are kept; a new day's first
 * score clears the rest. Beside them, each collector's run under way (OP-137), and whether it is a
 * spectator's practice run (OP-191). No wrangler migration is needed for the tables: the constructor
 * creates them and adds the columns that came later.
 */
import { moduleLog } from './logs';
import { isArcadeGame, sanitizePortrait, type ArcadeGame, type ArcadeRunRow, type PortraitLook, type ScoreRow, type ScoreStore } from '@owl-park/shared';

type Row = { day: string; game: string; cid: string; score: number; look: string; at: number; bonus: number };
type RunRow = { cid: string; game: string; seed: number; started_at: number; best_before: number | null; practice: number };

/** Stored colours that no longer read as colours put a plain owl on the wall. */
const PLAIN: PortraitLook = { body: '#8A6A4A', belly: '#F6F1E3', accent: '#C9A227' };

function portrait(text: string): PortraitLook {
  try {
    return sanitizePortrait(JSON.parse(text) as unknown) ?? PLAIN;
  } catch (e) {
    moduleLog.error('collections', 'read_failed', 'A stored score-wall picture could not be read: a plain owl shows.', { error: e });
    return PLAIN;
  }
}

const score = (r: Row): ScoreRow | null =>
  isArcadeGame(r.game) ? { day: r.day, game: r.game, cid: r.cid, score: r.score, look: portrait(r.look), at: r.at, bonus: r.bonus === 1 } : null;

const COLUMNS = 'day, game, cid, score, look, at, bonus';

export class SqlScoreStore implements ScoreStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS arcade_scores (day TEXT NOT NULL, game TEXT NOT NULL, cid TEXT NOT NULL, score INTEGER NOT NULL, look TEXT NOT NULL, at INTEGER NOT NULL, bonus INTEGER NOT NULL, PRIMARY KEY (day, game, cid))`);
    // The wall: a game's best of the day, the earlier first among equal scores, read from the index in order.
    sql.exec(`CREATE INDEX IF NOT EXISTS arcade_wall ON arcade_scores (day, game, score DESC, at)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS arcade_runs (cid TEXT PRIMARY KEY, game TEXT NOT NULL, seed INTEGER NOT NULL, started_at INTEGER NOT NULL, best_before INTEGER, practice INTEGER NOT NULL DEFAULT 0)`);
    // Spectators' practice runs (OP-191) came after the first table: a run table from before them gains the column.
    const columns = sql.exec<{ name: string }>(`PRAGMA table_info(arcade_runs)`).toArray();
    if (!columns.some((c) => c.name === 'practice')) sql.exec(`ALTER TABLE arcade_runs ADD COLUMN practice INTEGER NOT NULL DEFAULT 0`);
  }

  bests(day: string, cid: string) {
    return this.sql
      .exec<Row>(`SELECT ${COLUMNS} FROM arcade_scores WHERE day = ? AND cid = ?`, day, cid)
      .toArray()
      .flatMap((r) => score(r) ?? []);
  }
  top(day: string, game: ArcadeGame, limit: number) {
    return this.sql
      .exec<Row>(`SELECT ${COLUMNS} FROM arcade_scores WHERE day = ? AND game = ? AND score > 0 ORDER BY score DESC, at ASC LIMIT ?`, day, game, Math.max(0, limit))
      .toArray()
      .flatMap((r) => score(r) ?? []);
  }
  putScore(row: ScoreRow) {
    this.sql.exec(`DELETE FROM arcade_scores WHERE day <> ?`, row.day);
    const look = sanitizePortrait(row.look) ?? PLAIN;
    this.sql.exec(`INSERT OR REPLACE INTO arcade_scores (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`, row.day, row.game, row.cid, row.score, JSON.stringify(look), row.at, row.bonus ? 1 : 0);
  }
  openRun(cid: string): ArcadeRunRow | null {
    const r = this.sql.exec<RunRow>(`SELECT cid, game, seed, started_at, best_before, practice FROM arcade_runs WHERE cid = ?`, cid).toArray()[0];
    return r && isArcadeGame(r.game) ? { cid: r.cid, game: r.game, seed: r.seed, startedAt: r.started_at, bestBefore: r.best_before, ...(r.practice === 1 ? { practice: true as const } : {}) } : null;
  }
  putRun(run: ArcadeRunRow) {
    this.sql.exec(`INSERT OR REPLACE INTO arcade_runs (cid, game, seed, started_at, best_before, practice) VALUES (?, ?, ?, ?, ?, ?)`, run.cid, run.game, run.seed, run.startedAt, run.bestBefore, run.practice ? 1 : 0);
  }
  dropRun(cid: string) {
    this.sql.exec(`DELETE FROM arcade_runs WHERE cid = ?`, cid);
  }
}
