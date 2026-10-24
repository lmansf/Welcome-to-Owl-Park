/**
 * Durable Object holding every collector's collection, feathers and quests in its SQLite storage,
 * and every owl's nest and furniture beside them. One object for the park (`getByName('park')`),
 * called over RPC by the Worker (inventory, the shop, grants, the furniture gift) and by the room
 * object (quests, uses, ownership checks for wear and emotes, the nests). The rules live in the
 * portable `CollectionBook`, `QuestBook` and `NestBook` (packages/shared) over the SQL stores in
 * sqlStore.ts and sqlNestStore.ts. Rewards and nest ids draw from the platform's cryptographic
 * random source. Visitors' feedback waits here too, for the keepers' page (feedbackBox.ts). Every
 * collectible granted goes to the collection log (collectLog.ts, OP-107) in the same step, and on to
 * the owner's analytics once the call is done; the object's alarm retries what could not be sent.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  CollectionBook,
  LEAF_FEATHERS_PER_DAY,
  NestBook,
  QuestBook,
  leafFeathers,
  secureNestId,
  type AbandonResult,
  type AcceptResult,
  type BuyResult,
  type FeedbackDraft,
  type FurnitureGiftResult,
  type GatherResult,
  type GiftResult,
  type GrantResult,
  type HandInResult,
  type Inventory,
  type MyNest,
  type NestEditResult,
  type NestLook,
  type NestVisit,
  type QuestBoard,
  type QuestEvent,
  type QuestUpdate,
  type PlayEvent,
  type PlayResult,
  type ShopView,
  type Source,
  type StreetDoor,
  type TaskView,
  type Vec2,
  type Wear,
} from '@owl-park/shared';
import { CollectLog, collectibleType, furnitureId, logConfig, type CollectibleType, type Visit } from './collectLog';
import { FeedbackBox, type FeedbackAdd, type FeedbackRow, type FeedbackStatus } from './feedbackBox';
import { ROOMS } from './rooms';
import { SqlNestStore } from './sqlNestStore';
import { SqlCollectionStore } from './sqlStore';
import type { Env } from './env';

/** A uniform [0, 1) from the platform's cryptographic source. */
function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
}

/** Random bytes from the platform's cryptographic source. */
const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

const SPOTS = Object.fromEntries(Object.values(ROOMS).map((r) => [r.id, r.spots ?? []]));

export interface EventResult {
  updates: QuestUpdate[];
  /** Present when something moved, so the room can push it to the visitor. */
  board?: QuestBoard;
}

export interface FlopResult extends EventResult {
  feathers: number;
  total: number;
}

export class Collections extends DurableObject<Env> {
  private readonly book: CollectionBook;
  private readonly quests: QuestBook;
  private readonly nests: NestBook;
  private readonly feedbackBox: FeedbackBox;
  private readonly log: CollectLog;
  /** The visit the call in progress came in, as its caller said (`during`), for the log's rows. */
  private visit: Visit | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    this.log = new CollectLog(sql, logConfig(env), { fetch: (url, init) => fetch(url, init), now: () => Date.now(), wake: (at) => this.wake(at) });
    const store = new SqlCollectionStore(sql, (cid, variant, source, at) => this.acquired(cid, variant, collectibleType(variant, source), at));
    this.book = new CollectionBook(store);
    this.quests = new QuestBook(store, this.book, SPOTS);
    const nestStore = new SqlNestStore(sql, (cid, item, source, at) => this.acquired(cid, furnitureId(item), collectibleType(item, source), at));
    this.nests = new NestBook(nestStore, this.book, { newId: () => secureNestId(randomBytes), random: secureRandom });
    this.feedbackBox = new FeedbackBox(sql);
  }

  // ---------- the collection log (OP-107) ----------

  /** A collectible granted: into the log's outbox in this same step, and sent as soon as the step is done. */
  private acquired(cid: string, collectible: string, type: CollectibleType, at: number): void {
    if (!this.log.on) return;
    this.log.record({ cid, collectible, type, at, visit: this.visit });
    this.ctx.waitUntil(this.log.flush());
  }

  /** Run a call with the visit it came in (the Worker's or the room's word), for any row it grants. */
  private during<T>(visit: Visit | undefined, run: () => T): T {
    this.visit = visit ?? null;
    try {
      return run();
    } finally {
      this.visit = null;
    }
  }

  /** The log's next try, unless the alarm is set sooner. */
  private wake(at: number): void {
    this.ctx.waitUntil(this.ctx.storage.getAlarm().then((set) => (set === null || set > at ? this.ctx.storage.setAlarm(at) : undefined)));
  }

  /** The log's retries: whatever is still waiting goes again. */
  override async alarm(): Promise<void> {
    await this.log.flush();
  }

  /** The owner's backfill (OP-107): every collectible held now, queued for the log once (a row it has already lands once). */
  async backfillLog(): Promise<{ on: boolean; queued: number; waiting: number }> {
    const queued = this.log.backfill();
    if (queued) this.ctx.waitUntil(this.log.flush());
    return { on: this.log.on, queued, waiting: this.log.waiting() };
  }

  /** Whether the log is set up, and how many rows wait to be sent. */
  async logState(): Promise<{ on: boolean; waiting: number }> {
    return { on: this.log.on, waiting: this.log.waiting() };
  }

  /** The health check's question (OP-068): the object is up and answering. */
  async ping(): Promise<true> {
    return true;
  }

  // A call that may grant something (a new collector's starter pack and presents among them) takes
  // the visit it came in, for the log.

  async owned(cid: string, tzHint?: string, visit?: Visit): Promise<string[]> {
    return this.during(visit, () => this.book.owned(cid, tzHint, Date.now()));
  }

  async inventory(cid: string, tzHint?: string, visit?: Visit): Promise<Inventory> {
    return this.during(visit, () => this.book.inventory(cid, tzHint, Date.now()));
  }

  async setEquipped(cid: string, tzHint: string | undefined, wear: Wear | null): Promise<Wear | null> {
    return this.book.setEquipped(cid, tzHint, wear ?? undefined, Date.now()) ?? null;
  }

  async grant(cid: string, variant: string, source: Source): Promise<GrantResult> {
    return this.book.grant(cid, variant, source, Date.now());
  }

  async shop(cid: string): Promise<ShopView> {
    return this.book.shop(cid, Date.now());
  }

  async buy(cid: string, variant: string, visit?: Visit): Promise<BuyResult> {
    return this.during(visit, () => this.book.buy(cid, variant, Date.now()));
  }

  async claimGift(cid: string, visit?: Visit): Promise<GiftResult> {
    return this.during(visit, () => this.book.claimGift(cid, Date.now()));
  }

  async board(cid: string): Promise<QuestBoard> {
    return this.quests.board(cid, Date.now());
  }

  async accept(cid: string, quest: string, here: string): Promise<AcceptResult> {
    return this.quests.accept(cid, quest, Date.now(), here);
  }

  async abandon(cid: string, quest: string): Promise<AbandonResult> {
    return this.quests.abandon(cid, quest, Date.now());
  }

  /** Count a talk, visit, use or emote toward the collector's quests. */
  async questEvent(cid: string, ev: QuestEvent, here: string): Promise<EventResult> {
    const now = Date.now();
    const updates = this.quests.event(cid, ev, now, here);
    return updates.length ? { updates, board: this.quests.board(cid, now) } : { updates };
  }

  /** A flop into a leaf pile: maybe feathers (capped per day), and quest progress. */
  async flop(cid: string, ev: QuestEvent, here: string): Promise<FlopResult> {
    const now = Date.now();
    const { added, feathers } = this.book.earnCapped(cid, 'leaves', leafFeathers(secureRandom), LEAF_FEATHERS_PER_DAY, now);
    const updates = this.quests.event(cid, ev, now, here);
    return { feathers: added, total: feathers, updates, ...(updates.length ? { board: this.quests.board(cid, now) } : {}) };
  }

  /**
   * Feathers from an activity (lanterns, the quiz, fishing, the copy game) under their shared daily
   * cap, and the event's progress on today's tasks (`feathers` may be 0: a lantern lit, a leaf pile).
   */
  async play(cid: string, feathers: number, ev: PlayEvent | null): Promise<PlayResult> {
    return this.book.play(cid, feathers, ev, Date.now());
  }

  /** Today's three tasks and this collector's progress. */
  async tasks(cid: string): Promise<TaskView> {
    return this.book.tasks(cid, Date.now());
  }

  async gather(cid: string, quest: string, n: number, room: string, pos: Vec2): Promise<GatherResult> {
    return this.quests.gather(cid, quest, n, room, pos, Date.now());
  }

  async handIn(cid: string, quest: string, npc: string, visit?: Visit): Promise<HandInResult> {
    return this.during(visit, () => this.quests.handIn(cid, quest, npc, Date.now(), secureRandom));
  }

  // ---------- nests: none of these answers carries a collector id ----------

  /** The collector's own nest (made on first sight), keeping its colours for the flag on its street door. */
  async myNest(cid: string, look: NestLook | null, visit?: Visit): Promise<MyNest> {
    return this.during(visit, () => this.nests.mine(cid, look, Date.now()));
  }

  /** A nest by its id as this visitor finds it (null: no such nest): whether it is the visitor's own is decided here. */
  async nestById(nestId: string, visitorCid?: string): Promise<NestVisit | null> {
    return this.nests.visit(nestId, visitorCid ?? null, Date.now());
  }

  /** The owner puts a piece in a spot of its nest, or with `item` null takes the spot's piece away. */
  async setNestSpot(cid: string, spot: string, item: string | null): Promise<NestEditResult> {
    return this.nests.setSpot(cid, spot, item, Date.now());
  }

  /** The owner opens its nest to visitors or closes it. */
  async setNestOpen(cid: string, open: boolean): Promise<NestEditResult> {
    return this.nests.setOpen(cid, open === true, Date.now());
  }

  /** Up to `n` other owls' open nests for the street's doors. */
  async streetNests(cid: string, n: number): Promise<StreetDoor[]> {
    return this.nests.street(cid, n);
  }

  /** Today's furniture gift, once a park day. */
  async claimFurnitureGift(cid: string, visit?: Visit): Promise<FurnitureGiftResult> {
    return this.during(visit, () => this.nests.claimGift(cid, Date.now()));
  }

  // ---------- feedback ----------

  /** A visitor's feedback, kept for the park's keepers (feedbackBox.ts). */
  async addFeedback(cid: string, draft: FeedbackDraft, ua: string | null): Promise<FeedbackAdd> {
    return this.feedbackBox.add(cid, draft, ua, Date.now());
  }

  async feedback(status: FeedbackStatus | 'all', limit: number): Promise<FeedbackRow[]> {
    return this.feedbackBox.list(status, limit);
  }

  async setFeedbackStatus(id: number, status: FeedbackStatus): Promise<boolean> {
    return this.feedbackBox.setStatus(id, status);
  }
}
