import type { Award, BuyResult, GiftResult, Inventory, QuestBoard, QuestEvent, QuestUpdate, ShopView, Vec2 } from '@owl-park/shared';
import type { RoomConnection } from '../net/transport';

/** The answer to a quest request: whether it worked, the board as it now stands, and what moved. */
export interface QuestReply {
  ok: boolean;
  /** Why not: 'far', 'busy', 'offline', 'unknown', or the ledger's reason ('full', 'not-offered', 'gone', ...). */
  reason?: string;
  /** Null when the request never reached the ledger (offline, refused on the way). */
  board: QuestBoard | null;
  updates: QuestUpdate[];
}

export type HandInReply =
  | { ok: true; quest: string; title: string; thanks: string; feathers: number; total: number; award: Award | null; board: QuestBoard }
  | { ok: false; reason: string; board: QuestBoard | null };

/** A use of an interactable: feathers found (leaf piles), the balance (-1 when unknown) and quest progress. */
export interface UseReply {
  ok: boolean;
  reason?: string;
  feathers: number;
  total: number;
  updates: QuestUpdate[];
  /** The board after progress, when the answer carries it (the room server pushes it separately). */
  board?: QuestBoard;
}

/**
 * Quests in one room. The room server answers these over the room's WebSocket (it checks where
 * the owl stands, and counts arrivals and emotes by itself); the local mode answers them in this
 * browser.
 */
export interface QuestLink {
  board(): Promise<QuestReply>;
  /** Talk to an NPC owl standing close by (counts for quests that ask for it). */
  talk(npc: string): Promise<QuestReply>;
  accept(quest: string): Promise<QuestReply>;
  abandon(quest: string): Promise<QuestReply>;
  /** Hand a finished quest back to its giver, who stands close by. */
  handIn(quest: string): Promise<HandInReply>;
  /** Use an interactable close by: flop into a leaf pile, browse a stall. */
  use(target: string): Promise<UseReply>;
  /** Pick up quest item `n` the owl stands on. */
  gather(quest: string, n: number): Promise<QuestReply>;
  /** An arrival or an emote, for quests that ask for one (the room server notices these itself). */
  note(ev: QuestEvent): void;
}

/** What the room pushes without being asked. */
export interface QuestPushes {
  /** The board after an arrival or an emote moved a quest along. */
  onQuests?(board: QuestBoard, updates: QuestUpdate[]): void;
  /** Every shared object used up right now: id -> when it is back (this device's clock). */
  onObjects?(until: Record<string, number>): void;
  /** Someone used a shared object (`by` is null for this visitor); it is back at `until` (this device's clock). */
  onUsed?(id: string, by: string | null, until: number): void;
}

/**
 * A visitor's collection, feathers and quests. Two implementations share the rules in
 * `@owl-park/shared`:
 *  - LocalCollections: zero backend, everything in this browser's localStorage (local and
 *    Supabase transports, development, the end-to-end tests);
 *  - EdgeCollections: the room server's Collections object (inventory and the shop over HTTP,
 *    quests over the room's WebSocket so the server can check where the owl stands).
 */
export interface CollectionService {
  readonly mode: 'local' | 'edge';
  inventory(): Promise<Inventory>;
  /** The shop as this collector sees it: this week's eight, the featured ones, today's three and the free gift. */
  shop(): Promise<ShopView>;
  buy(variant: string): Promise<BuyResult>;
  /** Take today's free gift (once a park day). */
  claimGift(): Promise<GiftResult>;
  /**
   * Quests in a room: the room connection's link when the server keeps them, otherwise one in this
   * browser that reads the owl's position from `where`. Null when there is none (the server link
   * is missing).
   */
  questLink(room: string, conn: RoomConnection | null, pushes: QuestPushes, where: () => Vec2): QuestLink | null;
}

/** This device's IANA time zone, if the browser reports a usable one. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
