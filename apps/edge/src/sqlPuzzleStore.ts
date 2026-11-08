/**
 * Puzzle quests' rows in the collections object's SQLite, behind the portable `PuzzleStore`
 * (packages/shared/src/puzzles.ts, OP-255): one row per run (its seed, members and what it has open,
 * read and picked up) and one per owl, puzzle and period (the locks that owl opened itself, and the run
 * it is in). Rows of an older week or month are dropped as the puzzle is next played. No wrangler
 * migration is needed for the tables: the constructor creates them, as the course store does.
 */
import { cleanIds, type PuzzleProgressRow, type PuzzleRunRow, type PuzzleStore } from '@owl-park/shared';

type RunRec = { id: string; puzzle: string; period: string; seed: string; host: string; members: string; opened: string; found: string; keys: string; misses: string; created_at: number };
type RowRec = { cid: string; puzzle: string; period: string; opened: string; run: string | null };

function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function misses(v: unknown): PuzzleRunRow['misses'] {
  const out: PuzzleRunRow['misses'] = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, m] of Object.entries(v as Record<string, unknown>)) {
    if (!m || typeof m !== 'object') continue;
    const { n, until } = m as { n?: unknown; until?: unknown };
    if (typeof n === 'number' && typeof until === 'number' && Number.isFinite(n) && Number.isFinite(until)) out[k] = { n, until };
  }
  return out;
}

const RUN_COLUMNS = 'id, puzzle, period, seed, host, members, opened, found, keys, misses, created_at';
const ROW_COLUMNS = 'cid, puzzle, period, opened, run';

export class SqlPuzzleStore implements PuzzleStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS puzzle_runs (id TEXT PRIMARY KEY, puzzle TEXT NOT NULL, period TEXT NOT NULL, seed TEXT NOT NULL, host TEXT NOT NULL, members TEXT NOT NULL DEFAULT '[]', opened TEXT NOT NULL DEFAULT '[]', found TEXT NOT NULL DEFAULT '[]', keys TEXT NOT NULL DEFAULT '[]', misses TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL)`,
    );
    sql.exec(`CREATE TABLE IF NOT EXISTS puzzle_progress (cid TEXT NOT NULL, puzzle TEXT NOT NULL, period TEXT NOT NULL, opened TEXT NOT NULL DEFAULT '[]', run TEXT, PRIMARY KEY (cid, puzzle, period))`);
  }

  run(id: string): PuzzleRunRow | null {
    const r = this.sql.exec<RunRec>(`SELECT ${RUN_COLUMNS} FROM puzzle_runs WHERE id = ?`, id).toArray()[0];
    if (!r) return null;
    return {
      id: r.id,
      puzzle: r.puzzle,
      period: r.period,
      seed: r.seed,
      host: r.host,
      members: cleanIds(json(r.members)),
      opened: cleanIds(json(r.opened)),
      found: cleanIds(json(r.found)),
      keys: cleanIds(json(r.keys)),
      misses: misses(json(r.misses)),
      createdAt: r.created_at,
    };
  }
  putRun(r: PuzzleRunRow) {
    this.sql.exec(
      `INSERT OR REPLACE INTO puzzle_runs (${RUN_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.id,
      r.puzzle,
      r.period,
      r.seed,
      r.host,
      JSON.stringify(r.members),
      JSON.stringify(r.opened),
      JSON.stringify(r.found),
      JSON.stringify(r.keys),
      JSON.stringify(r.misses),
      r.createdAt,
    );
  }
  dropRun(id: string) {
    this.sql.exec(`DELETE FROM puzzle_runs WHERE id = ?`, id);
  }
  progress(cid: string, puzzle: string, period: string): PuzzleProgressRow | null {
    const r = this.sql.exec<RowRec>(`SELECT ${ROW_COLUMNS} FROM puzzle_progress WHERE cid = ? AND puzzle = ? AND period = ?`, cid, puzzle, period).toArray()[0];
    return r ? { cid: r.cid, puzzle: r.puzzle, period: r.period, opened: cleanIds(json(r.opened)), run: r.run } : null;
  }
  putProgress(r: PuzzleProgressRow) {
    this.sql.exec(`INSERT OR REPLACE INTO puzzle_progress (${ROW_COLUMNS}) VALUES (?, ?, ?, ?, ?)`, r.cid, r.puzzle, r.period, JSON.stringify(r.opened), r.run);
  }
  dropStale(puzzle: string, keep: string) {
    this.sql.exec(`DELETE FROM puzzle_runs WHERE puzzle = ? AND period != ?`, puzzle, keep);
    this.sql.exec(`DELETE FROM puzzle_progress WHERE puzzle = ? AND period != ?`, puzzle, keep);
  }
}
