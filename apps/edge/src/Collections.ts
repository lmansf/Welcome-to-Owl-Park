/**
 * Durable Object holding every collector's collection in its SQLite storage. One object for the
 * park (`getByName('park')`), called over RPC by the Worker (inventory, crafting, time zone,
 * grants) and by the room object (drops, pickups, ownership checks for wear and emotes).
 * The rules live in the portable `CollectionBook` (packages/shared/src/book.ts); this class is the SQL store.
 */
import { DurableObject } from 'cloudflare:workers';
import { allSpots, sanitizeWear, type Drop, type Vec2, type Wear } from '@owl-park/shared';
import { ROOMS } from './rooms';
import { CollectionBook, type ClaimResult, type CollectionStore, type CollectorRow, type CraftResult, type DropRow, type DropsInfo, type GrantResult, type Inventory, type Source, type TzResult } from '@owl-park/shared';
import { dropSeed, signingSecret } from './pass';
import type { Env } from './env';

class SqlCollectionStore implements CollectionStore {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(`CREATE TABLE IF NOT EXISTS collectors (cid TEXT PRIMARY KEY, tz TEXT NOT NULL, tz_set_at INTEGER NOT NULL, feathers INTEGER NOT NULL DEFAULT 0, equipped TEXT, created_at INTEGER NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS owned (cid TEXT NOT NULL, variant TEXT NOT NULL, source TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (cid, variant))`);
    // `win` is the window key (YYYY-MM-DD:AM|PM); WINDOW is an SQL keyword.
    sql.exec(`CREATE TABLE IF NOT EXISTS drops (cid TEXT NOT NULL, win TEXT NOT NULL, n INTEGER NOT NULL, room TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, variant TEXT NOT NULL, claimed_at INTEGER, PRIMARY KEY (cid, win, n))`);
  }

  getCollector(cid: string): CollectorRow | null {
    const r = this.sql
      .exec<{ cid: string; tz: string; tz_set_at: number; feathers: number; equipped: string | null; created_at: number }>(`SELECT cid, tz, tz_set_at, feathers, equipped, created_at FROM collectors WHERE cid = ?`, cid)
      .toArray()[0];
    if (!r) return null;
    let equipped: Wear | undefined;
    try {
      equipped = r.equipped ? sanitizeWear(JSON.parse(r.equipped)) : undefined;
    } catch {
      equipped = undefined;
    }
    return { cid: r.cid, tz: r.tz, tzSetAt: r.tz_set_at, feathers: r.feathers, equipped, createdAt: r.created_at };
  }
  insertCollector(row: CollectorRow) {
    this.sql.exec(
      `INSERT OR IGNORE INTO collectors (cid, tz, tz_set_at, feathers, equipped, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      row.cid,
      row.tz,
      row.tzSetAt,
      row.feathers,
      row.equipped ? JSON.stringify(row.equipped) : null,
      row.createdAt,
    );
  }
  setFeathers(cid: string, feathers: number) {
    this.sql.exec(`UPDATE collectors SET feathers = ? WHERE cid = ?`, feathers, cid);
  }
  setTimeZone(cid: string, tz: string, at: number) {
    this.sql.exec(`UPDATE collectors SET tz = ?, tz_set_at = ? WHERE cid = ?`, tz, at, cid);
  }
  setEquipped(cid: string, equipped: Wear | undefined) {
    this.sql.exec(`UPDATE collectors SET equipped = ? WHERE cid = ?`, equipped ? JSON.stringify(equipped) : null, cid);
  }
  owned(cid: string): string[] {
    return this.sql.exec<{ variant: string }>(`SELECT variant FROM owned WHERE cid = ? ORDER BY at, variant`, cid).toArray().map((r) => r.variant);
  }
  hasOwned(cid: string, variant: string): boolean {
    return this.sql.exec(`SELECT 1 FROM owned WHERE cid = ? AND variant = ?`, cid, variant).toArray().length > 0;
  }
  addOwned(cid: string, variant: string, source: Source, at: number): boolean {
    return this.sql.exec(`INSERT OR IGNORE INTO owned (cid, variant, source, at) VALUES (?, ?, ?, ?)`, cid, variant, source, at).rowsWritten > 0;
  }
  drops(cid: string, win: string): DropRow[] {
    return this.sql
      .exec<{ n: number; room: string; x: number; y: number; variant: string; claimed_at: number | null }>(`SELECT n, room, x, y, variant, claimed_at FROM drops WHERE cid = ? AND win = ? ORDER BY n`, cid, win)
      .toArray()
      .map((r) => ({ n: r.n, room: r.room, x: r.x, y: r.y, variant: r.variant, claimedAt: r.claimed_at }));
  }
  putDrops(cid: string, win: string, drops: Drop[]) {
    // One window's rows per collector: the rest are history nobody can pick up any more.
    this.sql.exec(`DELETE FROM drops WHERE cid = ? AND win <> ?`, cid, win);
    for (const d of drops) this.sql.exec(`INSERT OR IGNORE INTO drops (cid, win, n, room, x, y, variant, claimed_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`, cid, win, d.n, d.room, d.x, d.y, d.variant);
  }
  claimDrop(cid: string, win: string, n: number, at: number) {
    this.sql.exec(`UPDATE drops SET claimed_at = ? WHERE cid = ? AND win = ? AND n = ? AND claimed_at IS NULL`, at, cid, win, n);
  }
}

export class Collections extends DurableObject<Env> {
  private readonly book: CollectionBook;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.book = new CollectionBook(new SqlCollectionStore(ctx.storage.sql), allSpots(ROOMS));
  }

  /** This window's unclaimed drops, generated (and stored) on the first request of the window. */
  async drops(cid: string, tzHint?: string): Promise<DropsInfo> {
    const now = Date.now();
    const cur = this.book.current(cid, tzHint, now);
    // The seed is computed before any storage write, so the generation below runs without awaiting.
    const rows = cur.rows ?? this.book.storeDrops(cid, cur.window, await dropSeed(signingSecret(this.env), cid, cur.window));
    return this.book.info(this.book.ensure(cid, tzHint, now), cur.window, cur.next, rows);
  }

  async claim(cid: string, tzHint: string | undefined, n: number, room: string, pos: Vec2): Promise<ClaimResult> {
    return this.book.claim(cid, tzHint, n, room, pos, Date.now());
  }

  async owned(cid: string, tzHint?: string): Promise<string[]> {
    return this.book.owned(cid, tzHint, Date.now());
  }

  async inventory(cid: string, tzHint?: string): Promise<Inventory> {
    return this.book.inventory(cid, tzHint, Date.now());
  }

  async craft(cid: string, tzHint: string | undefined, variant: string): Promise<CraftResult> {
    return this.book.craft(cid, tzHint, variant, Date.now());
  }

  async setTimeZone(cid: string, tzHint: string | undefined, tz: string): Promise<TzResult> {
    return this.book.setTimeZone(cid, tzHint, tz, Date.now());
  }

  async setEquipped(cid: string, tzHint: string | undefined, wear: Wear | null): Promise<Wear | null> {
    return this.book.setEquipped(cid, tzHint, wear ?? undefined, Date.now()) ?? null;
  }

  async grant(cid: string, variant: string, source: Source): Promise<GrantResult> {
    return this.book.grant(cid, variant, source, Date.now());
  }
}
