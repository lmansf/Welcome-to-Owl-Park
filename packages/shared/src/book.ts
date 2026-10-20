/**
 * The collectibles ledger, written without platform APIs so the room server's Durable Object
 * and the zero-backend local mode run exactly the same rules (and Node tests them). A collector
 * owns variants and a feather balance. Collectibles come from quests (questbook.ts) and the
 * shop (shop.ts), including its daily free gift; feathers come from quests, leaf piles, the
 * park's activities and their daily tasks (activities.ts) and duplicates, and are spent in the
 * shop.
 */
import { PLAY_FEATHERS_PER_DAY, TASKS_BONUS, TASK_FEATHERS, dailyTasks, taskProgress, type PlayEvent, type TaskView } from './activities';
import { DUPLICATE_FEATHERS, STARTER_PACK, filterOwnedWear, isWear, normalizeTimeZone, parseVariant, type Wear } from './collectibles';
import type { QuestItemSpot } from './interactables';
import { nextParkDayAt, parkDay } from './parktime';
import { offerFor, shopRotation, type BuyResult, type GiftResult, type ShopView } from './shop';
import { ROOM_LAYOUT, relayout } from '../rooms';

export type Source = 'found' | 'crafted' | 'granted' | 'bought' | 'quest' | 'shop' | 'gift';
export const SOURCES: readonly Source[] = ['found', 'crafted', 'granted', 'bought', 'quest', 'shop', 'gift'];

/**
 * Things counted per collector and park day: feathers from leaf piles and from the activities (each
 * capped), today's gift, progress on each of the day's three tasks, and whether their bonus is paid.
 */
export type EarnSource = 'leaves' | 'gift' | 'play' | 'task-0' | 'task-1' | 'task-2' | 'tasks-bonus';
export const EARN_SOURCES: readonly EarnSource[] = ['leaves', 'gift', 'play', 'task-0', 'task-1', 'task-2', 'tasks-bonus'];
const TASK_SOURCES = ['task-0', 'task-1', 'task-2'] as const;

export interface CollectorRow {
  cid: string;
  tz: string;
  /** When the home zone was last set (creation counts), ms. */
  tzSetAt: number;
  feathers: number;
  equipped: Wear | undefined;
  createdAt: number;
}

/** One collector's progress on one quest in one period ('' for story quests, else the day or week). */
export interface QuestRow {
  cid: string;
  quest: string;
  period: string;
  /** The current step; equal to the quest's step count when it is ready to hand in. */
  step: number;
  /** Progress on the current step. */
  count: number;
  /** Interactables already counted on the current step (for steps that want different ones). */
  seen: string[];
  /** Quest items placed for this collector (all steps). */
  items: QuestItemSpot[];
  acceptedAt: number;
  /** When it was handed in; null while active. */
  doneAt: number | null;
}

export interface CollectionStore {
  getCollector(cid: string): CollectorRow | null;
  /** Insert a new collector (ignored when it already exists). */
  insertCollector(row: CollectorRow): void;
  setFeathers(cid: string, feathers: number): void;
  setEquipped(cid: string, equipped: Wear | undefined): void;
  owned(cid: string): string[];
  hasOwned(cid: string, variant: string): boolean;
  /** Returns true when the variant was not owned before. */
  addOwned(cid: string, variant: string, source: Source, at: number): boolean;
  /** Feathers earned from a capped source on a park day. */
  earned(cid: string, day: string, source: EarnSource): number;
  addEarned(cid: string, day: string, source: EarnSource, n: number): void;
  /** Every quest row of a collector (active and handed in). */
  quests(cid: string): QuestRow[];
  /** Insert or replace by (cid, quest, period). */
  putQuest(row: QuestRow): void;
  dropQuest(cid: string, quest: string, period: string): void;
}

export interface Inventory {
  cid: string;
  owned: string[];
  feathers: number;
  equipped: Wear | null;
}

export type GrantResult = { ok: true; variant: string; added: boolean } | { ok: false; reason: 'unknown' };

/** A collectible given to a collector: new, or a duplicate paid in feathers. */
export interface Award {
  variant: string;
  dup: boolean;
  /** Feathers paid for a duplicate (0 when new). */
  feathers: number;
}

export class CollectionBook {
  constructor(private readonly store: CollectionStore) {}

  /** The collector, created on first sight with the starter pack. */
  ensure(cid: string, tzHint: string | undefined, now: number): CollectorRow {
    const existing = this.store.getCollector(cid);
    if (existing) return existing;
    const row: CollectorRow = { cid, tz: normalizeTimeZone(tzHint), tzSetAt: now, feathers: 0, equipped: undefined, createdAt: now };
    this.store.insertCollector(row);
    for (const v of STARTER_PACK) this.store.addOwned(cid, v, 'granted', now);
    return this.store.getCollector(cid) ?? row;
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
    return { cid, owned: this.store.owned(cid), feathers: c.feathers, equipped: c.equipped ?? null };
  }

  feathers(cid: string, now: number): number {
    return this.ensure(cid, undefined, now).feathers;
  }

  /** Add feathers; returns the new balance. */
  addFeathers(cid: string, n: number, now: number): number {
    const c = this.ensure(cid, undefined, now);
    const total = c.feathers + Math.max(0, Math.floor(n));
    this.store.setFeathers(cid, total);
    return total;
  }

  /** Add feathers from a capped source, up to `cap` a park day. Returns what was added and the balance. */
  earnCapped(cid: string, source: EarnSource, n: number, cap: number, now: number): { added: number; feathers: number } {
    const day = parkDay(now);
    const room = Math.max(0, cap - this.store.earned(cid, day, source));
    const added = Math.min(room, Math.max(0, Math.floor(n)));
    if (added > 0) this.store.addEarned(cid, day, source, added);
    return { added, feathers: added > 0 ? this.addFeathers(cid, added, now) : this.feathers(cid, now) };
  }

  /** Feathers from an activity (lanterns, the quiz, fishing, the copy game), under their shared daily cap. */
  earnPlay(cid: string, n: number, now: number): { added: number; feathers: number } {
    return this.earnCapped(cid, 'play', n, PLAY_FEATHERS_PER_DAY, now);
  }

  /** Today's three tasks and how far this collector is with each. */
  tasks(cid: string, now: number): TaskView {
    const day = parkDay(now);
    return {
      day,
      endsAt: nextParkDayAt(now),
      tasks: dailyTasks(day).map((t, i) => ({ text: t.text, count: t.count, done: Math.min(t.count, this.store.earned(cid, day, TASK_SOURCES[i]!)) })),
      bonus: this.store.earned(cid, day, 'tasks-bonus') > 0,
    };
  }

  /**
   * Something done in the park: progress on today's tasks, feathers for each task it finishes,
   * and the bonus once all three are done.
   */
  taskEvent(cid: string, ev: PlayEvent, now: number): { tasks: TaskView; finished: string[]; paid: number; total: number } {
    this.ensure(cid, undefined, now);
    const day = parkDay(now);
    const defs = dailyTasks(day);
    const counts = defs.map((_, i) => this.store.earned(cid, day, TASK_SOURCES[i]!));
    const { counts: next, finished } = taskProgress(defs, counts, ev);
    next.forEach((n, i) => {
      if (n > counts[i]!) this.store.addEarned(cid, day, TASK_SOURCES[i]!, n - counts[i]!);
    });
    let paid = finished.length * TASK_FEATHERS;
    if (finished.length && defs.every((t, i) => next[i]! >= t.count) && this.store.earned(cid, day, 'tasks-bonus') === 0) {
      this.store.addEarned(cid, day, 'tasks-bonus', 1);
      paid += TASKS_BONUS;
    }
    const total = paid ? this.addFeathers(cid, paid, now) : this.feathers(cid, now);
    return { tasks: this.tasks(cid, now), finished: finished.map((i) => defs[i]!.text), paid, total };
  }

  /** Give a variant: new goes into the collection, a duplicate pays its feathers. */
  award(cid: string, variant: string, source: Source, now: number): Award {
    this.ensure(cid, undefined, now);
    if (this.store.addOwned(cid, variant, source, now)) return { variant, dup: false, feathers: 0 };
    const v = parseVariant(variant);
    const pay = v ? DUPLICATE_FEATHERS[v.rarity] : 0;
    this.addFeathers(cid, pay, now);
    return { variant, dup: true, feathers: pay };
  }

  /** Give a collector a variant (support, events). Idempotent. */
  grant(cid: string, variant: string, source: Source, now: number): GrantResult {
    if (!parseVariant(variant)) return { ok: false, reason: 'unknown' };
    this.ensure(cid, undefined, now);
    return { ok: true, variant, added: this.store.addOwned(cid, variant, source, now) };
  }

  /** The shop as this collector sees it. */
  shop(cid: string, now: number): ShopView {
    const c = this.ensure(cid, undefined, now);
    const rotation = shopRotation(now);
    const offered = [...rotation.featured, ...rotation.weekly, ...rotation.daily, ...(rotation.gift ? [rotation.gift] : [])].map((o) => o.variant);
    return { rotation, owned: offered.filter((v) => this.store.hasOwned(cid, v)), feathers: c.feathers, giftTaken: this.store.earned(cid, parkDay(now), 'gift') > 0 };
  }

  /** Take today's free gift, once a park day: new to the collection, or a duplicate paid in feathers. */
  claimGift(cid: string, now: number): GiftResult {
    const c = this.ensure(cid, undefined, now);
    const gift = shopRotation(now).gift;
    if (!gift) return { ok: false, reason: 'none', total: c.feathers };
    const day = parkDay(now);
    if (this.store.earned(cid, day, 'gift') > 0) return { ok: false, reason: 'taken', total: c.feathers };
    this.store.addEarned(cid, day, 'gift', 1);
    const award = this.award(cid, gift.variant, 'gift', now);
    return { ok: true, variant: award.variant, dup: award.dup, feathers: award.feathers, total: this.feathers(cid, now) };
  }

  /** Buy a variant the shop offers right now, for feathers. */
  buy(cid: string, variant: unknown, now: number): BuyResult {
    const c = this.ensure(cid, undefined, now);
    if (typeof variant !== 'string' || !parseVariant(variant)) return { ok: false, reason: 'unknown', feathers: c.feathers };
    const offer = offerFor(shopRotation(now), variant);
    if (!offer) return { ok: false, reason: 'not-offered', feathers: c.feathers };
    if (this.store.hasOwned(cid, variant)) return { ok: false, reason: 'owned', feathers: c.feathers };
    if (c.feathers < offer.price) return { ok: false, reason: 'feathers', feathers: c.feathers };
    const feathers = c.feathers - offer.price;
    this.store.setFeathers(cid, feathers);
    this.store.addOwned(cid, variant, 'shop', now);
    return { ok: true, variant, price: offer.price, feathers };
  }
}

/** A plain-JSON copy of a memory store (the local mode keeps it in localStorage). */
export interface MemoryStoreSnapshot {
  collectors: CollectorRow[];
  owned: Array<[string, string, Source, number]>;
  earned?: Array<[string, string, EarnSource, number]>;
  quests?: QuestRow[];
  /** The rooms' layout its positions belong to (ROOM_LAYOUT; 1 when missing). */
  layout?: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function cleanQuestRow(r: unknown): QuestRow | null {
  const o = r as Partial<QuestRow> | null;
  if (!o || typeof o.cid !== 'string' || typeof o.quest !== 'string' || typeof o.period !== 'string') return null;
  const items = Array.isArray(o.items)
    ? o.items.filter((i) => i && typeof i.room === 'string' && typeof i.kind === 'string').map((i) => ({ n: num(i.n), step: num(i.step), room: i.room, x: num(i.x), y: num(i.y), kind: i.kind, taken: !!i.taken }))
    : [];
  return {
    cid: o.cid,
    quest: o.quest,
    period: o.period,
    step: num(o.step),
    count: num(o.count),
    seen: Array.isArray(o.seen) ? o.seen.filter((s) => typeof s === 'string') : [],
    items,
    acceptedAt: num(o.acceptedAt),
    doneAt: o.doneAt === null || o.doneAt === undefined ? null : num(o.doneAt),
  };
}

/** In-memory store for tests and the zero-backend local mode. */
export class MemoryCollectionStore implements CollectionStore {
  readonly collectors = new Map<string, CollectorRow>();
  readonly ownedRows = new Map<string, Map<string, { source: Source; at: number }>>();
  readonly earnedRows = new Map<string, number>();
  readonly questRows = new Map<string, QuestRow>();

  snapshot(): MemoryStoreSnapshot {
    const owned: MemoryStoreSnapshot['owned'] = [];
    for (const [cid, m] of this.ownedRows) for (const [variant, o] of m) owned.push([cid, variant, o.source, o.at]);
    const earned: NonNullable<MemoryStoreSnapshot['earned']> = [];
    for (const [k, n] of this.earnedRows) {
      const [cid, day, source] = k.split('|') as [string, string, EarnSource];
      earned.push([cid, day, source, n]);
    }
    return { collectors: [...this.collectors.values()], owned, earned, quests: [...this.questRows.values()], layout: ROOM_LAYOUT };
  }

  /** Rebuild from a snapshot; anything malformed is skipped rather than trusted (old snapshots' drops are ignored). */
  static from(input: unknown): MemoryCollectionStore {
    const store = new MemoryCollectionStore();
    const snap = (input ?? {}) as Partial<MemoryStoreSnapshot>;
    for (const c of Array.isArray(snap.collectors) ? snap.collectors : []) {
      if (!c || typeof c.cid !== 'string') continue;
      store.collectors.set(c.cid, { cid: c.cid, tz: normalizeTimeZone(c.tz), tzSetAt: num(c.tzSetAt), feathers: num(c.feathers), equipped: isWear(c.equipped) ? c.equipped : undefined, createdAt: num(c.createdAt) });
    }
    for (const row of Array.isArray(snap.owned) ? snap.owned : []) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || !parseVariant(row[1])) continue;
      store.addOwned(row[0], row[1], (SOURCES as readonly unknown[]).includes(row[2]) ? row[2] : 'found', num(row[3]));
    }
    for (const row of Array.isArray(snap.earned) ? snap.earned : []) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[1] !== 'string' || !(EARN_SOURCES as readonly unknown[]).includes(row[2])) continue;
      store.earnedRows.set(`${row[0]}|${row[1]}|${row[2]}`, num(row[3]));
    }
    // Quest items saved under an older room layout move with the rooms.
    const layout = typeof snap.layout === 'number' ? snap.layout : 1;
    for (const r of Array.isArray(snap.quests) ? snap.quests : []) {
      const q = cleanQuestRow(r);
      if (q) store.putQuest({ ...q, items: q.items.map((i) => ({ ...i, ...relayout(i.room, i, layout) })) });
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
  earned(cid: string, day: string, source: EarnSource) {
    return this.earnedRows.get(`${cid}|${day}|${source}`) ?? 0;
  }
  addEarned(cid: string, day: string, source: EarnSource, n: number) {
    // Only today's counts matter: forget older days for this collector as we go.
    for (const k of this.earnedRows.keys()) if (k.startsWith(`${cid}|`) && !k.startsWith(`${cid}|${day}|`)) this.earnedRows.delete(k);
    const k = `${cid}|${day}|${source}`;
    this.earnedRows.set(k, (this.earnedRows.get(k) ?? 0) + n);
  }
  quests(cid: string) {
    return [...this.questRows.values()].filter((r) => r.cid === cid).map((r) => ({ ...r, seen: [...r.seen], items: r.items.map((i) => ({ ...i })) }));
  }
  putQuest(row: QuestRow) {
    this.questRows.set(`${row.cid}|${row.quest}|${row.period}`, { ...row, seen: [...row.seen], items: row.items.map((i) => ({ ...i })) });
  }
  dropQuest(cid: string, quest: string, period: string) {
    this.questRows.delete(`${cid}|${quest}|${period}`);
  }
}
