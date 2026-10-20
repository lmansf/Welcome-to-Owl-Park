/**
 * Durable Object holding every collector's collection, feathers and quests in its SQLite storage.
 * One object for the park (`getByName('park')`), called over RPC by the Worker (inventory, the
 * shop, grants) and by the room object (quests, uses, ownership checks for wear and emotes). The
 * rules live in the portable `CollectionBook` and `QuestBook` (packages/shared) over the SQL store
 * in sqlStore.ts. Rewards draw from the platform's cryptographic random source.
 */
import { DurableObject } from 'cloudflare:workers';
import {
  CollectionBook,
  LEAF_FEATHERS_PER_DAY,
  QuestBook,
  leafFeathers,
  type AbandonResult,
  type AcceptResult,
  type BuyResult,
  type GatherResult,
  type GiftResult,
  type GrantResult,
  type HandInResult,
  type Inventory,
  type QuestBoard,
  type QuestEvent,
  type QuestUpdate,
  type PlayEvent,
  type PlayResult,
  type ShopView,
  type Source,
  type TaskView,
  type Vec2,
  type Wear,
} from '@owl-park/shared';
import { ROOMS } from './rooms';
import { SqlCollectionStore } from './sqlStore';
import type { Env } from './env';

/** A uniform [0, 1) from the platform's cryptographic source. */
function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296;
}

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

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const store = new SqlCollectionStore(ctx.storage.sql);
    this.book = new CollectionBook(store);
    this.quests = new QuestBook(store, this.book, SPOTS);
  }

  async owned(cid: string, tzHint?: string): Promise<string[]> {
    return this.book.owned(cid, tzHint, Date.now());
  }

  async inventory(cid: string, tzHint?: string): Promise<Inventory> {
    return this.book.inventory(cid, tzHint, Date.now());
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

  async buy(cid: string, variant: string): Promise<BuyResult> {
    return this.book.buy(cid, variant, Date.now());
  }

  async claimGift(cid: string): Promise<GiftResult> {
    return this.book.claimGift(cid, Date.now());
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

  async handIn(cid: string, quest: string, npc: string): Promise<HandInResult> {
    return this.quests.handIn(cid, quest, npc, Date.now(), secureRandom);
  }
}
