/**
 * The climb's runs and bands in the collections object's SQLite, behind the portable `ClimbStore`
 * (packages/shared/src/climbbook.ts): one open run per collector, and one row per band a run
 * reached, kept CLIMB_ROW_KEEP_DAYS and then swept on the next write. The run table is never
 * swept: a new run overwrites the collector's row. No wrangler migration is needed for the tables.
 */
import { BAND_COUNT, isClimbRef, type BandRow, type ClimbStore, type ClimbWhy, type RunRow } from '@owl-park/shared';

type RunRec = { cid: string; seed: number; night: string; layout: string; started_at: number; banked: number };
type BandRec = { cid: string; seed: number; band: number; day: string; arrived_at: number; verdict: string; floor_ms: number; elapsed_ms: number; due: number; added: number; brisk: number; why: string | null; night: string; ref: string };

const WHYS: ReadonlySet<string> = new Set(['capped', 'paid-today', 'item-already-given']);

const run = (r: RunRec): RunRow => ({ cid: r.cid, seed: r.seed >>> 0, night: r.night, layout: r.layout, startedAt: r.started_at, banked: Math.min(BAND_COUNT, Math.max(0, r.banked)) });

const band = (r: BandRec): BandRow | null =>
  isClimbRef(r.ref) && r.band >= 1 && r.band <= BAND_COUNT
    ? {
        cid: r.cid,
        seed: r.seed >>> 0,
        band: r.band,
        day: r.day,
        arrivedAt: r.arrived_at,
        verdict: r.verdict === 'paid-today' ? 'paid-today' : 'ok',
        floorMs: r.floor_ms,
        elapsedMs: r.elapsed_ms,
        due: r.due,
        added: r.added,
        brisk: r.brisk === 1,
        why: r.why !== null && WHYS.has(r.why) ? (r.why as ClimbWhy) : null,
        night: r.night,
        ref: r.ref,
      }
    : null;

const BAND_COLUMNS = 'cid, seed, band, day, arrived_at, verdict, floor_ms, elapsed_ms, due, added, brisk, why, night, ref';

export class SqlClimbStore implements ClimbStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS climb_runs (cid TEXT PRIMARY KEY, seed INTEGER NOT NULL, night TEXT NOT NULL, layout TEXT NOT NULL, started_at INTEGER NOT NULL, banked INTEGER NOT NULL)`);
    sql.exec(
      `CREATE TABLE IF NOT EXISTS climb_bands (cid TEXT NOT NULL, seed INTEGER NOT NULL, band INTEGER NOT NULL, day TEXT NOT NULL, arrived_at INTEGER NOT NULL, verdict TEXT NOT NULL, floor_ms INTEGER NOT NULL, elapsed_ms INTEGER NOT NULL, due INTEGER NOT NULL, added INTEGER NOT NULL, brisk INTEGER NOT NULL DEFAULT 0, why TEXT, night TEXT NOT NULL, ref TEXT NOT NULL, PRIMARY KEY (cid, seed, band))`,
    );
    // A keeper's lookup by the reference a visitor quotes.
    sql.exec(`CREATE INDEX IF NOT EXISTS climb_bands_ref ON climb_bands (ref)`);
    // The day's paid bands, and the sweep.
    sql.exec(`CREATE INDEX IF NOT EXISTS climb_bands_day ON climb_bands (cid, day)`);
  }

  openRun(cid: string) {
    const r = this.sql.exec<RunRec>(`SELECT cid, seed, night, layout, started_at, banked FROM climb_runs WHERE cid = ?`, cid).toArray()[0];
    return r ? run(r) : null;
  }
  putRun(row: RunRow) {
    this.sql.exec(`INSERT OR REPLACE INTO climb_runs (cid, seed, night, layout, started_at, banked) VALUES (?, ?, ?, ?, ?, ?)`, row.cid, row.seed >>> 0, row.night, row.layout, row.startedAt, row.banked);
  }
  upsertBand(row: BandRow) {
    this.sql.exec(
      `INSERT OR REPLACE INTO climb_bands (${BAND_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.cid,
      row.seed >>> 0,
      row.band,
      row.day,
      row.arrivedAt,
      row.verdict,
      row.floorMs,
      row.elapsedMs,
      row.due,
      row.added,
      row.brisk ? 1 : 0,
      row.why,
      row.night,
      row.ref,
    );
  }
  bands(cid: string, seed: number) {
    return this.sql
      .exec<BandRec>(`SELECT ${BAND_COLUMNS} FROM climb_bands WHERE cid = ? AND seed = ? ORDER BY band`, cid, seed >>> 0)
      .toArray()
      .flatMap((r) => band(r) ?? []);
  }
  paidBands(cid: string, day: string) {
    return this.sql
      .exec<{ band: number }>(`SELECT DISTINCT band FROM climb_bands WHERE cid = ? AND day = ? AND verdict = 'ok' ORDER BY band`, cid, day)
      .toArray()
      .map((r) => r.band);
  }
  byRef(ref: string) {
    return this.sql
      .exec<BandRec>(`SELECT ${BAND_COLUMNS} FROM climb_bands WHERE ref = ? ORDER BY band`, ref)
      .toArray()
      .flatMap((r) => band(r) ?? []);
  }
  sweep(before: number) {
    this.sql.exec(`DELETE FROM climb_bands WHERE arrived_at < ?`, before);
  }
}
