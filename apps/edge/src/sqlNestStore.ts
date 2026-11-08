/**
 * The nests' SQLite tables, beside the collections in the collections object, behind the portable
 * `NestStore` (packages/shared/src/nestbook.ts). Kept apart from the Durable Object class so tests
 * run it against any SQLite with the same `exec(query, ...bindings)` shape. These tables are the only
 * place a nest and its owner's collector id meet; no wrangler migration is needed for them.
 */
import { moduleLog } from './logs';
import { sanitizeLayout, sanitizeNestLook, type FurnitureSource, type NestLayout, type NestLook, type NestRow, type NestStore, type StreetDoor } from '@owl-park/shared';

type Row = {
  cid: string;
  nest_id: string;
  open: number;
  layout: string;
  look: string | null;
  gift_day: string | null;
  updated: number;
};

function parsed(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    moduleLog.error('collections', 'read_failed', 'A stored nest field could not be read: it counts as missing.', { error: e });
    return null;
  }
}

/** A stored row, cleaned: a broken layout or look reads as an empty nest and no colours. */
const nest = (r: Row): NestRow => ({
  cid: r.cid,
  nestId: r.nest_id,
  open: r.open === 1,
  layout: sanitizeLayout(parsed(r.layout)),
  look: sanitizeNestLook(parsed(r.look)),
  giftDay: r.gift_day,
  updated: r.updated,
});

/** Only the three colours go into storage, whatever else a look carries. */
const lookText = (look: NestLook | null) => {
  const colours = sanitizeNestLook(look);
  return colours ? JSON.stringify(colours) : null;
};

/** Told of each piece the moment a collector first owns it (the collection log, OP-107). */
export type OnFurniture = (cid: string, item: string, source: FurnitureSource, at: number) => void;

export class SqlNestStore implements NestStore {
  constructor(
    private readonly sql: SqlStorage,
    private readonly onFurniture?: OnFurniture,
  ) {
    // One nest per collector, under a random id of its own. `updated` is when its owner last arranged it.
    sql.exec(`CREATE TABLE IF NOT EXISTS nests (cid TEXT PRIMARY KEY, nest_id TEXT NOT NULL UNIQUE, open INTEGER NOT NULL, layout TEXT NOT NULL, look TEXT, gift_day TEXT, updated INTEGER NOT NULL)`);
    // The street's pick: open nests, the most recently arranged first, read from the index in order.
    sql.exec(`CREATE INDEX IF NOT EXISTS nests_street ON nests (open, updated)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS furniture (cid TEXT NOT NULL, item TEXT NOT NULL, source TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (cid, item))`);
  }

  nestOf(cid: string) {
    const r = this.sql.exec<Row>(`SELECT cid, nest_id, open, layout, look, gift_day, updated FROM nests WHERE cid = ?`, cid).toArray()[0];
    return r ? nest(r) : null;
  }
  nestById(nestId: string) {
    const r = this.sql.exec<Row>(`SELECT cid, nest_id, open, layout, look, gift_day, updated FROM nests WHERE nest_id = ?`, nestId).toArray()[0];
    return r ? nest(r) : null;
  }
  insertNest(row: NestRow) {
    return (
      this.sql.exec(
        `INSERT OR IGNORE INTO nests (cid, nest_id, open, layout, look, gift_day, updated) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        row.cid,
        row.nestId,
        row.open ? 1 : 0,
        JSON.stringify(sanitizeLayout(row.layout)),
        lookText(row.look),
        row.giftDay,
        row.updated,
      ).rowsWritten > 0
    );
  }
  setLayout(cid: string, layout: NestLayout, at: number) {
    this.sql.exec(`UPDATE nests SET layout = ?, updated = ? WHERE cid = ?`, JSON.stringify(sanitizeLayout(layout)), at, cid);
  }
  setOpen(cid: string, open: boolean, at: number) {
    this.sql.exec(`UPDATE nests SET open = ?, updated = ? WHERE cid = ?`, open ? 1 : 0, at, cid);
  }
  setLook(cid: string, look: NestLook) {
    this.sql.exec(`UPDATE nests SET look = ? WHERE cid = ?`, lookText(look), cid);
  }
  setGiftDay(cid: string, day: string) {
    this.sql.exec(`UPDATE nests SET gift_day = ? WHERE cid = ?`, day, cid);
  }
  furniture(cid: string): string[] {
    return this.sql.exec<{ item: string }>(`SELECT item FROM furniture WHERE cid = ? ORDER BY at, item`, cid).toArray().map((r) => r.item);
  }
  addFurniture(cid: string, item: string, source: FurnitureSource, at: number): boolean {
    const added = this.sql.exec(`INSERT OR IGNORE INTO furniture (cid, item, source, at) VALUES (?, ?, ?, ?)`, cid, item, source, at).rowsWritten > 0;
    if (added) this.onFurniture?.(cid, item, source, at);
    return added;
  }
  recentOpen(exceptCid: string, limit: number): StreetDoor[] {
    // Never ORDER BY random(): that reads every open nest. The book picks at random from these few.
    return this.sql
      .exec<{ nest_id: string; look: string | null }>(`SELECT nest_id, look FROM nests WHERE open = 1 AND cid <> ? ORDER BY updated DESC LIMIT ?`, exceptCid, Math.max(0, Math.floor(limit) || 0))
      .toArray()
      .map((r) => ({ nestId: r.nest_id, look: sanitizeNestLook(parsed(r.look)) }));
  }
}
