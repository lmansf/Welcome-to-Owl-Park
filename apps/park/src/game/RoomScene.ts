import Phaser from 'phaser';
import {
  EMOTE_IDS,
  KIND_RULES,
  MAX_ACTIVE_QUESTS,
  NEST_SPOTS,
  NEST_WORDS,
  NPC_EMOTE_RADIUS,
  NPC_TALK_RADIUS,
  PICKUP_CLIENT_RADIUS,
  PROTOCOL_VERSION,
  REACH_SLACK,
  ROOM_H,
  ROOM_W,
  RARITY_COLOURS,
  RARITY_NAMES,
  STREET_ROOM,
  backgroundTiles,
  distance,
  filterOwnedWear,
  findSpawn,
  foregroundTiles,
  getFurniture,
  getInteractable,
  getNpc,
  getQuest,
  interactablesIn,
  isNestRoom,
  nestDoorIndex,
  nestIdOf,
  nestLook,
  npcsIn,
  parseVariant,
  pointInRect,
  positionAlongWalk,
  resolveTarget,
  steerTarget,
  variantName,
  type DoorDef,
  type EquipSlot,
  type NestSpotId,
  type NestView,
  type OwlLook,
  type PlayerState,
  type QuestBoard,
  type QuestUpdate,
  type RoomDef,
  type Vec2,
  type Walk,
  type Wear,
} from '@owl-park/shared';
import type { QuestState } from '../collect/quests';
import type { ActivityLink, ActivityPushes, NestLink, NestPushes, NestSeen, QuestLink, QuestPushes, QuestReply } from '../collect/service';
import type { CollectionState } from '../collect/state';
import type { TaskState } from '../collect/tasks';
import type { ParkConfig } from '../config';
import { saveLook } from '../identity';
import { OPEN_ENTRY, type ConnectionStatus, type Entry, type ParkTransport, type RoomConnection, type ScanReply } from '../net';
import { castVote } from '../net/vote';
import { getRoom } from '../rooms';
import type { DecorateView } from '../ui/decorate';
import type { Hud } from '../ui/hud';
import type { Keys } from '../ui/keyboard';
import { gateCard, gateRefusal } from '../ui/tickets';
import { ActivityLayer } from './activities';
import { addAmbience, addSetPieces, ensureFxTextures, type SetPieces } from './ambience';
import { loadArt, releaseArt, roomArtKeys } from './art';
import { roomScaleCap } from './artFiles';
import { takesDoorway } from './doors';
import { placeHints } from './hints';
import { itemScale } from './items';
import { LeafPile, featherFind } from './LeafPile';
import { NestDecor, pieceThumb } from './nest';
import { streetDoors, streetSpawnBack, type StreetDoor } from './nestPlan';
import { NpcOwl } from './Npc';
import { Owl } from './Owl';
import { QuestItemMarker, SpotGlow } from './QuestItem';
import { StreetDoors, addNestsSign } from './street';

export interface RoomStart {
  room: string;
  spawn: string | undefined;
  /** Where we came from, so a full room can send us back. */
  from?: { room: string; spawn: string | undefined } | undefined;
}

/** How far a tap may drift before it counts as a drag (game pixels). */
const TAP_SLOP = 16;
/** Remote walks whose timestamps are this far off our clock are rebased to "now". */
const CLOCK_TOLERANCE_MS = 1500;

const sameWalk = (a: Walk, b: Walk): boolean => a.from.x === b.from.x && a.from.y === b.from.y && a.to.x === b.to.x && a.to.y === b.to.y;
/** Ask again after a failed pickup this long later (the owl may still be walking up). */
const PICKUP_RETRY_MS = 800;
/** A dialogue closes once the owl wanders this far from the NPC (room pixels). */
const DIALOGUE_LEAVE_PX = NPC_TALK_RADIUS + REACH_SLACK + 40;
/** An NPC turns to look at a visitor this close. */
const NPC_LOOK_PX = NPC_TALK_RADIUS * 1.6;
/** The flop lands on the pile this long after it starts: the leaves fly then. */
const FLOP_LAND_MS = 330;
/** A few words for using things that stay put. */
const USE_LINES: Record<string, readonly string[]> = {
  stall: ['Neon trinkets, rain-polished gears and a jar of something glowing.', 'A tray of buttons that hum when you look at them.', 'Paper lanterns, folded owls and one very small umbrella.'],
  moonbeam: ['The moonbeam is warm. You feel a little shinier.', 'You bask. The moonlight hums softly.', 'Silver light settles on your feathers.'],
};

/** Something the owl was walking up to do: talk to an NPC or use an interactable on arrival. */
interface Errand {
  kind: 'talk' | 'use';
  id: string;
}

/** Something to do where the owl stands: a button each, and E runs the first. */
interface Action {
  id: string;
  label: string;
  run: () => void;
}
/** How far hint chips keep from the screen's edges, in CSS pixels (clear of the HUD's top and bottom bars). */
const HINT_INSETS = { top: 64, bottom: 84, side: 30 };
/** On touch screens the thumbstick and the buttons above it fill the bottom-right corner: hints keep above them. */
const TOUCH_HINT_BOTTOM = 190;
const TOUCH_SCREEN = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
/** Hint chip colours: doorways glow like the realm they lead to, spots are gold. */
const DOOR_TINTS: Record<string, string> = { market: '#FF2AA1', grove: '#FFB347' };
/** Fresh walks the held keys may plan without a change of keys (sliding round corners), so a nook never loops. */
const KEY_TURNS = 8;
/** Never wait longer than this for the park day to turn (timers past ~24 days overflow). */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;
/** Ask for the quest board again this long after a request failed (offline, or no answer in time). */
const BOARD_RETRY_MS = 5_000;

/**
 * One scene renders any room from its RoomDef: background, set pieces, the local owl,
 * every remote owl, doors, ambience and the camera. Walking is time-based so every
 * client animates the same walk identically from the same (from, to, startedAt).
 */
export class RoomScene extends Phaser.Scene {
  private room!: RoomDef;
  private me!: Owl;
  private peers = new Map<string, Owl>();
  private built = false;
  private conn: RoomConnection | null = null;
  private leaving = false;
  private cfg!: ParkConfig;
  private hud!: Hud;
  private transport!: ParkTransport;
  private playerId!: string;
  private look!: OwlLook;
  private atIdol = false;
  /** Going through the lobby's turnstiles (the welcome is playing, or the gate is checking the pass). */
  private passingGate = false;
  /** What the owl can do where it stands (spots, NPC owls, interactables), in order: E runs the first. */
  private actions: Action[] = [];
  private keys: Keys | null = null;
  /** The direction the held keys walk in. */
  private keyDir: Vec2 | null = null;
  /** The walk under way came from the keys, so letting go of them stops it. */
  private keyWalk = false;
  private keyTurns = 0;
  /** The hint chips last sent to the HUD, so an unchanged frame touches no DOM. */
  private hintsShown = '';
  private voting = false;
  /** Set when the visitor tapped the idol from afar: vote as soon as the owl arrives. */
  private pendingVote = false;
  private pieces: SetPieces = {};
  /** When a game object (the idol, an NPC) last took a tap, so the room does not walk there too. */
  private tapTakenAt = 0;
  private cameFrom: RoomStart['from'];
  /** Bumped on every (re)start so a join that resolves for a previous room is discarded. */
  private gen = 0;
  private lastStatus: ConnectionStatus | null = null;
  private collection!: CollectionState;
  private quests!: QuestState;
  private link: QuestLink | null = null;
  private readonly npcs = new Map<string, NpcOwl>();
  private readonly piles = new Map<string, LeafPile>();
  private readonly glows = new Map<string, SpotGlow>();
  private readonly items = new Map<string, QuestItemMarker>();
  /** Pickups in flight (by item key), and when a failed one may be retried. */
  private readonly gathering = new Map<string, number>();
  /** Set when the visitor tapped an NPC or an interactable from afar: do it on arrival. */
  private errand: Errand | null = null;
  /** A talk or a use is on its way to the room (one at a time). */
  private busy = false;
  /** The NPC whose dialogue is open, if any. */
  private talkingTo: string | null = null;
  private boardTimer: Phaser.Time.TimerEvent | null = null;
  private unwatchBoard: (() => void) | null = null;
  private readonly peerEmotes = new Map<string, string>();
  private tasks!: TaskState;
  /** The room's activities (lanterns, the stage quiz, fishing, the copy game) and the link to run them. */
  private play: ActivityLayer | null = null;
  private acts: ActivityLink | null = null;
  /** The nests: on the street, who lives behind each door; in a nest, what stands where. */
  private nests: NestLink | null = null;
  private street: StreetDoor[] = streetDoors(null);
  /** Asking the street who lives behind its doors (one question at a time). */
  private askingStreet = false;
  private streetSigns: StreetDoors | null = null;
  private decor: NestDecor | null = null;
  private nestView: NestView | null = null;
  /** This nest is the visitor's own: it may decorate it. */
  private nestMine = false;
  private owned: string[] = [];
  private nestGift: { taken: boolean } | null = null;
  /** Decorate mode: taps pick spots, the owl stays put, and the camera looks at the chosen spot. */
  private decorating = false;
  private decorSpot: NestSpotId = 'f1';
  /** CSS pixels the Decorate sheet covers at the bottom of the screen. */
  private sheetPx = 0;
  private readonly thumbs = new Map<string, string | null>();

  constructor() {
    super('room');
  }

  init(data: RoomStart): void {
    this.room = getRoom(data.room);
    this.cfg = this.registry.get('config') as ParkConfig;
    this.hud = this.registry.get('hud') as Hud;
    this.transport = this.registry.get('transport') as ParkTransport;
    this.playerId = this.registry.get('playerId') as string;
    this.look = this.registry.get('look') as OwlLook;
    this.peers = new Map();
    this.built = false;
    this.conn = null;
    this.leaving = false;
    this.atIdol = false;
    this.passingGate = false;
    this.actions = [];
    this.keys = (this.registry.get('keys') as Keys | undefined) ?? null;
    this.keyDir = null;
    this.keyWalk = false;
    this.keyTurns = 0;
    this.hintsShown = '';
    this.voting = false;
    this.pendingVote = false;
    this.pieces = {};
    this.cameFrom = data.from;
    this.gen += 1;
    this.lastStatus = null;
    this.collection = this.registry.get('collection') as CollectionState;
    this.quests = this.registry.get('quests') as QuestState;
    this.link = null;
    this.npcs.clear();
    this.piles.clear();
    this.glows.clear();
    this.items.clear();
    this.gathering.clear();
    this.errand = null;
    this.busy = false;
    this.talkingTo = null;
    this.boardTimer = null;
    this.unwatchBoard = null;
    this.peerEmotes.clear();
    this.tasks = this.registry.get('tasks') as TaskState;
    this.play = null;
    this.acts = null;
    this.nests = null;
    this.street = streetDoors(null);
    this.askingStreet = false;
    this.streetSigns = null;
    this.decor = null;
    this.nestView = null;
    this.nestMine = false;
    this.owned = [];
    this.nestGift = null;
    this.decorating = false;
    this.decorSpot = 'f1';
    this.sheetPx = 0;
    this.thumbs.clear();
    this.registry.set('currentRoom', this.room.id);
    this.registry.set('spawnName', data.spawn);
  }

  create(): void {
    void this.open();
  }

  /** Load this room's art (releasing the previous room's), then build the scene. */
  private async open(): Promise<void> {
    const gen = this.gen;
    const previous = this.registry.get('loadedRoom') as string | undefined;
    if (previous && previous !== this.room.id) releaseArt(this, roomArtKeys(previous));
    const { width, height } = this.scale.gameSize;
    const label = this.add.text(width / 2, height / 2, 'Opening…', { fontSize: '26px', color: '#F6F1E3', fontFamily: 'system-ui, sans-serif' }).setOrigin(0.5).setScrollFactor(0).setDepth(1e6);
    // A room of several tiles keeps to the same memory budget as a one-screen room, at 1x if need be.
    const textures = backgroundTiles(this.room).length + foregroundTiles(this.room).length;
    const cap = roomScaleCap(textures, this.cfg.pixelRatio, this.cfg.artScaleMax, this.cfg.roomArtBudget);
    await loadArt(this, roomArtKeys(this.room.id), this.cfg.pixelRatio, cap);
    if (gen !== this.gen || !this.scene.isActive()) return; // the scene moved on while we loaded
    this.registry.set('loadedRoom', this.room.id);
    label.destroy();
    this.build();
  }

  private build(): void {
    const { room } = this;
    ensureFxTextures(this);

    // Each tile is one screen of art at its offset. Tiles overlap their neighbours by a pixel so no
    // hairline of the clear colour shows at a join while the camera scrolls.
    for (const t of backgroundTiles(room)) this.add.image(t.x, t.y, t.key).setOrigin(0).setDisplaySize(ROOM_W + 1, ROOM_H + 1).setDepth(-1);
    this.pieces = addSetPieces(this, room, (pointer, event) => this.onIdolTap(pointer, event));
    addAmbience(this, room);
    addNestsSign(this, room);
    if (room.id === STREET_ROOM) {
      this.streetSigns = new StreetDoors(this, room);
      this.streetSigns.show(this.street, nestLook(this.look));
    }
    if (isNestRoom(room.id)) this.decor = new NestDecor(this);
    for (const t of foregroundTiles(room)) {
      if (this.textures.exists(t.key)) this.add.image(t.x, t.y, t.key).setOrigin(0).setDisplaySize(ROOM_W, ROOM_H).setDepth(room.size.h + 100);
    }

    const spawn = findSpawn(room, this.registry.get('spawnName') as string | undefined);
    this.me = new Owl(this, this.playerId, this.look, spawn, itemScale(this.cfg.pixelRatio));
    this.addResidents();
    this.play = new ActivityLayer({
      scene: this,
      room: room.id,
      hud: this.hud,
      me: () => this.me,
      peer: (id) => this.peers.get(id),
      feathers: (total) => this.collection.setFeathers(total),
      tasks: this.tasks,
      cheer: () => this.pieces.idol?.react(),
    });

    this.setupCamera();
    this.setupInput();
    if (this.cfg.debug) this.drawDebug();

    this.hud.setCount(1);
    this.hud.setActions([]);
    this.hud.setRoom(room.id);
    // The owl panel changes colours and species only: today's pledge and the worn collectibles stay.
    this.hud.onLookChange((look) => this.changeLook({ ...this.look, body: look.body, belly: look.belly, accent: look.accent, ...(look.species ? { species: look.species } : {}) }));
    this.hud.onAction((id) => this.actions.find((a) => a.id === id)?.run());
    this.hud.onHint((id) => this.walkToDoorway(id));
    this.unwatchBoard = this.quests.onChange((board) => this.showBoard(board));
    this.showBoard(this.quests.board);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.cameras.main.fadeIn(350, 12, 30, 54);
    this.built = true;
    void this.connect();
  }

  override update(): void {
    if (!this.built) return;
    const now = Date.now();
    const finished = this.me.tick(now);
    if (!this.leaving) {
      this.steer();
      this.checkDoors(finished);
      this.checkItems(now);
      this.updateHints();
    }
    for (const owl of this.peers.values()) owl.tick(now);
    for (const npc of this.npcs.values()) npc.tick(now);
    for (const pile of this.piles.values()) pile.tick(now);
    this.play?.tick();
  }

  // ---------- networking ----------

  private snapshot(): PlayerState {
    return { id: this.playerId, look: this.look, pos: { ...this.me.pos }, walk: this.me.walk, v: PROTOCOL_VERSION };
  }

  private async connect(): Promise<void> {
    const gen = this.gen;
    const live = () => gen === this.gen && !this.leaving;
    const spawnName = this.registry.get('spawnName') as string | undefined;
    // What the room pushes about quests, shared objects and activities (the room server's own, or the local mode's).
    const pushes: QuestPushes & ActivityPushes & NestPushes = {
      onQuests: (board, updates) => {
        if (!live()) return;
        this.applyBoard(board);
        this.showUpdates(updates);
      },
      onObjects: (until) => {
        if (!live()) return;
        for (const pile of this.piles.values()) pile.setUntil(until[pile.id] ?? 0);
      },
      onUsed: (id, by, until) => live() && this.onUsed(id, by, until),
      onLanterns: (beam, lit) => live() && this.play?.onLanterns(beam, lit),
      onQuiz: (n, right, won, others) => live() && this.play?.onQuiz(n, right, won, others),
      onPaid: (what, feathers, total) => live() && this.play?.onPaid(what, feathers, total),
      onTasks: (tasks, finished, paid, total) => live() && this.play?.onTasks(tasks, finished, paid, total),
      onNest: (seen) => live() && this.onNest(seen),
      onNestClosed: () => live() && this.onNestClosed(),
    };
    const conn = await this.transport.join(this.room.id, { ...this.snapshot(), ...(spawnName ? { spawn: spawnName } : {}) } as PlayerState, {
      ...pushes,
      onPeerState: (s) => live() && this.onPeerState(s),
      onPeerMove: (id, walk) => live() && this.onPeerMove(id, walk),
      onPeerLeave: (id) => live() && this.onPeerLeave(id),
      onStatus: (s) => live() && this.onStatus(s),
      onSelf: (pos) => {
        if (!live()) return;
        // The server decided where we stand. A walk already under way restarts from there.
        const target = this.me.walk?.to;
        this.me.place(pos);
        if (target) this.walkTo(target, this.keyWalk);
      },
      onSelfWalk: (walk) => live() && this.me.startWalk({ ...walk, from: { ...this.me.pos } }),
      onPeerLook: (id, look) => live() && this.peers.get(id)?.applyLook(look),
      onCounts: (rooms) => {
        if (!live()) return;
        this.registry.set('counts', rooms);
        this.hud.setParkCount(Object.values(rooms).reduce((a, b) => a + b, 0));
      },
      onFull: (roomId) => live() && void this.roomFull(roomId),
      onPeerEmote: (id, e) => {
        if (!live()) return;
        this.peerEmotes.set(id, e);
        this.peers.get(id)?.playEmote(e);
      },
    });
    if (!live() || !this.scene.isActive()) {
      await conn.leave();
      return;
    }
    this.conn = conn;
    this.link = this.collection.service.questLink(this.room.id, conn, pushes, () => ({ ...this.me.pos }));
    this.acts = this.collection.service.activityLink(this.room.id, conn, pushes, () => ({ ...this.me.pos }));
    this.play?.attach(this.acts);
    this.nests = this.collection.service.nestLink(this.room.id, conn, pushes, () => nestLook(this.look));
    if (this.room.id === STREET_ROOM) void this.askStreet();
    // Arriving here counts for quests that ask for a visit (the room server counts it on its own).
    this.link?.note({ kind: 'visit', room: this.room.id });
    void this.refreshBoard();
  }

  private onStatus(s: ConnectionStatus): void {
    this.hud.setStatus(s, this.transport.kind);
    const wentOffline = s === 'offline' && this.lastStatus !== 'offline';
    // Back online after a drop: the board may have moved meanwhile (a new park day, a push missed).
    if (s === 'online' && this.lastStatus === 'offline' && this.conn) void this.refreshBoard();
    this.lastStatus = s;
    if (wentOffline && !this.leaving) this.hud.toast('You are wandering alone for now: the park could not connect.', 4000);
  }

  private async roomFull(roomId: string): Promise<void> {
    if (this.leaving) return;
    this.hud.toast('That part of the park is full right now. Try again in a moment.', 3500);
    const back = this.cameFrom ?? { room: 'hub', spawn: undefined };
    if (back.room === roomId) return;
    await this.goTo(back.room, back.spawn ?? 'default', undefined);
  }

  private onPeerState(s: PlayerState): void {
    if (s.id === this.playerId) return;
    const now = Date.now();
    let owl = this.peers.get(s.id);
    if (!owl) {
      owl = new Owl(this, s.id, s.look, s.pos, itemScale(this.cfg.pixelRatio));
      owl.setAlpha(0);
      this.tweens.add({ targets: owl, alpha: 1, duration: 400 });
      this.peers.set(s.id, owl);
      this.hud.setCount(this.peers.size + 1);
    } else {
      owl.applyLook(s.look);
    }
    if (s.walk) {
      // A snapshot keeps the last walk until the next one: a future-dated start is pulled back to
      // now, an old one is played out to its end, and one we already animate (or already finished)
      // is left alone, so heartbeats never replay a walk.
      const raw = s.walk;
      const walk = now - raw.startedAt < -CLOCK_TOLERANCE_MS ? { ...raw, startedAt: now } : raw;
      const already = owl.walk ? sameWalk(owl.walk, raw) : distance(owl.pos, raw.to) < 1;
      if (!already) {
        const { done } = positionAlongWalk(walk, now);
        if (done) owl.place(walk.to);
        else {
          owl.place(walk.from);
          owl.startWalk(walk);
        }
      }
    } else if (!owl.walking) {
      owl.place(s.pos);
    }
  }

  private onPeerMove(id: string, walk: Walk): void {
    const owl = this.peers.get(id);
    if (!owl) return;
    const w = this.rebase(walk, Date.now());
    owl.place(w.from);
    owl.startWalk(w);
  }

  private onPeerLeave(id: string): void {
    const owl = this.peers.get(id);
    if (!owl) return;
    this.peers.delete(id);
    this.hud.setCount(this.peers.size + 1);
    this.tweens.add({ targets: owl, alpha: 0, duration: 300, onComplete: () => owl.destroy() });
  }

  /** Other clocks may be off; a walk that claims to have started in the future, or long ago, restarts now. */
  private rebase(walk: Walk, now: number): Walk {
    const skew = now - walk.startedAt;
    if (skew < -CLOCK_TOLERANCE_MS || skew > CLOCK_TOLERANCE_MS) return { ...walk, startedAt: now };
    return walk;
  }

  // ---------- input and movement ----------

  private setupInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      // Phaser only emits POINTER_UP for releases on the canvas; also require the press to have been on it.
      if (this.leaving || this.decorating || p.downElement !== this.game.canvas) return;
      if (Date.now() - this.tapTakenAt < 100) return; // the idol or an NPC took this tap
      if (p.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return; // a drag, not a tap
      this.pendingVote = false; // a new destination cancels a walk to the idol
      this.errand = null; // ...or to an NPC or a leaf pile
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      this.walkTo({ x: world.x, y: world.y });
    });
  }

  /** WASD and the arrow keys: walk while held (sliding along edges) and stop on letting go. */
  private steer(): void {
    // Decorating, the arrow keys step through the spots and the owl stays where it is.
    const dir = this.decorating ? null : (this.keys?.direction() ?? null);
    if (!dir) {
      if (this.keyWalk && this.me.walking) this.stop();
      this.keyDir = null;
      this.keyWalk = false;
      return;
    }
    const same = this.keyDir !== null && this.keyDir.x === dir.x && this.keyDir.y === dir.y;
    if (same && this.me.walking) return; // keep going
    if (!same) {
      this.keyDir = dir;
      this.keyTurns = KEY_TURNS;
    }
    if (this.keyTurns <= 0) return; // boxed in: wait for other keys
    this.keyTurns -= 1;
    const target = steerTarget(this.me.pos, dir, this.room.walkable);
    if (!target) {
      this.keyTurns = 0;
      return;
    }
    this.pendingVote = false; // walking away cancels a walk to the idol
    this.errand = null;
    this.walkTo(target, true);
  }

  /** Stand still where the owl is and tell the room. */
  private stop(): void {
    const here = { x: Math.round(this.me.pos.x), y: Math.round(this.me.pos.y) };
    this.me.walk = null;
    this.me.pos = here;
    const walk: Walk = { from: here, to: here, startedAt: Date.now() };
    this.conn?.send({ t: 'move', id: this.playerId, walk });
    this.conn?.track(this.snapshot());
  }

  /** Chips at the screen's edge for open doorways and interactive spots the camera cannot see. */
  private updateHints(): void {
    const own = this.room.id === STREET_ROOM ? 'nest-door-0' : null;
    const targets = this.room.doors.filter((d) => d.to || this.interactions[d.id] || d.id === own).map((d) => ({ id: d.id, x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2 }));
    const v = this.cameras.main.worldView;
    const places = placeHints(targets, { x: v.x, y: v.y, w: v.width, h: v.height }, { w: window.innerWidth, h: window.innerHeight, ...HINT_INSETS, ...(TOUCH_SCREEN ? { bottom: TOUCH_HINT_BOTTOM } : {}) });
    const shown = places.map((p) => `${p.id}:${Math.round(p.x)},${Math.round(p.y)},${p.angle.toFixed(2)}`).join('|');
    if (shown === this.hintsShown) return;
    this.hintsShown = shown;
    this.hud.setHints(
      places.map((p) => {
        const door = this.room.doors.find((d) => d.id === p.id)!;
        const spot = this.interactions[p.id];
        return {
          ...p,
          tint: door.to ? (DOOR_TINTS[door.to.room] ?? '#C9A227') : '#FFD36A',
          label: spot
            ? `${spot.label}, off screen: walk there`
            : door.id === 'gate'
              ? 'The turnstiles, off screen: walk there'
              : door.id === own
                ? `${NEST_WORDS.yourNest}, off screen: walk there`
                : door.to?.room === STREET_ROOM
                  ? `${NEST_WORDS.toNests}, off screen: walk there`
                  : 'Doorway, off screen: walk there',
        };
      }),
    );
  }

  /** A hint chip was tapped: head for that doorway or spot. */
  private walkToDoorway(id: string): void {
    const door = this.room.doors.find((d) => d.id === id);
    if (!this.built || this.leaving || !door) return;
    this.pendingVote = false;
    this.walkTo({ x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 });
  }

  /** E: do the first thing the owl can do where it stands (a spot, an NPC owl, a leaf pile). */
  interact(): boolean {
    if (!this.built || this.leaving) return false;
    const action = this.actions[0];
    if (!action) return false;
    action.run();
    return true;
  }

  /**
   * What each interactive spot offers, by its door id in the room data (a door without `to`):
   * standing in it shows a button with this label, and E or the button runs it. A new spot, such
   * as a mini game, is a door in the room data plus an entry here.
   */
  private readonly interactions: Record<string, { label: string; run: () => void }> = {
    shop: { label: 'Gift shop', run: () => this.openShop() },
    idol: { label: 'Vote for this realm', run: () => void this.vote() },
    booth: { label: 'Ticket booth', run: () => void this.openBooth() },
  };

  /** Tapping the realm's idol: pledge now if standing at it, otherwise walk up and pledge on arrival. */
  private onIdolTap(pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData): void {
    if (this.leaving || pointer.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return;
    event.stopPropagation();
    this.tapTakenAt = Date.now();
    this.errand = null;
    if (this.atIdol) {
      void this.vote();
      return;
    }
    const spot = this.room.doors.find((d) => d.id === 'idol');
    if (!spot) return;
    this.pendingVote = true;
    this.walkTo({ x: spot.rect.x + spot.rect.w / 2, y: spot.rect.y + spot.rect.h / 2 });
  }

  /** Read-only snapshot for tests and the console. */
  debugState(): {
    room: string;
    pos: Vec2;
    walking: boolean;
    look: OwlLook;
    peers: Array<{ id: string; pos: Vec2; walking: boolean; look: OwlLook; emote: string | null }>;
    connected: boolean;
    doors: Array<{ id: string; x: number; y: number; to: string | undefined }>;
    /** Where the owl's eyes are, left (-) or right (+) of its feet: the way its painting faces. */
    eyes: number;
    /** The owl's body layer in use: `owl-body`, or its species' own (`owl-barn-body`). */
    owlArt: string;
    /** NPC owls in this room and the marker each shows. */
    npcs: Array<{ id: string; x: number; y: number; mark: string | null }>;
    /** Interactables in this room; `here` is false while a leaf pile is used up. */
    objects: Array<{ id: string; kind: string; x: number; y: number; here: boolean }>;
    /** Quest items waiting in this room (only this visitor sees them). */
    items: Array<{ quest: string; n: number; kind: string; x: number; y: number }>;
    /** What the owl can do where it stands (the action buttons), in order. */
    actions: string[];
    /** The NPC whose dialogue is open. */
    talkingTo: string | null;
    /** The activities here: lanterns lit, the fishing line, the copy game, the next quiz question. */
    play: ReturnType<ActivityLayer['debug']> | null;
  } | null {
    if (!this.built) return null;
    return {
      room: this.room.id,
      doors: this.room.doors.map((d) => ({ id: d.id, x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2, to: d.to?.room })),
      pos: { ...this.me.pos },
      walking: this.me.walking,
      look: this.look,
      peers: [...this.peers.values()].map((o) => ({ id: o.id, pos: { ...o.pos }, walking: o.walking, look: o.look, emote: this.peerEmotes.get(o.id) ?? null })),
      connected: this.conn !== null,
      eyes: this.me.anchor('eyes').x,
      owlArt: this.me.artKey,
      npcs: [...this.npcs.values()].map((n) => ({ id: n.id, x: n.def.pos.x, y: n.def.pos.y, mark: this.quests.markFor(n.id) })),
      objects: interactablesIn(this.room.id).map((d) => ({ id: d.id, kind: d.kind, x: d.pos.x, y: d.pos.y, here: this.piles.get(d.id)?.here ?? true })),
      items: [...this.items.values()].map((m) => ({ quest: m.quest, n: m.n, kind: m.kind, x: m.pos.x, y: m.pos.y })),
      actions: this.actions.map((a) => a.id),
      talkingTo: this.talkingTo,
      play: this.play?.debug() ?? null,
    };
  }

  // ---------- NPC owls, interactables and quests ----------

  /** The room's residents: NPC owls, leaf piles, and glows under the things that stay put. */
  private addResidents(): void {
    const scale = itemScale(this.cfg.pixelRatio);
    for (const def of npcsIn(this.room.id)) this.npcs.set(def.id, new NpcOwl(this, def, scale, (npc, pointer, event) => this.onNpcTap(npc, pointer, event)));
    for (const def of interactablesIn(this.room.id)) {
      if (def.kind === 'leaf-pile') this.piles.set(def.id, new LeafPile(this, def));
      else this.glows.set(def.id, new SpotGlow(this, def));
    }
  }

  /** Tapping an NPC owl: talk now if close enough, otherwise walk up and talk on arrival. */
  private onNpcTap(npc: NpcOwl, pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData): void {
    if (this.leaving || pointer.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return;
    event.stopPropagation();
    this.tapTakenAt = Date.now();
    this.pendingVote = false;
    this.goDo({ kind: 'talk', id: npc.id });
  }

  /** Where an errand happens and how close the owl must stand for it. */
  private errandSpot(e: Errand): { pos: Vec2; reach: number } | null {
    if (e.kind === 'talk') {
      const npc = this.npcs.get(e.id);
      return npc ? { pos: npc.def.pos, reach: NPC_TALK_RADIUS } : null;
    }
    const def = getInteractable(e.id);
    return def && def.room === this.room.id ? { pos: def.pos, reach: KIND_RULES[def.kind].reach } : null;
  }

  private runErrand(e: Errand): void {
    if (e.kind === 'talk') void this.talk(e.id);
    else void this.use(e.id);
  }

  /** Do something at an NPC or an interactable: now when close enough, otherwise walk up first. */
  goDo(e: Errand): boolean {
    if (!this.built || this.leaving) return false;
    const spot = this.errandSpot(e);
    if (!spot) return false;
    if (distance(this.me.pos, spot.pos) <= spot.reach) {
      this.errand = null;
      this.runErrand(e);
      return true;
    }
    // Stand beside an NPC (on the visitor's side), or right on a leaf pile or at a stall.
    const side = this.me.pos.x < spot.pos.x ? -1 : 1;
    const target = e.kind === 'talk' ? { x: spot.pos.x + side * 70, y: spot.pos.y + 24 } : spot.pos;
    if (!this.walkTo(target)) {
      // Already as close as the floor allows.
      if (distance(this.me.pos, spot.pos) <= spot.reach + REACH_SLACK / 2) this.runErrand(e);
      return true;
    }
    this.errand = e;
    return true;
  }

  /** What the owl can do here, recomputed every frame: spots first, then the nearest NPC, then interactables. */
  private actionsHere(spots: string[]): Action[] {
    const out: Action[] = spots.map((id) => ({ id, label: this.interactions[id]!.label, run: () => this.interactions[id]?.run() }));
    if (this.nestMine && this.decor && !this.decorating) out.unshift({ id: 'decorate', label: NEST_WORDS.decorate, run: () => this.startDecorating() });
    const pos = this.me.pos;
    let nearest: NpcOwl | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const npc of this.npcs.values()) {
      const d = distance(pos, npc.def.pos);
      npc.lookAt(d <= NPC_LOOK_PX ? pos.x : null);
      if (d <= NPC_TALK_RADIUS && d < best) {
        nearest = npc;
        best = d;
      }
    }
    if (nearest) {
      const id = nearest.id;
      out.push({ id: `npc:${id}`, label: `Talk to ${nearest.def.name}`, run: () => void this.talk(id) });
    }
    for (const def of interactablesIn(this.room.id)) {
      const rules = KIND_RULES[def.kind];
      const close = distance(pos, def.pos) <= rules.reach;
      this.glows.get(def.id)?.setNear(close);
      if (!close || this.piles.get(def.id)?.here === false) continue;
      out.push({ id: `use:${def.id}`, label: rules.label, run: () => void this.use(def.id) });
    }
    // Lanterns, fishing and the robot owl's game where the owl stands.
    if (this.play) out.push(...this.play.actions(pos));
    return out;
  }

  /** Ask for the quest board; come back when the park day turns, or soon if the room did not answer. */
  private async refreshBoard(): Promise<void> {
    const gen = this.gen;
    const link = this.link;
    if (!link) return;
    const res = await link.board();
    if (gen !== this.gen || this.leaving || !this.scene.isActive()) return;
    this.boardTimer?.remove();
    if (!res.board) {
      this.boardTimer = this.time.delayedCall(BOARD_RETRY_MS, () => void this.refreshBoard());
      return;
    }
    this.applyBoard(res.board);
    this.boardTimer = this.time.delayedCall(Math.min(MAX_TIMER_MS, Math.max(1000, res.board.nextDay - Date.now() + 1500)), () => void this.refreshBoard());
  }

  private applyBoard(board: QuestBoard): void {
    this.quests.set(board);
    this.collection.setFeathers(board.feathers);
  }

  private applyReply(res: QuestReply): void {
    if (res.board) this.applyBoard(res.board);
    this.showUpdates(res.updates);
  }

  /** The board changed: NPC markers and this room's quest items follow it. */
  private showBoard(board: QuestBoard | null): void {
    if (!this.built) return;
    for (const npc of this.npcs.values()) npc.setMark(this.quests.markFor(npc.id));
    const wanted = new Map<string, { quest: string; n: number; kind: QuestItemMarker['kind']; x: number; y: number }>();
    for (const q of board?.active ?? []) for (const it of q.items) if (it.room === this.room.id) wanted.set(`${q.id}#${it.n}`, { quest: q.id, ...it });
    for (const [key, m] of this.items) {
      if (wanted.has(key)) continue;
      m.destroy();
      this.items.delete(key);
    }
    for (const [key, it] of wanted) if (!this.items.has(key)) this.items.set(key, new QuestItemMarker(this, it.quest, it.n, it.kind, { x: it.x, y: it.y }));
  }

  /** Toasts for quest steps that moved. */
  private showUpdates(updates: QuestUpdate[]): void {
    for (const u of updates) {
      const giver = getNpc(getQuest(u.quest)?.giver ?? '')?.name ?? 'its giver';
      if (u.ready) this.hud.toast(`${u.title}: all done! Take it back to ${giver}.`, 4200, '#FFD36A');
      else if (u.count >= u.need) this.hud.toast(`${u.title}: step done.`, 2800, '#FFD36A');
      else this.hud.toast(`${u.title}: ${u.count} of ${u.need}`, 2200);
    }
  }

  /** Talk to an NPC owl standing close: it counts for quests, and its dialogue opens. */
  private async talk(id: string): Promise<void> {
    const npc = this.npcs.get(id);
    if (!npc || this.busy) return;
    if (!this.link) return void this.hud.toast(`${npc.def.name} is lost in thought. Try again in a moment.`, 3000);
    const gen = this.gen;
    this.busy = true;
    try {
      const res = await this.link.talk(id);
      if (gen !== this.gen || this.leaving) return;
      if (!res.ok) {
        this.hud.toast(res.reason === 'far' ? `Walk a little closer to ${npc.def.name}.` : `${npc.def.name} did not hear you. Try again in a moment.`, 3000);
        return;
      }
      npc.greet();
      this.applyReply(res);
      this.talkingTo = id;
      this.hud.openDialogue(npc.def);
    } finally {
      this.busy = false;
    }
  }

  /** Use an interactable close by: flop into a leaf pile, browse a stall, bask in the moonbeam. */
  private async use(id: string): Promise<void> {
    const def = getInteractable(id);
    if (!def || this.busy || !this.link) return;
    const gen = this.gen;
    this.busy = true;
    try {
      const res = await this.link.use(id);
      if (gen !== this.gen || this.leaving) return;
      if (!res.ok) {
        if (res.reason === 'gone') this.hud.toast('Someone flopped in first. The leaves will blow back together soon.', 3200);
        else if (res.reason === 'far') this.hud.toast('A little closer...', 2000);
        else if (res.reason !== 'busy') this.hud.toast('The park did not catch that. Try again in a moment.', 3000);
        return;
      }
      if (def.kind === 'leaf-pile') {
        if (res.feathers > 0) {
          const n = res.feathers;
          this.time.delayedCall(FLOP_LAND_MS + 150, () => {
            if (gen !== this.gen) return;
            featherFind(this, def.pos, () => this.me.pos, () => this.collection.setFeathers(res.total));
            this.hud.toast(n === 1 ? 'A feather was hiding in the leaves! +1 feather' : `Feathers were hiding in the leaves! +${n} feathers`, 3200, '#FFD36A');
          });
        }
      } else {
        this.glows.get(id)?.pulse();
        const lines = USE_LINES[def.kind] ?? [];
        const line = lines[Math.floor(Math.random() * lines.length)];
        if (line) this.hud.toast(line, 2800);
        this.collection.setFeathers(res.total);
      }
      this.showUpdates(res.updates);
      // The room server pushes the board after progress; the local mode answers with it.
      if (res.board) this.applyBoard(res.board);
    } finally {
      this.busy = false;
    }
  }

  /** Someone flopped into a pile: their owl flops, the leaves fly, the pile is gone until `until`. */
  private onUsed(id: string, by: string | null, until: number): void {
    const pile = this.piles.get(id);
    if (!pile) return;
    const owl = by === null ? this.me : this.peers.get(by);
    owl?.flop();
    this.time.delayedCall(owl ? FLOP_LAND_MS : 0, () => pile.poof(until));
  }

  /** Standing on a quest item picks it up (the room server double-checks where the owl is). */
  private checkItems(now: number): void {
    for (const [key, m] of this.items) {
      const retryAt = this.gathering.get(key);
      if (retryAt !== undefined && now < retryAt) continue;
      const d = distance(this.me.pos, m.pos);
      if (d > PICKUP_CLIENT_RADIUS || (this.me.walking && d > PICKUP_CLIENT_RADIUS / 2)) continue;
      void this.gather(m);
    }
  }

  private async gather(m: QuestItemMarker): Promise<void> {
    const link = this.link;
    if (!link) return;
    const gen = this.gen;
    this.gathering.set(m.key, Number.POSITIVE_INFINITY);
    const res = await link.gather(m.quest, m.n);
    if (gen !== this.gen) return;
    if (res.ok || res.reason === 'gone' || res.reason === 'not-current') {
      this.gathering.delete(m.key);
      this.items.delete(m.key);
      if (res.ok) m.collect();
      else m.destroy();
      this.applyReply(res);
      return;
    }
    this.gathering.set(m.key, Date.now() + PICKUP_RETRY_MS);
  }

  /** Take a quest from the NPC whose dialogue is open. */
  async acceptQuest(quest: string): Promise<boolean> {
    if (!this.link) return false;
    const gen = this.gen;
    const res = await this.link.accept(quest);
    if (gen !== this.gen) return false;
    this.applyReply(res);
    const title = getQuest(quest)?.title ?? 'Quest';
    if (res.ok) this.hud.toast(`New quest: ${title}`, 3000, '#FFD36A');
    else if (res.reason === 'full') this.hud.toast(`You can carry ${MAX_ACTIVE_QUESTS} quests at once. Finish or drop one first.`, 3800);
    else if (res.reason === 'far') this.hud.toast('Walk a little closer first.', 2600);
    else if (res.reason === 'done') this.hud.toast('You have done that one already.', 2600);
    else this.hud.toast('That quest is not on offer right now.', 3000);
    return res.ok;
  }

  async abandonQuest(quest: string): Promise<boolean> {
    if (!this.link) return false;
    const gen = this.gen;
    const res = await this.link.abandon(quest);
    if (gen !== this.gen) return false;
    this.applyReply(res);
    if (res.ok) this.hud.toast(`Dropped: ${getQuest(quest)?.title ?? 'the quest'}`, 2600);
    return res.ok;
  }

  /** Hand a finished quest back to the NPC whose dialogue is open: feathers, and maybe a collectible. */
  async handInQuest(quest: string): Promise<boolean> {
    if (!this.link) return false;
    const gen = this.gen;
    const res = await this.link.handIn(quest);
    if (gen !== this.gen) return false;
    if (!res.ok) {
      if (res.board) this.applyBoard(res.board);
      this.hud.toast(res.reason === 'far' ? 'Walk a little closer first.' : res.reason === 'not-ready' ? 'Not quite done yet.' : 'That could not be handed in just now.', 3000);
      return false;
    }
    this.applyBoard(res.board);
    this.me.playEmote('flap');
    const award = res.award;
    if (award && !award.dup) this.collection.added(award.variant, res.total);
    else this.collection.setFeathers(res.total);
    this.hud.toast(res.thanks, 4200);
    const v = award ? parseVariant(award.variant) : null;
    const colour = v ? RARITY_COLOURS[v.rarity] : '#FFD36A';
    const item = award ? (award.dup ? `${variantName(award.variant)} again (+${award.feathers} feathers)` : `${variantName(award.variant)}${v ? ` (${RARITY_NAMES[v.rarity]})` : ''}`) : null;
    const feathers = res.feathers - (award?.feathers ?? 0);
    this.hud.toast(item ? `Reward: ${item} and ${feathers} feathers` : `Reward: ${feathers} feathers`, 4600, colour);
    return true;
  }

  /** Test hook: walk to quest item `n` of a quest if it is in this room (arriving picks it up). */
  walkToItem(quest: string, n: number): boolean {
    const m = this.items.get(`${quest}#${n}`);
    if (!m) return false;
    this.walkTo(m.pos);
    return true;
  }

  /** Play an owned emote here and for everyone in the room (it counts for quests that ask for it). */
  emote(e: string): boolean {
    if (!this.built || !EMOTE_IDS.includes(e) || !this.collection.owns(e)) return false;
    this.me.playEmote(e);
    this.conn?.send({ t: 'emote', id: this.playerId, e });
    const near = [...this.npcs.values()].filter((n) => distance(n.def.pos, this.me.pos) <= NPC_EMOTE_RADIUS).map((n) => n.id);
    this.link?.note({ kind: 'emote', emote: e, room: this.room.id, near });
    return true;
  }

  /** What the owl wears now. */
  wear(): Wear | undefined {
    return this.look.wear;
  }

  /** Put an owned variant on (or take a slot off) and tell the room. */
  equip(slot: EquipSlot, variant: string | null): boolean {
    if (!this.built) return false;
    if (variant !== null) {
      const v = parseVariant(variant);
      if (!v || !this.collection.owns(variant)) return false;
    }
    const wear: Wear = { ...(this.look.wear ?? {}) };
    if (variant === null) delete wear[slot];
    else wear[slot] = variant;
    const { wear: _old, ...rest } = this.look;
    this.changeLook(Object.keys(wear).length ? { ...rest, wear } : rest);
    return true;
  }

  /** Take off anything the collection does not hold (a look saved on this device by another collection). */
  pruneWear(): void {
    if (!this.built || !this.look.wear || !this.collection.inv) return;
    const kept = filterOwnedWear(this.look.wear, new Set(this.collection.inv.owned));
    if (JSON.stringify(kept ?? null) === JSON.stringify(this.look.wear)) return;
    const { wear: _old, ...rest } = this.look;
    this.changeLook(kept ? { ...rest, wear: kept } : rest);
  }

  /**
   * Public for tests and future features: walk the local owl to a room point. True if it set off.
   * `fromKeys` marks a walk the held keys own, which letting go of them stops.
   */
  walkTo(target: Vec2, fromKeys = false): boolean {
    if (!this.built) return false;
    const to = resolveTarget({ ...this.me.pos }, target, this.room.walkable);
    if (distance(to, this.me.pos) < 3) return false;
    const walk: Walk = { from: { ...this.me.pos }, to, startedAt: Date.now() };
    this.keyWalk = fromKeys;
    this.me.startWalk(walk);
    this.conn?.send({ t: 'move', id: this.playerId, walk });
    this.conn?.track(this.snapshot());
    return true;
  }

  private changeLook(look: OwlLook): void {
    this.look = look;
    this.registry.set('look', look);
    saveLook(look);
    this.me.applyLook(look);
    this.conn?.send({ t: 'state', state: this.snapshot() });
    this.conn?.track(this.snapshot());
    this.streetSigns?.show(this.street, nestLook(look));
  }

  private checkDoors(walkFinished: boolean): void {
    const pos = this.me.pos;
    const spots: string[] = [];
    const errand = this.errand;
    if (errand && walkFinished) {
      // Arrived (or stopped short): do it if close enough, else give up quietly.
      this.errand = null;
      const spot = this.errandSpot(errand);
      if (spot && distance(pos, spot.pos) <= spot.reach + REACH_SLACK / 2) this.runErrand(errand);
    }
    if (this.talkingTo) {
      const npc = this.npcs.get(this.talkingTo);
      if (!npc || distance(pos, npc.def.pos) > DIALOGUE_LEAVE_PX || this.hud.dialogueNpc() !== this.talkingTo) {
        if (this.hud.dialogueNpc() === this.talkingTo) this.hud.closeDialogue();
        this.talkingTo = null;
      }
    }
    for (const door of this.room.doors) {
      const inside = pointInRect(pos, door.rect);
      if (!inside) continue;
      const nestDoor = this.room.id === STREET_ROOM ? nestDoorIndex(door.id) : null;
      if (nestDoor !== null) {
        if (takesDoorway(door.rect, this.me.walk?.to ?? null, this.keyWalk, this.errand !== null) && this.enterNest(nestDoor, walkFinished)) return;
        continue;
      }
      if (door.to) {
        if (!takesDoorway(door.rect, this.me.walk?.to ?? null, this.keyWalk, this.errand !== null)) continue;
        if (door.id === 'gate') {
          void this.throughGate(door);
          return;
        }
        // Out of a nest, the owl comes back out by the street door it went in by.
        const spawn = isNestRoom(this.room.id) && door.to.room === STREET_ROOM ? streetSpawnBack(this.cameFrom) : door.to.spawn;
        void this.goTo(door.to.room, spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined });
        return;
      }
      if (this.interactions[door.id]) spots.push(door.id);
      if (door.closedSign && walkFinished) this.hud.toast(door.closedSign);
    }
    this.actions = this.actionsHere(spots);
    this.hud.setActions(this.actions.map(({ id, label }) => ({ id, label })));
    this.atIdol = spots.includes('idol');
    if (this.atIdol && walkFinished && this.pendingVote) {
      this.pendingVote = false;
      void this.vote();
    }
  }

  /** Remember today's pledge on the owl (visible to everyone) and tell the idol. */
  private pledged(realm: string): void {
    this.pieces.idol?.react();
    if (this.look.pledge === realm) return;
    this.look = { ...this.look, pledge: realm };
    this.registry.set('look', this.look);
    this.me.applyLook(this.look);
    this.conn?.send({ t: 'state', state: this.snapshot() });
    this.conn?.track(this.snapshot());
  }

  /** The Realm Vote: one vote per ticket-holder per park day, cast here at the idol. */
  private async vote(): Promise<void> {
    if (this.voting || !this.atIdol) return;
    this.voting = true;
    try {
      const outcome = await castVote(this.transport, this.room.id);
      switch (outcome.kind) {
        case 'voted':
          this.pledged(outcome.realm);
          this.hud.toast('Your vote for this realm is in. One vote a day, so come back tomorrow.', 4000);
          break;
        case 'already':
          if (outcome.votedFor === this.room.id) this.pledged(this.room.id);
          this.hud.toast(outcome.votedFor === this.room.id ? 'You already voted for this realm today.' : 'You already voted today. Each day brings one vote.', 3500);
          break;
        case 'tickets-required':
          this.hud.toast('Voting opens with tickets: ticket-holders get one vote a day.', 4000);
          break;
        case 'unavailable':
          this.hud.toast('Voting opens when the park is online with tickets.', 3500);
          break;
        default:
          this.hud.toast('The idol did not hear you. Try again in a moment.', 3500);
      }
    } finally {
      this.voting = false;
    }
  }

  /** The front gate as this visitor's transport sees it (an open gate without a server). */
  private async entry(): Promise<Entry> {
    try {
      return (await this.transport.entry?.()) ?? OPEN_ENTRY;
    } catch {
      return OPEN_ENTRY;
    }
  }

  /** The lobby's ticket booth: tickets sell in the store; the window shows the tickets on this device. */
  private async openBooth(): Promise<void> {
    const tickets = this.transport.tickets;
    const [entry, wallet] = await Promise.all([this.entry(), tickets ? tickets.wallet().catch(() => null) : Promise.resolve(null)]);
    if (this.leaving) return;
    this.hud.openBooth({ ticketsUrl: this.cfg.ticketsUrl || null, ...entry, wallet, ...(tickets ? { share: (id: string) => tickets.share(id) } : {}) });
  }

  /**
   * The lobby's turnstiles scan a ticket this device holds (its first scan starts its time, C35):
   * the ticket card flips up and the owl goes on into the hub. Without a ticket that goes through,
   * the turnstiles let everyone in while the gate is open; once the park takes tickets
   * (GATE=ticket) they turn the owl back toward the booth and say why.
   */
  private async throughGate(door: DoorDef): Promise<void> {
    const to = door.to;
    if (this.passingGate || this.leaving || !to) return;
    this.passingGate = true;
    this.me.walk = null;
    const scan: ScanReply = this.transport.tickets ? await this.transport.tickets.scan() : { ok: false, reason: 'none' };
    if (this.leaving) return;
    const entry = await this.entry();
    if (this.leaving) return;
    if (!scan.ok && entry.gate === 'ticket' && !entry.admitted) {
      this.hud.toast(gateRefusal(scan.reason), 4500);
      this.walkTo({ x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h + 70 });
      this.time.delayedCall(1500, () => {
        this.passingGate = false;
      });
      return;
    }
    this.pieces.gate?.react();
    if (scan.ok) this.hud.showTicket(gateCard(scan, Date.now()));
    else this.hud.toast('Welcome to Owl Park!', 2600);
    // The card stays up a moment before the walk on into the hub.
    this.time.delayedCall(scan.ok ? 1400 : 700, () => void this.goTo(to.room, to.spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined }));
  }

  private openShop(): void {
    if (this.cfg.shopUrl) window.open(this.cfg.shopUrl, '_blank', 'noopener');
    else this.hud.toast('The gift shop opens soon.');
  }

  private async goTo(roomId: string, spawn: string, from: RoomStart['from']): Promise<void> {
    if (this.leaving) return;
    this.leaving = true;
    this.hud.setHints([]);
    this.me.walk = null;
    this.cameras.main.fadeOut(220, 12, 30, 54);
    await new Promise<void>((r) => this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => r()));
    await this.teardown();
    this.scene.start('room', { room: roomId, spawn, from } satisfies RoomStart);
  }

  private async teardown(): Promise<void> {
    this.endDecorating(false);
    this.decor?.destroy();
    this.decor = null;
    this.streetSigns?.destroy();
    this.streetSigns = null;
    this.nests?.close();
    this.nests = null;
    this.hud.setHints([]);
    this.hud.closeDialogue();
    this.talkingTo = null;
    this.unwatchBoard?.();
    this.unwatchBoard = null;
    this.boardTimer?.remove();
    this.boardTimer = null;
    for (const m of this.items.values()) m.destroy();
    this.items.clear();
    for (const npc of this.npcs.values()) npc.destroy();
    this.npcs.clear();
    for (const pile of this.piles.values()) pile.destroy();
    this.piles.clear();
    for (const glow of this.glows.values()) glow.destroy();
    this.glows.clear();
    this.play?.destroy();
    this.play = null;
    this.acts?.close();
    this.acts = null;
    this.link = null;
    const conn = this.conn;
    this.conn = null;
    if (conn) await conn.leave();
  }

  // ---------- nests ----------

  /** Ask the street who lives behind its doors for this visitor, and hang the flags. */
  private async askStreet(): Promise<void> {
    const nests = this.nests;
    if (this.askingStreet || !nests) return;
    this.askingStreet = true;
    const gen = this.gen;
    const view = await nests.street();
    if (gen !== this.gen || this.leaving) return;
    this.askingStreet = false;
    if (!view) {
      this.hud.toast(NEST_WORDS.notAnswering, 3500);
      return;
    }
    this.street = streetDoors(view);
    this.streetSigns?.show(this.street, nestLook(this.look));
  }

  /** Through street door `n` into the nest behind it, when there is one for this visitor; true if the owl went. */
  private enterNest(n: number, walkFinished: boolean): boolean {
    const d = this.street[n];
    const nestId = d?.kind === 'own' || d?.kind === 'nest' ? d.nestId : null;
    if (nestId) {
      void this.goTo(`nest-${nestId}`, 'default', { room: STREET_ROOM, spawn: `from-nest-${n}` });
      return true;
    }
    if (!walkFinished) return false;
    // The visitor's own door before the street has said which nest is theirs: ask again.
    if (d?.kind === 'own') void this.askStreet();
    else this.hud.toast(NEST_WORDS.closedForNow);
    return false;
  }

  /** The nest as it stands: on arrival, after each change its owner makes, and in answer to the owner's own. */
  private onNest(seen: NestSeen): void {
    if (seen.nest.nestId !== nestIdOf(this.room.id)) return;
    if (seen.mine !== undefined) this.nestMine = seen.mine;
    if (seen.owned) this.owned = seen.owned;
    if (seen.gift) this.nestGift = { taken: seen.gift.taken };
    this.showNest(seen.nest);
  }

  private showNest(nest: NestView): void {
    this.nestView = nest;
    this.decor?.apply(nest.layout);
    if (this.decorating) this.hud.updateDecorate(this.decorateView());
  }

  /** The nest turned the visitor away (closed to visitors, or no such nest) or closed while it was inside. */
  private onNestClosed(): void {
    if (this.leaving) return;
    this.hud.toast(NEST_WORDS.closedForNow, 3000);
    void this.goTo(STREET_ROOM, streetSpawnBack(this.cameFrom), undefined);
  }

  private decorateView(): DecorateView {
    return { layout: this.nestView?.layout ?? {}, owned: this.owned, open: this.nestView?.open ?? true, gift: this.nestGift };
  }

  /** Decorate the owner's own nest: the spots show, the Decorate sheet opens, and the camera looks at the chosen spot. */
  private startDecorating(): void {
    if (this.decorating || this.leaving || !this.nestMine || !this.decor || !this.nestView) return;
    this.decorating = true;
    if (this.me.walking) this.stop();
    this.errand = null;
    this.pendingVote = false;
    this.cameras.main.stopFollow();
    this.decor.showSpots(this.decorSpot, (spot) => this.pickSpot(spot, true));
    this.hud.openDecorate(this.decorateView(), this.decorSpot, {
      place: (spot, item) => this.placePiece(spot, item),
      setOpen: (open) => this.setNestOpen(open),
      claimGift: () => this.takeFurnitureGift(),
      select: (spot) => this.pickSpot(spot, false),
      done: () => this.endDecorating(true),
      thumb: (art) => this.thumb(art),
      resize: (px) => {
        if (!this.decorating) return;
        this.sheetPx = px;
        this.fitCamera();
        this.lookAtSpot();
      },
    });
  }

  /** Back to walking about: the spots go, the sheet closes and (unless the room is closing) the camera follows the owl again. */
  private endDecorating(camera: boolean): void {
    if (!this.decorating) return;
    this.decorating = false;
    this.sheetPx = 0;
    this.decor?.hideSpots();
    this.hud.closeDecorate();
    if (!camera) return;
    this.fitCamera();
    this.cameras.main.startFollow(this.me, true, 0.12, 0.12);
  }

  /** A spot was chosen, in the room (a tap on its ring) or on the sheet. */
  private pickSpot(spot: NestSpotId, inRoom: boolean): void {
    if (!this.decorating) return;
    this.decorSpot = spot;
    this.decor?.select(spot);
    if (inRoom) this.hud.selectDecorateSpot(spot);
    this.lookAtSpot();
  }

  private lookAtSpot(): void {
    if (!this.decorating || !this.decor) return;
    const f = this.decor.focusOf(this.decorSpot);
    this.cameras.main.pan(f.x, f.y, 380, 'Sine.easeInOut', true);
  }

  private async placePiece(spot: NestSpotId, item: string | null): Promise<void> {
    const res = (await this.nests?.place(spot, item)) ?? ({ ok: false, reason: 'offline' } as const);
    if (this.leaving) return;
    if (res.ok) this.showNest(res.nest);
    else if (res.reason === 'offline' || res.reason === 'busy') this.hud.toast(NEST_WORDS.notAnswering, 3000);
  }

  private async setNestOpen(open: boolean): Promise<void> {
    const res = (await this.nests?.setOpen(open)) ?? ({ ok: false, reason: 'offline' } as const);
    if (this.leaving) return;
    if (res.ok) this.showNest(res.nest);
    else if (res.reason === 'offline' || res.reason === 'busy') this.hud.toast(NEST_WORDS.notAnswering, 3000);
  }

  /** Today's furniture gift: a new piece (shown off in a spot it fits), or feathers once the owl owns every piece. */
  private async takeFurnitureGift(): Promise<void> {
    const res = await this.collection.service.claimFurnitureGift();
    if (this.leaving) return;
    if (!res.ok && res.reason === 'offline') {
      this.hud.toast(NEST_WORDS.notAnswering, 3000);
      return;
    }
    this.owned = res.owned;
    this.nestGift = { taken: true };
    if (res.ok) {
      this.collection.setFeathers(res.total);
      const piece = res.item ? getFurniture(res.item) : null;
      if (piece) {
        this.hud.toast(`${NEST_WORDS.newPiece} ${piece.name}!`, 4000, '#FFD36A');
        const spot = NEST_SPOTS.find((s) => s.place === piece.place && !this.nestView?.layout[s.id]) ?? NEST_SPOTS.find((s) => s.place === piece.place);
        if (spot) this.pickSpot(spot.id, true);
      } else this.hud.toast(`+${res.feathers} feathers! ${NEST_WORDS.everyPiece}`, 4000, '#FFD36A');
    }
    this.hud.updateDecorate(this.decorateView());
  }

  /** A piece's picture for the Decorate sheet, drawn once per room. */
  private thumb(art: string): string | null {
    if (!this.thumbs.has(art)) this.thumbs.set(art, pieceThumb(this, art));
    return this.thumbs.get(art) ?? null;
  }

  // ---------- camera ----------

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.room.size.w, this.room.size.h);
    cam.startFollow(this.me, true, 0.12, 0.12);
    const fit = () => this.fitCamera();
    fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, fit));
  }

  /**
   * Cover: the room always fills the screen; on portrait phones the camera pans sideways. While the
   * owner decorates, the room fills the screen above the Decorate sheet instead.
   */
  private fitCamera(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    const h = Math.max(1, height - Math.round(this.sheetPx * this.cfg.pixelRatio));
    cam.setViewport(0, 0, width, h);
    cam.setZoom(Math.max(width / this.room.size.w, h / this.room.size.h));
  }

  private drawDebug(): void {
    const g = this.add.graphics().setDepth(this.room.size.h + 200);
    g.lineStyle(3, 0x00e5ff, 0.9);
    for (const poly of this.room.walkable) g.strokePoints(poly, true);
    for (const d of this.room.doors) {
      g.lineStyle(3, d.to ? 0xc9a227 : 0xff2aa1, 0.9);
      g.strokeRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h);
      this.add.text(d.rect.x, d.rect.y - 18, d.id, { fontSize: '16px', color: '#F6F1E3' }).setDepth(this.room.size.h + 201);
    }
    for (const [name, s] of Object.entries(this.room.spawns)) {
      g.fillStyle(0xf6f1e3, 1);
      g.fillCircle(s.x, s.y, 6);
      this.add.text(s.x + 8, s.y - 8, name, { fontSize: '14px', color: '#F6F1E3' }).setDepth(this.room.size.h + 201);
    }
  }
}
