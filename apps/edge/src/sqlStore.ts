/**
 * The collections object's SQLite tables behind the portable `CollectionStore` interface. Kept
 * apart from the Durable Object class so tests can run it against any SQLite with the same
 * `exec(query, ...bindings)` shape.
 */
import {
  sanitizeWear,
  type CollectionStore,
  type CollectorRow,
  type EarnSource,
  type QuestItemSpot,
  type QuestRow,
  type Source,
  type Wear,
} from '@owl-park/shared';
import { ROOM_LAYOUT, relayout } from '@owl-park/shared/rooms';

function json<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** Told of each variant the moment a collector first owns it (the collection log, OP-107). */
export type OnOwned = (cid: string, variant: string, source: Source, at: number) => void;

export class SqlCollectionStore implements CollectionStore {
  constructor(
    private readonly sql: SqlStorage,
    private readonly onOwned?: OnOwned,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS collectors (cid TEXT PRIMARY KEY, tz TEXT NOT NULL, tz_set_at INTEGER NOT NULL, feathers INTEGER NOT NULL DEFAULT 0, equipped TEXT, created_at INTEGER NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS owned (cid TEXT NOT NULL, variant TEXT NOT NULL, source TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (cid, variant))`);
    // Feathers from capped sources (leaf piles), per collector and park day.
    sql.exec(`CREATE TABLE IF NOT EXISTS earned (cid TEXT NOT NULL, day TEXT NOT NULL, source TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (cid, day, source))`);
    // One row per collector, quest and period ('' for story quests, else the park day or week).
    sql.exec(
      `CREATE TABLE IF NOT EXISTS quests (cid TEXT NOT NULL, quest TEXT NOT NULL, period TEXT NOT NULL, step INTEGER NOT NULL, count INTEGER NOT NULL, seen TEXT NOT NULL, items TEXT NOT NULL, accepted_at INTEGER NOT NULL, done_at INTEGER, PRIMARY KEY (cid, quest, period))`,
    );
    // The half-day finds are retired: their table stays (history) but nothing reads or writes it.
    // The rooms' layout the stored positions belong to: quest items move with the rooms, once.
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`);
    const layout = sql.exec<{ v: number }>(`SELECT v FROM meta WHERE k = 'layout'`).toArray()[0]?.v ?? 1;
    if (layout < ROOM_LAYOUT) {
      for (const r of sql.exec<{ cid: string; quest: string; period: string; items: string }>(`SELECT cid, quest, period, items FROM quests`).toArray()) {
        const items = json<QuestItemSpot[]>(r.items, []).map((i) => ({ ...i, ...relayout(i.room, i, layout) }));
        sql.exec(`UPDATE quests SET items = ? WHERE cid = ? AND quest = ? AND period = ?`, JSON.stringify(items), r.cid, r.quest, r.period);
      }
      sql.exec(`INSERT OR REPLACE INTO meta (k, v) VALUES ('layout', ?)`, ROOM_LAYOUT);
    }
  }

  getCollector(cid: string): CollectorRow | null {
    const r = this.sql
      .exec<{ cid: string; tz: string; tz_set_at: number; feathers: number; equipped: string | null; created_at: number }>(`SELECT cid, tz, tz_set_at, feathers, equipped, created_at FROM collectors WHERE cid = ?`, cid)
      .toArray()[0];
    if (!r) return null;
    const equipped = sanitizeWear(json<unknown>(r.equipped, null));
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
    const added = this.sql.exec(`INSERT OR IGNORE INTO owned (cid, variant, source, at) VALUES (?, ?, ?, ?)`, cid, variant, source, at).rowsWritten > 0;
    if (added) this.onOwned?.(cid, variant, source, at);
    return added;
  }
  earned(cid: string, day: string, source: EarnSource): number {
    return this.sql.exec<{ n: number }>(`SELECT n FROM earned WHERE cid = ? AND day = ? AND source = ?`, cid, day, source).toArray()[0]?.n ?? 0;
  }
  addEarned(cid: string, day: string, source: EarnSource, n: number) {
    // Only today's counts matter: older days go as soon as a new one starts.
    this.sql.exec(`DELETE FROM earned WHERE cid = ? AND day <> ?`, cid, day);
    this.sql.exec(`INSERT INTO earned (cid, day, source, n) VALUES (?, ?, ?, ?) ON CONFLICT (cid, day, source) DO UPDATE SET n = n + excluded.n`, cid, day, source, n);
  }
  quests(cid: string): QuestRow[] {
    return this.sql
      .exec<{ quest: string; period: string; step: number; count: number; seen: string; items: string; accepted_at: number; done_at: number | null }>(
        `SELECT quest, period, step, count, seen, items, accepted_at, done_at FROM quests WHERE cid = ?`,
        cid,
      )
      .toArray()
      .map((r) => ({
        cid,
        quest: r.quest,
        period: r.period,
        step: r.step,
        count: r.count,
        seen: json<string[]>(r.seen, []),
        items: json<QuestItemSpot[]>(r.items, []),
        acceptedAt: r.accepted_at,
        doneAt: r.done_at,
      }));
  }
  putQuest(row: QuestRow) {
    this.sql.exec(
      `INSERT OR REPLACE INTO quests (cid, quest, period, step, count, seen, items, accepted_at, done_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.cid,
      row.quest,
      row.period,
      row.step,
      row.count,
      JSON.stringify(row.seen),
      JSON.stringify(row.items),
      row.acceptedAt,
      row.doneAt,
    );
  }
  dropQuest(cid: string, quest: string, period: string) {
    this.sql.exec(`DELETE FROM quests WHERE cid = ? AND quest = ? AND period = ?`, cid, quest, period);
  }
}
