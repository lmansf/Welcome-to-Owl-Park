import {
  CollectionBook,
  KIND_RULES,
  LEAF_FEATHERS_PER_DAY,
  MemoryCollectionStore,
  NPC_TALK_RADIUS,
  QuestBook,
  REACH_SLACK,
  USE_COOLDOWN_MS,
  distance,
  getInteractable,
  getNpc,
  getQuest,
  leafFeathers,
  leafRespawnMs,
  normalizeTimeZone,
  type BuyResult,
  type GiftResult,
  type Inventory,
  type NpcDef,
  type QuestSpots,
  type ShopView,
  type Vec2,
} from '@owl-park/shared';
import type { RoomConnection } from '../net/transport';
import { ROOMS } from '../rooms';
import type { CollectionService, HandInReply, QuestLink, QuestPushes, QuestReply, UseReply } from './service';

const COLLECTOR_KEY = 'owl-park:local-collector';
const STORE_PREFIX = 'owl-park:collection:';
const SPOTS: QuestSpots = Object.fromEntries(Object.values(ROOMS).map((r) => [r.id, r.spots ?? []]));

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function randomCid(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const c = globalThis.crypto;
  const bytes = c && typeof c.getRandomValues === 'function' ? c.getRandomValues(new Uint8Array(12)) : Uint8Array.from({ length: 12 }, () => Math.floor(Math.random() * 256));
  let s = 'c_';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

const refused = (reason: string): QuestReply => ({ ok: false, reason, board: null, updates: [] });
const unused = (reason: string): UseReply => ({ ok: false, reason, feathers: 0, total: -1, updates: [] });

/**
 * The whole collection in this browser (no server). Same rules and numbers as the room server,
 * reach checks included; leaf piles are this page's alone (there is nobody to share them with).
 * Tabs share one collection: the store is re-read before and written after every operation.
 */
export class LocalCollections implements CollectionService {
  readonly mode = 'local' as const;
  readonly cid: string;
  private readonly tz: string;
  private readonly now: () => number;
  private readonly random: () => number;
  private memory: MemoryCollectionStore | null = null;
  /** Shared objects used up in this page: id -> when they are back. */
  private readonly objects = new Map<string, number>();
  private usedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly storage: KeyValueStorage | null,
    opts: { collector?: string | undefined; tz?: string | undefined; now?: () => number; random?: () => number } = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.random = opts.random ?? Math.random;
    this.tz = normalizeTimeZone(opts.tz);
    let cid = opts.collector && /^[A-Za-z0-9_-]{1,32}$/.test(opts.collector) ? opts.collector : null;
    if (!cid) {
      try {
        cid = storage?.getItem(COLLECTOR_KEY) ?? null;
      } catch {
        cid = null;
      }
    }
    if (!cid) {
      cid = randomCid();
      try {
        storage?.setItem(COLLECTOR_KEY, cid);
      } catch {
        /* private mode: this page keeps its own collection */
      }
    }
    this.cid = cid;
  }

  /** Run against the latest stored collection, then store it again. */
  private use<T>(fn: (books: { book: CollectionBook; quests: QuestBook }) => T): T {
    let store: MemoryCollectionStore;
    try {
      const raw = this.storage?.getItem(STORE_PREFIX + this.cid) ?? null;
      store = raw ? MemoryCollectionStore.from(JSON.parse(raw)) : (this.memory ?? new MemoryCollectionStore());
    } catch {
      store = this.memory ?? new MemoryCollectionStore();
    }
    const book = new CollectionBook(store);
    const out = fn({ book, quests: new QuestBook(store, book, SPOTS) });
    this.memory = store;
    try {
      this.storage?.setItem(STORE_PREFIX + this.cid, JSON.stringify(store.snapshot()));
    } catch {
      /* storage full or unavailable: the collection lives for this page only */
    }
    return out;
  }

  async inventory(): Promise<Inventory> {
    return this.use(({ book }) => book.inventory(this.cid, this.tz, this.now()));
  }

  async shop(): Promise<ShopView> {
    return this.use(({ book }) => book.shop(this.cid, this.now()));
  }

  async buy(variant: string): Promise<BuyResult> {
    return this.use(({ book }) => book.buy(this.cid, variant, this.now()));
  }

  async claimGift(): Promise<GiftResult> {
    return this.use(({ book }) => book.claimGift(this.cid, this.now()));
  }

  private liveObjects(): Record<string, number> {
    const now = this.now();
    const out: Record<string, number> = {};
    for (const [id, until] of this.objects) {
      if (until > now) out[id] = until;
      else this.objects.delete(id);
    }
    return out;
  }

  questLink(room: string, _conn: RoomConnection | null, pushes: QuestPushes, where: () => Vec2): QuestLink {
    const cid = this.cid;
    const near = (p: Vec2, radius: number) => distance(where(), p) <= radius + REACH_SLACK;
    /** The giver of a quest, if it stands in this room. */
    const giverHere = (quest: string): NpcDef | undefined => {
      const giver = getNpc(getQuest(quest)?.giver ?? '');
      return giver && giver.room === room ? giver : undefined;
    };
    // The room server reports used-up objects right after its welcome; so does this.
    queueMicrotask(() => pushes.onObjects?.(this.liveObjects()));
    return {
      board: async () => this.use(({ quests }) => ({ ok: true, board: quests.board(cid, this.now()), updates: [] })),
      talk: async (npcId) => {
        const npc = getNpc(npcId);
        if (!npc || npc.room !== room) return refused('unknown');
        if (!near(npc.pos, NPC_TALK_RADIUS)) return refused('far');
        return this.use(({ quests }) => {
          const now = this.now();
          const updates = quests.event(cid, { kind: 'talk', npc: npc.id }, now, room);
          return { ok: true, board: quests.board(cid, now), updates };
        });
      },
      accept: async (quest) => {
        const giver = giverHere(quest);
        if (!giver) return refused('unknown');
        if (!near(giver.pos, NPC_TALK_RADIUS)) return refused('far');
        return this.use(({ quests }) => {
          const res = quests.accept(cid, quest, this.now(), room);
          return { ok: res.ok, ...(res.ok ? {} : { reason: res.reason }), board: res.board, updates: [] };
        });
      },
      abandon: async (quest) =>
        this.use(({ quests }) => {
          const res = quests.abandon(cid, quest, this.now());
          return { ok: res.ok, board: res.board, updates: [] };
        }),
      handIn: async (quest): Promise<HandInReply> => {
        const giver = giverHere(quest);
        if (!giver) return { ok: false, reason: 'unknown', board: null };
        if (!near(giver.pos, NPC_TALK_RADIUS)) return { ok: false, reason: 'far', board: null };
        return this.use(({ quests }) => {
          const res = quests.handIn(cid, quest, giver.id, this.now(), this.random);
          return res.ok ? res : { ok: false, reason: res.reason, board: res.board };
        });
      },
      use: async (target) => {
        const it = getInteractable(target);
        if (!it || it.room !== room) return unused('unknown');
        const rules = KIND_RULES[it.kind];
        if (!near(it.pos, rules.reach)) return unused('far');
        const now = this.now();
        if (now - this.usedAt < USE_COOLDOWN_MS) return unused('busy');
        this.usedAt = now;
        if (rules.shared) {
          if ((this.objects.get(it.id) ?? 0) > now) return unused('gone');
          const until = now + leafRespawnMs(this.random);
          this.objects.set(it.id, until);
          pushes.onUsed?.(it.id, null, until);
        }
        return this.use(({ book, quests }) => {
          const earned = rules.shared ? book.earnCapped(cid, 'leaves', leafFeathers(this.random), LEAF_FEATHERS_PER_DAY, now) : null;
          const updates = quests.event(cid, { kind: 'interact', what: it.kind, id: it.id, room }, now, room);
          const reply: UseReply = { ok: true, feathers: earned?.added ?? 0, total: earned?.feathers ?? book.feathers(cid, now), updates };
          return updates.length ? { ...reply, board: quests.board(cid, now) } : reply;
        });
      },
      gather: async (quest, n) =>
        this.use(({ quests }) => {
          const now = this.now();
          const res = quests.gather(cid, quest, n, room, where(), now);
          return res.ok ? { ok: true, board: res.board, updates: res.updates } : { ok: false, reason: res.reason, board: quests.board(cid, now), updates: [] };
        }),
      note: (ev) => {
        const moved = this.use(({ quests }) => {
          const now = this.now();
          const updates = quests.event(cid, ev, now, room);
          return updates.length ? { board: quests.board(cid, now), updates } : null;
        });
        if (moved) pushes.onQuests?.(moved.board, moved.updates);
      },
    };
  }
}
