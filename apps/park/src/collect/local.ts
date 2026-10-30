import {
  ARCADE_ROOM,
  Activities,
  ArcadeBook,
  ClimbBook,
  CollectionBook,
  KIND_RULES,
  LEAF_FEATHERS_PER_DAY,
  MemoryClimbStore,
  MemoryCollectionStore,
  MemoryNestStore,
  MemoryScoreStore,
  NestBook,
  NPC_TALK_RADIUS,
  QUIZ_FEATHERS,
  QUIZ_ROOM,
  QuestBook,
  REACH_SLACK,
  sameLevel,
  STREET_DOORS,
  STREET_ROOM,
  USE_COOLDOWN_MS,
  distance,
  getInteractable,
  getNpc,
  getQuest,
  isEmoteId,
  lanternFeathers,
  leafFeathers,
  leafRespawnMs,
  nestIdOf,
  normalizeTimeZone,
  parseTravelState,
  pointInRect,
  portraitLook,
  randomNestId,
  secureNestId,
  startRun,
  travelAfter,
  type BuyResult,
  type GiftResult,
  type Inventory,
  type NestEditResult,
  type NestLook,
  type NestView,
  type NpcDef,
  type OwlLook,
  type PlayEvent,
  type PlayResult,
  type QuestSpots,
  type ShopView,
  type TravelState,
  type Vec2,
} from '@owl-park/shared';
import { LOCAL_COLLECTOR_KEY } from '../identity';
import type { RoomConnection } from '../net/transport';
import { ROOMS } from '../rooms';
import type { ActivityLink, ActivityPushes, CollectionService, FurnitureGiftReply, HandInReply, NestEditReply, NestLink, NestPushes, NoteReply, QuestLink, QuestPushes, QuestReply, UseReply } from './service';

const STORE_PREFIX = 'owl-park:collection:';
/** Every nest in this browser, whichever collector's: the street shows the other ones that are open. */
const NESTS_KEY = 'owl-park:nests';
/** A nest's owner changed it: the other tabs of this browser that are inside it hear of it here. */
const NESTS_CHANNEL = 'owl-park:nests';
/** The arcade's scores of the day in this browser, every collector's: the wall shows them all. */
const ARCADE_KEY = 'owl-park:arcade';
/** The climb's runs and bands in this browser, every collector's. */
const CLIMB_KEY = 'owl-park:climb';
/** Each collector's travel from the map in this browser (OP-130): the places walked into, and the gate. */
const TRAVEL_PREFIX = 'owl-park:travel:';
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

/** A run's seed, from the browser's cryptographic source where there is one. */
function runSeed(): number {
  const c = globalThis.crypto;
  return c && typeof c.getRandomValues === 'function' ? c.getRandomValues(new Uint32Array(1))[0]! : Math.floor(Math.random() * 2 ** 32);
}

/** A new nest id from the browser's cryptographic source where there is one. */
function localNestId(): string {
  const c = globalThis.crypto;
  return c && typeof c.getRandomValues === 'function' ? secureNestId((n) => c.getRandomValues(new Uint8Array(n))) : randomNestId(Math.random);
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
  private nestMemory: MemoryNestStore | null = null;
  private scoreMemory: MemoryScoreStore | null = null;
  private climbMemory: MemoryClimbStore | null = null;
  /** The climb's night when the page pins one (`?night=`); otherwise the moon's. */
  private readonly night: string | null;
  /** Shared objects used up in this page: id -> when they are back. */
  private readonly objects = new Map<string, number>();
  private usedAt = Number.NEGATIVE_INFINITY;
  /** Each room's activities for this page (a lantern beam stays lit while the owl looks round). */
  private readonly activities = new Map<string, { acts: Activities; where: { at: () => Vec2 } }>();
  /** The travel state as this page last had it, should the browser keep nothing. */
  private travelMemory: TravelState = { places: [], gate: false };

  constructor(
    private readonly storage: KeyValueStorage | null,
    opts: { collector?: string | undefined; tz?: string | undefined; now?: () => number; random?: () => number; night?: string | undefined } = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.night = opts.night ?? null;
    this.random = opts.random ?? Math.random;
    this.tz = normalizeTimeZone(opts.tz);
    let cid = opts.collector && /^[A-Za-z0-9_-]{1,32}$/.test(opts.collector) ? opts.collector : null;
    if (!cid) {
      try {
        cid = storage?.getItem(LOCAL_COLLECTOR_KEY) ?? null;
      } catch {
        cid = null;
      }
    }
    if (!cid) {
      cid = randomCid();
      try {
        storage?.setItem(LOCAL_COLLECTOR_KEY, cid);
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

  /** Run against the latest stored nests and this collector's collection (the gift may pay feathers), then store both again. */
  private nests<T>(fn: (nests: NestBook, book: CollectionBook) => T): T {
    let store: MemoryNestStore;
    try {
      const raw = this.storage?.getItem(NESTS_KEY) ?? null;
      store = raw ? MemoryNestStore.from(JSON.parse(raw)) : (this.nestMemory ?? new MemoryNestStore());
    } catch {
      store = this.nestMemory ?? new MemoryNestStore();
    }
    const out = this.use(({ book }) => fn(new NestBook(store, book, { newId: localNestId, random: this.random }), book));
    this.nestMemory = store;
    try {
      this.storage?.setItem(NESTS_KEY, JSON.stringify(store.snapshot()));
    } catch {
      /* storage full or unavailable: the nests live for this page only */
    }
    return out;
  }

  /** Run against the latest stored scores and this collector's collection (a run pays feathers), then store both again. */
  private arcade<T>(fn: (arcade: ArcadeBook) => T): T {
    let store: MemoryScoreStore;
    try {
      const raw = this.storage?.getItem(ARCADE_KEY) ?? null;
      store = raw ? MemoryScoreStore.from(JSON.parse(raw)) : (this.scoreMemory ?? new MemoryScoreStore());
    } catch {
      store = this.scoreMemory ?? new MemoryScoreStore();
    }
    const out = this.use(({ book }) => fn(new ArcadeBook(store, book)));
    this.scoreMemory = store;
    try {
      this.storage?.setItem(ARCADE_KEY, JSON.stringify(store.snapshot()));
    } catch {
      /* storage full or unavailable: the scores live for this page only */
    }
    return out;
  }

  /** Run against the latest stored climbs and this collector's collection (a band pays feathers), then store both again. */
  private climb<T>(fn: (climb: ClimbBook) => T): T {
    let store: MemoryClimbStore;
    try {
      const raw = this.storage?.getItem(CLIMB_KEY) ?? null;
      store = raw ? MemoryClimbStore.from(JSON.parse(raw)) : (this.climbMemory ?? new MemoryClimbStore());
    } catch {
      store = this.climbMemory ?? new MemoryClimbStore();
    }
    const out = this.use(({ book }) => fn(new ClimbBook(store, book, runSeed)));
    this.climbMemory = store;
    try {
      this.storage?.setItem(CLIMB_KEY, JSON.stringify(store.snapshot()));
    } catch {
      /* storage full or unavailable: the climbs live for this page only */
    }
    return out;
  }

  /** The collection, with the furniture for the style sets (any capstone earned since is given first), as the room server answers. */
  async inventory(): Promise<Inventory> {
    return this.nests((nests, book) => {
      const now = this.now();
      return { ...book.inventory(this.cid, this.tz, now), furniture: nests.furniture(this.cid, now) };
    });
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

  async claimFurnitureGift(): Promise<FurnitureGiftReply> {
    return this.nests((nests) => nests.claimGift(this.cid, this.now()));
  }

  async homeNest(): Promise<string | null> {
    return this.nests((nests) => nests.mine(this.cid, null, this.now()).nest.nestId);
  }

  async travel(): Promise<TravelState> {
    return this.travelNow();
  }

  /** The owl joined a room at a spawn: the places and the gate kept as the room server keeps them (shared travel.ts). */
  travelEntered(room: string, spawn: string | undefined): void {
    this.travelMemory = travelAfter(this.travelNow(), room, spawn);
    try {
      this.storage?.setItem(TRAVEL_PREFIX + this.cid, JSON.stringify(this.travelMemory));
    } catch {
      /* storage full or unavailable: the map lives for this page only */
    }
  }

  /** The travel state as stored (another tab of this browser may have moved it on), or as this page last had it. */
  private travelNow(): TravelState {
    try {
      const raw = this.storage?.getItem(TRAVEL_PREFIX + this.cid) ?? null;
      const stored = raw ? parseTravelState(JSON.parse(raw)) : null;
      if (stored) this.travelMemory = stored;
    } catch {
      /* unreadable: what this page last had */
    }
    return this.travelMemory;
  }

  /**
   * The nests in this browser, by the same rules as the room server's: on the street, the visitor's
   * own nest behind door 0 and other collectors' open ones behind the rest; in a nest, the nest as it
   * stands (or the visitor turned away) and, in its own, the owner's changes, which reach the other
   * tabs inside it.
   */
  nestLink(room: string, _conn: RoomConnection | null, pushes: NestPushes, look: () => NestLook): NestLink | null {
    const cid = this.cid;
    const here = nestIdOf(room);
    if (room !== STREET_ROOM && !here) return null;
    let closed = false;
    const later = (fn: () => void) => setTimeout(() => !closed && fn(), 0);
    const channel = here && typeof BroadcastChannel === 'function' ? new BroadcastChannel(NESTS_CHANNEL) : null;
    let mine = false;
    if (here) {
      // The room server sends a newcomer the nest right after its welcome, or turns it away; so does this.
      const visit = this.nests((nests) => nests.visit(here, cid, this.now()));
      mine = visit?.mine ?? false;
      later(() => {
        if (!visit || (!visit.nest.open && !visit.mine)) pushes.onNestClosed?.(visit ? 'closed' : 'gone');
        else pushes.onNest?.({ nest: visit.nest, mine: visit.mine, ...(visit.owned ? { owned: visit.owned } : {}), ...(visit.gift ? { gift: visit.gift } : {}) });
      });
      if (channel) {
        channel.onmessage = (ev: MessageEvent<unknown>) => {
          const nest = (ev.data as { nest?: NestView } | null)?.nest;
          if (closed || !nest || nest.nestId !== here) return;
          if (!nest.open && !mine) pushes.onNestClosed?.('closed');
          else pushes.onNest?.({ nest });
        };
      }
    }
    /** Only the owner, in its own nest, changes it. */
    const edit = (change: (nests: NestBook) => NestEditResult): NestEditReply => {
      const res = this.nests((nests): NestEditReply => (here && nests.mine(cid, null, this.now()).nest.nestId === here ? change(nests) : { ok: false, reason: 'not-owner' }));
      if (res.ok) channel?.postMessage({ nest: res.nest });
      return res;
    };
    return {
      street: async () =>
        this.nests((nests) => {
          const own = nests.mine(cid, look(), this.now()).nest;
          const doors = nests.street(cid, STREET_DOORS - 1);
          return { own: { nestId: own.nestId, open: own.open }, doors: Array.from({ length: STREET_DOORS - 1 }, (_, i) => doors[i] ?? null) };
        }),
      place: async (spot, item) => edit((nests) => nests.setSpot(cid, spot, item, this.now())),
      setOpen: async (open) => edit((nests) => nests.setOpen(cid, open, this.now())),
      close: () => {
        closed = true;
        channel?.close();
      },
    };
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

  questLink(room: string, _conn: RoomConnection | null, pushes: QuestPushes, where: () => Vec2, ground: () => number = () => 0): QuestLink {
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
        // Up on a perch, only from that perch; on the floor, only from the floor (OP-084).
        if (!near(it.pos, rules.reach) || !sameLevel(ground(), it)) return unused('far');
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
          // Leaf piles and stalls count toward today's tasks too.
          const task = it.kind === 'leaf-pile' ? 'flop' : it.kind === 'stall' ? 'browse' : null;
          const played = task ? book.play(cid, 0, { kind: task }, now) : null;
          if (played?.tasks) {
            const t = played.tasks;
            setTimeout(() => this.taskPushes?.onTasks?.(t.tasks, t.finished, t.paid, t.total), 0);
          }
          const reply: UseReply = { ok: true, feathers: earned?.added ?? 0, total: played?.tasks?.total ?? earned?.feathers ?? book.feathers(cid, now), updates };
          return updates.length ? { ...reply, board: quests.board(cid, now) } : reply;
        });
      },
      gather: async (quest, n) =>
        this.use(({ quests }) => {
          const now = this.now();
          const res = quests.gather(cid, quest, n, room, where(), now, ground());
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

  /** Where the room's task progress goes (the room scene's pushes, while it is open). */
  private taskPushes: ActivityPushes | null = null;

  /**
   * The activities, run by the same class as the room server's, for the one owl on this device: the
   * lantern beam is this page's alone, and the stage quiz settles on a timer while the owl is in the hub.
   * The arcade's runs are checked and paid by the same rules, and its wall shows this browser's scores.
   */
  activityLink(room: string, _conn: RoomConnection | null, pushes: ActivityPushes, where: () => Vec2, look: () => OwlLook): ActivityLink {
    const cid = this.cid;
    let host = this.activities.get(room);
    if (!host) {
      const spot = { at: where };
      host = { acts: new Activities({ id: room, ids: () => [cid], positionOf: (id) => (id === cid ? spot.at() : null) }, this.now, this.random), where: spot };
      this.activities.set(room, host);
    }
    host.where.at = where;
    const { acts } = host;
    this.taskPushes = pushes;
    let closed = false;
    let quizTimer: ReturnType<typeof setTimeout> | null = null;
    /** Pushes follow the answer, as the room server's frames do. */
    const later = (fn: () => void) => setTimeout(() => !closed && fn(), 0);
    const play = (feathers: number, ev: PlayEvent | null): PlayResult => {
      const res = this.use(({ book }) => book.play(cid, feathers, ev, this.now()));
      const t = res.tasks;
      if (t) later(() => pushes.onTasks?.(t.tasks, t.finished, t.paid, t.total));
      return res;
    };
    const settleQuiz = () => {
      quizTimer = null;
      if (closed) return;
      const due = acts.quizDue();
      if (due) {
        const { right, winners } = acts.settleQuiz(due);
        const won = winners.includes(cid);
        pushes.onQuiz?.(due.n, right, won, []);
        if (won) {
          const res = play(QUIZ_FEATHERS, { kind: 'quiz' });
          pushes.onPaid?.('quiz', res.added, res.total);
        }
      }
      armQuiz();
    };
    const armQuiz = () => {
      if (closed || room !== QUIZ_ROOM) return;
      quizTimer = setTimeout(settleQuiz, Math.max(0, acts.nextQuizClose() - this.now()) + 50);
    };
    armQuiz();
    // The room server sends a newcomer the beam as it burns, and the arcade's wall; so does this.
    const beam = acts.lanternState();
    if (Object.keys(beam.lit).length) later(() => pushes.onLanterns?.({ lit: beam.lit, glowUntil: beam.glowUntil }, null));
    if (room === ARCADE_ROOM) {
      const wall = this.arcade((a) => ({ walls: a.walls(this.now()), mine: a.mine(cid, this.now()) }));
      later(() => pushes.onWall?.(wall.walls, wall.mine));
    }
    return {
      parkNow: () => this.now(),
      light: async () => {
        const r = acts.light(cid);
        if (!r.ok) return r;
        const s = acts.lanternState();
        later(() => pushes.onLanterns?.({ lit: s.lit, glowUntil: s.glowUntil }, { id: r.id, by: null }));
        play(0, { kind: 'light' });
        if (r.full) {
          const res = play(lanternFeathers(r.full.length), { kind: 'beam' });
          later(() => pushes.onPaid?.('beam', res.added, res.total));
        }
        return { ok: true, id: r.id };
      },
      cast: async () => acts.cast(cid),
      reel: async () => {
        const r = acts.reel(cid);
        if (!r.ok || r.outcome !== 'caught') return r;
        const res = play(r.fish.feathers, { kind: 'fish' });
        return { ok: true, outcome: 'caught', fish: r.fish.id, feathers: res.added, total: res.total };
      },
      copy: async () => {
        const owned = this.use(({ book }) => book.inventory(cid, this.tz, this.now()).owned.filter((v) => isEmoteId(v)));
        const r = acts.startCopy(cid, owned);
        if (!r.ok) return r;
        const g = r.game;
        return { ok: true, notes: g.notes, tune: g.tune, listenUntil: g.listenUntil, deadline: g.deadline, level: g.level };
      },
      note: async (e): Promise<NoteReply> => {
        const step = acts.note(cid, e);
        switch (step.kind) {
          case 'idle':
          case 'busy':
            return { ok: false, reason: step.kind };
          case 'early':
          case 'note':
            return { ok: true, step: step.kind, deadline: step.game.deadline };
          case 'wrong':
          case 'slow':
            return { ok: true, step: step.kind, level: step.level, expected: step.expected };
          case 'tune': {
            const res = play(step.feathers, { kind: 'copy' });
            const g = step.game;
            return { ok: true, step: 'tune', tune: g.tune, listenUntil: g.listenUntil, deadline: g.deadline, level: g.level, feathers: res.added, total: res.total };
          }
          case 'won': {
            const res = play(step.feathers, { kind: 'copy' });
            return { ok: true, step: 'won', level: step.level, feathers: res.added, total: res.total };
          }
        }
      },
      tasks: async () => this.use(({ book }) => book.tasks(cid, this.now())),
      // The run is kept in this browser's score book, as the room server keeps it in its own (OP-137).
      run: async (game) => {
        const r = startRun(room, where(), game, runSeed(), this.now());
        if (!r.ok) return r;
        const started = this.arcade((a) => a.start(cid, game, r.run.seed, this.now()));
        return { ok: true, game, seed: started.seed, startedAt: started.startedAt };
      },
      record: async (result, seed) => {
        const kept = this.arcade((a) => a.record(cid, result, seed, portraitLook(look()), this.now()));
        return kept.ok ? { ok: true, wall: kept.wall, mine: kept.mine } : kept;
      },
      score: async (result, seed) => {
        const settled = this.arcade((a) => a.finish(cid, result, seed, portraitLook(look()), this.now()));
        if (!settled.ok) return settled;
        const t = settled.tasks;
        if (t) later(() => pushes.onTasks?.(t.tasks, t.finished, t.paid, t.total));
        return { ok: true, paid: settled.paid };
      },
      // The climb: the realm and the portal are open in this browser; the night is the moon's unless the page pins one.
      climb: async () => {
        const portal = ROOMS[room]?.doors.find((d) => d.id === 'portal');
        const atPortal = !!portal && pointInRect(where(), portal.rect);
        return this.climb((c) => c.start(cid, { atPortal, portalLive: true, special: this.night }, this.now()));
      },
      ascent: async (seed, band) => this.climb((c) => c.band(cid, seed, band, this.now())),
      close: () => {
        closed = true;
        if (quizTimer) clearTimeout(quizTimer);
        acts.forget(cid);
        if (this.taskPushes === pushes) this.taskPushes = null;
      },
    };
  }
}
