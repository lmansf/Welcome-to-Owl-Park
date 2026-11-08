/**
 * The line in front of the park (OP-075), in the overflow object's SQLite. Each new arrival takes a
 * number; the line calls numbers strictly in order as places free up; a called owl's place is held
 * for a few minutes, then given up, and an owl whose turn passed takes a new number at the back. A
 * number belongs to the browser that took it (its collector), so nobody else can take its turn.
 *
 * A script can't stuff the line (OP-244). One address holds at most LINE_PER_ADDRESS live numbers,
 * keyed by a keyed hash of the address the Worker sends, never the address itself. And a number that
 * stopped checking in is passed over when its turn comes: once it has stood near the front (the first
 * LINE_CALL_ZONE waiting, where its page asks the line itself) for LINE_STALE_MS without asking, the
 * line skips it instead of holding a place for it. It leaves the line from below, as every number
 * does, so the places of the numbers above it stay right.
 */
import { LINE_CALL_ZONE, LINE_PER_ADDRESS, LINE_STALE_MS } from '@owl-park/shared';

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
  /** When its page last asked the line itself (taking the number counts). */
  seen: number | null;
  /** When it first stood near the front, among the first LINE_CALL_ZONE waiting. */
  zoned: number | null;
  /** The keyed hash of the address it was taken from (OP-244), or null for a number taken before that. */
  addr: string | null;
};

/** The columns added since the line was first made (OP-244), each added once to a line made before them. */
const ADDED: Record<string, string> = { seen: 'INTEGER', zoned: 'INTEGER', addr: 'TEXT' };

export class Line {
  constructor(private readonly sql: SqlStorage) {
    // AUTOINCREMENT: a number is never handed out twice, even after old ones are forgotten.
    sql.exec(`CREATE TABLE IF NOT EXISTS line (n INTEGER PRIMARY KEY AUTOINCREMENT, who TEXT NOT NULL, joined INTEGER NOT NULL, called INTEGER, claimed INTEGER, gone INTEGER)`);
    sql.exec(`CREATE INDEX IF NOT EXISTS line_who ON line (who)`);
    const have = new Set(sql.exec<{ name: string }>(`PRAGMA table_info(line)`).toArray().map((c) => c.name));
    for (const [col, type] of Object.entries(ADDED)) if (!have.has(col)) sql.exec(`ALTER TABLE line ADD COLUMN ${col} ${type}`);
    sql.exec(`CREATE INDEX IF NOT EXISTS line_addr ON line (addr)`);
  }

  /**
   * A number for `who`: the one it holds (waiting, or called and still held), or a new one at the back;
   * null when `addr` already holds LINE_PER_ADDRESS live numbers (OP-244).
   */
  join(who: string, now: number, holdMs: number): number;
  join(who: string, now: number, holdMs: number, addr: string | null): number | null;
  join(who: string, now: number, holdMs: number, addr: string | null = null): number | null {
    const held = this.held(who, now, holdMs);
    if (held !== null) {
      this.sql.exec(`UPDATE line SET seen = ? WHERE n = ?`, now, held);
      return held;
    }
    if (addr !== null && this.liveFrom(addr, now, holdMs) >= LINE_PER_ADDRESS) return null;
    this.sql.exec(`INSERT INTO line (who, joined, seen, addr) VALUES (?, ?, ?, ?)`, who, now, now, addr);
    return this.sql.exec<{ n: number }>(`SELECT last_insert_rowid() AS n`).one().n;
  }

  /** Live numbers taken from `addr`: waiting, or called and still held. */
  liveFrom(addr: string, now: number, holdMs: number): number {
    return this.sql.exec<{ c: number }>(`SELECT COUNT(*) AS c FROM line WHERE addr = ? AND gone IS NULL AND claimed IS NULL AND (called IS NULL OR called > ?)`, addr, now - holdMs).one().c;
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
   * One step of the line: places held too long are given up, the numbers now near the front are
   * marked so, then up to `free` waiting owls are called, lowest number first. A number whose turn
   * comes after it stood near the front for LINE_STALE_MS without asking is passed over (OP-244): it
   * leaves the line, and the next is called in its place. Returns how many were called.
   */
  tick(now: number, holdMs: number, free: number): number {
    this.sql.exec(`UPDATE line SET gone = ? WHERE called IS NOT NULL AND claimed IS NULL AND gone IS NULL AND called <= ?`, now, now - holdMs);
    this.sql.exec(`DELETE FROM line WHERE joined < ?`, now - KEEP_MS);
    this.sql.exec(`UPDATE line SET zoned = ? WHERE zoned IS NULL AND n IN (SELECT n FROM line WHERE called IS NULL AND gone IS NULL ORDER BY n LIMIT ?)`, now, LINE_CALL_ZONE);
    let called = 0;
    const want = Math.floor(free);
    while (called < want) {
      const next = this.sql.exec<Pick<Row, 'n' | 'seen' | 'zoned' | 'joined'>>(`SELECT n, seen, zoned, joined FROM line WHERE called IS NULL AND gone IS NULL ORDER BY n LIMIT 1`).toArray()[0];
      if (!next) break;
      const quiet = now - (next.seen ?? next.joined) >= LINE_STALE_MS;
      const stoodNear = next.zoned !== null && now - next.zoned >= LINE_STALE_MS;
      if (quiet && stoodNear) {
        this.sql.exec(`UPDATE line SET gone = ? WHERE n = ?`, now, next.n);
        continue;
      }
      this.sql.exec(`UPDATE line SET called = ? WHERE n = ?`, now, next.n);
      called++;
    }
    return called;
  }

  /** Where number `n` stands, for the browser that took it; asking is checking in. */
  status(n: number, who: string, now: number, holdMs: number): LineEntry {
    const row = this.sql.exec<Row>(`SELECT * FROM line WHERE n = ? AND who = ?`, n, who).toArray()[0];
    if (!row) return { state: 'unknown' };
    this.sql.exec(`UPDATE line SET seen = ? WHERE n = ?`, now, n);
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
