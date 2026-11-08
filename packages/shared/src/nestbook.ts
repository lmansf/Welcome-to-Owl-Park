/**
 * The nests' book: every owl's nest and the furniture it owns, kept in a store (the collections
 * object's SQLite on the server, this browser's storage in the local mode), with the rules of
 * homes.ts. Written without platform APIs so the room server and the local mode run the same rules.
 *
 * A nest is made the first time its owl comes to the street: a random id, the starter furniture
 * arranged in it, open to visitors. Whose nest it is never leaves the book: everyone else knows a
 * nest by its id alone, and the flag on its street door shows only its owner's three colours.
 */
import type { CollectionBook } from './book';
import {
  FURNITURE,
  NEST_ID_LENGTH,
  STARTER_FURNITURE,
  furnitureGift,
  furnitureGiftReady,
  getFurniture,
  isNestId,
  placeFurniture,
  sanitizeLayout,
  type FurnitureGift,
  type NestLayout,
  type NestLook,
  type NestRefusal,
  type NestView,
} from './homes';
import { isHexColour } from './look';
import { nextParkDayAt, parkDay } from './parktime';
import { STYLE_SETS, capstonesDue, type StyleSet } from './styles';
import { isObj } from './validate';

// ---------- what the book keeps ----------

/** How an owl came by a piece of furniture: `set` is a style set's capstone (OP-110). */
export type FurnitureSource = 'starter' | 'gift' | 'set';
export const FURNITURE_SOURCES: readonly FurnitureSource[] = ['starter', 'gift', 'set'];

/** One collector's nest as stored. Only the book and its store ever see `cid`. */
export interface NestRow {
  cid: string;
  nestId: string;
  open: boolean;
  layout: NestLayout;
  /** The owner's colours as last seen on the street, for the flag on its door; null until then. */
  look: NestLook | null;
  /** The park day the owner last took its furniture gift; null: never. */
  giftDay: string | null;
  /** When the owner last arranged its nest (moved a piece, opened or closed it); 0 until then. */
  updated: number;
}

export interface NestStore {
  nestOf(cid: string): NestRow | null;
  nestById(nestId: string): NestRow | null;
  /** Insert a new nest; false when the collector has one already or the id is taken. */
  insertNest(row: NestRow): boolean;
  setLayout(cid: string, layout: NestLayout, at: number): void;
  setOpen(cid: string, open: boolean, at: number): void;
  /** The owner's colours arrange nothing, so `updated` stays as it was. */
  setLook(cid: string, look: NestLook): void;
  setGiftDay(cid: string, day: string): void;
  /** Every piece the collector owns. */
  furniture(cid: string): string[];
  /** Returns true when the piece was not owned before. */
  addFurniture(cid: string, item: string, source: FurnitureSource, at: number): boolean;
  /** Open nests other than this collector's, the most recently arranged first, at most `limit`. */
  recentOpen(exceptCid: string, limit: number): StreetDoor[];
}

// ---------- what the book answers ----------

/** Today's furniture gift as its owner sees it: taken already or not, and when the next one comes (server ms). */
export interface NestGiftState {
  taken: boolean;
  next: number;
}

/** One of the street's doors 1 to 5: another owl's open nest, with its owner's colours for the flag (null: none kept). */
export interface StreetDoor {
  nestId: string;
  look: NestLook | null;
}

/** The collector's own nest as it stands, the furniture it owns and today's gift. */
export interface MyNest {
  nest: NestView;
  owned: string[];
  gift: NestGiftState;
}

/** A nest as one visitor finds it: whether it is the visitor's own, and for its owner what it owns and today's gift. */
export interface NestVisit {
  nest: NestView;
  mine: boolean;
  owned?: string[];
  gift?: NestGiftState;
}

export type NestEditResult = { ok: true; nest: NestView } | { ok: false; reason: NestRefusal };

/**
 * The day's furniture gift: a piece the owl did not own, or feathers once it owns every piece, with
 * the feather balance; or refused, taken already today. Both say what the owl owns now and when the
 * next gift comes (server ms).
 */
export type FurnitureGiftResult = ({ ok: true; total: number } & FurnitureGift & { owned: string[]; next: number }) | { ok: false; reason: 'taken'; owned: string[]; next: number };

// ---------- the rules ----------

/** Where the starter pieces stand in a new nest: the lamp, the table and the fern along the back, the rug in front. */
export const STARTER_LAYOUT: Readonly<NestLayout> = { f1: 'lamp', f3: 'stump-table', f4: 'potted-fern', f6: 'rug' };
/** The street's doors 1 to 5 are picked from this many open nests, the ones their owners arranged most recently. */
export const STREET_POOL = 40;
/** Fresh ids tried for a new nest before giving up (eight random letters and digits rarely meet). */
const NEW_ID_TRIES = 5;

/** The letters and digits of a nest id (homes.ts, isNestId). */
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Bytes below this map evenly onto the 36 letters and digits, seven each; the rest are drawn again. */
const EVEN_BYTES = 252;

/**
 * A new nest id from a source of random bytes (the server's cryptographic one): eight letters and
 * digits, each as likely as any other. Nothing in it comes from the collector.
 */
export function secureNestId(bytes: (n: number) => Uint8Array): string {
  let id = '';
  for (let round = 0; id.length < NEST_ID_LENGTH; round++) {
    if (round >= 64) throw new Error('no random bytes');
    for (const b of bytes(NEST_ID_LENGTH)) if (b < EVEN_BYTES && id.length < NEST_ID_LENGTH) id += ID_CHARS[b % ID_CHARS.length];
  }
  return id;
}

/** Only the three colours of a look, when all three are colours; null for anything else. */
export function sanitizeNestLook(v: unknown): NestLook | null {
  if (!isObj(v) || !isHexColour(v['body']) || !isHexColour(v['belly']) || !isHexColour(v['accent'])) return null;
  return { body: v['body'], belly: v['belly'], accent: v['accent'] };
}

const sameLook = (a: NestLook | null, b: NestLook): boolean => !!a && a.body === b.body && a.belly === b.belly && a.accent === b.accent;

/** An index below `n` from a source of numbers in [0, 1); one that strays outside it still lands in range. */
function pick(random: () => number, n: number): number {
  const i = Math.floor(random() * n);
  return Number.isFinite(i) ? Math.min(n - 1, Math.max(0, i)) : 0;
}

/** The book's sources of chance. */
export interface NestBookOptions {
  /** A fresh nest id (the server's comes from its cryptographic source through secureNestId). */
  newId(): string;
  /** Uniform in [0, 1): the day's gift and the street's mix. */
  random(): number;
  /** The style sets whose capstones the book gives (STYLE_SETS; the tests bring their own). */
  sets?: readonly StyleSet[];
}

export class NestBook {
  constructor(
    private readonly store: NestStore,
    private readonly book: CollectionBook,
    private readonly opts: NestBookOptions,
  ) {}

  /** The collector's nest, made on first sight: a fresh id, the starter furniture arranged, open to visitors. */
  private ensure(cid: string, look: NestLook | null, now: number): NestRow {
    const existing = this.store.nestOf(cid);
    if (existing) return existing;
    for (let i = 0; i < NEW_ID_TRIES; i++) {
      const row: NestRow = { cid, nestId: this.opts.newId(), open: true, layout: { ...STARTER_LAYOUT }, look, giftDay: null, updated: 0 };
      if (!isNestId(row.nestId) || !this.store.insertNest(row)) continue;
      for (const item of STARTER_FURNITURE) this.store.addFurniture(cid, item, 'starter', now);
      return row;
    }
    throw new Error('no free nest id');
  }

  /**
   * The furniture a collector owns, in catalogue order, with the capstone of any style set it has
   * completed given first (OP-110): whenever the park reads an owl's furniture, a set completed since
   * (by a quest, the shop, a gift) has its capstone waiting.
   */
  private owned(cid: string, now: number): string[] {
    const sets = this.opts.sets ?? STYLE_SETS;
    if (sets.length) for (const id of capstonesDue(this.book.owned(cid, undefined, now), this.store.furniture(cid), sets)) this.store.addFurniture(cid, id, 'set', now);
    const have = new Set(this.store.furniture(cid));
    return FURNITURE.filter((f) => have.has(f.id)).map((f) => f.id);
  }

  /** The furniture the collector owns, for its collection (the Collection tab counts it toward the sets). */
  furniture(cid: string, now: number): string[] {
    return this.owned(cid, now);
  }

  /** A nest as visitors see it: its id, open or closed, what stands where, and its owner's colours. */
  private view(row: NestRow): NestView {
    const nest: NestView = { nestId: row.nestId, open: row.open, layout: sanitizeLayout(row.layout) };
    const look = sanitizeNestLook(row.look);
    if (look) nest.look = look;
    return nest;
  }

  private gift(row: NestRow, now: number): NestGiftState {
    return { taken: !furnitureGiftReady(row.giftDay, now), next: nextParkDayAt(now) };
  }

  /** The collector's own nest, made on first sight. Its owner's colours, as it comes by, go on the flag on its door. */
  mine(cid: string, look: NestLook | null, now: number): MyNest {
    const colours = sanitizeNestLook(look);
    let row = this.ensure(cid, colours, now);
    if (colours && !sameLook(row.look, colours)) {
      this.store.setLook(cid, colours);
      row = { ...row, look: colours };
    }
    return { nest: this.view(row), owned: this.owned(cid, now), gift: this.gift(row, now) };
  }

  /**
   * A nest as a visitor finds it (null: no such nest). The owner learns what it owns and today's
   * gift; nobody learns whose nest it is.
   */
  visit(nestId: string, visitorCid: string | null, now: number): NestVisit | null {
    const row = isNestId(nestId) ? this.store.nestById(nestId) : null;
    if (!row) return null;
    const nest = this.view(row);
    if (!visitorCid || row.cid !== visitorCid) return { nest, mine: false };
    return { nest, mine: true, owned: this.owned(row.cid, now), gift: this.gift(row, now) };
  }

  /** The owner puts a piece it owns in a spot of its nest (moving it if it stands elsewhere), or with `item` null takes the spot's piece away. */
  setSpot(cid: string, spot: string, item: string | null, now: number): NestEditResult {
    const row = this.ensure(cid, null, now);
    const layout = sanitizeLayout(row.layout);
    const res = placeFurniture(layout, spot, item, this.owned(cid, now));
    if (!res.ok) return res;
    if (JSON.stringify(res.layout) === JSON.stringify(layout)) return { ok: true, nest: this.view(row) };
    this.store.setLayout(cid, res.layout, now);
    return { ok: true, nest: this.view({ ...row, layout: res.layout, updated: now }) };
  }

  /** The owner opens its nest to visitors or closes it; a closed nest lets only its owner in. */
  setOpen(cid: string, open: boolean, now: number): NestEditResult {
    const row = this.ensure(cid, null, now);
    if (row.open === open) return { ok: true, nest: this.view(row) };
    this.store.setOpen(cid, open, now);
    return { ok: true, nest: this.view({ ...row, open, updated: now }) };
  }

  /**
   * Up to `n` open nests for the street's doors 1 to 5, never the collector's own: picked at random
   * from the STREET_POOL that were arranged most recently, so the street shows a fresh mix each time.
   */
  street(cid: string, n: number): StreetDoor[] {
    const pool = this.store.recentOpen(cid, STREET_POOL);
    const k = Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), pool.length)) : 0;
    for (let i = 0; i < k; i++) {
      const j = i + pick(this.opts.random, pool.length - i);
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, k).map((d) => ({ nestId: d.nestId, look: sanitizeNestLook(d.look) }));
  }

  /** Take today's furniture gift, once a park day: a piece the owl does not own yet, or feathers once it owns them all. */
  claimGift(cid: string, now: number): FurnitureGiftResult {
    const row = this.ensure(cid, null, now);
    const next = nextParkDayAt(now);
    if (!furnitureGiftReady(row.giftDay, now)) return { ok: false, reason: 'taken', owned: this.owned(cid, now), next };
    this.store.setGiftDay(cid, parkDay(now));
    const gift = furnitureGift(this.owned(cid, now), this.opts.random);
    if (gift.item !== null) this.store.addFurniture(cid, gift.item, 'gift', now);
    const total = gift.feathers > 0 ? this.book.addFeathers(cid, gift.feathers, now) : this.book.feathers(cid, now);
    return { ok: true, ...gift, total, owned: this.owned(cid, now), next };
  }
}

// ---------- in memory ----------

/** A plain-JSON copy of a memory store (the local mode keeps one in this browser). */
export interface MemoryNestSnapshot {
  nests: NestRow[];
  furniture: Array<[cid: string, item: string, source: FurnitureSource, at: number]>;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const copyRow = (r: NestRow): NestRow => ({ ...r, layout: { ...r.layout }, look: r.look && { ...r.look } });

/** A stored nest from untrusted JSON, cleaned; null when it is not one. */
function cleanNestRow(v: unknown): NestRow | null {
  if (!isObj(v) || typeof v['cid'] !== 'string' || !v['cid'] || !isNestId(v['nestId'])) return null;
  return {
    cid: v['cid'],
    nestId: v['nestId'],
    open: v['open'] === true,
    layout: sanitizeLayout(v['layout']),
    look: sanitizeNestLook(v['look']),
    giftDay: typeof v['giftDay'] === 'string' ? v['giftDay'] : null,
    updated: num(v['updated']),
  };
}

/** In-memory store for tests and the local mode. */
export class MemoryNestStore implements NestStore {
  /** By collector. */
  private readonly rows = new Map<string, NestRow>();
  private readonly owns = new Map<string, Map<string, { source: FurnitureSource; at: number }>>();

  snapshot(): MemoryNestSnapshot {
    const furniture: MemoryNestSnapshot['furniture'] = [];
    for (const [cid, m] of this.owns) for (const [item, o] of m) furniture.push([cid, item, o.source, o.at]);
    return { nests: [...this.rows.values()].map(copyRow), furniture };
  }

  /** Rebuild from a snapshot; anything malformed is skipped rather than trusted. */
  static from(input: unknown): MemoryNestStore {
    const store = new MemoryNestStore();
    const snap = isObj(input) ? input : {};
    for (const v of Array.isArray(snap['nests']) ? snap['nests'] : []) {
      const row = cleanNestRow(v);
      if (row) store.insertNest(row);
    }
    for (const f of Array.isArray(snap['furniture']) ? snap['furniture'] : []) {
      const p = Array.isArray(f) && typeof f[0] === 'string' && f[0] ? getFurniture(f[1]) : null;
      if (!p) continue;
      const source = (FURNITURE_SOURCES as readonly unknown[]).includes(f[2]) ? (f[2] as FurnitureSource) : 'gift';
      store.addFurniture(f[0] as string, p.id, source, num(f[3]));
    }
    return store;
  }

  nestOf(cid: string) {
    const r = this.rows.get(cid);
    return r ? copyRow(r) : null;
  }
  nestById(nestId: string) {
    for (const r of this.rows.values()) if (r.nestId === nestId) return copyRow(r);
    return null;
  }
  insertNest(row: NestRow) {
    if (this.rows.has(row.cid) || this.nestById(row.nestId)) return false;
    this.rows.set(row.cid, copyRow(row));
    return true;
  }
  setLayout(cid: string, layout: NestLayout, at: number) {
    const r = this.rows.get(cid);
    if (r) Object.assign(r, { layout: { ...layout }, updated: at });
  }
  setOpen(cid: string, open: boolean, at: number) {
    const r = this.rows.get(cid);
    if (r) Object.assign(r, { open, updated: at });
  }
  setLook(cid: string, look: NestLook) {
    const r = this.rows.get(cid);
    if (r) r.look = { ...look };
  }
  setGiftDay(cid: string, day: string) {
    const r = this.rows.get(cid);
    if (r) r.giftDay = day;
  }
  furniture(cid: string) {
    return [...(this.owns.get(cid)?.keys() ?? [])];
  }
  addFurniture(cid: string, item: string, source: FurnitureSource, at: number) {
    let m = this.owns.get(cid);
    if (!m) this.owns.set(cid, (m = new Map()));
    if (m.has(item)) return false;
    m.set(item, { source, at });
    return true;
  }
  recentOpen(exceptCid: string, limit: number) {
    // Arranged at the same time, the newer nest first, as SQLite reads its index backwards.
    return [...this.rows.values()]
      .reverse()
      .filter((r) => r.open && r.cid !== exceptCid)
      .sort((a, b) => b.updated - a.updated)
      .slice(0, Math.max(0, limit))
      .map((r) => ({ nestId: r.nestId, look: r.look && { ...r.look } }));
  }
}
