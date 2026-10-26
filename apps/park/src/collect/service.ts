import type {
  ArcadeGame,
  Award,
  BuyResult,
  ClimbTier,
  ClimbWhy,
  FurnitureGiftResult,
  GameWall,
  GiftResult,
  Inventory,
  NestEditRefusal,
  NestLook,
  NestSpotId,
  NestView,
  OwlLook,
  OwnBests,
  QuestBoard,
  QuestEvent,
  QuestUpdate,
  QuizZone,
  RunPaid,
  RunResult,
  ShopView,
  TaskView,
  Vec2,
} from '@owl-park/shared';
import type { StreetView } from '../game/nestPlan';
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

/** Why the room did not take an activity. */
export type ActRefusal = 'far' | 'busy' | 'lit' | 'glowing' | 'idle' | 'emote' | 'offline' | 'unknown' | 'closed' | 'too-fast' | 'forgotten';
type No = { ok: false; reason: ActRefusal };

/** The robot owl's tune to copy: played until `listenUntil`, then each note due by `deadline`. */
export interface CopyTune {
  tune: string[];
  listenUntil: number;
  deadline: number;
  /** Tunes copied so far this game. */
  level: number;
}

export type LightReply = { ok: true; id: string } | No;
export type CastReply = { ok: true; biteAt: number } | No;
export type ReelReply = { ok: true; outcome: 'early' | 'late' } | { ok: true; outcome: 'caught'; fish: string; feathers: number; total: number } | No;
/** A new game: the emotes the robot plays this game, and its first tune. */
export type CopyReply = ({ ok: true; notes: string[] } & CopyTune) | No;
export type NoteReply =
  | { ok: true; step: 'note' | 'early'; deadline: number }
  | ({ ok: true; step: 'tune'; feathers: number; total: number } & CopyTune)
  | { ok: true; step: 'won'; level: number; feathers: number; total: number }
  | { ok: true; step: 'wrong' | 'slow'; level: number; expected: string }
  | No;
/** A run started at a cabinet: the seed of its course and when it started (this device's clock). */
export type RunReply = { ok: true; game: ArcadeGame; seed: number; startedAt: number } | No;
/** A run's result taken: what it paid, the wall it changed and the owl's own bests. */
export type ScoreReply = { ok: true; paid: RunPaid } | No;
/** A climb started at the portal, or the open one returned (`resumed`); `startedAt` on this device's clock. */
export type ClimbReply =
  | { ok: true; seed: number; startedAt: number; night: string; tier: ClimbTier; banked: number; remainingCap: number; bestBandToday: number; resumed: boolean; previousForgotten: boolean }
  | No;
/** A band line reached: what the room banked and paid, and the run's reference. */
export type AscentReply = { ok: true; banked: number; added: number; feathers: number; total: number; brisk: number; why?: ClimbWhy; item?: { variant: string; first: true }; ref: string } | No;

/**
 * The park's activities in one room (activities.ts in @owl-park/shared): the hub's lanterns, the pond
 * in the grove, the market robot owl's copy game, the arcade's runs (arcade.ts), and today's tasks.
 * Times in answers and pushes are on this device's clock; the stage quiz runs on the park clock,
 * `parkNow()`.
 */
export interface ActivityLink {
  /** The room's clock: the stage quiz's schedule runs on it. */
  parkNow(): number;
  /** Light the dark lantern above the owl. */
  light(): Promise<LightReply>;
  /** Cast a line from the jetty; a fish bites at `biteAt`. */
  cast(): Promise<CastReply>;
  reel(): Promise<ReelReply>;
  /** Start the robot owl's copy game, standing in front of it. */
  copy(): Promise<CopyReply>;
  /** Play a note (an emote) of the tune. */
  note(e: string): Promise<NoteReply>;
  /** Today's three tasks (null when the room did not answer). */
  tasks(): Promise<TaskView | null>;
  /** Start a run of an arcade game, standing at its cabinet. */
  run(game: ArcadeGame): Promise<RunReply>;
  /** End the run with this seed: its score (and for Nest Knockdown, its shots). */
  score(result: RunResult, seed: number): Promise<ScoreReply>;
  /** The stained-glass climb: start a run at the portal, or get the open one back wherever the owl stands. */
  climb(): Promise<ClimbReply>;
  /** A band line reached in the run with this seed (1 to BAND_COUNT). */
  ascent(seed: number, band: number): Promise<AscentReply>;
  /** The owl left the room. */
  close(): void;
}

/** What the activities push without being asked. */
export interface ActivityPushes {
  /** The lantern beam (this device's clock); `lit` names a lantern just lit and by whom (null: this visitor). */
  onLanterns?(beam: { lit: Record<string, number>; glowUntil: number }, lit: { id: string; by: string | null } | null): void;
  /** A stage quiz question closed: the right zone, whether this visitor stood in it, and the other owls that did. */
  onQuiz?(n: number, right: QuizZone, won: boolean, others: string[]): void;
  /** Feathers from something shared: a full lantern beam, a right quiz answer. */
  onPaid?(what: 'beam' | 'quiz', feathers: number, total: number): void;
  /** Today's tasks moved: as they stand, the ones just finished, what they paid and the balance. */
  onTasks?(tasks: TaskView, finished: string[], paid: number, total: number): void;
  /** The arcade's score wall: every column and the owl's own bests on arrival, then a column as it changes. */
  onWall?(walls: GameWall[], mine: OwnBests | null): void;
}

/** A nest as the room shows it to this visitor; its owner also learns what it owns and today's gift. */
export interface NestSeen {
  nest: NestView;
  /** Whether it is this visitor's own nest; absent when an update leaves that as it was. */
  mine?: boolean;
  owned?: string[];
  /** Today's furniture gift: taken already or not, and when the next one comes (this device's clock). */
  gift?: { taken: boolean; next: number };
}

export type NestEditReply = { ok: true; nest: NestView } | { ok: false; reason: NestEditRefusal };

/** Today's furniture gift as the visitor got it, or why not. */
export type FurnitureGiftReply = FurnitureGiftResult | { ok: false; reason: 'offline' };

/**
 * The nests in one room. On the street: who lives behind each door, for this visitor. In the
 * visitor's own nest: its changes. The room server answers over the room's socket (it knows whose
 * nest it is); the local mode answers in this browser.
 */
export interface NestLink {
  /** The street's doors for this visitor; null when the room did not answer. */
  street(): Promise<StreetView | null>;
  /** Put a piece the owner owns in a spot of its nest, or with null take the spot's piece away. */
  place(spot: NestSpotId, item: string | null): Promise<NestEditReply>;
  /** Open the nest to visitors, or close it (visitors inside go back to the street). */
  setOpen(open: boolean): Promise<NestEditReply>;
  /** The owl left the room. */
  close(): void;
}

/** What the nests push without being asked. */
export interface NestPushes {
  /** The nest as it stands: on arrival, and again whenever its owner changes it. */
  onNest?(seen: NestSeen): void;
  /** The nest turned this visitor away (closed to visitors, or no such nest), or closed while it was inside. */
  onNestClosed?(why: 'closed' | 'gone'): void;
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
  /**
   * The activities in a room, the same way: the room server's over its socket, otherwise this
   * browser's (`look` gives the owl's colours for its portrait on the arcade's wall).
   */
  activityLink(room: string, conn: RoomConnection | null, pushes: ActivityPushes, where: () => Vec2, look: () => OwlLook): ActivityLink | null;
  /**
   * The nests, the same way, on the street and in a nest (null in any other room). `look` gives the
   * visitor's colours for the flag on its own door.
   */
  nestLink(room: string, conn: RoomConnection | null, pushes: NestPushes, look: () => NestLook): NestLink | null;
  /** Today's furniture gift for the visitor's nest (once a park day). */
  claimFurnitureGift(): Promise<FurnitureGiftReply>;
  /** The id of the visitor's own nest, for "Go home" (made on first sight, as on the street); null when it cannot be had. */
  homeNest(): Promise<string | null>;
}

/** This device's IANA time zone, if the browser reports a usable one. */
export function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
