import Phaser from 'phaser';
import {
  AIR_BURST,
  AIR_REFILL_PER_S,
  CABINETS,
  CABINET_OFF,
  EMOTE_IDS,
  FLIGHT_STEP_MS,
  GAMES,
  GLIDING,
  GROUNDED,
  LEFT_PARK_SPAWN,
  LOBBY_ROOM,
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
  SAY_EVERY_MS,
  STREET_ROOM,
  arrivalPoint,
  backgroundTiles,
  cabinetAt,
  distance,
  filterOwnedWear,
  foregroundTiles,
  getFurniture,
  getInteractable,
  getQuest,
  insidePark,
  interactablesIn,
  isNestRoom,
  isPhrase,
  laneThrough,
  nestDoorIndex,
  nestIdOf,
  nestLook,
  nestRoomId,
  npcsIn,
  parkwardDoor,
  parseVariant,
  pointInRect,
  positionAlongWalk,
  putOn,
  resolveTarget,
  steerTarget,
  footing,
  footingLevel,
  groundAt,
  sameLevel,
  tapGoal,
  variantName,
  type DoorDef,
  type EquipSlot,
  type Lane,
  type NestLayout,
  type NestSpotId,
  type NestView,
  type OwlLook,
  type PlayerState,
  type QuestBoard,
  type QuestUpdate,
  type Polygon,
  type Raised,
  type Rect,
  type Shut,
  type RoomDef,
  type Vec2,
  type Walk,
  type Wear,
  REALMS_DEFAULTS,
  type RealmsSettings,
  ALL_FLIGHT,
  ON_GROUND,
  airChanged,
  fall,
  newFlier,
  stepFlier,
  type Air,
  type Flier,
  type FlightAbilities,
  TRAVEL_LANDINGS,
  TRAVEL_WORDS,
  canTravel,
  needsGate,
  travelAfter,
  type TravelRefusal,
  type TravelState,
} from '@owl-park/shared';
import type { QuestState } from '../collect/quests';
import type { ActivityLink, ActivityPushes, NestLink, NestPushes, NestSeen, QuestLink, QuestPushes, QuestReply } from '../collect/service';
import type { CollectionState } from '../collect/state';
import type { TaskState } from '../collect/tasks';
import type { ParkConfig } from '../config';
import { saveLook } from '../identity';
import { OPEN_ENTRY, type ConnectionStatus, type Entry, type ParkTransport, type RoomConnection, type ScanReply } from '../net';
import type { Ribbon } from '../ui/ribbon';
import { openPosOverlay, type PosOverlay } from '../ui/posOverlay';
import type { Away } from '../ui/away';
import { castVote } from '../net/vote';
import { GATED_ROOMS, NEST_MIRROR, ROOMS, getRoom } from '../rooms';
import type { DecorateView } from '../ui/decorate';
import type { Hud } from '../ui/hud';
import type { SettingsStore } from '../settings';
import type { Keys } from '../ui/keyboard';
import type { LoadScreen } from '../ui/loader';
import type { PreviewFrame } from '../ui/owlBuilder';
import { gateCard, gateRefusal } from '../ui/tickets';
import { ActivityLayer } from './activities';
import { addAmbience, addSetPieces, ensureFxTextures, type SetPieces } from './ambience';
import { arcadeFor, type Arcade } from './arcade';
import { PORTAL_OFF, climbFor, type Climb } from './climb';
import { artScale, loadArt, opensSoft, prefetchRoomArt, releaseArt, roomArtCap, roomArtKeys, roomOpeningArt, sharpCopy, sharpenArt } from './art';
import { SpeechBubbles } from './bubbles';
import { roomsAhead, takesDoorway } from './doors';
import { FitOverlay } from './fitOverlay';
import { placeHints } from './hints';
import { itemScale } from './items';
import { LeafPile, featherFind } from './LeafPile';
import { NestMirror } from './mirror';
import { NestDecor, pieceThumb } from './nest';
import { firstGlint, firstNestWelcome, streetDoors, streetSpawnBack, type StreetDoor } from './nestPlan';
import { NpcOwl } from './Npc';
import { Owl } from './Owl';
import { QuestItemMarker, SpotGlow } from './QuestItem';
import { StreetDoors, addNestsSign, addParkSign } from './street';

export interface RoomStart {
  room: string;
  spawn: string | undefined;
  /** Where we came from, so a full room can send us back. */
  from?: { room: string; spawn: string | undefined } | undefined;
  /** How far across the doorway the owl came through, so it comes out as far across the doorway back (OP-124). */
  lane?: Lane | undefined;
  /** Come by travel from the Menu's map (OP-130): into the park, the room server lets it in only once it has walked through the gate. */
  via?: 'travel' | undefined;
}

/** How far a tap may drift before it counts as a drag (game pixels). */
const TAP_SLOP = 16;
/** How long the room fades out on the way to another. */
const LEAVE_FADE_MS = 220;
/** Where Play and travel home land the owl in its own nest (OP-105, OP-130): before its mirror. */
export const NEST_SPAWN = 'mirror';
/** Travel from the map fades out slower than a doorway, so going home or across the park is not a jolt (OP-114, OP-130). */
export const NEST_FADE_MS = 400;
/** Remote walks whose timestamps are this far off our clock are rebased to "now". */
const CLOCK_TOLERANCE_MS = 1500;
/** Air states this page sends the room (OP-084): a burst and a refill each a little under the room server's, so frames bunched by the network still fit. */
const AIR_SEND_BURST = AIR_BURST - 2;
const AIR_SEND_PER_S = AIR_REFILL_PER_S - 1;
/** Back from a hidden tab, the flight catches up this much at most (a flight is down well within it). */
const FLIGHT_CATCH_UP_MS = 10_000;
/**
 * An owl still standing where it came in walks over to where the room puts it, this far at most (the
 * room spreads arrivals so owls coming in together do not stand in one spot); any other owl keeps its
 * place and the room is told (OP-138).
 */
const STEP_ASIDE_PX = 240;

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

/**
 * Something the owl was walking up to do on arrival: talk to an NPC, use an interactable, hand a
 * finished quest to the NPC that gave it (Collect in the quests screen), or look in a nest's mirror.
 */
type Errand = { kind: 'talk' | 'use' | 'mirror'; id: string } | { kind: 'handin'; id: string; quest: string };

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
const DOOR_TINTS: Record<string, string> = { market: '#FF2AA1', arcade: '#00E5FF', grove: '#FFB347', glass: '#9FD0FF' };
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
  /** When to look again for doorways to fetch the next room's art through. */
  private prefetchAt = 0;
  private voting = false;
  /** Set when the visitor tapped the idol from afar: vote as soon as the owl arrives. */
  private pendingVote = false;
  private pieces: SetPieces = {};
  /** The realms switch as the room server last said (the stained-glass climb); without a server, every gated realm is open. */
  private realms: RealmsSettings = REALMS_DEFAULTS;
  /** When a game object (the idol, an NPC) last took a tap, so the room does not walk there too. */
  private tapTakenAt = 0;
  private cameFrom: RoomStart['from'];
  /** How the owl came: by travel from the map, or (undefined) through a doorway, Play or the page's address. */
  private via: RoomStart['via'];
  private lane: Lane | undefined;
  /** When the owl fell asleep, its visitor idle (OP-126); 0 awake. */
  private sleptAt = 0;
  /** When "Still here?" went up; 0 when it is not up. */
  private askedAt = 0;
  /** No answer came: the owl is on its way out of the room. */
  private goingAway = false;
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
  /** Phrases said here, in bubbles over the owls (C44), and when this owl last said one. */
  private bubbles: SpeechBubbles | null = null;
  private saidAt = Number.NEGATIVE_INFINITY;
  /** The visitor's own flight (OP-084), stepped from Jump at the flight's step on this page's clock (Date.now). */
  private flier: Flier = newFlier();
  /** What the owl can do in the air: all three until the lock-and-key game (OP-115) has them earned. */
  private readonly abilities: Readonly<FlightAbilities> = ALL_FLIGHT;
  /** When the flight last stepped (ms; 0 before the first step in this room). */
  private flightClock = 0;
  /**
   * Whether Jump is down, when it last went down and last came up (this page's ms, 0 never), and the
   * press the flight has taken: each step reads Jump as it was at the step's own time, so a tap in a
   * slow frame is still a tap, not as long as the frame.
   */
  private jumpIsDown = false;
  private jumpDownAt = 0;
  private jumpUpAt = 0;
  private jumpTaken = 0;
  /**
   * The flight as this owl's drawing and the room carry it on, each a step at a time from what it was
   * last told, as the flier goes: the moment the flier parts from one, it is told the flier's state.
   */
  private drawnAir: Air = ON_GROUND;
  private roomAir: Air = ON_GROUND;
  /** What the room was last told of the flight, and when (for a newcomer's snapshot on the peer transports). */
  private roomTold: { air: Air; at: number } = { air: ON_GROUND, at: 0 };
  /** Air states this page may still send now, a little under the room server's allowance so a late frame is never dropped there. */
  private airTokens = AIR_SEND_BURST;
  /**
   * Perches (OP-084): where a tap or an errand last asked the owl to go, which a walk stopped short of
   * (at a perch's face, from the floor) goes on for once a jump lifts the owl to it; and the footing
   * the owl last walked on (how many perch tops are at or below it), which a walk is aimed afresh for
   * whenever it changes.
   */
  private walkGoal: Vec2 | null = null;
  private footLevel = 0;
  /** Held keys to steer afresh at the next frame, the footing having changed under a walk they own. */
  private reSteer = false;
  /** What an owl comes down on where it is in this room: the floor, or a perch's top (OP-084). */
  private readonly groundUnder = (p: Vec2, z: number): number => groundAt(this.room.perches, p, z);
  private airRefilledAt = 0;
  /** The owl's take-offs as its flight steps them (for tests): how many on this page, and the last one's top, whether it glided and how long it was up. */
  private flown = { n: 0, peak: 0, glided: false, ms: 0 };
  private flownFrom = 0;
  /** Where the room put the own owl when it last let it in (its welcome), until the room is caught up with the owl (OP-138). */
  private roomHas: Vec2 | null = null;
  /** Where the owl came into this room. */
  private arrivedAt: Vec2 = { x: 0, y: 0 };
  /** The position overlay (OP-138, `?pos=1`), once the keepers' key checks out. */
  private posOverlay: PosOverlay | null = null;
  private tasks!: TaskState;
  /** The room's activities (lanterns, the stage quiz, fishing, the copy game) and the link to run them. */
  private play: ActivityLayer | null = null;
  /** The arcade's cabinets, score wall and runs, in the arcade only. */
  private arcade: Arcade | null = null;
  /** The stained-glass climb from its portal, in the glass realm only. */
  private climb: Climb | null = null;
  private acts: ActivityLink | null = null;
  /** The nests: on the street, who lives behind each door; in a nest, what stands where. */
  private nests: NestLink | null = null;
  private street: StreetDoor[] = streetDoors(null);
  /** Asking the street who lives behind its doors (one question at a time). */
  private askingStreet = false;
  private streetSigns: StreetDoors | null = null;
  private decor: NestDecor | null = null;
  /** The fit overlay (OP-127, `?boxes=1`). */
  private fitOverlay: FitOverlay | null = null;
  /** In a nest, its mirror (OP-077); and while Your owl is open at it, the builder's stage, where the camera frames the owl. */
  private mirror: NestMirror | null = null;
  private mirrorFrame: PreviewFrame | null = null;
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
  /** The Decorate sheet's pictures of pieces, drawn once each from their textures. */
  private readonly thumbs = new Map<string, string>();
  /** How sharp this room's art is drawn (pixels per room pixel at most): a nest's furniture loads at it too. */
  private artCap = 1;
  /** This room's paintings opened at 1x, waiting on their sharp copies (OP-129). */
  private soft = new Set<string>();

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
    this.roomHas = null;
    this.posOverlay = null;
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
    this.lane = data.lane;
    this.via = data.via;
    this.sleptAt = 0;
    this.askedAt = 0;
    this.goingAway = false;
    // A new room: on the ground, Jump let go, the allowance full.
    this.flier = newFlier();
    this.flightClock = 0;
    this.jumpIsDown = false;
    this.jumpDownAt = 0;
    this.jumpUpAt = 0;
    this.jumpTaken = 0;
    this.drawnAir = ON_GROUND;
    this.roomAir = ON_GROUND;
    this.roomTold = { air: ON_GROUND, at: 0 };
    this.airTokens = AIR_SEND_BURST;
    this.airRefilledAt = 0;
    this.walkGoal = null;
    this.footLevel = 0;
    this.reSteer = false;
    this.gen += 1;
    this.soft = new Set();
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
    this.bubbles = null;
    this.tasks = this.registry.get('tasks') as TaskState;
    this.play = null;
    this.arcade = null;
    this.climb = null;
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

  /** Load this room's art (releasing the previous room's) under the load screen (OP-129), then build the scene. */
  private async open(): Promise<void> {
    const gen = this.gen;
    const previous = this.registry.get('loadedRoom') as string | undefined;
    if (previous && previous !== this.room.id) releaseArt(this, roomArtKeys(previous));
    const screen = this.registry.get('loadScreen') as LoadScreen | undefined;
    screen?.show('Opening…');
    const cap = roomArtCap(this.room, this.cfg);
    this.artCap = cap;
    // On a dense screen, the paintings whose sharp copies the browser does not have yet open at 1x,
    // a third of the bytes, and sharpen once those come.
    const soft = await opensSoft(this.room, this.cfg);
    await loadArt(
      this,
      roomOpeningArt(this.room.id),
      this.cfg.pixelRatio,
      cap,
      (done, total) => {
        if (gen === this.gen) screen?.progress(done, total);
      },
      soft,
    );
    if (gen !== this.gen || !this.scene.isActive()) return; // the scene moved on while we loaded
    this.registry.set('loadedRoom', this.room.id);
    screen?.hide();
    this.build();
    this.soft = soft;
    void this.sharpen(gen);
  }

  /**
   * Swap each painting that opened at 1x for its 2x copy (OP-129). The copies download together,
   * whatever the owl does; they swap in one after another, each at a moment the owl stands still.
   * One whose copy fails stays soft.
   */
  private async sharpen(gen: number): Promise<void> {
    const live = () => gen === this.gen && this.scene.isActive();
    const scale = artScale('room', this.cfg.pixelRatio, this.artCap);
    const copies = [...this.soft].map((key) => [key, sharpCopy(key, scale)] as const);
    // The owl's flight body (OP-136) loads once these have come, so it never slows what the room opens with.
    void Promise.all(copies.map(([, copy]) => copy)).then(() => {
      if (live()) this.me.readyForFlight();
    });
    for (const [key, copy] of copies) {
      if (!live()) return;
      if (await sharpenArt(this, key, await copy, live, () => this.still())) this.soft.delete(key);
    }
  }

  /** Whether the owl stands still: no walk under way, no key or stick held, on the ground. */
  private still(): boolean {
    return !this.me.walking && !this.keys?.direction() && this.flier.air.s === GROUNDED;
  }

  private build(): void {
    const { room } = this;
    ensureFxTextures(this);

    // Each tile is one screen of art at its offset. Tiles overlap their neighbours by a pixel so no
    // hairline of the clear colour shows at a join while the camera scrolls.
    for (const t of backgroundTiles(room)) this.add.image(t.x, t.y, t.key).setOrigin(0).setDisplaySize(ROOM_W + 1, ROOM_H + 1).setDepth(-1);
    this.pieces = addSetPieces(this, room, (pointer, event) => this.onIdolTap(pointer, event));
    this.setRealms(this.transport.kind === 'edge' ? this.realms : { open: [...GATED_ROOMS], portal: true, night: null });
    this.arcade = arcadeFor(room, {
      scene: this,
      hud: this.hud,
      acts: () => this.acts,
      look: () => this.look,
      feathers: (total) => this.collection.setFeathers(total),
    });
    this.climb = climbFor(room, {
      scene: this,
      hud: this.hud,
      acts: () => this.acts,
      look: () => this.look,
      portalLive: () => this.realms.portal,
      calm: () => (this.registry.get('settings') as SettingsStore | undefined)?.get().calm ?? false,
      feathers: (total) => this.collection.setFeathers(total),
      awarded: () => void this.collection.refresh(),
    });
    // Calm motion (a setting) stills the drifting particles, at once and in every room after.
    const ambience = addAmbience(this, room);
    // What owls say shows in bubbles over everything in the room, the words the same size on any screen.
    this.bubbles = new SpeechBubbles(this, room.size.h + 150, () => this.cfg.pixelRatio / this.cameras.main.zoom);
    const settings = this.registry.get('settings') as SettingsStore | undefined;
    if (settings) {
      ambience.setCalm(settings.get().calm);
      this.bubbles.setShown(settings.get().bubbles);
      const stop = settings.onChange((s) => {
        ambience.setCalm(s.calm);
        this.bubbles?.setShown(s.bubbles);
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    }
    addNestsSign(this, room);
    addParkSign(this, room);
    if (room.id === STREET_ROOM) {
      this.streetSigns = new StreetDoors(this, room);
      this.streetSigns.show(this.street, nestLook(this.look));
    }
    if (isNestRoom(room.id)) {
      this.decor = new NestDecor(this, (keys) => loadArt(this, keys, this.cfg.pixelRatio, this.artCap));
      this.mirror = new NestMirror(this, NEST_MIRROR);
    }
    for (const t of foregroundTiles(room)) {
      if (this.textures.exists(t.key)) this.add.image(t.x, t.y, t.key).setOrigin(0).setDisplaySize(ROOM_W, ROOM_H).setDepth(room.size.h + 100);
    }

    const spawn = arrivalPoint(room, this.registry.get('spawnName') as string | undefined, this.cameFrom?.room, this.lane);
    this.me = new Owl(this, this.playerId, this.look, spawn, itemScale(this.cfg.pixelRatio));
    this.me.groundUnder = this.groundUnder;
    this.me.calm = () => this.calm();
    this.arrivedAt = { ...spawn };
    if (this.cfg.pos && this.transport.kind === 'edge') {
      // Asked for once a tab; every room after shows it at once.
      let overlay = this.registry.get('posOverlay') as Promise<PosOverlay | null> | undefined;
      if (!overlay) {
        overlay = openPosOverlay(this.cfg.edgeUrl);
        this.registry.set('posOverlay', overlay);
      }
      const gen = this.gen;
      void overlay.then((o) => {
        if (gen === this.gen) this.posOverlay = o;
      });
    }
    // Come in to stand before the mirror (Play, OP-105), the owl faces it.
    if (this.mirror && this.registry.get('spawnName') === 'mirror') this.me.face(NEST_MIRROR.x < spawn.x ? -1 : 1);
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
      robot: () => this.pieces.idol?.image ?? null,
    });

    this.setupCamera();
    this.setupInput();
    if (this.cfg.debug) this.drawDebug();
    if (this.cfg.boxes) {
      this.fitOverlay = new FitOverlay(this, {
        room,
        shut: () => this.shutFloor(),
        npcs: () => [...this.npcs.values()].map((n) => n.fit()),
        owls: () => [this.me, ...this.peers.values()].map((o) => o.fitMarks()),
        sprites: () => {
          const out: Array<{ key: string; image: Phaser.GameObjects.Image }> = [];
          const idol = this.pieces.idol?.image;
          if (idol) out.push({ key: idol.texture.key, image: idol });
          for (const arch of Object.values(this.pieces.arches ?? {})) if (arch.blockade) out.push({ key: arch.blockade.texture.key, image: arch.blockade });
          out.push(...(this.decor?.fitSprites() ?? []));
          return out;
        },
      });
    }

    this.hud.setCount(1);
    this.hud.setActions([]);
    this.hud.setRoom(room.id);
    this.showWaysOut();
    // The owl builder's kind and colours: today's pledge and the worn collectibles stay as they are.
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
    this.fly(now);
    const finished = this.me.tick(now);
    // At what a tap asked for: nothing left for a jump to carry on to (OP-084).
    if (finished && this.walkGoal && distance(this.walkGoal, this.me.pos) < 3) this.walkGoal = null;
    this.posOverlay?.frame(this.me.pos, now, this.room.id);
    if (!this.leaving) {
      this.steer();
      this.checkDoors(finished);
      this.checkItems(now);
      this.updateHints();
      this.rest(now);
      this.prefetchNear(now);
    }
    for (const owl of this.peers.values()) owl.tick(now);
    this.bubbles?.tick(now);
    this.fitOverlay?.draw();
    for (const npc of this.npcs.values()) npc.tick(now);
    for (const pile of this.piles.values()) pile.tick(now);
    this.play?.tick();
  }

  // ---------- networking ----------

  private snapshot(): PlayerState {
    const told = this.roomTold;
    const up = told.air.s !== GROUNDED || told.air.z > 0;
    return { id: this.playerId, look: this.look, pos: { ...this.me.pos }, walk: this.me.walk, ...(this.sleptAt ? { asleep: true } : {}), ...(up ? { air: { ...told.air, at: told.at } } : {}), v: PROTOCOL_VERSION };
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
      onWall: (walls, mine) => live() && this.arcade?.onWall(walls, mine),
      onNest: (seen) => live() && this.onNest(seen),
      onNestClosed: () => live() && this.onNestClosed(),
    };
    const conn = await this.transport.join(this.room.id, { ...this.snapshot(), ...(spawnName ? { spawn: spawnName } : {}), ...(this.via ? { via: this.via } : {}) } as PlayerState, {
      ...pushes,
      onPeerState: (s) => live() && this.onPeerState(s),
      onPeerMove: (id, walk) => live() && this.onPeerMove(id, walk),
      onPeerLeave: (id) => live() && this.onPeerLeave(id),
      onStatus: (s) => live() && this.onStatus(s),
      onSelf: (pos) => {
        if (!live()) return;
        this.posOverlay?.told('welcome', pos);
        this.roomHas = pos;
        // On joining, the room is caught up once this page holds the connection (below).
        if (this.conn) this.catchUpRoom();
      },
      onSelfWalk: (walk) => live() && this.me.startWalk({ ...walk, from: { ...this.me.pos } }),
      onSelfEcho: (from, to) => live() && this.posOverlay?.told('echo', to, from),
      onPeerLook: (id, look) => live() && this.peers.get(id)?.applyLook(look),
      onPeerRest: (id, asleep) => live() && this.peers.get(id)?.setAsleep(asleep, this.calm()),
      onPeerAir: (id, air, at) => live() && this.peers.get(id)?.fly(air, this.peerTime(at)),
      onCounts: (rooms) => {
        if (!live()) return;
        this.registry.set('counts', rooms);
        this.hud.setParkCount(Object.values(rooms).reduce((a, b) => a + b, 0));
      },
      onFull: (roomId) => live() && void this.roomFull(roomId),
      onQueued: () => live() && this.queued(),
      onNotice: (words) => live() && (this.registry.get('ribbon') as Ribbon | undefined)?.set(words),
      onRealms: (realms) => live() && this.setRealms(realms),
      onRealmClosed: (sign) => live() && this.onRealmClosed(sign),
      onNotThroughGate: () => live() && this.notThroughGate(),
      onPeerEmote: (id, e) => {
        if (!live()) return;
        this.peerEmotes.set(id, e);
        this.peers.get(id)?.playEmote(e);
      },
      onPeerSay: (id, n) => {
        if (!live()) return;
        const owl = this.peers.get(id);
        if (owl) this.bubbles?.say(owl, n, Date.now());
      },
    });
    if (!live() || !this.scene.isActive()) {
      await conn.leave();
      return;
    }
    this.conn = conn;
    this.catchUpRoom();
    // The map's places (OP-130): this browser keeps the room walked into when no server does.
    this.collection.service.travelEntered(this.room.id, spawnName);
    void this.refreshTravel(spawnName);
    this.link = this.collection.service.questLink(this.room.id, conn, pushes, () => ({ ...this.me.pos }), () => this.groundNow());
    this.acts = this.collection.service.activityLink(this.room.id, conn, pushes, () => ({ ...this.me.pos }), () => this.look);
    this.play?.attach(this.acts);
    this.nests = this.collection.service.nestLink(this.room.id, conn, pushes, () => nestLook(this.look));
    if (this.room.id === STREET_ROOM) void this.askStreet();
    // Arriving here counts for quests that ask for a visit (the room server counts it on its own).
    this.link?.note({ kind: 'visit', room: this.room.id });
    void this.refreshBoard();
  }

  /**
   * The room let the own owl in at `roomHas` (its welcome, on joining and on every reconnect): where
   * the owl stood as the page joined, or another spot when that one was taken or the room would not
   * have it there. The owl does not jump to it (OP-138). Still standing where it came in, it walks over
   * if that is a step aside; otherwise it stays where its visitor put it, walking on where it was
   * going, and the room is told, so the room's copy walks over to it. Only when the room's copy cannot
   * walk straight over (a wall, a plinth or a gap between: the room forgot the owl, or it came back
   * further than it could have walked) does the owl go to the room's spot, faded in there as an owl
   * arriving is; told instead, the room's copy would stop short and pull the owl after it.
   *
   * TODO-DOCS (OP-138): docs/ARCHITECTURE.md's client rules: a welcome never moves the local owl (it
   * walks over a step aside or the room is told where it is), and a page back from a dropped
   * connection resumes as far from where it left as its owl could have walked since.
   */
  private catchUpRoom(): void {
    const at = this.roomHas;
    this.roomHas = null;
    if (!at) return;
    // The room starts the owl on the floor: standing on a perch, or up in the air, it is told (OP-084).
    this.retellAir();
    const target = this.me.walk?.to;
    if (distance(at, this.me.pos) >= 3 && !this.roomCanFollow(at)) {
      this.moveTo(at);
      if (target) this.walkTo(target, this.keyWalk, this.walkGoal);
      return;
    }
    if (target && this.walkTo(target, this.keyWalk, this.walkGoal)) return;
    const off = distance(at, this.me.pos);
    if (off < 3) return;
    const untouched = !this.me.walk && distance(this.me.pos, this.arrivedAt) < 3;
    if (untouched && off <= STEP_ASIDE_PX && this.walkTo(at)) return;
    this.stop();
  }

  /** Whether the room's copy of the own owl, at `from`, can walk straight to where the owl is. */
  private roomCanFollow(from: Vec2): boolean {
    const f = this.footingNow();
    return distance(resolveTarget(from, this.me.pos, f.walkable, f.shut), this.me.pos) < 3;
  }

  /** The own owl to where the room has it, faded in there: the one move of it that is not a walk (OP-138). */
  private moveTo(at: Vec2): void {
    this.posOverlay?.told('moved', at, this.me.pos);
    this.me.place(at);
    this.me.setAlpha(0);
    this.tweens.add({ targets: this.me, alpha: 1, duration: 200 });
    this.conn?.track(this.snapshot());
  }

  private onStatus(s: ConnectionStatus): void {
    this.hud.setStatus(s, this.transport.kind);
    const wentOffline = s === 'offline' && this.lastStatus !== 'offline';
    // Back online after a drop: the board may have moved meanwhile (a new park day, a push missed).
    if (s === 'online' && this.lastStatus === 'offline' && this.conn) {
      void this.refreshBoard();
      // A climb under way asks the room for its run again, with any band the room never answered.
      void this.climb?.reconnected();
    }
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

  /** The park has a line (OP-075) and this owl has not come through it: back to the home screen, where it waits its turn. */
  private queued(): void {
    if (this.leaving) return;
    this.registry.set('queued', true);
    void this.leaveRoom().then((left) => {
      if (left) this.scene.start('home');
    });
  }

  private onPeerState(s: PlayerState): void {
    if (s.id === this.playerId) return;
    const now = Date.now();
    let owl = this.peers.get(s.id);
    if (!owl) {
      owl = new Owl(this, s.id, s.look, s.pos, itemScale(this.cfg.pixelRatio));
      owl.groundUnder = this.groundUnder;
      owl.calm = () => this.calm();
      owl.setAlpha(0);
      this.tweens.add({ targets: owl, alpha: 1, duration: 400 });
      this.peers.set(s.id, owl);
      this.hud.setCount(this.peers.size + 1);
    } else {
      owl.applyLook(s.look);
    }
    owl.setAsleep(s.asleep === true, this.calm());
    if (s.air) {
      // Off the ground when the snapshot was made: carried on from then, as its own page carries it.
      const { at, ...air } = s.air;
      owl.fly(air, this.peerTime(at));
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
    this.bubbles?.drop(id);
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
      if (this.leaving || this.passingGate || this.decorating || !this.onCanvas(p)) return;
      if (Date.now() - this.tapTakenAt < 100) return; // the idol or an NPC took this tap
      if (p.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return; // a drag, not a tap
      this.pendingVote = false; // a new destination cancels a walk to the idol
      this.errand = null; // ...or to an NPC or a leaf pile
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      // A tap on a perch's top asks for the top, not the floor behind it (OP-084).
      this.walkTo(tapGoal(this.room, { x: world.x, y: world.y }));
    });
  }

  /** WASD and the arrow keys: walk while held (sliding along edges) and stop on letting go. */
  private steer(): void {
    // In the turnstiles the owl goes on through where it stands, not sideways along them (OP-124).
    if (this.passingGate) return;
    // Decorating, the arrow keys step through the spots and the owl stays where it is.
    const dir = this.decorating ? null : (this.keys?.direction() ?? null);
    if (!dir) {
      if (this.keyWalk && this.me.walking) this.stop();
      this.keyDir = null;
      this.keyWalk = false;
      return;
    }
    const same = this.keyDir !== null && this.keyDir.x === dir.x && this.keyDir.y === dir.y;
    const afresh = this.reSteer;
    this.reSteer = false;
    if (same && this.me.walking && !afresh) return; // keep going
    if (!same) {
      this.keyDir = dir;
      this.keyTurns = KEY_TURNS;
    }
    if (this.keyTurns <= 0) return; // boxed in: wait for other keys
    this.keyTurns -= 1;
    const f = this.footingNow();
    const target = steerTarget(this.me.pos, dir, f.walkable, undefined, f.shut);
    if (!target) {
      this.keyTurns = 0;
      // Steered afresh at a perch's face, from the floor: no further this way, so stand.
      if (afresh && this.me.walking) this.stop();
      return;
    }
    // Steered afresh to where the walk already ends: nothing to tell.
    if (afresh && this.me.walk && distance(target, this.me.walk.to) < 3) return;
    this.pendingVote = false; // walking away cancels a walk to the idol
    this.errand = null;
    this.walkTo(target, true);
  }

  /** Twice a second at most: the art of the rooms the owl is heading into, fetched ahead so going through finds it in the browser (OP-129). */
  private prefetchNear(now: number): void {
    if (now < this.prefetchAt) return;
    this.prefetchAt = now + 500;
    for (const to of roomsAhead(this.room, this.me.pos, this.me.walk?.to ?? null, this.keyWalk, (id) => this.realmClosed(id))) prefetchRoomArt(this, to, this.cfg);
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

  /**
   * Chips at the screen's edge for open doorways and interactive spots the camera cannot see. Outside
   * the park, the chip for the way there says so in words (OP-105).
   */
  private updateHints(): void {
    const own = this.room.id === STREET_ROOM ? 'nest-door-0' : null;
    const toPark = parkwardDoor(this.room.id);
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
          ...(door.id === toPark ? { text: NEST_WORDS.toPark } : {}),
          label: spot
            ? `${spot.label}, off screen: walk there`
            : door.id === toPark
              ? `${NEST_WORDS.toPark}, off screen: walk there`
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

  /** The Menu's ways out from here: leaving inside the park, going home anywhere but the owl's own nest. */
  private showWaysOut(): void {
    this.hud.setWaysOut({ leave: insidePark(this.room.id), home: !(isNestRoom(this.room.id) && this.nestMine) });
  }

  /** "Leave the park" (the card asked first): to the lobby, outside the gate. The ticket keeps running. */
  leavePark(): boolean {
    if (!this.built || this.leaving || !insidePark(this.room.id)) return false;
    void this.goTo(LOBBY_ROOM, LEFT_PARK_SPAWN, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined });
    return true;
  }

  /**
   * Home (travel home on the map, OP-130, and Q away from it): straight to the owl's own nest, from
   * anywhere, an open dialogue closing first (the quest stays as it was). Out of it again, the owl is
   * on the street in front of its own door, as if it had come in that way.
   */
  async goHome(spawn = 'default', fadeMs = LEAVE_FADE_MS): Promise<boolean> {
    if (!this.built || this.leaving) return false;
    const nestId = await this.collection.service.homeNest();
    if (!this.built || this.leaving) return false;
    const home = nestId ? nestRoomId(nestId) : null;
    if (!home) {
      this.hud.toast(NEST_WORDS.notAnswering, 3500);
      return false;
    }
    if (home === this.room.id) return false;
    this.hud.closeDialogue();
    this.talkingTo = null;
    void this.goTo(home, spawn, { room: STREET_ROOM, spawn: 'from-nest-0' }, fadeMs, undefined, 'travel');
    return true;
  }

  /**
   * Travel from the Menu's map, its button held (OP-130): to a place the owl has walked into (its own
   * nest always), landing where walking in would have, after the slower fade going home has. Into the
   * park only once the owl has walked through the front gate since it was last outside; the room server
   * turns any other travel in away (notThroughGate). Not in the middle of a climb, a game or the
   * turnstiles, nor while "Still here?" is asked. Null when the owl is on its way, otherwise why not.
   *
   * TODO-DOCS (OP-130): docs/PLAYBOOK.md's controls: travel from the Menu's map, held (M opens the
   * map), places lit once walked into, into the park only through the gate, Go home retired;
   * docs/ARCHITECTURE.md: protocol 13 (`via: 'travel'` in the hello, `closed` why 'gate' and close
   * 4015), GET /api/travel and the travel book in the Collections object (travelBook.ts).
   */
  travel(place: string): TravelRefusal | null {
    if (!this.built || this.leaving) return 'busy';
    const climb = this.climb?.debug();
    if (this.passingGate || this.decorating || this.askedAt || this.goingAway || this.arcade?.debug() || (climb && !climb.over)) return 'busy';
    const known = this.travelNow();
    if (!canTravel(place, known.places)) return 'not-yet';
    if (needsGate(place) && !known.gate) return 'gate';
    if (place === 'nest') {
      if (isNestRoom(this.room.id) && this.nestMine) return 'here';
      void this.goHome(NEST_SPAWN, NEST_FADE_MS);
      return null;
    }
    const to = TRAVEL_LANDINGS[place]!;
    if (to.room === this.room.id) return 'here';
    this.hud.closeDialogue();
    this.talkingTo = null;
    void this.goTo(to.room, to.spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined }, NEST_FADE_MS, undefined, 'travel');
    return null;
  }

  /** The map's places and the gate as this page has them (OP-130): none walked into yet until it hears. */
  private travelNow(): TravelState {
    return (this.registry.get('travel') as TravelState | undefined) ?? { places: [], gate: false };
  }

  private setTravel(state: TravelState): void {
    this.registry.set('travel', state);
    this.hud.setTravel(state);
  }

  /**
   * In a room (OP-130): the map has this room on top of what the page had, at once, and then on top of
   * what the collection keeps (the room server's, or this browser's), once that answers.
   */
  private async refreshTravel(spawn: string | undefined): Promise<void> {
    const gen = this.gen;
    const room = this.room.id;
    this.setTravel(travelAfter(this.travelNow(), room, spawn));
    const kept = await this.collection.service.travel().catch(() => null);
    if (gen !== this.gen || !kept) return;
    this.setTravel(travelAfter(kept, room, spawn));
  }

  /**
   * The room server turned a travel into the park away (OP-130): the owl has not walked through the
   * front gate since it was last outside (another screen may have taken it out). It goes back where it
   * was, and the map offers the gate.
   */
  private notThroughGate(): void {
    if (this.leaving) return;
    this.setTravel({ ...this.travelNow(), gate: false });
    this.hud.toast(TRAVEL_WORDS.gateFirst, 3500);
    const back = this.cameFrom ?? { room: LOBBY_ROOM, spawn: undefined };
    void this.goTo(back.room, back.spawn ?? 'default', undefined);
  }

  /** Calm motion, as this visitor set it. */
  private calm(): boolean {
    return (this.registry.get('settings') as SettingsStore | undefined)?.get().calm ?? false;
  }

  /**
   * An idle owl (OP-126). With no key, touch, click or scroll for a while, no walk under way and no
   * stick held, it falls asleep where it stands, for everyone; anything its visitor does wakes it.
   * Asleep a long while anywhere but its own nest, "Still here?" asks; with no answer it leaves the
   * room, freeing its place, and comes home to its nest at a tap. Never during a climb or a game.
   */
  private rest(now: number): void {
    const idle = this.registry.get('idle') as { at: number } | undefined;
    if (!idle || this.goingAway) return;
    if (!this.still()) idle.at = now;
    if (!this.sleptAt) {
      if (now - idle.at >= this.cfg.sleepAfterMs && this.maySleep()) this.fallAsleep(now);
      return;
    }
    if (idle.at > this.sleptAt) return this.wake();
    if (isNestRoom(this.room.id) && this.nestMine) return; // at home an owl sleeps as long as it likes
    if (!this.askedAt) {
      if (now - this.sleptAt < this.cfg.awayAskMs) return;
      this.askedAt = now;
      this.awayScreen()?.ask();
    } else if (now - this.askedAt >= this.cfg.awayAnswerMs) void this.goAway();
  }

  private maySleep(): boolean {
    return !this.passingGate && !this.decorating && !this.climb?.debug() && !this.arcade?.debug();
  }

  private fallAsleep(now: number): void {
    this.sleptAt = now;
    this.me.setAsleep(true, this.calm());
    this.conn?.track(this.snapshot());
    this.conn?.send({ t: 'rest', id: this.playerId, asleep: true });
  }

  private wake(): void {
    this.sleptAt = 0;
    this.askedAt = 0;
    this.awayScreen()?.close();
    this.me.setAsleep(false);
    this.conn?.track(this.snapshot());
    this.conn?.send({ t: 'rest', id: this.playerId, asleep: false });
  }

  private awayScreen(): Away | undefined {
    return this.registry.get('away') as Away | undefined;
  }

  /**
   * No answer to "Still here?": the owl leaves the room as any visitor does (its place freed, its
   * visit closed), and the page waits for a tap to bring it back, to its own nest (OP-105).
   */
  private async goAway(): Promise<void> {
    this.goingAway = true;
    this.awayScreen()?.close();
    const nestId = await this.collection.service.homeNest().catch(() => null);
    const home = nestId ? nestRoomId(nestId) : null;
    if (!(await this.leaveRoom())) return;
    const back: RoomStart = home ? { room: home, spawn: NEST_SPAWN, from: { room: STREET_ROOM, spawn: 'from-nest-0' } } : { room: LOBBY_ROOM, spawn: undefined };
    this.awayScreen()?.gone(() => this.scene.start('room', back));
  }

  /**
   * At a nest's mirror (OP-077): the owl turns to it and Your owl opens, the room showing round the
   * owl as it changes. Any owl may look into any nest's mirror: it changes only that owl.
   */
  lookInMirror(): boolean {
    // Not over the Decorate sheet, nor over a screen opened while the owl walked up.
    if (!this.built || this.leaving || !this.mirror || this.decorating || this.hud.isBlocking()) return false;
    if (this.me.walking) this.stop();
    this.errand = null;
    this.me.face(NEST_MIRROR.x < this.me.pos.x ? -1 : 1);
    this.hud.openMirror();
    return true;
  }

  /** Q (OP-077): to the mirror. In a nest the owl walks up to it and looks in; anywhere else it goes home, landing before its own mirror. */
  toMirror(): boolean {
    if (!this.built || this.leaving || this.decorating) return false;
    if (this.mirror) return this.goDo({ kind: 'mirror', id: 'mirror' });
    void this.goHome('mirror');
    return true;
  }

  /**
   * While Your owl is open at the mirror, the room's own camera draws the owl and its mirror close
   * up in the builder's stage (CSS pixels): the owl in the room is the preview, changing as the
   * choices do. Null puts the camera back on the owl.
   */
  mirrorView(frame: PreviewFrame | null): void {
    this.mirrorFrame = frame;
    if (!this.built) return;
    const cam = this.cameras.main;
    if (frame) cam.stopFollow();
    this.fitCamera();
    if (!frame) cam.startFollow(this.me, true, 0.12, 0.12);
  }

  /**
   * The first time this device's owl is home, the mirror catches the light (no words), and the
   * welcome card says the park is out of the door (OP-105); each once, never again after.
   */
  private firstTimeHome(): void {
    if (!this.mirror) return;
    let storage: Storage | null = null;
    try {
      storage = localStorage;
    } catch {
      // A browser that keeps nothing: neither (firstGlint, firstNestWelcome).
    }
    if (firstGlint(storage)) this.time.delayedCall(700, () => this.mirror?.glint());
    if (firstNestWelcome(storage)) this.hud.setNestWelcome(true);
  }

  /**
   * The Menu's "Home screen" (OP-065): out of the room as through a door (the room frees the owl's
   * place at once; a ticket keeps running), and the home screen comes up. Play goes back in, to the
   * owl's own nest.
   */
  toHomeScreen(): boolean {
    if (!this.built || this.leaving) return false;
    void this.leaveRoom().then((left) => {
      if (left) this.scene.start('home');
    });
    return true;
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
    // The arcade's cabinets whose games are live: Play starts a run (a cabinet switched off says Hatching Soon).
    ...Object.fromEntries(CABINETS.filter((c) => c.live).map((c) => [c.spot, { label: `Play ${GAMES[c.game].name}`, run: () => void this.arcade?.play(c.game) }])),
    // The glass realm's portal: the climb, while the keepers' switch has the portal live.
    portal: { label: 'Climb', run: () => (this.realms.portal ? void this.climb?.play() : this.hud.toast(PORTAL_OFF)) },
    mirror: { label: NEST_WORDS.mirror, run: () => this.lookInMirror() },
  };

  /**
   * A tap that was pressed and let go on the game itself. Phaser finds what is under a release
   * anywhere on the page, so a tap on a HUD button over an NPC owl would otherwise talk to it.
   */
  private onCanvas(p: Phaser.Input.Pointer): boolean {
    return p.downElement === this.game.canvas && p.upElement === this.game.canvas;
  }

  /** Tapping the realm's idol: pledge now if standing at it, otherwise walk up and pledge on arrival. */
  private onIdolTap(pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData): void {
    if (this.leaving || !this.onCanvas(pointer) || pointer.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return;
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

  /** The arcade's run under way, for tests: its game itself, to play it by its rules. */
  arcadeRun(): ReturnType<Arcade['debug']> {
    return this.arcade?.debug() ?? null;
  }

  /** The climb under way, for tests: its seed, what is banked, and the owl on the field. */
  climbRun(): ReturnType<Climb['debug']> {
    return this.climb?.debug() ?? null;
  }

  /** The scripted climber at the climb's controls, for tests. */
  climbAuto(on: boolean): boolean {
    return this.climb?.autopilot(on) ?? false;
  }

  /** Read-only snapshot for tests and the console. */
  debugState(): {
    room: string;
    pos: Vec2;
    walking: boolean;
    look: OwlLook;
    /** How high the owl is drawn above the floor (OP-084), in room pixels; its place stays at `pos`. */
    height: number;
    /** Its flight as it steps (on the ground, in the air or gliding; flaps left). */
    air: Air;
    /**
     * Its take-offs as the flight steps them: how many on this page, and the last one's top (room px),
     * whether it glided and how long it was up (ms, once down). A tap let go at once hops a few pixels
     * for a fraction of a second, which a slow machine can step through between two frames it draws,
     * so `height` may never show it.
     */
    flown: { n: number; peak: number; glided: boolean; ms: number };
    /**
     * The others, with how high each is drawn, whether on the ground (0), in the air (1) or gliding (2),
     * and its take-offs as this page carried them on from the states it was told (as `flown` is for the own owl).
     */
    peers: Array<{ id: string; pos: Vec2; walking: boolean; look: OwlLook; emote: string | null; height: number; air: Air['s']; flown: { n: number; peak: number; glided: boolean; ms: number }; asleep: boolean; wings: boolean; owlWorn: string }>;
    /** Asleep, its visitor idle (OP-126). */
    asleep: boolean;
    /** The phrases in bubbles over the owls right now: whose (this visitor's own id included), and which. */
    bubbles: Array<{ id: string; n: number }>;
    connected: boolean;
    doors: Array<{ id: string; x: number; y: number; to: string | undefined }>;
    /** Where the owl's eyes are, left (-) or right (+) of its feet: the way its painting faces. */
    eyes: number;
    /** The owl's body layer in use: `owl-body`, or its species' own (`owl-barn-body`). */
    owlArt: string;
    /** The body layer drawn right now: `owlArt`, or with the wings out its flight copy (`owl-flight-body`), the folded wings taken away (OP-136). */
    owlWorn: string;
    /** Whether the owl's wings are open (OP-084); only ever over its flight body. */
    wings: boolean;
    /** NPC owls in this room, the quest marker each shows, and whether its '!' says the owl can talk to it now (OP-114). */
    npcs: Array<{ id: string; x: number; y: number; mark: string | null; approach: boolean }>;
    /** Interactables in this room; `here` is false while a leaf pile is used up. */
    objects: Array<{ id: string; kind: string; x: number; y: number; top: number; here: boolean }>;
    /** Quest items waiting in this room (only this visitor sees them); `top` for one up on a perch. */
    items: Array<{ quest: string; n: number; kind: string; x: number; y: number; top: number }>;
    /** What the owl can do where it stands (the action buttons), in order. */
    actions: string[];
    /** The NPC whose dialogue is open. */
    talkingTo: string | null;
    /** The activities here: lanterns lit, the fishing line, the copy game, the next quiz question. */
    play: ReturnType<ActivityLayer['debug']> | null;
    /** In the arcade: the score wall as this page shows it. */
    wall: ReturnType<Arcade['wall']> | null;
    /** On the street: who lives behind each door for this visitor (door 0 is its own). */
    street: StreetDoor[] | null;
    /** In a nest: which, whether it is this visitor's, how it stands (and which pieces are drawn yet: their pictures load as they are put out), and Decorate mode. */
    nest: { id: string; mine: boolean; open: boolean; layout: NestLayout; drawn: NestLayout; owned: string[]; gift: { taken: boolean } | null; decorating: boolean; spot: NestSpotId } | null;
    /** In a nest, its mirror (OP-077): where it stands, and while Your owl is open at it, the stage the room's camera draws in (CSS pixels). */
    mirror: { x: number; y: number; stage: PreviewFrame | null } | null;
    /** The room's paintings drawn at 1x still, their sharp copies on the way (OP-129). */
    soft: string[];
    /** The map's places walked into and whether the owl is through the front gate, as this page has them (OP-130). */
    travel: TravelState;
  } | null {
    if (!this.built) return null;
    return {
      room: this.room.id,
      doors: this.room.doors.map((d) => ({ id: d.id, x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2, to: d.to?.room })),
      pos: { ...this.me.pos },
      walking: this.me.walking,
      look: this.look,
      height: this.me.flightHeight(),
      air: { ...this.flier.air },
      flown: { ...this.flown },
      peers: [...this.peers.values()].map((o) => ({ id: o.id, pos: { ...o.pos }, walking: o.walking, look: o.look, emote: this.peerEmotes.get(o.id) ?? null, height: o.flightHeight(), air: o.airMode, flown: o.flown, asleep: o.asleep, wings: o.wingsOut, owlWorn: o.wornKey })),
      asleep: this.me.asleep,
      bubbles: this.bubbles?.showing() ?? [],
      connected: this.conn !== null,
      eyes: this.me.anchor('eyes').x,
      owlArt: this.me.artKey,
      owlWorn: this.me.wornKey,
      wings: this.me.wingsOut,
      npcs: [...this.npcs.values()].map((n) => ({ id: n.id, x: n.def.pos.x, y: n.def.pos.y, mark: this.quests.markFor(n.id), approach: n.approaching })),
      objects: interactablesIn(this.room.id).map((d) => ({ id: d.id, kind: d.kind, x: d.pos.x, y: d.pos.y, top: d.top ?? 0, here: this.piles.get(d.id)?.here ?? true })),
      items: [...this.items.values()].map((m) => ({ quest: m.quest, n: m.n, kind: m.kind, x: m.pos.x, y: m.pos.y, top: m.top })),
      actions: this.actions.map((a) => a.id),
      talkingTo: this.talkingTo,
      play: this.play?.debug() ?? null,
      wall: this.arcade?.wall() ?? null,
      street: this.room.id === STREET_ROOM ? this.street : null,
      nest: this.nestView
        ? { id: this.nestView.nestId, mine: this.nestMine, open: this.nestView.open, layout: this.nestView.layout, drawn: this.decor?.drawn() ?? {}, owned: this.owned, gift: this.nestGift, decorating: this.decorating, spot: this.decorSpot }
        : null,
      mirror: this.mirror ? { ...NEST_MIRROR, stage: this.mirrorFrame } : null,
      soft: [...this.soft],
      travel: this.travelNow(),
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
    if (this.leaving || !this.onCanvas(pointer) || pointer.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return;
    event.stopPropagation();
    this.tapTakenAt = Date.now();
    this.pendingVote = false;
    this.goDo({ kind: 'talk', id: npc.id });
  }

  /** Where an errand happens and how close the owl must stand for it. */
  private errandSpot(e: Errand): { pos: Vec2; reach: number; top?: number } | null {
    if (e.kind === 'talk' || e.kind === 'handin') {
      const npc = this.npcs.get(e.id);
      return npc ? { pos: npc.def.pos, reach: NPC_TALK_RADIUS } : null;
    }
    if (e.kind === 'mirror') {
      const at = this.mirror ? this.room.spawns['mirror'] : undefined;
      return at ? { pos: at, reach: 40 } : null;
    }
    const def = getInteractable(e.id);
    return def && def.room === this.room.id ? { pos: def.pos, reach: KIND_RULES[def.kind].reach, ...(def.top ? { top: def.top } : {}) } : null;
  }

  private runErrand(e: Errand): void {
    if (e.kind === 'talk') void this.talk(e.id);
    else if (e.kind === 'handin') void this.handInQuest(e.quest);
    else if (e.kind === 'mirror') this.lookInMirror();
    else void this.use(e.id);
  }

  /** Do something at an NPC or an interactable: now when close enough, otherwise walk up first. */
  goDo(e: Errand): boolean {
    if (!this.built || this.leaving) return false;
    const spot = this.errandSpot(e);
    if (!spot) return false;
    if (distance(this.me.pos, spot.pos) <= spot.reach && this.atLevel(spot)) {
      this.errand = null;
      this.runErrand(e);
      return true;
    }
    // Stand beside an NPC (on the visitor's side), or right on a leaf pile or at a stall.
    const side = this.me.pos.x < spot.pos.x ? -1 : 1;
    const target = e.kind === 'use' || e.kind === 'mirror' ? spot.pos : { x: spot.pos.x + side * 70, y: spot.pos.y + 24 };
    if (!this.walkTo(target)) {
      // Already as close as the floor allows (a thing up on a perch waits for the owl to be up there too).
      if (distance(this.me.pos, spot.pos) <= spot.reach + REACH_SLACK / 2 && this.atLevel(spot)) this.runErrand(e);
      return true;
    }
    this.errand = e;
    return true;
  }

  /**
   * What the owl can do here, recomputed every frame: spots first (such as a nest's mirror), then
   * Decorate in the owl's own nest, then the nearest NPC, then interactables.
   */
  private actionsHere(spots: string[]): Action[] {
    const out: Action[] = spots.map((id) => ({ id, label: this.interactions[id]!.label, run: () => this.interactions[id]?.run() }));
    if (this.nestMine && this.decor && !this.decorating) out.push({ id: 'decorate', label: NEST_WORDS.decorate, run: () => this.startDecorating() });
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
    // The '!' over the one the owl can talk to now (OP-114): the nearest in reach, while talking to it
    // is what Interact's '!' (and E) would do, not a spot the owl stands in first, such as the gift shop.
    const calm = (this.registry.get('settings') as SettingsStore | undefined)?.get().calm ?? false;
    const talkFirst = out.length === 0;
    for (const npc of this.npcs.values()) npc.setApproach(npc === nearest && talkFirst && !this.sleptAt, calm);
    if (nearest) {
      const id = nearest.id;
      out.push({ id: `npc:${id}`, label: `Talk to ${nearest.def.name}`, run: () => void this.talk(id) });
    }
    for (const def of interactablesIn(this.room.id)) {
      const rules = KIND_RULES[def.kind];
      // A pile up on a perch is in reach only from that perch, one on the floor only from the floor (OP-084).
      const close = distance(pos, def.pos) <= rules.reach && this.atLevel(def);
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
    const wanted = new Map<string, { quest: string; n: number; kind: QuestItemMarker['kind']; x: number; y: number; top?: number }>();
    for (const q of board?.active ?? []) for (const it of q.items) if (it.room === this.room.id) wanted.set(`${q.id}#${it.n}`, { quest: q.id, ...it });
    for (const [key, m] of this.items) {
      if (wanted.has(key)) continue;
      m.destroy();
      this.items.delete(key);
    }
    for (const [key, it] of wanted) if (!this.items.has(key)) this.items.set(key, new QuestItemMarker(this, it.quest, it.n, it.kind, { x: it.x, y: it.y }, it.top ?? 0));
  }

  /**
   * Quest steps that moved (OP-083): only a quest finished is news, a short line at the top and the
   * dot on the Menu button. Each step's progress shows in the quests screen, not over the room.
   */
  private showUpdates(updates: QuestUpdate[]): void {
    for (const u of updates) if (u.ready) this.hud.questNews('done', u.title);
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
            featherFind(this, def.pos, () => ({ x: this.me.pos.x, y: this.me.pos.y - this.flier.air.z }), () => this.collection.setFeathers(res.total), def.top ?? 0);
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
      if (d > PICKUP_CLIENT_RADIUS || (this.me.walking && d > PICKUP_CLIENT_RADIUS / 2) || !this.atLevel(m)) continue;
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
    if (res.ok) this.hud.questNews('new', title);
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

  /**
   * Collect from the quests screen (OP-083): a finished quest goes to the NPC that gave it, as from its
   * dialogue. Standing close, at once; elsewhere in this room, the quests screen closes and the owl
   * walks up and hands it in on arrival. Its giver in another room: false (the screen says where).
   */
  async collectQuest(quest: string): Promise<boolean> {
    const giver = getQuest(quest)?.giver;
    const npc = giver ? this.npcs.get(giver) : undefined;
    if (!npc || !this.built || this.leaving) return false;
    if (distance(this.me.pos, npc.def.pos) <= NPC_TALK_RADIUS) return this.handInQuest(quest);
    this.hud.closePanels();
    return this.goDo({ kind: 'handin', id: npc.id, quest });
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

  /** Drop the room's socket as a bad network would (tests): false without one, or in the local mode. */
  dropConnection(): boolean {
    if (!this.conn?.drop) return false;
    this.conn.drop();
    return true;
  }

  /**
   * Jump goes down (`at`, when: the space bar, the pad's Jump; OP-084): on the ground a jump, in the
   * air the one flap more, and held on the way down a glide (jumpUp lets go). Flight is a height over the floor:
   * the owl's place, its walk and what it stands at stay as they are, and no quest counts it.
   */
  jumpDown(at = Date.now()): boolean {
    if (!this.built || this.leaving) return false;
    if (this.jumpIsDown) return true; // a second thumb on it, or the key's repeat
    this.jumpIsDown = true;
    this.jumpDownAt = Math.max(at, this.jumpUpAt, this.jumpDownAt);
    return true;
  }

  /** Jump comes up (`at`, when): on the way up the rise is cut short, and a glide ends. */
  jumpUp(at = Date.now()): void {
    if (!this.jumpIsDown) return;
    this.jumpIsDown = false;
    this.jumpUpAt = Math.max(at, this.jumpDownAt);
  }

  /** Jump pressed now and let go `holdMs` after the press takes, set at once (the tests and the console). */
  jumpFor(holdMs: number): boolean {
    if (!this.jumpDown()) return false;
    this.jumpUp(this.jumpDownAt + holdMs);
    return true;
  }

  /**
   * The own owl's flight, stepped to `now` at the flight's step. Its drawing is told each change the
   * moment it comes, and so is the room, within its allowance: a change that finds the allowance
   * spent goes with the next one that has it (as the flight stands then), and the landing is never
   * sent, since every page reckons it.
   */
  private fly(now: number): void {
    if (!this.flightClock || now - this.flightClock > FLIGHT_CATCH_UP_MS) this.flightClock = now;
    while (now - this.flightClock >= FLIGHT_STEP_MS) {
      this.flightClock += FLIGHT_STEP_MS;
      const at = this.flightClock;
      const down = this.jumpDownAt;
      const pressed = down > this.jumpTaken && down <= at;
      if (pressed) this.jumpTaken = down;
      const held = down > 0 && down <= at && (this.jumpIsDown || this.jumpUpAt > at);
      const grounded = this.flier.air.s === GROUNDED;
      this.flier = stepFlier(this.flier, { pressed, held }, groundAt(this.room.perches, this.me.pos, this.flier.air.z), this.abilities);
      const air = this.flier.air;
      const level = footingLevel(this.room, air.z);
      if (level !== this.footLevel) {
        this.footLevel = level;
        this.reaim();
      }
      if (air.s !== GROUNDED) {
        if (grounded) {
          this.flown = { n: this.flown.n + 1, peak: 0, glided: false, ms: 0 };
          this.flownFrom = at;
        }
        this.flown.peak = Math.max(this.flown.peak, air.z);
        if (air.s === GLIDING) this.flown.glided = true;
      } else if (!grounded) this.flown.ms = at - this.flownFrom;
      this.drawnAir = fall(this.drawnAir, FLIGHT_STEP_MS);
      if (airChanged(this.drawnAir, air)) {
        this.drawnAir = air;
        this.me.fly(air, at);
      }
      this.roomAir = fall(this.roomAir, FLIGHT_STEP_MS);
      if (airChanged(this.roomAir, air) && this.takeAirToken(at)) {
        const wasPerched = this.roomTold.air.s === GROUNDED && this.roomTold.air.z > 0;
        this.roomAir = air;
        this.roomTold = { air, at };
        this.conn?.send({ t: 'air', id: this.playerId, air: { z: Math.round(air.z * 10) / 10, vz: Math.round(air.vz * 10) / 10, s: air.s, f: air.f }, at });
        // A newcomer on the peer transports reads the snapshot: up on a perch, or just off one, it is told afresh (OP-084).
        if (wasPerched || (air.s === GROUNDED && air.z > 0)) this.conn?.track(this.snapshot());
      }
    }
  }

  /**
   * The footing changed under the owl (OP-084): it rose past a perch's top, or came down below one.
   * Held keys steer afresh; a walk asked for by a tap is aimed afresh at what was asked, and sent
   * only if that changes where it ends: on from a perch's face once the owl is up level with its
   * top, or stopped at the face for an owl that came down before reaching it.
   */
  private reaim(): void {
    if (this.keys?.direction()) {
      this.keyTurns = KEY_TURNS;
      this.reSteer = true;
      return;
    }
    const goal = this.walkGoal;
    if (!goal) return;
    if (distance(goal, this.me.pos) < 3) {
      this.walkGoal = null;
      return;
    }
    const f = this.footingNow();
    const to = resolveTarget({ ...this.me.pos }, goal, f.walkable, f.shut);
    if (distance(to, this.me.walk?.to ?? this.me.pos) < 3) return;
    if (distance(to, this.me.pos) >= 3) {
      this.walkTo(goal);
      return;
    }
    // No further on this footing: stand here, the goal kept for the next jump.
    this.stop();
    this.walkGoal = goal;
  }

  /** The own owl's air told to the room afresh (after a welcome): not on the floor, the room needs it. */
  private retellAir(): void {
    const air = this.flier.air;
    if (air.s === GROUNDED && air.z === 0) return;
    const at = Date.now();
    if (!this.takeAirToken(at)) return;
    this.roomAir = air;
    this.roomTold = { air, at };
    this.conn?.send({ t: 'air', id: this.playerId, air: { z: Math.round(air.z * 10) / 10, vz: Math.round(air.vz * 10) / 10, s: air.s, f: air.f }, at });
    this.conn?.track(this.snapshot());
  }

  private takeAirToken(now: number): boolean {
    const refill = ((now - this.airRefilledAt) / 1000) * AIR_SEND_PER_S;
    if (refill >= 1) {
      this.airTokens = Math.min(AIR_SEND_BURST, this.airTokens + Math.floor(refill));
      this.airRefilledAt = now;
    }
    if (this.airTokens <= 0) return false;
    this.airTokens -= 1;
    return true;
  }

  /** Another page's time on this page's clock, rebased to now when it is too far ahead to believe (as walks are). */
  private peerTime(at: number): number {
    const now = Date.now();
    return at - now > CLOCK_TOLERANCE_MS ? now : at;
  }

  /**
   * Say a prewritten phrase (its number in the phrase list): a bubble over the owl here, and the
   * number to everyone in the room. One phrase every SAY_EVERY_MS, as the room server keeps it.
   */
  say(n: number): boolean {
    if (!this.built || !isPhrase(n)) return false;
    const now = Date.now();
    if (now - this.saidAt < SAY_EVERY_MS) return false;
    this.saidAt = now;
    this.bubbles?.say(this.me, n, now);
    this.conn?.send({ t: 'say', id: this.playerId, n });
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
    this.changeLook(putOn(this.look, slot, variant));
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
  walkTo(target: Vec2, fromKeys = false, goal: Vec2 | null = fromKeys ? null : target): boolean {
    if (!this.built) return false;
    const f = this.footingNow();
    const to = resolveTarget({ ...this.me.pos }, target, f.walkable, f.shut);
    // Kept for a jump to carry on (OP-084): a perch's top asked for from the floor stops at its face.
    this.walkGoal = goal;
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
      if (spot && distance(pos, spot.pos) <= spot.reach + REACH_SLACK / 2 && this.atLevel(spot)) this.runErrand(errand);
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
        if (this.realmClosed(door.to.room)) {
          // The arch into a gated realm the keepers have not opened: its blockade's phrase, and no way through.
          if (door.closedSign && walkFinished) this.hud.toast(door.closedSign);
          continue;
        }
        if (!takesDoorway(door.rect, this.me.walk?.to ?? null, this.keyWalk, this.errand !== null)) continue;
        if (door.id === 'gate') {
          void this.throughGate(door);
          return;
        }
        // Out of a nest, the owl comes back out by the street door it went in by.
        const spawn = isNestRoom(this.room.id) && door.to.room === STREET_ROOM ? streetSpawnBack(this.cameFrom) : door.to.spawn;
        void this.goTo(door.to.room, spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined }, LEAVE_FADE_MS, laneThrough(this.room, door, pos));
        return;
      }
      if (this.interactions[door.id]) spots.push(door.id);
      if (door.closedSign && walkFinished) this.hud.toast(door.closedSign);
      if (walkFinished && cabinetAt(this.room.id, door.id)?.live === false) this.hud.toast(CABINET_OFF);
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

  /**
   * The lobby's ticket booth: tickets sell in the store; the window shows the tickets on this device.
   * On opening night (C42) it says every pass is half price, and an Opening Night Ticket that went
   * through the gate tonight offers its pass.
   */
  private async openBooth(): Promise<void> {
    const tickets = this.transport.tickets;
    const [entry, wallet] = await Promise.all([this.entry(), tickets ? tickets.wallet().catch(() => null) : Promise.resolve(null)]);
    if (this.leaving) return;
    const ready = (wallet ?? []).filter((t) => t.freePass === 'ready');
    const links = tickets ? await Promise.all(ready.map(async (t) => [t.id, await tickets.freePass(t.id).catch(() => null)] as const)) : [];
    if (this.leaving) return;
    this.hud.openBooth({
      ticketsUrl: this.cfg.ticketsUrl || null,
      ...entry,
      wallet,
      ...(tickets
        ? {
            share: (id: string) => tickets.share(id),
            openingNight: tickets.openingNight(),
            passLinks: Object.fromEntries(links.filter((l): l is readonly [string, string] => l[1] !== null)),
            watchPass: (id: string) => this.hud.watchFreePass(() => this.passCame(id)),
          }
        : {}),
    });
  }

  /** Whether the pass this Opening Night Ticket claimed has come (C42). */
  private async passCame(id: string): Promise<boolean> {
    const wallet = (await this.transport.tickets?.wallet()) ?? [];
    return wallet.find((t) => t.id === id)?.freePass === 'claimed';
  }

  /** Opening night (C42): after the ticket card, the half-price pass its Opening Night Ticket may claim tonight. */
  private async offerFreePass(id: string): Promise<void> {
    const tickets = this.transport.tickets;
    if (!tickets) return;
    const wallet = await tickets.wallet().catch(() => []);
    if (wallet.find((t) => t.id === id)?.freePass !== 'ready') return;
    const link = await tickets.freePass(id).catch(() => null);
    // The ticket card has had its moment: the offer follows it.
    if (link) setTimeout(() => this.hud.offerFreePass({ link, claimed: () => this.passCame(id) }), 2700);
  }

  /**
   * The lobby's turnstiles scan a ticket this device holds (its first scan starts its time, C35):
   * the ticket card flips up and the owl goes on into the hub. Without a ticket that goes through,
   * the turnstiles let everyone in while the gate is open; once the park takes tickets
   * (GATE=ticket) they send the owl back out of the turnstile it tried and say why. The owl keeps its
   * lane: it stands still while the turnstiles decide and comes out in the hub as far across (OP-124).
   */
  private async throughGate(door: DoorDef): Promise<void> {
    const to = door.to;
    if (this.passingGate || this.leaving || !to) return;
    this.passingGate = true;
    this.me.walk = null;
    const lane = laneThrough(this.room, door, this.me.pos);
    const scan: ScanReply = this.transport.tickets ? await this.transport.tickets.scan() : { ok: false, reason: 'none' };
    if (this.leaving) return;
    const entry = await this.entry();
    if (this.leaving) return;
    if (!scan.ok && entry.gate === 'ticket' && !entry.admitted) {
      this.hud.toast(gateRefusal(scan.reason, scan.kind), 4500);
      this.walkTo({ x: this.me.pos.x, y: door.rect.y + door.rect.h + 70 });
      this.time.delayedCall(1500, () => {
        this.passingGate = false;
      });
      return;
    }
    this.pieces.gate?.react();
    if (scan.ok) this.hud.showTicket(gateCard(scan, Date.now()));
    else this.hud.toast('Welcome to Owl Park!', 2600);
    if (scan.ok && scan.kind === 'opening-night') void this.offerFreePass(scan.id);
    // The card stays up a moment before the walk on into the hub.
    this.time.delayedCall(scan.ok ? 1400 : 700, () => void this.goTo(to.room, to.spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined }, LEAVE_FADE_MS, lane));
  }

  private openShop(): void {
    if (this.cfg.shopUrl) window.open(this.cfg.shopUrl, '_blank', 'noopener');
    else this.hud.toast('The gift shop opens soon.');
  }

  private async goTo(roomId: string, spawn: string, from: RoomStart['from'], fadeMs = LEAVE_FADE_MS, lane?: Lane, via?: RoomStart['via']): Promise<void> {
    if (await this.leaveRoom(fadeMs)) this.scene.start('room', { room: roomId, spawn, from, lane, via } satisfies RoomStart);
  }

  /** The owl stops, the room fades and its connection closes. False when the room is already being left. */
  private async leaveRoom(fadeMs = LEAVE_FADE_MS): Promise<boolean> {
    if (this.leaving) return false;
    this.leaving = true;
    this.hud.setHints([]);
    this.me.walk = null;
    for (const npc of this.npcs.values()) npc.setApproach(false, true);
    this.cameras.main.fadeOut(fadeMs, 12, 30, 54);
    await new Promise<void>((r) => this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => r()));
    await this.teardown();
    return true;
  }

  private async teardown(): Promise<void> {
    this.fitOverlay?.destroy();
    this.fitOverlay = null;
    this.endDecorating(false);
    this.decor?.destroy();
    this.decor = null;
    // Out of the nest with Your owl open at its mirror (its owner closed it, say): it closes with the room.
    if (this.mirrorFrame && this.hud.isOwlOpen()) this.hud.toggleOwl();
    this.mirror?.destroy();
    this.mirror = null;
    this.mirrorFrame = null;
    this.streetSigns?.destroy();
    this.streetSigns = null;
    // The nest's welcome stays in the nest.
    this.hud.setNestWelcome(false);
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
    this.arcade?.destroy();
    this.arcade = null;
    this.climb?.destroy();
    this.climb = null;
    this.bubbles?.clear();
    this.bubbles = null;
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
    if (seen.mine !== undefined) {
      this.nestMine = seen.mine;
      this.showWaysOut();
      // The first time this device's owl is home: the mirror's glint and the welcome, once each.
      if (seen.mine) this.firstTimeHome();
    }
    if (seen.owned) this.owned = seen.owned;
    if (seen.gift) this.nestGift = { taken: seen.gift.taken };
    this.showNest(seen.nest);
  }

  private showNest(nest: NestView): void {
    this.nestView = nest;
    this.decor?.apply(nest.layout);
    if (this.decorating) this.refreshDecorate();
  }

  /** The nest turned the visitor away (closed to visitors, or no such nest) or closed while it was inside. */
  private onNestClosed(): void {
    if (this.leaving) return;
    this.hud.toast(NEST_WORDS.closedForNow, 3000);
    void this.goTo(STREET_ROOM, streetSpawnBack(this.cameFrom), undefined);
  }

  /** A gated realm the keepers have not opened (the realms switch). Rooms without `gated` are never closed this way. */
  private realmClosed(roomId: string | undefined): boolean {
    return !!roomId && ROOMS[roomId]?.gated === true && !this.realms.open.includes(roomId);
  }

  /**
   * The floor behind each closed realm's blockade (OP-127): the way into the arch is floor for when
   * the realm opens, but while it is closed an owl stops at the blockade's foot (the door's marker)
   * instead of walking in behind it.
   */
  private shutFloor(): Rect[] {
    return this.room.doors.flatMap((d) => (d.marker && this.realmClosed(d.to?.room) ? [{ x: d.rect.x, y: 0, w: d.rect.w, h: d.marker.y + 2 }] : []));
  }

  /** Where the owl can walk at the height it is now (OP-084, perches.ts): the floor and the perch tops at or below it, less the floor shut for now. */
  private footingNow(): { walkable: Polygon[]; shut: Shut[] } {
    return footing(this.room, this.flier.air.z, this.shutFloor());
  }

  /** What the owl stands on, or would come down on, now: a perch's top, else the floor (0). */
  private groundNow(): number {
    return this.groundUnder(this.me.pos, this.flier.air.z);
  }

  /** Whether the owl is level with a thing that may sit up on a perch (OP-084): on that perch, or on the floor for a thing on the floor. */
  private atLevel(thing: Raised): boolean {
    return sameLevel(this.groundNow(), thing);
  }

  /** The realms switch, as the welcome or a later frame said it: the hub's arches draw open or closed, and the Menu map agrees. */
  private setRealms(realms: RealmsSettings): void {
    this.realms = realms;
    this.hud.setOpenRealms(realms.open);
    for (const [id, arch] of Object.entries(this.pieces.arches ?? {})) {
      const closed = this.realmClosed(this.room.doors.find((d) => d.id === id)?.to?.room);
      arch.blockade?.setVisible(closed);
      arch.glow.setVisible(!closed);
    }
  }

  /** The realm this owl is in (or was entering) is closed: back to the hub, by the arch it came through. */
  private onRealmClosed(sign: string): void {
    if (this.leaving) return;
    this.hud.toast(sign || 'Pardon Our Feathers', 3000);
    const back = `from-${this.room.id}`;
    void this.goTo('hub', Object.hasOwn(ROOMS['hub']?.spawns ?? {}, back) ? back : 'default', undefined);
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
    this.loadThumbs();
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
    this.refreshDecorate();
  }

  /** The Decorate sheet shows the nest as it stands now, and the pictures of any pieces new to it load. */
  private refreshDecorate(): void {
    this.hud.updateDecorate(this.decorateView());
    this.loadThumbs();
  }

  /** The owner's pieces' pictures load as Decorate opens (OP-129: not with the nest), and the sheet shows them once they are here. */
  private loadThumbs(): void {
    const arts = this.owned.flatMap((id) => getFurniture(id)?.art ?? []);
    if (!this.decor || arts.every((art) => this.textures.exists(art))) return;
    void this.decor.load(arts).then(() => this.decorating && this.hud.updateDecorate(this.decorateView()));
  }

  /** A piece's picture for the Decorate sheet, drawn once per room (none while it loads). */
  private thumb(art: string): string | null {
    const had = this.thumbs.get(art);
    if (had) return had;
    const src = pieceThumb(this, art);
    if (src) this.thumbs.set(art, src);
    return src;
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
    const f = this.mirrorFrame;
    if (f) {
      // The stage's rectangle, zoomed in on the owl (and its mirror, in a nest), from a hat's height to the floor.
      const k = this.cfg.pixelRatio;
      cam.setViewport(Math.round(f.x * k), Math.round(f.y * k), Math.max(1, Math.round(f.w * k)), Math.max(1, Math.round(f.h * k)));
      cam.setZoom(Math.max(0.1, Math.min((f.w * k) / 340, (f.h * k) / 280, 4)));
      const x = this.mirror ? (this.me.pos.x + NEST_MIRROR.x) / 2 : this.me.pos.x;
      cam.centerOn(x, this.me.pos.y - 90);
      return;
    }
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
