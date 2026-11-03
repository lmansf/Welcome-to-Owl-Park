/**
 * The parkour courses' rows in the collections object's SQLite, behind the portable `CourseStore`
 * (packages/shared/src/coursebook.ts, OP-224): one row per owl and course, kept for good (what it has
 * cleared, its best, the once-only rewards paid, its lost feathers and the shortcuts it opened), and one
 * run per owl, replaced by its next. No wrangler migration is needed for the tables: the constructor
 * creates them, as the climb's store does.
 */
import { cleanCourseRow, cleanCourseRun, type CourseRow, type CourseRunRow, type CourseStore } from '@owl-park/shared';

type RowRec = { cid: string; course: string; cleared_at: number | null; best_ms: number | null; gold: number; emote: number; feathers: string; shortcuts: string; repeat_day: string; repeat_paid: number };
type RunRec = { cid: string; course: string; started_at: number; parts: string; bench_id: string | null; bench_room: string | null; practice: number };

/** A list kept as JSON text: anything that is not one reads as empty. */
function list(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

const row = (r: RowRec): CourseRow | null =>
  cleanCourseRow({ cid: r.cid, course: r.course, clearedAt: r.cleared_at, bestMs: r.best_ms, gold: r.gold === 1, emote: r.emote === 1, feathers: list(r.feathers), shortcuts: list(r.shortcuts), repeatDay: r.repeat_day, repeatPaid: r.repeat_paid });

const run = (r: RunRec): CourseRunRow | null =>
  cleanCourseRun({ cid: r.cid, course: r.course, startedAt: r.started_at, parts: list(r.parts), bench: r.bench_id !== null && r.bench_room !== null ? { id: r.bench_id, room: r.bench_room } : null, practice: r.practice === 1 });

const ROW_COLUMNS = 'cid, course, cleared_at, best_ms, gold, emote, feathers, shortcuts, repeat_day, repeat_paid';
const RUN_COLUMNS = 'cid, course, started_at, parts, bench_id, bench_room, practice';

export class SqlCourseStore implements CourseStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS course_rows (cid TEXT NOT NULL, course TEXT NOT NULL, cleared_at INTEGER, best_ms INTEGER, gold INTEGER NOT NULL DEFAULT 0, emote INTEGER NOT NULL DEFAULT 0, feathers TEXT NOT NULL DEFAULT '[]', shortcuts TEXT NOT NULL DEFAULT '[]', repeat_day TEXT NOT NULL DEFAULT '', repeat_paid INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cid, course))`,
    );
    sql.exec(`CREATE TABLE IF NOT EXISTS course_runs (cid TEXT PRIMARY KEY, course TEXT NOT NULL, started_at INTEGER NOT NULL, parts TEXT NOT NULL DEFAULT '[]', bench_id TEXT, bench_room TEXT, practice INTEGER NOT NULL DEFAULT 0)`);
  }

  course(cid: string, course: string) {
    const r = this.sql.exec<RowRec>(`SELECT ${ROW_COLUMNS} FROM course_rows WHERE cid = ? AND course = ?`, cid, course).toArray()[0];
    return r ? row(r) : null;
  }
  putCourse(r: CourseRow) {
    this.sql.exec(
      `INSERT OR REPLACE INTO course_rows (${ROW_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      r.cid,
      r.course,
      r.clearedAt,
      r.bestMs,
      r.gold ? 1 : 0,
      r.emote ? 1 : 0,
      JSON.stringify(r.feathers),
      JSON.stringify(r.shortcuts),
      r.repeatDay,
      r.repeatPaid,
    );
  }
  courses(cid: string) {
    return this.sql
      .exec<RowRec>(`SELECT ${ROW_COLUMNS} FROM course_rows WHERE cid = ? ORDER BY course`, cid)
      .toArray()
      .flatMap((r) => row(r) ?? []);
  }
  run(cid: string) {
    const r = this.sql.exec<RunRec>(`SELECT ${RUN_COLUMNS} FROM course_runs WHERE cid = ?`, cid).toArray()[0];
    return r ? run(r) : null;
  }
  putRun(r: CourseRunRow) {
    this.sql.exec(`INSERT OR REPLACE INTO course_runs (${RUN_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`, r.cid, r.course, r.startedAt, JSON.stringify(r.parts), r.bench?.id ?? null, r.bench?.room ?? null, r.practice ? 1 : 0);
  }
  dropRun(cid: string) {
    this.sql.exec(`DELETE FROM course_runs WHERE cid = ?`, cid);
  }
}
