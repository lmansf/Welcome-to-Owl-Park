/**
 * The line in front of the park (OP-075), in the overflow object's SQLite. Each new arrival takes a
 * number; the line calls numbers strictly in order as places free up; a called owl's place is held
 * for a few minutes, then given up, and an owl whose turn passed takes a new number at the back. A
 * number belongs to the browser that took it (its collector), so nobody else can take its turn.
 */

/** An owl let in takes a few seconds to reach its room: until then it still counts against the free places. */
export const CLAIM_GRACE_MS = 20_000;
/** Numbers older than this are forgotten. */
const KEEP_MS = 6 * 60 * 60_000;
/** The line's pace is measured over this long. */
const RATE_WINDOW_MS = 10 * 60_000;

export type LineEntry =
  | { state: 'unknown' }
  | { state: 'waiting'; place: number }
  | { state: 'called'; holdUntil: number }
  | { state: 'claimed' }
  | { state: 'expired' };

type Row = {
  n: number;
  who: string;
  joined: number;
  called: number | null;
  claimed: number | null;
  gone: number | null;
};

export class Line {
  constructor(private readonly sql: SqlStorage) {
    // AUTOINCREMENT: a number is never handed out twice, even after old ones are forgotten.
    sql.exec(`CREATE TABLE IF NOT EXISTS line (n INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT NOT NULL, joined INTEGER NOT NULL, called INTEGER, claimed INTEGER, gone INTEGER)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS line_who ON line (who)`);
  }

  /** A number for `who`: the one it holds (waiting, or called and still held), or a new one at the back. */
  join(who: string, now: number, holdMs: number): number {
    const held = this.held(who, now, holdMs);
    if (held !== null) return held;
    this.sql.exec(`INSERT INTO line (who, joined) VALUES (?, ?)`, who, now);
    return this.sql.exec<{ n: number }>(`SELECT last_insert_rowid() AS n`).one().n;
  }

  /** The number `who` holds now (waiting, or called and still held), if any. */
  held(who: string, now: number, holdMs: number): number | null {
    return (
      this.sql
        .exec<{ n: number }>(`SELECT n FROM line WHERE who = ? AND gone IS NULL AND claimed IS NULL AND (called IS NULL OR called > ?) ORDER BY n DESC LIMIT 1`, who, now - holdMs)
        .toArray()[0]?.n ?? null
    );
  }

  /** When number `n` was taken (OP-134 logs how long an owl waited); null for a number not in the line. */
  joinedAt(n: number): number | null {
    return this.sql.exec<{ joined: number }>(`SELECT joined FROM line WHERE n = ?`, n).toArray()[0]?.joined ?? null;
  }

  /** Owls waiting for their turn. */
  waiting(): number {
    return this.sql.exec<{ c: number }>(`SELECT COUNT(*) AS c FROM line WHERE called IS NULL AND gone IS NULL`).one().c;
  }

  /** Owls called whose place is still held, and owls let in this last minute that may not be in a room yet. */
  outstanding(now: number, holdMs: number): number {
    return this.sql
      .exec<{ c: number }>(
        `SELECT COUNT(*) AS c FROM line WHERE gone IS NULL AND ((called IS NOT NULL AND claimed IS NULL AND called > ?) OR (claimed IS NOT NULL AND claimed > ?))`,
        now - holdMs,
        now - CLAIM_GRACE_MS,
      )
      .one().c;
  }

  /**
   * The number just before the first owl still waiting. Numbers are called in order and every owl
   * leaving the line leaves from below, so the owls waiting hold exactly the numbers above it, and a
   * waiting number's place is how far above it it stands. With nobody waiting, the last number taken.
   */
  front(): number {
    const first = this.sql.exec<{ m: number | null }>(`SELECT MIN(n) AS m FROM line WHERE called IS NULL AND gone IS NULL`).one().m;
    if (first !== null) return first - 1;
    return this.sql.exec<{ m: number | null }>(`SELECT MAX(n) AS m FROM line`).one().m ?? 0;
  }

  /** The line taken down: everyone waiting or called goes in on their next look, and their numbers are spent. */
  clear(now: number): void {
    this.sql.exec(`UPDATE line SET gone = ? WHERE gone IS NULL AND claimed IS NULL`, now);
  }

  /** When owls were called lately: the line's pace. */
  calledTimes(now: number): number[] {
    return this.sql.exec<{ called: number }>(`SELECT called FROM line WHERE called IS NOT NULL AND called > ?`, now - RATE_WINDOW_MS).toArray().map((r) => r.called);
  }

  /**
   * One step of the line: places held too long are given up, then up to `free` waiting owls are
   * called, lowest number first. Returns how many were called.
   */
  tick(now: number, holdMs: number, free: number): number {
    this.sql.exec(`UPDATE line SET gone = ? WHERE called IS NOT NULL AND claimed IS NULL AND gone IS NULL AND called <= ?`, now, now - holdMs);
    this.sql.exec(`DELETE FROM line WHERE joined < ?`, now - KEEP_MS);
    if (free <= 0) return 0;
    return this.sql.exec(`UPDATE line SET called = ? WHERE n IN (SELECT n FROM line WHERE called IS NULL AND gone IS NULL ORDER BY n LIMIT ?)`, now, Math.floor(free)).rowsWritten;
  }

  /** Where number `n` stands, for the browser that took it. */
  status(n: number, who: string, now: number, holdMs: number): LineEntry {
    const row = this.sql.exec<Row>(`SELECT * FROM line WHERE n = ? AND who = ?`, n, who).toArray()[0];
    if (!row) return { state: 'unknown' };
    if (row.claimed !== null) return { state: 'claimed' };
    if (row.gone !== null) return { state: 'expired' };
    if (row.called !== null) return row.called > now - holdMs ? { state: 'called', holdUntil: row.called + holdMs } : { state: 'expired' };
    const place = this.sql.exec<{ c: number }>(`SELECT COUNT(*) AS c FROM line WHERE called IS NULL AND gone IS NULL AND n <= ?`, n).one().c;
    return { state: 'waiting', place };
  }

  /** The owl with number `n` takes its turn: true while its place is held. */
  claim(n: number, who: string, now: number, holdMs: number): boolean {
    return (
      this.sql.exec(`UPDATE line SET claimed = ? WHERE n = ? AND who = ? AND called IS NOT NULL AND claimed IS NULL AND gone IS NULL AND called > ?`, now, n, who, now - holdMs).rowsWritten === 1
    );
  }
}
