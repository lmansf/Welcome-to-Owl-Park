/**
 * The collectibles ledger, written without platform APIs so the room server's Durable Object
 * and the zero-backend local mode run exactly the same rules (and Node tests them). Rules: a
 * collector has a home time zone; each half-day window of that zone holds two or three personal
 * drops on the park's hiding spots, generated once when first asked for and stored, so they never
 * shift as the collection grows; a drop is picked up by standing on it; a duplicate pays
 * feathers; feathers craft a chosen variant.
 */
import {
  CRAFT_COST,
  DUPLICATE_FEATHERS,
  PICKUP_RADIUS,
  STARTER_PACK,
  TZ_CHANGE_COOLDOWN_DAYS,
  dropView,
  filterOwnedWear,
  generateDrops,
  isTimeZone,
  isWear,
  normalizeTimeZone,
  parseVariant,
  windowInfo,
  type Drop,
  type DropSpot,
  type DropView,
  type Wear,
} from './collectibles';
import { distance } from './geometry';
import type { Vec2 } from './protocol';

export type Source = 'found' | 'crafted' | 'granted' | 'bought';
export const SOURCES: readonly Source[] = ['found', 'crafted', 'granted', 'bought'];

export interface CollectorRow {
  cid: string;
  tz: string;
  /** When the home zone was last set (creation counts), ms. */
  tzSetAt: number;
  feathers: number;
  equipped: Wear | undefined;
  createdAt: number;
}

export interface DropRow extends Drop {
  claimedAt: number | null;
}

export interface CollectionStore {
  getCollector(cid: string): CollectorRow | null;
  /** Insert a new collector (ignored when it already exists). */
  insertCollector(row: CollectorRow): void;
  setFeathers(cid: string, feathers: number): void;
  setTimeZone(cid: string, tz: string, at: number): void;
  setEquipped(cid: string, equipped: Wear | undefined): void;
  owned(cid: string): string[];
  hasOwned(cid: string, variant: string): boolean;
  /** Returns true when the variant was not owned before. */
  addOwned(cid: string, variant: string, source: Source, at: number): boolean;
  drops(cid: string, win: string): DropRow[];
  /** Insert a window's drops (existing rows win) and forget every other window of this collector. */
  putDrops(cid: string, win: string, drops: Drop[]): void;
  claimDrop(cid: string, win: string, n: number, at: number): void;
}

export interface DropsInfo {
  window: string;
  /** When the next window opens, ms. */
  next: number;
  /** Unclaimed drops only. */
  drops: DropView[];
  feathers: number;
}

export type ClaimResult = { ok: true; n: number; variant: string; dup: boolean; feathers: number } | { ok: false; n: number; reason: 'far' | 'gone' };
export type CraftResult = { ok: true; variant: string; feathers: number } | { ok: false; reason: 'unknown' | 'owned' | 'feathers'; feathers: number };
export type TzResult = { ok: true; tz: string; tzLockedUntil: number | null } | { ok: false; reason: 'invalid' | 'locked'; tz: string; tzLockedUntil: number | null };
export type GrantResult = { ok: true; variant: string; added: boolean } | { ok: false; reason: 'unknown' };

export interface Inventory {
  cid: string;
  owned: string[];
  feathers: number;
  equipped: Wear | null;
  tz: string;
  /** Until when the home zone cannot change (ms), or null when it can. */
  tzLockedUntil: number | null;
  window: string;
  next: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export class CollectionBook {
  constructor(
    private readonly store: CollectionStore,
    /** Every hiding spot of the park, in a stable order (`allSpots(ROOMS)`). */
    private readonly spots: readonly DropSpot[],
  ) {}

  /** The collector, created on first sight with its home zone and the starter pack. */
  ensure(cid: string, tzHint: string | undefined, now: number): CollectorRow {
    const existing = this.store.getCollector(cid);
    if (existing) return existing;
    const row: CollectorRow = { cid, tz: normalizeTimeZone(tzHint), tzSetAt: now, feathers: 0, equipped: undefined, createdAt: now };
    this.store.insertCollector(row);
    for (const v of STARTER_PACK) this.store.addOwned(cid, v, 'granted', now);
    return this.store.getCollector(cid) ?? row;
  }

  tzLockedUntil(c: CollectorRow, now: number): number | null {
    const until = c.tzSetAt + TZ_CHANGE_COOLDOWN_DAYS * DAY_MS;
    return until > now ? until : null;
  }

  /** The current window's drops when they exist; `rows: null` means generate them (with `storeDrops`). */
  current(cid: string, tzHint: string | undefined, now: number): { collector: CollectorRow; window: string; next: number; rows: DropRow[] | null } {
    const collector = this.ensure(cid, tzHint, now);
    const info = windowInfo(now, collector.tz);
    const rows = this.store.drops(cid, info.key);
    return { collector, window: info.key, next: info.next, rows: rows.length ? rows : null };
  }

  /** Generate and store a window's drops from its seed and the collection as it stands now. */
  storeDrops(cid: string, win: string, seed: Uint8Array): DropRow[] {
    const existing = this.store.drops(cid, win);
    if (existing.length) return existing;
    const owned = new Set(this.store.owned(cid));
    this.store.putDrops(cid, win, generateDrops(seed, this.spots, owned));
    return this.store.drops(cid, win);
  }

  info(collector: CollectorRow, win: string, next: number, rows: DropRow[]): DropsInfo {
    return { window: win, next, drops: rows.filter((r) => r.claimedAt === null).map(dropView), feathers: collector.feathers };
  }

  /** Pick up drop `n` of the current window, standing at `pos` in `room`. */
  claim(cid: string, tzHint: string | undefined, n: number, room: string, pos: Vec2, now: number): ClaimResult {
    const { collector, window: win, rows } = this.current(cid, tzHint, now);
    const drop = rows?.find((r) => r.n === n);
    if (!drop || drop.claimedAt !== null) return { ok: false, n, reason: 'gone' };
    if (drop.room !== room || distance(pos, drop) > PICKUP_RADIUS) return { ok: false, n, reason: 'far' };
    this.store.claimDrop(cid, win, n, now);
    const added = this.store.addOwned(cid, drop.variant, 'found', now);
    let feathers = collector.feathers;
    if (!added) {
      const v = parseVariant(drop.variant);
      feathers += v ? DUPLICATE_FEATHERS[v.rarity] : 0;
      this.store.setFeathers(cid, feathers);
    }
    return { ok: true, n, variant: drop.variant, dup: !added, feathers };
  }

  craft(cid: string, tzHint: string | undefined, variant: string, now: number): CraftResult {
    const collector = this.ensure(cid, tzHint, now);
    const v = parseVariant(variant);
    if (!v) return { ok: false, reason: 'unknown', feathers: collector.feathers };
    if (this.store.hasOwned(cid, variant)) return { ok: false, reason: 'owned', feathers: collector.feathers };
    const cost = CRAFT_COST[v.rarity];
    if (collector.feathers < cost) return { ok: false, reason: 'feathers', feathers: collector.feathers };
    const feathers = collector.feathers - cost;
    this.store.setFeathers(cid, feathers);
    this.store.addOwned(cid, variant, 'crafted', now);
    return { ok: true, variant, feathers };
  }

  /** Change the home time zone: once per TZ_CHANGE_COOLDOWN_DAYS (creation counts as a change). */
  setTimeZone(cid: string, tzHint: string | undefined, tz: unknown, now: number): TzResult {
    const collector = this.ensure(cid, tzHint, now);
    const locked = this.tzLockedUntil(collector, now);
    if (!isTimeZone(tz)) return { ok: false, reason: 'invalid', tz: collector.tz, tzLockedUntil: locked };
    if (tz === collector.tz) return { ok: true, tz, tzLockedUntil: locked };
    if (locked !== null) return { ok: false, reason: 'locked', tz: collector.tz, tzLockedUntil: locked };
    this.store.setTimeZone(cid, tz, now);
    return { ok: true, tz, tzLockedUntil: now + TZ_CHANGE_COOLDOWN_DAYS * DAY_MS };
  }

  owned(cid: string, tzHint: string | undefined, now: number): string[] {
    this.ensure(cid, tzHint, now);
    return this.store.owned(cid);
  }

  /** Remember what the collector wears (owned variants only); returns what was kept. */
  setEquipped(cid: string, tzHint: string | undefined, wear: unknown, now: number): Wear | undefined {
    this.ensure(cid, tzHint, now);
    const kept = isWear(wear) ? filterOwnedWear(wear, new Set(this.store.owned(cid))) : undefined;
    this.store.setEquipped(cid, kept);
    return kept;
  }

  inventory(cid: string, tzHint: string | undefined, now: number): Inventory {
    const c = this.ensure(cid, tzHint, now);
    const info = windowInfo(now, c.tz);
    return {
      cid,
      owned: this.store.owned(cid),
      feathers: c.feathers,
      equipped: c.equipped ?? null,
      tz: c.tz,
      tzLockedUntil: this.tzLockedUntil(c, now),
      window: info.key,
      next: info.next,
    };
  }

  /** Give a collector a variant (shop purchases, support, events). Idempotent. */
  grant(cid: string, variant: string, source: Source, now: number): GrantResult {
    if (!parseVariant(variant)) return { ok: false, reason: 'unknown' };
    this.ensure(cid, undefined, now);
    return { ok: true, variant, added: this.store.addOwned(cid, variant, source, now) };
  }
}

/** A plain-JSON copy of a memory store (the local mode keeps it in localStorage). */
export interface MemoryStoreSnapshot {
  collectors: CollectorRow[];
  owned: Array<[string, string, Source, number]>;
  drops: Array<[string, string, DropRow[]]>;
}

/** In-memory store for tests and the zero-backend local mode. */
export class MemoryCollectionStore implements CollectionStore {
  readonly collectors = new Map<string, CollectorRow>();
  readonly ownedRows = new Map<string, Map<string, { source: Source; at: number }>>();
  readonly dropRows = new Map<string, Map<string, DropRow[]>>();

  snapshot(): MemoryStoreSnapshot {
    const owned: MemoryStoreSnapshot['owned'] = [];
    for (const [cid, m] of this.ownedRows) for (const [variant, o] of m) owned.push([cid, variant, o.source, o.at]);
    const drops: MemoryStoreSnapshot['drops'] = [];
    for (const [cid, m] of this.dropRows) for (const [win, rows] of m) drops.push([cid, win, rows]);
    return { collectors: [...this.collectors.values()], owned, drops };
  }

  /** Rebuild from a snapshot; anything malformed is skipped rather than trusted. */
  static from(input: unknown): MemoryCollectionStore {
    const store = new MemoryCollectionStore();
    const snap = (input ?? {}) as Partial<MemoryStoreSnapshot>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    for (const c of Array.isArray(snap.collectors) ? snap.collectors : []) {
      if (!c || typeof c.cid !== 'string') continue;
      store.collectors.set(c.cid, { cid: c.cid, tz: normalizeTimeZone(c.tz), tzSetAt: num(c.tzSetAt), feathers: num(c.feathers), equipped: isWear(c.equipped) ? c.equipped : undefined, createdAt: num(c.createdAt) });
    }
    for (const row of Array.isArray(snap.owned) ? snap.owned : []) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || !parseVariant(row[1])) continue;
      store.addOwned(row[0], row[1], (SOURCES as readonly unknown[]).includes(row[2]) ? row[2] : 'found', num(row[3]));
    }
    for (const row of Array.isArray(snap.drops) ? snap.drops : []) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[1] !== 'string' || !Array.isArray(row[2])) continue;
      const rows = row[2].filter((d) => d && typeof d.room === 'string' && parseVariant(d.variant)).map((d) => ({ n: num(d.n), room: d.room, x: num(d.x), y: num(d.y), variant: d.variant, claimedAt: d.claimedAt === null ? null : num(d.claimedAt) }));
      store.dropRows.set(row[0], new Map([[row[1], rows]]));
    }
    return store;
  }

  getCollector(cid: string) {
    const c = this.collectors.get(cid);
    return c ? { ...c } : null;
  }
  insertCollector(row: CollectorRow) {
    if (!this.collectors.has(row.cid)) this.collectors.set(row.cid, { ...row });
  }
  setFeathers(cid: string, feathers: number) {
    const c = this.collectors.get(cid);
    if (c) c.feathers = feathers;
  }
  setTimeZone(cid: string, tz: string, at: number) {
    const c = this.collectors.get(cid);
    if (c) {
      c.tz = tz;
      c.tzSetAt = at;
    }
  }
  setEquipped(cid: string, equipped: Wear | undefined) {
    const c = this.collectors.get(cid);
    if (c) c.equipped = equipped;
  }
  owned(cid: string) {
    return [...(this.ownedRows.get(cid)?.keys() ?? [])];
  }
  hasOwned(cid: string, variant: string) {
    return this.ownedRows.get(cid)?.has(variant) ?? false;
  }
  addOwned(cid: string, variant: string, source: Source, at: number) {
    let m = this.ownedRows.get(cid);
    if (!m) this.ownedRows.set(cid, (m = new Map()));
    if (m.has(variant)) return false;
    m.set(variant, { source, at });
    return true;
  }
  drops(cid: string, win: string) {
    return (this.dropRows.get(cid)?.get(win) ?? []).map((d) => ({ ...d }));
  }
  putDrops(cid: string, win: string, drops: Drop[]) {
    const prev = this.dropRows.get(cid)?.get(win);
    this.dropRows.set(cid, new Map([[win, prev ?? drops.map((d) => ({ ...d, claimedAt: null }))]]));
  }
  claimDrop(cid: string, win: string, n: number, at: number) {
    const d = this.dropRows.get(cid)?.get(win)?.find((r) => r.n === n);
    if (d) d.claimedAt = at;
  }
}
