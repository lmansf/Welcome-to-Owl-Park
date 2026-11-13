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
  LIFTED,
  GROUNDED,
  LEFT_PARK_SPAWN,
  LOBBY_ROOM,
  KIND_RULES,
  ACTIVE_SLOTS,
  MAX_ACTIVE_QUESTS,
  NEST_SPOTS,
  NEST_WORDS,
  NPC_EMOTE_RADIUS,
  NPC_TALK_RADIUS,
  PICKUP_CLIENT_RADIUS,
  PUZZLE_REACH,
  PROTOCOL_VERSION,
  REACH_SLACK,
  ROOM_H,
  ROOM_W,
  RARITY_COLOURS,
  RARITY_NAMES,
  SAY_EVERY_MS,
  isStreetRoom,
  streetOf,
  STREET_ROOM,
  TREE_STREET_ROOM,
  arrivalPoint,
  backgroundTiles,
  isPaintable,
  mapOf,
  seenFromSide,
  realmShut,
  speciesOf,
  tileFade,
  tilePlacement,
  cabinetAt,
  closestPointOnSegment,
  distance,
  entryPoint,
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
  snapToWalkable,
  followsOn,
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
  type Perch,
  type PlayerState,
  type QuestBoard,
  type QuestUpdate,
  type Polygon,
  type Raised,
  type Rect,
  type Shut,
  type RoomDef,
  type RoomTile,
  type Vec2,
  type Walk,
  type Wear,
  REALMS_DEFAULTS,
  type RealmsSettings,
  flightFor,
  ON_GROUND,
  airChanged,
  fall,
  newFlier,
  slopeUnder,
  spawnTop,
  stepFlier,
  FRESH_DASH,
  dashEnd,
  dashHeading,
  dashRefusal,
  holdsDash,
  courseOfRoom,
  endsCourse,
  placeShown,
  airOut,
  liftAt,
  thermalAt,
  spendDash,
  windAt,
  windEnd,
  type WindCurrent,
  type Air,
  type Flier,
  type FlightAbilities,
  TRAVEL_WORDS,
  canTravel,
  needsGate,
  travelAfter,
  travelLanding,
  type TravelRefusal,
  type TravelState,
  WAY_SHORT_PX,
  wayAround,
  PERCH_SLACK,
  doorLabel,
  doorTarget,
  SETUP_WORDS,
  type LockView,
  type PuzzleStep,
  type PuzzleSymbol,
  type PuzzleView,
  type WalkMap,
  voteRealmAt,
  FROM_STUMP_SPAWN,
  STUMP_ROOM,
  isPartyRoom,
  throughGate as walkedThroughGate,
} from '@owl-park/shared';
import type { QuestState } from '../collect/quests';
import type { ActivityLink, ActivityPushes, CourseLink, NestLink, NestPushes, NestSeen, PuzzleArgs, PuzzleReply, QuestLink, QuestPushes, QuestReply } from '../collect/service';
import type { CollectionState } from '../collect/state';
import type { TaskState } from '../collect/tasks';
import type { ParkConfig } from '../config';
import { saveLook } from '../identity';
import { OPEN_ENTRY, type ConnectionStatus, type Entry, type ParkTransport, type RoomConnection, type RoomHandlers, type ScanReply, type WalletEntry } from '../net';
import type { Ribbon } from '../ui/ribbon';
import { openPosOverlay, type PosOverlay } from '../ui/posOverlay';
import { keeperToken } from '../net/keeper';
import type { EscapeLink } from '../net/transport';
import type { Away } from '../ui/away';
import { castVote } from '../net/vote';
import { COURSES, GATED_ROOMS, NEST_MIRROR, ROOMS, TREE_ARRIVAL, getRoom, groundOf, roomFor, roomOnMap } from '../rooms';
import { drawKit, drawnRoom } from './kitView';
import { TREE_RAISED_BAND, dressTreeRoom, type TreeDress, type TreeDressing } from './treeView';
import type { DecorateView } from '../ui/decorate';
import type { Hud } from '../ui/hud';
import type { SettingsStore } from '../settings';
import { alongTheFloor, holdsUp, type Keys } from '../ui/keyboard';
import type { LoadScreen } from '../ui/loader';
import type { PreviewFrame } from '../ui/owlBuilder';
import { PASS_AFTER_DAY_TICKET, gateCard, gateRefusal, offerOnce, type FreePassOffer } from '../ui/tickets';
import { SPECTATOR_WORDS, createOfferPacer, createOnceHint, turnstileWay, type OfferPacer } from '../ui/spectator';
import type { Opener } from '../ui/checkout';
import { earlyPreview } from '../ui/preview';
import { ActivityLayer } from './activities';
import { PartyLayer } from './partyLayer';
import { flagOn } from '../flags';
import { addAmbience, addSetPieces, ensureFxTextures, type SetPieces } from './ambience';
import { arcadeFor, type Arcade } from './arcade';
import { PORTAL_OFF, climbFor, type Climb } from './climb';
import { UpdraftLeaves } from './updraftLeaves';
import { WindStreaks } from './windStreaks';
import { BrushInk } from './brushInk';
import { NeonSigns } from './neonSigns';
import { courseFor, drawPlaceholderRoom, type Course } from './course';
import { ESCAPE_WORDS, escapeFor, type EscapeDoorway, type EscapeHollow } from './escapeRoom';
import { TRIAL_BACKDROP_VEIL, trialBackdropVeiled } from './skinTrial';
import { PUZZLE_ART_KEYS, artScale, drawnAsSizeBox, drawsSkinTrial, loadArt, opensSoft, prefetchRoomArt, releaseArt, roomArtCap, roomArtKeys, roomOpeningArt, sharpCopy, sharpenArt } from './art';
import { SpeechBubbles } from './bubbles';
import { backWaits, carriedIn, doorwayUnder, doorwaysOff, heldAtFall, roomsAhead, stillCarried, stillHeldSinceFall, takesDoorway, upCounts, type HeldAtFall } from './doors';
import { PLAY_SPOTS, ROOTS_SPOT, TriedDoors, doorSpot, leadsToPlay, playSpotsAt, trailTo, type PlaySpot } from './featherTrail';
import { CALLS, GUARDIAN_ROOM, guardianShade, type OwlSeen } from './guardian';
import { GuardianView, type GuardianState } from './guardianView';
import { FIRST_FLIGHT_MARK, glidedOff, hallTipFor, hallTips } from './hallTips';
import { HALL_WORDS } from '../ui/hallWords';
import { FeatherTrail } from './featherTrailView';
import { admitTarget } from './gateAdmit';
import { enteredRoom, walkingMap } from './walkingMap';
import { storedKeeper } from '../net/keeper';
import { FitOverlay } from './fitOverlay';
import type { LedgePainter, PaintDebug } from './ledgePainter';
import { doorHintTarget, nearTargets, placeHints, sideChipWords, signFocus, signWaits, touchBottom } from './hints';
import { itemScale } from './items';
import { FLOOR_KINDS, FloorThing } from './FloorThing';
import { LeafPile, featherFind } from './LeafPile';
import { NestMirror } from './mirror';
import { NestDecor, pieceThumb } from './nest';
import { firstGlint, firstNestWelcome, streetDoors, streetSpawnBack, type StreetDoor } from './nestPlan';
import { NpcOwl } from './Npc';
import { OWL_SCALE, OWL_W, Owl } from './Owl';
import { QuestItemMarker, SpotGlow } from './QuestItem';
import { PuzzleMarker, markKey, type PuzzleMarkKind, type PuzzleMarkLook } from './PuzzleMarker';
import { StreetDoors, addNestsSign, addParkSign } from './street';
import { cameraBounds, followLead, type CoveredEdges } from './hudInset';
import { RISE_HEAD, lookBetween, openingAt, restAt, riseBack, screenZoom, townZoom, wholeLook, wholeZoom, type Look } from './townView';
import { SizeLabels } from './sizeLabels';
import { CourseTipSigns } from './courseTipSigns';
import { courseTips, tipFor } from './courseTips';
import { DoorSigns } from './doorSigns';
import { ReachPrompt, promptPlace, promptWords } from './reachPrompt';
import { SeeThrough } from './seeThroughArt';
import { parkSfx, type Sfx } from './sfx';
import { STEP_MOST_MS, sideCamAt, sideCamStep, speedAlong, type SideCam } from './sideCamera';
import { airCues, type CueName } from './sfxCues';
import { sideEdges } from './sideEdges';
import { drawWalkFloor } from './walkFloor';
import { BOWL_BEYOND, BOWL_SHADOW, drawBowl } from './bowlView';
import { artTrialFor, drawArtTrial } from './artTrial';
import { drawEdges } from './edgeView';
import { drawSkirts } from './plazaSkirt';
import { setVignette } from './vignette';

export interface RoomStart {
  room: string;
  spawn: string | undefined;
  /** Where we came from, so a full room can send us back. */
  from?: { room: string; spawn: string | undefined } | undefined;
  /** How far across the doorway the owl came through, so it comes out as far across the doorway back (OP-124). */
  lane?: Lane | undefined;
  /** How many times the walking keys had been let go as the owl left the last room (Keys.rests): the way back waits on one more (doors.ts, backWaits). */
  rests?: number | undefined;
  /** Whether the room the owl left was seen from the side: a direction held across a change of view is not a walk (OP-346; doors.ts, carriedIn). */
  side?: boolean | undefined;
  /** Come by travel from the Menu's map (OP-130): into the park, the room server lets it in only once it has walked through the gate. */
  via?: 'travel' | undefined;
  /**
   * Back from the store's checkout in a page of its own (OP-190): the bought ticket, on the owl now.
   * Play lands the owl in front of the turnstiles, and it goes through them with it by itself.
   */
  ticket?: WalletEntry | undefined;
}

/** What an owl is told the first time it stands in a thermal (OP-340): the one line of words the thermal has. */
const THERMAL_WORDS = 'Warm air rises here. Jump and keep holding to ride it up.';
/** How far a tap may drift before it counts as a drag (game pixels). */
const TAP_SLOP = 16;
/** How long the room fades out on the way to another. */
const LEAVE_FADE_MS = 220;
/** How long a room fades in as it comes in. The opening look (townView.ts) counts its time from the end of it. */
const ROOM_FADE_IN_MS = 350;
/** How long the room takes to come back after a fall in a course blinks it dark (OP-343). */
const FALL_BLINK_MS = 260;
/** The registry's word that the nightly restart sent the owl home (OP-181): the home screen says so once. */
export const RESTARTED_KEY = 'restarted';
/** The registry's word that the owl's ticket ran out mid-visit (OP-237): the home screen says so once. */
export const TICKET_ENDED_KEY = 'ticketEnded';
/** The registry's closed card (OP-205): the words the home screen shows while the park is closed for setup. */
export const SETUP_KEY = 'setup';
/** The restart's notice stays up until the room closes, near enough (the room waits ten seconds, OP-181). */
const RESTART_NOTICE_MS = 9_000;
/** Where Play and travel home land the owl in its own nest (OP-105, OP-130): before its mirror. */
export const NEST_SPAWN = 'mirror';
/** Travel from the map fades out slower than a doorway, so going home or across the park is not a jolt (OP-114, OP-130). */
export const NEST_FADE_MS = 400;
/** The feather trail (OP-307): how long after the room is in it comes out, and how long an owl stands still with none out before it comes again. */
const TRAIL_AFTER_MS = 1200;
const TRAIL_IDLE_MS = 8000;

/** This device's doorways tried (OP-307), read once. */
let tried: TriedDoors | null = null;
function triedDoors(): TriedDoors {
  if (tried) return tried;
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {
    storage = null;
  }
  return (tried = new TriedDoors(storage));
}
/** Travel from the map (OP-305): the wing beats the owl takes off with, and how far it rises as the room fades (room px). */
const TRAVEL_BEAT = { ms: 200, beats: 2 } as const;
const TRAVEL_RISE = 120;
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
  'bird-bath': ['Splash! You shake the water off every feather.', 'The water is cold and sparkly. Very refreshing.', 'You splash so hard the moon wobbles in the water.'],
  mushroom: ['Boing! The caps are as springy as a cushion.', 'You bounce, and a puff of glowing spores floats up.', 'Squish, boing. The mushrooms do not seem to mind.'],
  telescope: ['You spot a star shaped like an owl. It winks back.', 'The moon is so close you can see its craters.', 'Far off, a shooting star. Make a wish.'],
  shiny: ['A shiny button! You tuck it under a wing.', 'A glinting pebble, smooth as glass. Yours now.', 'Something shiny. You will find a good place for it.'],
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

/** A room's connection as it opens (OP-129), and what the room pushes about quests, activities and nests. */
interface Joining {
  conn: Promise<RoomConnection>;
  pushes: QuestPushes & ActivityPushes & NestPushes;
}

/** `handlers` with each call put off while `waiting()` gives a list: the call joins it, to run in turn when the list is played. */
function heldBack<T extends object>(handlers: T, waiting: () => Array<() => void> | null): T {
  const held: Record<string, unknown> = {};
  for (const [name, handler] of Object.entries(handlers) as Array<[string, (...args: unknown[]) => unknown]>) {
    held[name] = (...args: unknown[]) => {
      const list = waiting();
      if (list) list.push(() => void handler(...args));
      else handler(...args);
    };
  }
  return held as T;
}
/** How far hint chips keep from the screen's edges, in CSS pixels (clear of the HUD's top and bottom bars). */
const HINT_INSETS = { top: 64, bottom: 84, side: 30 };
/** On touch screens the thumbstick and the face buttons fill the bottom corners: hints keep above them. */
const TOUCH_HINT_BOTTOM = 190;
/** Seen from the side, hints point only at doorways within this far above or below the view (room px): a screen's height. */
const SIDE_HINT_REACH = ROOM_H;
const TOUCH_SCREEN = globalThis.matchMedia?.('(pointer: coarse)').matches ?? false;
/** Hint chip colours: doorways glow like the realm they lead to, spots are gold. */
const DOOR_TINTS: Record<string, string> = { market: '#FF2AA1', arcade: '#00E5FF', grove: '#FFB347', glass: '#9FD0FF' };
/** The action that goes through the doorway an owl stands in, seen from the side (OP-212). */
const GO_IN = 'Go in';
/** The up arrow over that doorway (OP-212): its disc's radius, how far over the doorway's floor (room px, at owl scale 1) and its bob. */
const UP_HINT = { r: 20, over: 175, bob: 5 } as const;
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
  /** The room's art tiles that scroll at a rate of their own (OP-156), put back in place when the camera is fitted. */
  private parallax: Array<{ t: RoomTile; img: Phaser.GameObjects.Image }> = [];
  /** What a room of the tree drew to read at a glance (OP-173), for the debug state. */
  private treeDress: TreeDressing | null = null;
  /** The point the camera follows in a room seen from the side: where the side camera looks (OP-351). */
  private readonly camAt = { x: 0, y: 0 };
  private conn: RoomConnection | null = null;
  /** The leaves in the room's updrafts, drawn (OP-226); none in a room without them. */
  private updrafts: UpdraftLeaves | null = null;
  /** The streaks in the room's wind currents, drawn (OP-275); none in a room without them. */
  private winds: WindStreaks | null = null;
  /** Times this page's owl was caught by a wind current in this room, for the tests. */
  private windRides = 0;
  /** The ink the room's brush stones paint (OP-235): which strokes stand, and their art; none in a room without them. */
  private brush: BrushInk | null = null;
  /** The room's neon signs on their circuits (circuit.ts): which are lit, and their art; none in a room without them. */
  private signs: NeonSigns | null = null;
  /** Which strokes and signs stood when the room's perches were last set (standPerches). */
  private standKey = '';
  /**
   * What the room says while its art loads (OP-129): the page joins as the art starts to load, and
   * each word waits here, in order, until the scene is built and holds the connection. Null after.
   */
  private heard: Array<() => void> | null = null;
  private leaving = false;
  private cfg!: ParkConfig;
  private hud!: Hud;
  private transport!: ParkTransport;
  private playerId!: string;
  private look!: OwlLook;
  private atIdol = false;
  /** The Realm Vote spot the owl stands in: the realm it votes for (RoomDef.idols, or the room's one idol). */
  private idolRealm: string | null = null;
  /** Going through the lobby's turnstiles (the welcome is playing, or the gate is checking the pass). */
  private passingGate = false;
  /** The ticket bought in checkout's own page that Play came in with (OP-190): through the turnstiles once the room is up. */
  private cameWith: WalletEntry | null = null;
  /**
   * The owl walks this room as a spectator (OP-191), as its welcome said (kept in the registry from room
   * to room until the next welcome says): it plays, but quests, the stores and the vote are locked.
   */
  private spectator = false;
  /** A bought ticket is making this spectator a full visitor in place (OP-191): its scan, then `admit` (or a new socket). */
  private admitting = false;
  /** Where the owl was at the last look for doorways, and the walk it was on: a doorway takes it from where its step crossed in (OP-124). */
  private doorLook: { pos: Vec2; walk: Walk | null } | null = null;
  /** What the owl can do where it stands (spots, NPC owls, interactables), in order: E runs the first. */
  private actions: Action[] = [];
  private keys: Keys | null = null;
  /** The direction the held keys walk in. */
  private keyDir: Vec2 | null = null;
  /** The walk under way came from the keys, so letting go of them stops it. */
  private keyWalk = false;
  /**
   * The keys' kind of walk with no key held (walkAsKeys, for the browser tests): it goes on to its end
   * instead of stopping, and still takes no doorway, until a key or a tap walks the owl again.
   */
  private coasting = false;
  /** When up was last pressed (the up key or the Go in action, OP-212; 0 for not since): in a side view, through the doorway the owl stands in. */
  private upAt = 0;
  /** The up arrow over the doorway the owl stands in (a side view, OP-212), and which doorway it is over now. */
  private upHint: Phaser.GameObjects.Container | null = null;
  private upHintDoor: string | null = null;
  private keyTurns = 0;
  /** The hint chips last sent to the HUD, so an unchanged frame touches no DOM. */
  private hintsShown = '';
  /** The doorway whose sign shows, seen from above (OP-309). */
  private signFocused: string | null = null;
  /** The doorway the owl came in by, while its sign is kept back (OP-337, hints.ts signWaits): until the owl has stepped out of its reach once. */
  private signKept: string | null = null;
  /** The view, screen and doors the hints were last placed for: unchanged, nothing is placed again (OP-204). */
  private hintsFor: { at: string; doors: unknown } = { at: '', doors: null };
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
  /** The owl has not let go of the walking keys since it came in: the doorway back where it came from waits (doors.ts, backWaits). */
  private backWaiting = false;
  /** How many times the walking keys had been let go as the owl took the doorway here (Keys.rests). */
  private restsThen = 0;
  /** The direction held as the owl came in across a change of view (doors.ts, carriedIn): not a walk until it is let go or points elsewhere. */
  private carried: Vec2 | null = null;
  /** The push held as a course's fall put the owl back (doors.ts, heldAtFall): not a walk until it is let go or points elsewhere. */
  private fallHeld: HeldAtFall | null = null;
  /** The room's tall standing art, each see-through while the visitor's own owl is behind it (seeThrough.ts); none in a room seen from the side. */
  private seeThrough: SeeThrough | null = null;
  /** The guardian alive at the heart of the Great Hollow (OP-359): only there, and only behind `?guardian=1` (flags.ts). */
  private guardian: GuardianView | null = null;
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
  /** What the room server said of the owl's map as this room was come into, until a room has the owl (takeKeptTravel, OP-358). */
  private travelKept: { state: TravelState; room: string; spawn: string | undefined } | null = null;
  private collection!: CollectionState;
  private quests!: QuestState;
  private link: QuestLink | null = null;
  private readonly npcs = new Map<string, NpcOwl>();
  /** Things shared by the room: leaf piles, and the shiny things out on a plaza's floor (gone for everyone once used). */
  private readonly piles = new Map<string, LeafPile | FloorThing>();
  private readonly glows = new Map<string, SpotGlow>();
  /** Things to use out on a plaza's floor (plazaFloor.ts): bird baths, mushrooms, telescopes and shiny things. */
  private readonly things = new Map<string, FloorThing>();
  private readonly items = new Map<string, QuestItemMarker>();
  /** Pickups in flight (by item key), and when a failed one may be retried. */
  private readonly gathering = new Map<string, number>();
  /** Puzzle quests' pieces in this room (OP-255): lock posts, clues and keys, by mark key. */
  private readonly puzzleMarks = new Map<string, PuzzleMarker>();
  /** Puzzle pieces being worked, by mark key, and when a failed try may be retried. */
  private readonly puzzleBusy = new Map<string, number>();
  /** Puzzle quests whose run this room has asked for. */
  private readonly puzzlesAsked = new Set<string>();
  /** The lock the owl last walked up to: its pad (or its key line) shows once per approach. */
  private atLock: string | null = null;
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
  /** The feather trail toward a doorway not tried yet (OP-307), and whether Settings has it on; none in a course. */
  private trail: FeatherTrail | null = null;
  private trailOn = true;
  /** When the owl last walked, or the trail was last laid: standing still a while lays it again once it is used up. */
  private trailIdleAt = 0;
  private saidAt = Number.NEGATIVE_INFINITY;
  /** The visitor's own flight (OP-084), stepped from Jump at the flight's step on this page's clock (Date.now). */
  private flier: Flier = newFlier();
  /** What the owl can do in the air: all of it until the lock-and-key game (OP-115) has them earned; both flaps in the tree (OP-239). */
  private get abilities(): Readonly<FlightAbilities> {
    return flightFor(seenFromSide(this.room) ? 2 : 1);
  }
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
  /**
   * Where a tap asked the owl to go that a straight walk stops short of, at a bend in the floor
   * (OP-148): the owl walks there in legs, each set off as the one before ends.
   */
  private wayTo: Vec2 | null = null;
  private footLevel = 0;
  /** Held keys to steer afresh at the next frame, the footing having changed under a walk they own. */
  private reSteer = false;
  /** What an owl comes down on where it is in this room: the floor, or a perch's top (OP-084). */
  private readonly groundUnder = (p: Vec2, z: number): number => groundAt(this.room.perches, p, z);
  private readonly slopeBelow = (p: Vec2, z: number) => slopeUnder(this.room.perches, p, z);
  private airRefilledAt = 0;
  /** The owl's take-offs as its flight steps them (for tests): how many on this page, and the last one's top, whether it glided and how long it was up. */
  private flown = { n: 0, peak: 0, glided: false, ms: 0 };
  private flownFrom = 0;
  /** Where the flight under way left the ground, and how high that was (a perch's top, 0 on the floor). */
  private flownOff: { pos: Vec2; z: number } = { pos: { x: 0, y: 0 }, z: 0 };
  /** Whether this room has the Great Hollow's root tips (hallTips.ts), and whether this device's owl has made its first glide off a root (OP-347). */
  private rootTips = false;
  private firstFlown = false;
  /** When the HUD was last told where the owl is on the screen (the thumbstick's quiet, OP-349). */
  private owlToldAt = 0;
  /** Where the room put the own owl when it last let it in (its welcome), until the room is caught up with the owl (OP-138). */
  private roomHas: Vec2 | null = null;
  /** Where the owl came into this room. */
  private arrivedAt: Vec2 = { x: 0, y: 0 };
  /** The position overlay (OP-138, `?pos=1`), once the keepers' key checks out. */
  private posOverlay: PosOverlay | null = null;
  private tasks!: TaskState;
  /** The room's activities (lanterns, the stage quiz, fishing, the copy game) and the link to run them. */
  private play: ActivityLayer | null = null;
  /** The party game (OP-314), behind the friends preview: the Old Stump here, or a game's own room. */
  private party: PartyLayer | null = null;
  /** The arcade's cabinets, score wall and runs, in the arcade only. */
  private arcade: Arcade | null = null;
  /** The stained-glass climb from its portal, in the glass realm only. */
  private climb: Climb | null = null;
  /** The parkour course, in a room that is one of its acts (OP-224); the owl holds the dash there. */
  private course: Course | null = null;
  /** The sealed hollow (OP-310, `?friends=1`): its run in an escape room, its doorway in the grove; the link to both. */
  private hollow: EscapeHollow | null = null;
  private doorway: EscapeDoorway | null = null;
  private escapeLink: EscapeLink | null = null;
  private courseLink: CourseLink | null = null;
  /** Dashes this page made in this room, for the tests. */
  private dashes = 0;
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
  /** The labels over the size boxes (`?sizes=1`): one per piece in the room. */
  private sizeLabels: SizeLabels | null = null;
  /** The signs naming where the doorways lead, in a room seen from above. */
  private doorSigns: DoorSigns | null = null;
  /** A course's tips in this room (OP-344): words at the first of each thing a visitor has to understand. */
  private tips: CourseTipSigns | null = null;
  /** The prompt over the visitor's own owl (OP-344): what it can do where it stands, and the key that does it. */
  private reach: ReachPrompt | null = null;
  /** Whether this room draws its walkable floor plainly: every room seen from above. */
  private floorShown = false;
  /** How many pieces shape this room's edges (edges.ts), drawn. */
  private edgesDrawn = 0;
  /** The ledge painter (OP-156, `?paint=1` with a keeper's token), over a room of the tree. */
  private painter: LedgePainter | null = null;
  /** The room as the park has it: `room` is this with the painter's draft's ledges while the painter tries them (OP-156). */
  private ownRoom!: RoomDef;
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
  /**
   * The opening look under way (OP-336, townView.ts): when the room has faded in (its time is counted from
   * then), and when the player first moved, in that time (which brings it in early); null when there is
   * none. The camera is set each frame while it lasts.
   */
  private opening: { at: number; cutAt: number | null; covered: CoveredEdges } | null = null;
  /** The park's sounds for what this visitor's own owl does (OP-350, sfx.ts), under the Settings switch "Sounds". */
  private readonly sfx: Sfx = parkSfx(() => (this.registry?.get('settings') as SettingsStore | undefined)?.get().sound ?? true);
  /**
   * The side camera (OP-351, sideCamera.ts): in a room seen from the side the view leads the owl's
   * travel, holds its height through a jump and eases by the clock. Where it looks now, null until the
   * room's first frame and in a room seen from above, where the camera is on the owl itself.
   */
  private sideCam: SideCam | null = null;
  /** For the side camera: when it last looked (ms), where the owl was then and how fast it was travelling along (px/s). */
  private sideCamSeen = { at: 0, x: 0, vx: 0 };
  /**
   * The owl's ride on a thermal, from the moment it was lifted until it is down again: the height it
   * was taken at, the thermal's top, what the HUD covered, and whether the camera has been drawn back
   * for it yet (townView.ts, riseBack). While it is, the camera is set each frame; null, it follows as ever.
   */
  private rise: { from: number; top: number; covered: CoveredEdges; back: boolean } | null = null;
  /** Whether this room's visit has said what its thermal is for (once, as the owl first stands in it). */
  private thermalTold = false;
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
    // On the new map a realm whose idol now stands in the Great Hollow has none of its own (roomOnMap).
    this.room = roomOnMap(getRoom(data.room), walkingMap());
    this.ownRoom = this.room;
    this.painter = null;
    enteredRoom(this.room);
    this.cfg = this.registry.get('config') as ParkConfig;
    this.hud = this.registry.get('hud') as Hud;
    this.transport = this.registry.get('transport') as ParkTransport;
    this.playerId = this.registry.get('playerId') as string;
    this.look = this.registry.get('look') as OwlLook;
    this.peers = new Map();
    this.built = false;
    this.conn = null;
    this.heard = null;
    this.roomHas = null;
    this.posOverlay = null;
    this.leaving = false;
    this.atIdol = false;
    this.passingGate = false;
    this.spectator = this.registry.get('spectator') === true;
    this.admitting = false;
    this.doorLook = null;
    this.actions = [];
    // The scene is reused room after room: the last room's tiles went with its display list and art.
    this.parallax = [];
    this.treeDress = null;
    this.keys = (this.registry.get('keys') as Keys | undefined) ?? null;
    this.keyDir = null;
    this.keyWalk = false;
    this.upAt = 0;
    this.upHint = null;
    this.upHintDoor = null;
    this.keyTurns = 0;
    this.hintsShown = '';
    this.signFocused = null;
    this.signKept = null;
    this.hintsFor = { at: '', doors: null };
    this.voting = false;
    this.pendingVote = false;
    this.pieces = {};
    this.seeThrough = null;
    this.guardian = null;
    this.sideCam = null;
    this.opening = null;
    this.rise = null;
    this.thermalTold = false;
    this.cameFrom = data.from;
    this.backWaiting = data.from !== undefined;
    this.restsThen = data.rests ?? this.keys?.rests() ?? 0;
    this.carried = carriedIn(data.side, this.sideView(), this.keys?.direction() ?? null, (this.keys?.rests() ?? 0) !== this.restsThen);
    this.fallHeld = null;
    this.cameWith = data.ticket ?? null;
    this.lane = data.lane;
    this.via = data.via;
    this.sleptAt = 0;
    this.askedAt = 0;
    this.goingAway = false;
    // A new room: on the ground, Jump let go, the allowance full; in a parkour course, the dash in hand (OP-224).
    this.flier = holdsDash(this.room) ? { ...newFlier(), dash: { ...FRESH_DASH } } : newFlier();
    this.dashes = 0;
    this.courseLink = null;
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
    this.wayTo = null;
    this.footLevel = 0;
    this.reSteer = false;
    this.gen += 1;
    this.soft = new Set();
    this.lastStatus = null;
    this.travelKept = null;
    this.collection = this.registry.get('collection') as CollectionState;
    this.quests = this.registry.get('quests') as QuestState;
    this.link = null;
    this.npcs.clear();
    this.piles.clear();
    this.glows.clear();
    this.things.clear();
    this.items.clear();
    this.gathering.clear();
    this.puzzleMarks.clear();
    this.puzzleBusy.clear();
    this.puzzlesAsked.clear();
    this.atLock = null;
    this.errand = null;
    this.busy = false;
    this.talkingTo = null;
    this.boardTimer = null;
    this.unwatchBoard = null;
    this.peerEmotes.clear();
    this.bubbles = null;
    this.trail = null;
    this.tasks = this.registry.get('tasks') as TaskState;
    this.play = null;
    this.arcade = null;
    this.climb = null;
    this.course = null;
    this.updrafts = null;
    this.winds?.destroy();
    this.winds = null;
    this.windRides = 0;
    this.brush = null;
    this.signs = null;
    this.standKey = '';
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

  /**
   * Load this room's art (releasing the previous room's) under the load screen (OP-129), then build the
   * scene. The room is joined as the art starts to load, so its welcome and the owls already in it come
   * alongside the art instead of after it.
   */
  private async open(): Promise<void> {
    const gen = this.gen;
    const previous = this.registry.get('loadedRoom') as string | undefined;
    // A room drawn from the art kit (OP-234) loads and releases its kit's pieces instead of paintings.
    const drawn = drawnRoom(this.room, this.cfg);
    const was = previous ? roomFor(previous) : undefined;
    if (previous && previous !== this.room.id) releaseArt(this, roomArtKeys(previous, was && drawnRoom(was, this.cfg)));
    const screen = this.registry.get('loadScreen') as LoadScreen | undefined;
    screen?.show('Opening…');
    const spawn = arrivalPoint(this.room, this.registry.get('spawnName') as string | undefined, this.cameFrom?.room, this.lane);
    // A spawn up on a perch (a landing of the hollow hall): the owl comes in standing on it, and its
    // height is told to the room after the welcome (retellAir).
    const arriveTop = spawnTop(this.room, this.registry.get('spawnName') as string | undefined);
    if (arriveTop > 0) this.flier = { ...this.flier, air: { ...this.flier.air, z: arriveTop } };
    const joining = this.join(spawn);
    // Gone before the room was built (the page went on to another scene): the room is left too.
    const leaveEarly = () => void joining.conn.then((conn) => conn.leave());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, leaveEarly);
    this.openPosOverlay();
    const cap = roomArtCap(drawn, this.cfg);
    this.artCap = cap;
    // On a dense screen, the paintings whose sharp copies the browser does not have yet open at 1x,
    // a third of the bytes, and sharpen once those come.
    const soft = await opensSoft(drawn, this.cfg);
    await loadArt(
      this,
      roomOpeningArt(this.room.id, drawn),
      this.cfg.pixelRatio,
      cap,
      (done, total) => {
        if (gen === this.gen) screen?.progress(done, total);
      },
      soft,
    );
    if (gen !== this.gen || !this.scene.isActive()) return; // the scene moved on while we loaded
    this.events.off(Phaser.Scenes.Events.SHUTDOWN, leaveEarly);
    this.registry.set('loadedRoom', this.room.id);
    screen?.hide();
    this.build(spawn);
    // Up on a perch from the first frame (the hollow hall's knothole landing, OP-277): the owl is drawn
    // at that height too. The flight's step only tells the drawing of a change of mode, and a grounded
    // owl's height alone is none, so without this it stood drawn on the floor far below the camera.
    if (this.flier.air.z > 0) {
      this.drawnAir = this.flier.air;
      this.me.fly(this.flier.air, Date.now());
    }
    void this.connect(joining);
    this.soft = soft;
    void this.sharpen(gen);
    void this.loadPuzzleArt(gen, cap);
  }

  /** The puzzle quests' art (OP-256), after the room's own: the marks already standing are drawn again with it. */
  private async loadPuzzleArt(gen: number, cap: number): Promise<void> {
    if (this.spectator || PUZZLE_ART_KEYS.length === 0) return;
    await loadArt(this, PUZZLE_ART_KEYS, this.cfg.pixelRatio, cap);
    if (gen !== this.gen || !this.scene.isActive()) return;
    for (const m of this.puzzleMarks.values()) m.redraw();
  }

  /** The keepers' position overlay (?pos=1 with the room server): asked for once a tab, as the first room starts to load, and up from then on. */
  private openPosOverlay(): void {
    if (!this.cfg.pos || this.transport.kind !== 'edge') return;
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

  /**
   * The ledge painter (OP-156): `?paint=1` over a room of the tree, for a tab that holds a keeper's
   * token. With `?keeper=1` the token is the one the page asks for as the room opens, so the painter
   * waits for that answer. Its code is fetched only then: no visitor's page loads it.
   */
  private openPainter(): void {
    if (!this.cfg.paint || !isPaintable(this.room)) return;
    const gen = this.gen;
    const live = () => gen === this.gen && !this.leaving && this.scene.isActive();
    void keeperToken(this.cfg.edgeUrl, this.cfg.keeper).then(async (token) => {
      if (!live()) return;
      if (!token) {
        this.hud.toast('The painter needs a keeper’s token: open the park with ?keeper=1&paint=1.', 6000);
        return;
      }
      const { LedgePainter } = await import('./ledgePainter');
      if (!live()) return;
      this.painter = new LedgePainter({
        scene: this,
        room: this.ownRoom,
        base: this.cfg.edgeUrl,
        token,
        pixelRatio: this.cfg.pixelRatio,
        hud: document.getElementById('hud') ?? document.body,
        tryPerches: (perches) => this.tryPerches(perches),
      });
    });
  }

  /** The painter's Try (OP-156): the owl stands on these perches in this page, or on the room's own again (null). */
  private tryPerches(perches: Perch[] | null): void {
    this.room = perches ? { ...this.ownRoom, perches } : this.ownRoom;
    this.reSteer = true;
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
      if (await sharpenArt(this, key, await copy, live, () => this.still())) {
        this.soft.delete(key);
        // A sharper copy has a bigger frame: the strips of a fading tile are cut again from it, and so
        // are the tree's shapes in front of the owls (OP-173).
        for (const { t, img } of this.parallax) if (t.key === key) this.cropFade(t, img);
        this.treeDress?.recut(key);
      }
    }
  }

  /**
   * A tile of the room's art: one that scrolls at a rate of its own (the tree's sky plate and overlay,
   * OP-156) is drawn with that scroll factor where tilePlacement puts it for the camera's size, and put
   * back there whenever the camera is fitted again.
   */
  private placeTile(t: RoomTile, img: Phaser.GameObjects.Image): void {
    if ((t.rate ?? 1) === 1) return;
    img.setScrollFactor(t.rate ?? 1);
    this.parallax.push({ t, img });
    this.placeParallax(t, img);
  }

  private placeParallax(t: RoomTile, img: Phaser.GameObjects.Image): void {
    const cam = this.cameras.main;
    const p = tilePlacement(t, { w: cam.width, h: cam.height });
    img.setPosition(p.x, p.y).setDisplaySize(p.w + 1, p.h + 1);
  }

  /**
   * The images a tile is drawn with (OP-162): one, or for a tile that fades at its side edges three
   * crops of its texture placed alike, the edge strips ramping from clear to solid and the middle
   * solid, so the fade costs no texture of its own. (The ramp is a corner alpha, which WebGL draws; the
   * canvas renderer draws the strips solid.)
   */
  private tileImages(t: RoomTile, depth: number, w: number, h: number): Phaser.GameObjects.Image[] {
    const make = () => this.add.image(t.x, t.y, t.key).setOrigin(0).setDisplaySize(w, h).setDepth(depth);
    const fade = tileFade(t);
    if (!fade.left && !fade.right) return [make()];
    const parts = [...(fade.left ? ['left'] : []), 'middle', ...(fade.right ? ['right'] : [])];
    return parts.map((part) => {
      const img = make().setData('fade', part);
      this.cropFade(t, img);
      return img;
    });
  }

  /** Cuts a fading tile's strip from its texture as it is now (a sharper copy may come later). */
  private cropFade(t: RoomTile, img: Phaser.GameObjects.Image): void {
    const part = img.getData('fade') as 'left' | 'middle' | 'right' | undefined;
    if (!part) return;
    const { width: fw, height: fh } = img.frame;
    const fade = tileFade(t);
    const left = Math.round((fade.left * fw) / ROOM_W);
    const right = Math.round((fade.right * fw) / ROOM_W);
    if (part === 'left') img.setCrop(0, 0, left, fh).setAlpha(0, 1, 0, 1);
    else if (part === 'right') img.setCrop(fw - right, 0, right, fh).setAlpha(1, 0, 1, 0);
    else img.setCrop(left, 0, fw - left - right, fh);
  }

  /**
   * What the camera follows: the owl's spot on the floor, or in a room seen from the side (the tree,
   * a course) where the side camera looks, the owl's height in it, so the camera climbs with the owl
   * and the layers' rates show.
   */
  private followed(): { x: number; y: number } {
    if (!seenFromSide(this.room)) return this.me;
    // Asked for as the camera is set on the owl afresh (a room coming in, a fall): the side camera starts over there.
    this.sideCam = null;
    this.aimCamera(Date.now());
    return this.camAt;
  }

  /** How the engine's own follow eases: a share of the way each frame, or not at all in a room seen from the side, where the side camera eases by the clock itself. */
  private followEase(): number {
    return seenFromSide(this.room) ? 1 : 0.12;
  }

  /** Where the camera looks this frame in a room seen from the side: what the side camera makes of where the owl is going (sideCamera.ts). */
  private aimCamera(now: number): void {
    if (!seenFromSide(this.room)) return;
    const cam = this.cameras.main;
    const viewW = cam.width / cam.zoom;
    const seen = this.sideCamSeen;
    const air = this.flier.air;
    const grounded = air.s === GROUNDED;
    // The flight goes in steps of its own (fly): between two of them the owl is where its speed has taken it
    // since the last, so the view moves every frame and not by a step more in one frame and a step less in the next.
    const z = grounded || !this.flightClock ? air.z : air.z + (air.vz * Math.min(FLIGHT_STEP_MS, Math.max(0, now - this.flightClock))) / 1000;
    const owl = { x: this.me.x, y: this.me.y, z, grounded, vx: 0, vz: grounded ? 0 : air.vz, lifted: air.s === LIFTED, facing: this.me.facing() };
    if (!this.sideCam) {
      this.sideCam = sideCamAt(owl, viewW);
      this.sideCamSeen = { at: now, x: owl.x, vx: 0 };
    } else {
      // The owl's speed is read over the time that passed; the camera's own step is never longer than its
      // most, so a page that stalled is eased over the frames after it and not jumped.
      const passed = Math.max(0, now - seen.at);
      const vx = speedAlong(seen.vx, owl.x - seen.x, passed);
      this.sideCam = sideCamStep(this.sideCam, { ...owl, vx }, viewW, Math.min(STEP_MOST_MS, passed));
      this.sideCamSeen = { at: now, x: owl.x, vx };
    }
    this.camAt.x = this.sideCam.x;
    this.camAt.y = this.sideCam.y;
  }

  /** Whether the owl stands still: no walk under way, no key or stick held, on the ground. */
  private still(): boolean {
    return !this.me.walking && !this.keys?.direction() && this.flier.air.s === GROUNDED;
  }

  /** The room's art, pieces and residents, with the own owl at `spawn`, where the room was told it comes in. */
  private build(spawn: Vec2): void {
    const { room } = this;
    // What is drawn: the room's paintings, or the art kit's pieces (OP-234), the same layout either way.
    const art = drawnRoom(room, this.cfg);
    ensureFxTextures(this);

    // Each tile is one screen of art at its offset. Tiles overlap their neighbours by a pixel so no
    // hairline of the clear colour shows at a join while the camera scrolls.
    const playTiles: Phaser.GameObjects.Image[] = [];
    // A room with no art (the test course, OP-224) is drawn in plain shapes.
    if (room.drawn) drawPlaceholderRoom(this, room);
    for (const t of room.drawn ? [] : backgroundTiles(art)) {
      for (const img of this.tileImages(t, -1, ROOM_W + 1, ROOM_H + 1)) {
        this.placeTile(t, img);
        if (t.plain) img.setData('plain', true);
        if ((t.rate ?? 1) === 1) playTiles.push(img);
      }
    }
    // Seen from above, where an owl can walk reads at a glance: the floor edged, the rest veiled (walkFloor.ts).
    this.floorShown = !seenFromSide(room) && !room.drawn && !!drawWalkFloor(this, room, this.cfg.sizes, -0.6);
    // On a skin trial (?skin=, skinTrial.ts), the backdrop sits back under a dark, flat veil, so what an owl plays on reads first.
    if (art.kit && trialBackdropVeiled() && drawsSkinTrial(art.id, art)) {
      this.add.rectangle(-2000, -2000, room.size.w + 4000, room.size.h + 4000, TRIAL_BACKDROP_VEIL.colour, TRIAL_BACKDROP_VEIL.alpha).setOrigin(0).setDepth(-0.98);
    }
    // The kit's surfaces, platforms and pieces over its backdrops; its front props over the owls, under the overlay.
    if (art.kit) drawKit(this, art, { back: -0.97, hazard: -0.96, play: -0.95, piece: -0.93, front: room.size.h + 50 });
    // A plaza's floor: the painting's foot runs on over it, mirrored and fading, so the two meet with no seam (plazaSkirt.ts).
    if (!room.drawn) drawSkirts(this, art);
    // Seen from above: roots, ferns, pillars and the rim that break up its rectangles (edges.ts), under the floor's edge line.
    this.edgesDrawn = drawEdges(this, room);
    // An oval floor seen from almost straight above (the Great Hollow): its wall with height round it, the floor shaded so it recedes.
    drawBowl(this, room);
    // A painting of the whole room (the Great Hollow's; `?art=old` leaves it off, artTrial.ts), over its floor and wall, under all that is drawn on them.
    void drawArtTrial(this, room);
    // A soft shade in the view's corners, so a room seems to run on past the screen instead of stopping in a box.
    setVignette(true);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => setVignette(false));
    this.pieces = addSetPieces(this, room, (pointer, event, realm) => this.onIdolTap(pointer, event, realm));
    // The guardian at the heart of the Great Hollow (OP-359, behind ?guardian=1): one more tall piece among the owls.
    if (room.id === GUARDIAN_ROOM && flagOn('guardian') && !this.sideView()) {
      this.guardian = new GuardianView(this, { light: room.bowl?.light, calm: () => this.calm(), onHoot: () => this.sfx.play('guardianHoot') });
      (this.pieces.standing ??= []).push(this.guardian.image);
    }
    // Seen from above, tall art an owl can stand behind goes see-through while the visitor's own owl is behind it (OP-346).
    this.seeThrough = this.sideView() ? null : new SeeThrough(this, this.pieces.standing ?? []);
    this.setRealms(this.transport.kind === 'edge' ? this.realms : { open: [...GATED_ROOMS], portal: true, night: null });
    this.arcade = arcadeFor(room, {
      scene: this,
      hud: this.hud,
      acts: () => this.acts,
      look: () => this.look,
      feathers: (total) => this.collection.setFeathers(total),
      offerTicket: (line) => this.offerDayTicket(line),
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
      offerTicket: (line) => this.offerDayTicket(line),
    });
    // The leaves in the room's updrafts (OP-226): what shows a column, and when its gust drops.
    this.updrafts = room.updrafts?.length
      ? new UpdraftLeaves(this, room.updrafts, groundOf(room), 1, () => (this.registry.get('settings') as SettingsStore | undefined)?.get().calm ?? false)
      : null;
    // The streaks in the room's wind currents (OP-275): which way the air carries a glide, and where.
    this.winds = room.winds?.length ? new WindStreaks(this, room.winds, groundOf(room), 1, (this.registry.get('settings') as SettingsStore | undefined)?.get().calm ?? false) : null;
    // The ink of the room's brush stones (OP-235): its strokes drawn while they last, and stood on only then.
    this.brush = room.brushStones?.length ? new BrushInk(this, room.brushStones, groundOf(room)) : null;
    // The neon signs on their circuits: drawn lit or dark by park time, and stood on only while lit.
    this.signs = room.neonSigns?.length ? new NeonSigns(this, room.neonSigns, groundOf(room)) : null;
    this.course = courseFor(room, {
      scene: this,
      hud: this.hud,
      link: () => this.courseLink,
      me: () => ({ pos: { ...this.me.pos }, grounded: this.flier.air.s === GROUNDED, ground: this.groundNow(), z: this.flier.air.z }),
      spawn: () => this.registry.get('spawnName') as string | undefined,
      fell: (at, top) => this.fellTo(at, top),
      feathers: (total) => this.collection.setFeathers(total),
      awarded: () => void this.collection.refresh(),
      hudRoot: () => document.getElementById('hud'),
      calm: () => this.calm(),
      sound: (cue: CueName) => this.sfx.play(cue),
    });
    ({ hollow: this.hollow, doorway: this.doorway } = escapeFor(room, {
      scene: this,
      hud: this.hud,
      link: () => this.escapeLink,
      me: () => ({ pos: { ...this.me.pos }, ground: this.groundNow(), walking: this.me.walking }),
      goTo: (to, spawn) => void this.goTo(to, spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined }),
      feathers: (total) => this.collection.setFeathers(total),
      awarded: () => void this.collection.refresh(),
      hudRoot: () => document.getElementById('hud'),
    }));
    this.hud.setDash(this.flier.dash !== undefined);
    // Calm motion (a setting) stills the drifting particles, at once and in every room after.
    const ambience = addAmbience(this, room);
    // What owls say shows in bubbles over everything in the room, the words the same size on any screen.
    this.bubbles = new SpeechBubbles(this, room.size.h + 150, () => this.cfg.pixelRatio / this.cameras.main.zoom);
    if (this.cfg.sizes) this.sizeLabels = new SizeLabels(this, room.size.h + 140, () => this.cfg.pixelRatio / this.cameras.main.zoom);
    this.doorSigns = new DoorSigns(this, room, () => this.cfg.pixelRatio / this.cameras.main.zoom, this.walking(), (id) => this.realmClosed(id), () => this.me.pos);
    // A course's tips for this room (OP-344), over everything in it: the one nearest the owl shows, where the thing it is about is.
    const courseDef = courseOfRoom(room, COURSES);
    const tips = courseDef ? courseTips(courseDef, (id) => ROOMS[id], groundOf, TOUCH_SCREEN).filter((t) => t.room === room.id) : [];
    this.reach = new ReachPrompt(
      this,
      room.size.h + 135,
      () => this.cfg.pixelRatio / this.cameras.main.zoom,
      () => promptPlace({ x: this.me.x, y: this.me.y - this.me.flightHeight() }, this.doorSigns?.shownBox() ?? null, this.cfg.pixelRatio / this.cameras.main.zoom),
    );
    // The Great Hollow's own tips (OP-347): how to hop up its roots and glide off them, until this device's owl has done it once.
    const hall = courseDef ? [] : hallTips(room, TOUCH_SCREEN);
    this.rootTips = hall.length > 0;
    this.firstFlown = this.rootTips && triedDoors().has(room.id, FIRST_FLIGHT_MARK);
    const pick = tips.length
      ? () => tipFor(tips, this.me.pos.x, this.flier.air.z)?.id ?? null
      : () => (this.firstFlown ? null : (hallTipFor(hall, this.me.pos, this.flier.air.z)?.id ?? null));
    this.tips = tips.length || hall.length ? new CourseTipSigns(this, tips.length ? tips : hall, () => this.cfg.pixelRatio / this.cameras.main.zoom, pick, room.size.h + 130) : null;
    const settings = this.registry.get('settings') as SettingsStore | undefined;
    if (settings) {
      ambience.setCalm(settings.get().calm);
      this.bubbles.setShown(settings.get().bubbles);
      this.trailOn = settings.get().trail;
      const stop = settings.onChange((s) => {
        ambience.setCalm(s.calm);
        this.bubbles?.setShown(s.bubbles);
        if (s.trail !== this.trailOn) {
          this.trailOn = s.trail;
          this.layTrail();
        }
      });
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    }
    addNestsSign(this, room);
    addParkSign(this, room);
    if (isStreetRoom(room.id)) {
      this.streetSigns = new StreetDoors(this, room);
      this.streetSigns.show(this.street, nestLook(this.look));
    }
    if (isNestRoom(room.id)) {
      this.decor = new NestDecor(this, (keys) => loadArt(this, keys, this.cfg.pixelRatio, this.artCap));
      this.mirror = new NestMirror(this, NEST_MIRROR);
    }
    for (const t of foregroundTiles(art)) {
      if (this.textures.exists(t.key)) for (const img of this.tileImages(t, room.size.h + 100, ROOM_W, ROOM_H)) this.placeTile(t, img);
    }
    // A room of the tree reads at a glance (OP-173): its ledges' edges and the shades over the playfield
    // under the owls, the shapes painted in front of the path over them, under the overlay.
    if (seenFromSide(room)) {
      this.treeDress = dressTreeRoom(this, art, playTiles, {
        ground: groundOf(room),
        // A kit room's ledges carry their own edge, the cap.
        lips: !art.kit,
        // A raised front lies between the owls on ledges (drawn TREE_RAISED_BAND back) and those on the floor.
        depths: { shade: -0.9, lip: -0.8, barrier: -0.7, front: room.size.h + 50, raised: groundOf(room) - TREE_RAISED_BAND / 2, mark: room.size.h + 60 },
        open: (door) => !this.realmClosed(this.doorTo(door)?.room),
        calm: this.calm(),
        onMarkTap: (door) => this.walkToDoorway(door.id),
      });
    }

    this.me = new Owl(this, this.playerId, this.look, spawn, itemScale(this.cfg.pixelRatio))
      .setRoomScale(room.owlScale ?? 1)
      .setRaisedBand(this.raisedBand())
      .setShadowDepth(room.bowl ? BOWL_SHADOW : 1);
    this.me.groundUnder = this.groundUnder;
    this.me.slopeUnder = this.slopeBelow;
    this.me.calm = () => this.calm();
    this.arrivedAt = { ...spawn };
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
      spectating: () => this.spectator,
      spectatorOffer: (line) => this.afterGameOffer(line),
    });
    if (flagOn('friends') && (room.id === STUMP_ROOM || isPartyRoom(room.id))) {
      this.party = new PartyLayer({
        scene: this,
        room: room.id,
        hudRoot: () => document.getElementById('hud'),
        toast: (m, ms) => this.hud.toast(m, ms),
        walkTo: (p) => void this.walkTo(p),
        goTo: (to) => void this.goTo(to, 'default', { room: this.room.id, spawn: FROM_STUMP_SPAWN }),
        back: () => void this.goTo(STUMP_ROOM, FROM_STUMP_SPAWN, undefined),
      });
    }

    this.setupCamera();
    this.setupInput();
    this.openPainter();
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
    // Phones play the tree on their side (OP-155 (d)): held upright in a tree room, a card asks to turn them.
    this.hud.setSideways(seenFromSide(room));
    this.showWaysOut();
    if (isNestRoom(room.id)) void this.knowOwnNest();
    // The owl builder's kind and colours: today's pledge and the worn collectibles stay as they are.
    this.hud.onLookChange((look) => this.changeLook({ ...this.look, body: look.body, belly: look.belly, accent: look.accent, ...(look.species ? { species: look.species } : {}) }));
    this.hud.onAction((id) => this.actions.find((a) => a.id === id)?.run());
    this.hud.onHint((id) => this.walkToDoorway(id));
    this.unwatchBoard = this.quests.onChange((board) => this.showBoard(board));
    this.showBoard(this.quests.board);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.hud.setRoomDark(false);
    this.cameras.main.fadeIn(ROOM_FADE_IN_MS, 12, 30, 54);
    this.built = true;
    this.startOpening(this.registry.get('spawnName') as string | undefined);
    // The guardian sees the visitor's own owl come in (OP-359), counted from when the room has faded in: by the
    // knothole, or set down in the hall's middle, it is hooted to; back from one of the hall's own ways, looked at.
    const cameBy = this.registry.get('spawnName') as string | undefined;
    this.guardian?.arrived(this.playerId, Date.now() + ROOM_FADE_IN_MS, cameBy === undefined || cameBy === 'default' || cameBy === 'from-lobby');
    // The sign of the doorway the owl came in by waits until it has stepped away once (OP-337, updateHints).
    this.signKept = room.doors.find((d) => this.leadsBack(d))?.id ?? null;
    // The feather trail (OP-307): the doorway the owl came in by counts as tried, and the feathers come out once the room is in.
    if (!room.course) {
      this.trail = new FeatherTrail(this, () => this.calm());
      const back = this.cameFrom ? room.doors.find((d) => this.doorTo(d)?.room === this.cameFrom?.room) : undefined;
      if (back) triedDoors().add(room.id, back.id);
      this.trailIdleAt = Date.now();
      this.time.delayedCall(TRAIL_AFTER_MS, () => this.layTrail());
    }
    // Back from checkout in a page of its own (OP-190): in front of the turnstiles, and on through them with the ticket.
    const came = this.cameWith;
    this.cameWith = null;
    if (came) this.time.delayedCall(450, () => void this.ticketCame(came));
  }

  override update(): void {
    if (!this.built) return;
    const now = Date.now();
    this.standPerches(now);
    this.fly(now);
    let finished = this.me.tick(now);
    this.tickTrail(now);
    this.aimCamera(now);
    this.frameOpening(now);
    this.frameRise();
    // A leg of a way around a bend done (OP-148): the next sets off at once, and the walk goes on.
    if (finished && this.wayTo && this.walkOn()) finished = false;
    // At what a tap asked for: nothing left for a jump to carry on to (OP-084).
    if (finished && this.walkGoal && distance(this.walkGoal, this.me.pos) < 3) this.walkGoal = null;
    this.posOverlay?.frame(this.me.pos, now, this.room.id);
    this.seeThrough?.frame(this.me.pos, this.flier.air.z);
    this.guardian?.frame(now, this.owlsSeen());
    // On a touch screen the thumbstick goes quiet while the owl is under it (OP-349): told a few times a second.
    if (TOUCH_SCREEN && now - this.owlToldAt > 180) {
      this.owlToldAt = now;
      const v = this.cameras.main.worldView;
      this.hud.setOwlAt(v.width > 0 ? { x: ((this.me.x - v.x) / v.width) * window.innerWidth, y: ((this.me.y - this.me.flightHeight() - v.y) / v.height) * window.innerHeight } : null);
    }
    // Where in the tree the owl is, on the computer's minimap (OP-213); none out of the tree.
    this.hud.setTreeSpot(this.sideView() ? { room: this.room.id, x: this.me.pos.x } : null);
    if (!this.leaving) {
      // Let go of since the owl took the doorway here, the keys open the way back (doors.ts, backWaits).
      const rested = (this.keys?.rests() ?? 0) !== this.restsThen;
      const heldNow = this.keys?.direction() ?? null;
      this.backWaiting = backWaits(this.backWaiting, heldNow !== null, this.hud.isBlocking(), rested);
      // The same letting go, or a push another way, frees a direction held across a change of view (doors.ts, carriedIn).
      this.carried = rested ? null : stillCarried(this.carried, heldNow);
      this.steer();
      this.checkDoors(finished);
      this.checkItems(now);
      this.checkPuzzles(now);
      this.course?.tick(now);
      this.hollow?.tick(now);
      this.updrafts?.update(now + this.clockSkew());
      this.updateHints();
      this.rest(now);
      this.prefetchNear(now);
    }
    for (const owl of this.peers.values()) owl.tick(now);
    this.bubbles?.tick(now);
    this.fitOverlay?.draw();
    this.painter?.draw();
    for (const npc of this.npcs.values()) npc.tick(now);
    for (const pile of this.piles.values()) pile.tick(now);
    this.play?.tick();
  }

  // ---------- networking ----------

  /** The own owl as the room sees it; before the scene is built, standing at `pos` (where it comes in). */
  private snapshot(pos: Vec2 = this.me.pos, walk: Walk | null = this.me.walk): PlayerState {
    const told = this.roomTold;
    const up = told.air.s !== GROUNDED || told.air.z > 0;
    return { id: this.playerId, look: this.look, pos: { ...pos }, walk, ...(this.sleptAt ? { asleep: true } : {}), ...(up ? { air: { ...told.air, at: told.at } } : {}), v: PROTOCOL_VERSION };
  }

  /**
   * Join the room for the owl coming in at `at`, as the room's art starts to load (OP-129): its welcome,
   * the owls already in it and its settings then come while the art loads. Until connect() holds the
   * connection, every word from the room waits in `heard`, in order.
   *
   * TODO-DOCS (OP-129): docs/ARCHITECTURE.md's client rules: a page joins a room as the room's art
   * starts to load, and acts on what the room says once the scene is built, in the order it was said.
   */
  private join(at: Vec2): Joining {
    const gen = this.gen;
    const live = () => gen === this.gen && !this.leaving;
    const spawnName = this.registry.get('spawnName') as string | undefined;
    const heard: Array<() => void> = [];
    this.heard = heard;
    // What the room pushes about quests, shared objects and activities (the room server's own, or the local mode's).
    const pushes: QuestPushes & ActivityPushes & NestPushes = {
      onQuests: (board, updates) => {
        if (!live()) return;
        this.applyBoard(board);
        this.showUpdates(updates);
      },
      // Someone else in the owl's run moved it along (OP-255).
      onPuzzle: (quest, view, board, updates) => {
        if (!live()) return;
        this.quests.setPuzzle(quest, view);
        if (board) this.applyBoard(board);
        if (updates) this.showUpdates(updates);
      },
      onObjects: (until) => {
        if (!live()) return;
        for (const pile of this.piles.values()) pile.setUntil(until[pile.id] ?? 0);
      },
      onUsed: (id, by, until) => live() && this.onUsed(id, by, until),
      onLanterns: (beam, lit) => live() && this.play?.onLanterns(beam, lit),
      onQuiz: (n, right, won, others) => live() && this.play?.onQuiz(n, right, won, others),
      onPaid: (what, feathers, total, practice) => live() && this.play?.onPaid(what, feathers, total, practice),
      onTasks: (tasks, finished, paid, total) => live() && this.play?.onTasks(tasks, finished, paid, total),
      onWall: (walls, mine) => live() && this.arcade?.onWall(walls, mine),
      onNest: (seen) => live() && this.onNest(seen),
      onNestClosed: () => live() && this.onNestClosed(),
    };
    const handlers: RoomHandlers = {
      ...pushes,
      onPeerState: (s) => live() && this.onPeerState(s),
      onPeerMove: (id, walk) => live() && this.onPeerMove(id, walk),
      onPeerLeave: (id) => live() && this.onPeerLeave(id),
      onStatus: (s) => live() && this.onStatus(s),
      onSelf: (pos) => {
        if (!live()) return;
        this.posOverlay?.told('welcome', pos);
        this.roomHas = pos;
        // Heard only once this page holds the connection (connect()), so the room is caught up at once.
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
      onFull: (roomId, spectators) => live() && void this.roomFull(roomId, spectators === true),
      onEscape: (f) => live() && this.hollow?.onEscape(f),
      onSpectator: (on) => live() && this.setSpectator(on),
      onQueued: () => live() && this.queued(),
      onNotice: (words) => live() && (this.registry.get('ribbon') as Ribbon | undefined)?.set(words),
      onRealms: (realms) => live() && this.setRealms(realms),
      onRealmClosed: (sign) => live() && this.onRealmClosed(sign),
      onNotThroughGate: () => live() && this.notThroughGate(),
      onRestartNotice: (words) => live() && this.hud.toast(words, RESTART_NOTICE_MS),
      onRestart: () => live() && this.restarted(),
      onSetup: (words) => live() && this.closedForSetup(words),
      onTicketEnded: () => live() && this.ticketEnded(),
      onPeerEmote: (id, e) => {
        if (!live()) return;
        this.peerEmotes.set(id, e);
        this.peers.get(id)?.playEmote(e);
        this.guardianCalled(id, e);
      },
      onStump: (f) => live() && this.party?.onStump(f),
      onParty: (f) => live() && this.party?.onParty(f),
      onPartyClosed: () => live() && this.party?.onClosed(),
      onPeerSay: (id, n) => {
        if (!live()) return;
        const owl = this.peers.get(id);
        if (!owl) return;
        const now = Date.now();
        this.bubbles?.say(owl, n, now);
        if (now - this.saidAt >= 10_000) this.hud.offerReply(n);
      },
    };
    // The park the owl walks goes with the hello, so a nest's or a shared realm's stay is logged in the right one (OP-265).
    const self = { ...this.snapshot(at, null), ...(spawnName ? { spawn: spawnName } : {}), ...(this.via ? { via: this.via } : {}), map: this.walking() === 3 ? 2 : this.walking() } as PlayerState;
    // Where the own owl is as the room's socket opens (OP-138): a question, not news, so never held back; until the scene has its owl, where it comes in.
    const here = (): Vec2 | null => (!live() ? null : this.built ? { ...this.me.pos } : { ...at });
    const conn = this.transport.join(this.room.id, self, { ...heldBack(handlers, () => (this.heard === heard ? heard : null)), here });
    return { conn, pushes };
  }

  /** Take the room's connection once the scene is built, then hear what the room said while the art loaded (OP-129). */
  private async connect(joining: Joining): Promise<void> {
    const gen = this.gen;
    const live = () => gen === this.gen && !this.leaving;
    const spawnName = this.registry.get('spawnName') as string | undefined;
    const conn = await joining.conn;
    if (!live() || !this.scene.isActive()) {
      await conn.leave();
      return;
    }
    this.conn = conn;
    // The map's places (OP-130): this browser keeps the room walked into when no server does.
    this.collection.service.travelEntered(this.room.id, spawnName);
    void this.refreshTravel(spawnName);
    const { pushes } = joining;
    this.link = this.collection.service.questLink(this.room.id, conn, pushes, () => ({ ...this.me.pos }), () => this.groundNow());
    this.acts = this.collection.service.activityLink(this.room.id, conn, pushes, () => ({ ...this.me.pos }), () => this.look);
    this.play?.attach(this.acts);
    this.nests = this.collection.service.nestLink(this.room.id, conn, pushes, () => nestLook(this.look));
    if (this.course) {
      this.courseLink = this.collection.service.courseLink(this.room.id, conn, () => ({ ...this.me.pos }), () => this.groundNow(), () => ({ z: this.flier.air.z, entry: this.registry.get('spawnName') as string | undefined }));
      void this.course.connected();
    }
    this.escapeLink = conn.escape ?? null;
    if (this.hollow) void this.hollow.connected();
    if (isStreetRoom(this.room.id)) void this.askStreet();
    this.party?.attach(conn);
    // Arriving here counts for quests that ask for a visit (the room server counts it on its own).
    this.link?.note({ kind: 'visit', room: this.room.id });
    void this.refreshBoard();
    // Everything the room said meanwhile, in the order it said it; from here on each word is heard as it comes.
    const heard = this.heard ?? [];
    this.heard = null;
    for (const word of heard) word();
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
    this.followUp(at);
    // The room starts the owl on the floor: standing on a perch, or up in the air, it is told (OP-084),
    // once the room's copy is on its way over, so the room finds the perch the owl stands on (OP-149).
    this.retellAir();
  }

  /** The room's copy of the own owl, at `at`, sent over to where the owl is, or the owl to it (catchUpRoom). */
  private followUp(at: Vec2): void {
    // Where the owl is going: the end of a tap's way round a bend (OP-148), else of the walk under way.
    const target = this.wayTo ?? this.me.walk?.to;
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
    this.wayTo = null;
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
    // The room has the owl now: what the room server said of its map, if it answered first, counts (OP-358).
    if (s === 'online') this.takeKeptTravel();
    // The quest board says it isn't answering instead of loading for ever (OP-280); a board clears it.
    if (wentOffline) this.quests.setOffline(true);
    if (wentOffline && !this.leaving) this.hud.toast('You are wandering alone for now: the park could not connect.', 4000);
  }

  private async roomFull(roomId: string, spectators = false): Promise<void> {
    if (this.leaving) return;
    // Full for a spectator only (OP-191): a ticket holder would still get in, so the Day Ticket is offered.
    if (spectators) this.hud.offerTicket(SPECTATOR_WORDS.busy);
    else this.hud.toast('That part of the park is full right now. Try again in a moment.', 3500);
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

  /**
   * The park restarted for the night (OP-181): out of the room as through a door, to the home screen,
   * which says so calmly. Play brings the owl back in, to its own nest; past the turnstiles only with
   * a ticket that is still good, while the gate takes tickets.
   */
  private restarted(): void {
    if (this.leaving) return;
    this.registry.set(RESTARTED_KEY, true);
    void this.leaveRoom().then((left) => {
      if (left) this.scene.start('home');
    });
  }

  /** The ticket that let the owl in ran out of time (OP-237): out of the room as through a door, to the home screen. */
  private ticketEnded(): void {
    if (this.leaving) return;
    this.registry.set(TICKET_ENDED_KEY, true);
    void this.leaveRoom().then((left) => {
      if (left) this.scene.start('home');
    });
  }

  /**
   * The park is closed for setup (OP-205): out of the room as through a door, to the home screen, which
   * shows the keepers' words over Play until the park opens again.
   */
  private closedForSetup(words: string): void {
    if (this.leaving) return;
    this.registry.set(SETUP_KEY, words || SETUP_WORDS);
    void this.leaveRoom().then((left) => {
      if (left) this.scene.start('home');
    });
  }

  private onPeerState(s: PlayerState): void {
    if (s.id === this.playerId) return;
    const now = Date.now();
    let owl = this.peers.get(s.id);
    if (!owl) {
      owl = new Owl(this, s.id, s.look, s.pos, itemScale(this.cfg.pixelRatio))
        .setRoomScale(this.room.owlScale ?? 1)
        .setRaisedBand(this.raisedBand())
        .setShadowDepth(this.room.bowl ? BOWL_SHADOW : 1);
      owl.groundUnder = this.groundUnder;
      owl.slopeUnder = this.slopeBelow;
      owl.calm = () => this.calm();
      owl.setAlpha(0);
      this.tweens.add({ targets: owl, alpha: 1, duration: 400 });
      this.peers.set(s.id, owl);
      this.hud.setCount(this.peers.size + 1);
      this.guardian?.arrived(s.id, now, false);
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
      const already = owl.walk ? sameWalk(owl.walk, raw) || (owl.nextWalk !== null && sameWalk(owl.nextWalk, raw)) : distance(owl.pos, raw.to) < 1;
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
    // On from where the walk it is drawn walking ends (its next leg round a bend, OP-148): under way
    // as that one ends, so the owl does not skip ahead to it.
    if (followsOn(owl.walk, w, Date.now())) {
      owl.nextWalk = w;
      return;
    }
    owl.place(w.from);
    owl.startWalk(w);
  }

  private onPeerLeave(id: string): void {
    const owl = this.peers.get(id);
    if (!owl) return;
    this.peers.delete(id);
    this.brush?.forget(id);
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
      if (this.painter?.took(p)) return; // the ledge painter took this press (OP-156)
      if (p.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return; // a drag, not a tap
      this.pendingVote = false; // a new destination cancels a walk to the idol
      this.errand = null; // ...or to an NPC or a leaf pile
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      // A tap on a thing to use out on a plaza's floor walks the owl over and uses it (a bird bath, mushrooms, a telescope, a shiny thing).
      const thing = this.thingAt({ x: world.x, y: world.y });
      if (thing) {
        this.goDo({ kind: 'use', id: thing.id });
        return;
      }
      // A tap on a perch's top asks for the top, not the floor behind it (OP-084).
      const goal = tapGoal(this.room, { x: world.x, y: world.y });
      // A tap on the doorway the owl already stands in (a side view, OP-212) goes through, as one walked to would.
      if (!this.walkTo(goal)) this.tapIntoDoorway(goal);
    });
  }

  /** The thing to use out on a plaza's floor under a tap, if any: the nearest whose art or spot it is on. */
  private thingAt(p: Vec2): FloorThing | null {
    let best: FloorThing | null = null;
    for (const t of this.things.values()) if (t.hit(p) && (!best || distance(p, t.pos) < distance(p, best.pos))) best = t;
    return best;
  }

  /** Where the held keys or the thumbstick walk the owl: seen from the side (the tree), along the floor only, up going through doorways there (OP-212). */
  private heldWay(): Vec2 | null {
    const held = this.heldNow();
    return this.sideView() ? alongTheFloor(held) : held;
  }

  /**
   * The direction held, as a push of the owl's: none while it is still the one the owl came in with
   * across a change of view (OP-346; doors.ts, carriedIn), or the one held as a fall put it back
   * (OP-360; heldAtFall).
   */
  private heldNow(): Vec2 | null {
    if (this.carried) return null;
    const held = this.keys?.direction() ?? null;
    if (this.fallHeld) {
      if (stillHeldSinceFall(this.fallHeld, held, this.keys?.rests() ?? 0)) return null;
      this.fallHeld = null;
    }
    return held;
  }

  /** WASD and the arrow keys: walk while held (sliding along edges) and stop on letting go. */
  private steer(): void {
    // In the turnstiles the owl goes on through where it stands, not sideways along them (OP-124).
    if (this.passingGate) return;
    // Decorating, the arrow keys step through the spots and the owl stays where it is. Seen from the
    // side (the tree), the keys walk along the floor only: up goes through doorways there (OP-212).
    const dir = this.decorating ? null : this.heldWay();
    if (!dir) {
      if (this.coasting) return;
      if (this.keyWalk && this.me.walking) this.stop();
      this.keyDir = null;
      this.keyWalk = false;
      return;
    }
    this.coasting = false;
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
    const side = this.sideView();
    for (const to of roomsAhead(this.room, this.me.pos, this.me.walk?.to ?? null, this.keyWalk, (id) => this.realmClosed(id), this.walking(), side)) prefetchRoomArt(this, drawnRoom(to, this.cfg), this.cfg);
  }

  /** Stand still where the owl is and tell the room. */
  private stop(): void {
    const here = { x: Math.round(this.me.pos.x), y: Math.round(this.me.pos.y) };
    this.wayTo = null;
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
    const own = isStreetRoom(this.room.id) ? 'nest-door-0' : null;
    const toPark = parkwardDoor(this.room.id);
    const v = this.cameras.main.worldView;
    // Where a tap walk is going (a walk on held keys or the stick goes nowhere in particular).
    const goal = this.me.walk && !this.keyWalk ? (this.walkGoal ?? this.me.walk.to) : null;
    const owlAt = `${Math.round(this.me.pos.x / 20)},${Math.round(this.me.pos.y / 20)},${goal ? `${Math.round(goal.x)},${Math.round(goal.y)}` : '-'}`;
    const signSeen = this.signFocused && this.doorSigns?.onScreen(this.signFocused) ? 1 : 0;
    const at = `${v.x},${v.y},${v.width},${v.height},${window.innerWidth},${window.innerHeight},${owlAt},${signSeen}`;
    if (at === this.hintsFor.at && this.room.doors === this.hintsFor.doors) return;
    this.hintsFor = { at, doors: this.room.doors };
    // Seen from the side, each doorway is pointed at on its own landing, and only the near ones (hints.ts).
    const ground = this.sideView() ? groundOf(this.room) : null;
    const view = { x: v.x, y: v.y, w: v.width, h: v.height };
    const all = this.room.doors.filter((d) => d.to || this.interactions[d.id] || d.id === own).map((d) => doorHintTarget(d, ground));
    // Seen from above, one doorway at a time has its sign and chip (OP-309): the one the owl is walking
    // to or standing by. The owl's own nest door and the way to the park keep their chips (OP-105).
    let targets: typeof all;
    if (ground === null) {
      const keep = new Set([own, toPark].filter((id): id is string => !!id));
      // The doorway the owl came in by keeps its sign back until the owl has stepped away from it once (OP-337).
      if (this.signKept && !signWaits(true, all.find((t) => t.id === this.signKept), this.me.pos)) this.signKept = null;
      const focus = signFocus(all, this.me.pos, goal, this.signFocused, this.signKept);
      this.signFocused = focus;
      this.doorSigns?.focus(focus);
      // Its sign on the floor names it once it is on screen: then no chip repeats it at the screen's edge.
      targets = all.filter((t) => (t.id === focus && !this.doorSigns?.onScreen(t.id)) || keep.has(t.id));
    } else targets = nearTargets(all, view, SIDE_HINT_REACH);
    const places = placeHints(targets, view, { w: window.innerWidth, h: window.innerHeight, ...HINT_INSETS, ...(TOUCH_SCREEN ? { bottom: touchBottom(TOUCH_HINT_BOTTOM, window.innerHeight) } : {}) });
    const shown = places.map((p) => `${p.id}:${Math.round(p.x)},${Math.round(p.y)},${p.angle.toFixed(2)}`).join('|');
    if (shown === this.hintsShown) return;
    this.hintsShown = shown;
    this.hud.setHints(
      places.map((p) => {
        const door = this.room.doors.find((d) => d.id === p.id)!;
        const spot = this.interactions[p.id];
        // Its sign's words, or seen from the side (no signs there) where it leads or which way along the course it goes.
        const named = door.to ? (doorLabel(door, this.walking()) ?? (ground !== null ? this.sideChip(door) : undefined)) : undefined;
        return {
          ...p,
          tint: door.to ? (DOOR_TINTS[this.doorTo(door)?.room ?? door.to.room] ?? '#C9A227') : '#FFD36A',
          ...(door.id === toPark ? { text: NEST_WORDS.toPark } : named ? { text: named } : {}),
          label: spot
            ? `${spot.label}, off screen: walk there`
            : named && door.id !== toPark
              ? `${named}, off screen: walk there`
              : door.id === toPark
              ? `${NEST_WORDS.toPark}, off screen: walk there`
              : door.id === own
                ? `${NEST_WORDS.yourNest}, off screen: walk there`
                : isStreetRoom(this.doorTo(door)?.room)
                  ? `${NEST_WORDS.toNests}, off screen: walk there`
                  : 'Doorway, off screen: walk there',
        };
      }),
    );
  }

  /** The words on the chip for a doorway of this room seen from the side (hints.ts, sideChipWords). */
  private sideChip(door: DoorDef): string | undefined {
    const to = this.doorTo(door);
    if (!to) return undefined;
    const name = placeShown(to.room, this.walking());
    const course = courseOfRoom(this.room, COURSES);
    return sideChipWords(door, name === 'the park' ? null : name, course ? { finish: endsCourse(course, to.room, (id) => ROOMS[id]) } : null);
  }

  /** A hint chip was tapped: head for that doorway or spot. */
  private walkToDoorway(id: string): void {
    const door = this.room.doors.find((d) => d.id === id);
    if (!this.built || this.leaving || !door) return;
    this.pendingVote = false;
    const aim = { x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2 };
    // Already standing in it (a side view, OP-212): a tap on it goes through, as one walked to would.
    if (!this.walkTo(aim)) this.tapIntoDoorway(aim);
  }

  /** The Menu's ways out from here: leaving inside the park, going home anywhere but the owl's own nest. */
  private showWaysOut(): void {
    this.hud.setWaysOut({ leave: insidePark(this.room.id), home: !(isNestRoom(this.room.id) && this.nestMine) });
  }

  /** "Leave the park" (the card asked first): to the lobby, outside the gate (in the tree, before its front gate). The ticket keeps running. */
  leavePark(): boolean {
    if (!this.built || this.leaving || !insidePark(this.room.id)) return false;
    void this.goTo(this.walking() === 2 ? TREE_STREET_ROOM : LOBBY_ROOM, LEFT_PARK_SPAWN, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined });
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
    void this.goTo(home, spawn, { room: streetOf(this.walking()), spawn: 'from-nest-0' }, fadeMs, undefined, 'travel');
    return true;
  }

  /**
   * Travel from the Menu's map, its button held (OP-130): to any place of the map, walked into or not
   * (the owner's "whole map unlocked", Nov 8), landing where walking in would have, after the slower fade going home has. Into the
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
    const walking = this.walking();
    if (!canTravel(place, walking)) return 'not-yet';
    if (needsGate(place, walking) && !known.gate) return 'gate';
    if (place === 'nest') {
      if (isNestRoom(this.room.id) && this.nestMine) return 'here';
      this.flyAway(NEST_FADE_MS);
      void this.goHome(NEST_SPAWN, NEST_FADE_MS);
      return null;
    }
    const to = travelLanding(place, walking)!;
    if (to.room === this.room.id) return 'here';
    this.hud.closeDialogue();
    this.talkingTo = null;
    this.flyAway(NEST_FADE_MS);
    void this.goTo(to.room, to.spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined }, NEST_FADE_MS, undefined, 'travel');
    return null;
  }

  /** The doorways of this room that lead somewhere open and the owl has not been through yet (OP-307). */
  private untriedDoors(): DoorDef[] {
    const tried = triedDoors();
    return this.room.doors.filter((d) => {
      const to = this.doorTo(d);
      return to !== undefined && !this.realmClosed(to.room) && !tried.has(this.room.id, d.id);
    });
  }

  /**
   * Down from a flight (OP-347): the first glide off one of the Great Hollow's roots is marked, once on
   * this device. The roots' tips have done their work and show no more, a line says so, and the trail
   * leads on to a doorway.
   */
  private landedFromFlight(at: Vec2): void {
    if (!this.rootTips || this.firstFlown || !this.flown.glided) return;
    if (!glidedOff(this.flownOff.pos, this.flownOff.z, at)) return;
    this.firstFlown = true;
    triedDoors().add(this.room.id, FIRST_FLIGHT_MARK);
    triedDoors().add(this.room.id, ROOTS_SPOT);
    this.hud.toast(HALL_WORDS.flown, 4200);
    this.sfx.play('bench');
    this.layTrail();
  }

  /** The games of this room's own that the owl has not stood at yet (OP-338, featherTrail.ts PLAY_SPOTS). */
  private untriedSpots(): PlaySpot[] {
    const tried = triedDoors();
    return (PLAY_SPOTS[this.room.id] ?? []).filter((s) => !tried.has(this.room.id, s.id));
  }

  /** The owls in the room as the guardian sees them (guardian.ts): the visitor's own, then the others. */
  private owlsSeen(): OwlSeen[] {
    const seen: OwlSeen[] = [{ id: this.playerId, pos: this.me.pos, z: this.flier.air.z, lifted: this.flier.air.s === LIFTED }];
    for (const o of this.peers.values()) seen.push({ id: o.id, pos: o.pos, z: o.flightHeight(), lifted: o.airMode === LIFTED });
    return seen;
  }

  /** An owl's emote, where the guardian is: a hoot, a bow or a tilt is a call to it, and it answers in kind (guardian.ts). */
  private guardianCalled(id: string, emote: string): void {
    const call = CALLS[emote];
    if (call) this.guardian?.called(id, call, Date.now());
  }

  /**
   * The feather trail (OP-307): a glint on each doorway not tried yet, and feathers from the owl toward
   * one of them (featherTrail.ts, trailDoor), along the way it would walk there (straight in a room seen
   * from the side, where the owl flies). With the trail switched off, or every doorway tried, neither.
   */
  private layTrail(): void {
    const trail = this.trail;
    if (!trail || !this.built || this.leaving) return;
    this.trailIdleAt = Date.now();
    const doors = this.trailOn ? this.untriedDoors() : [];
    const spots = this.trailOn ? this.untriedSpots() : [];
    trail.glint([...spots, ...doors]);
    // To the room's own games first (OP-338), then to play beyond it (OP-337): a course's gate or the
    // arcade's hatch while one is untried, then the nearest of the rest.
    const to = trailTo(this.me.pos, spots, doors, (d) => leadsToPlay(roomFor(this.doorTo(d)?.room ?? '')));
    if (!to) return trail.clear();
    const from = { ...this.me.pos };
    const spot = doorSpot(to);
    if (this.sideView()) return trail.lay([from, spot]);
    const f = this.footingNow();
    const aim = snapToWalkable(spot, f.walkable);
    // Round the guardian, where it is (OP-359): no feather is laid behind it.
    const shade = this.guardian ? guardianShade() : [];
    const legs = wayAround(from, aim, f.walkable, [...f.shut, ...shade, ...doorwaysOff(this.room, from, aim, (id) => this.realmClosed(id), this.walking())]) ?? [];
    trail.lay([from, ...legs, aim]);
  }

  /** Each frame: feathers the owl reaches fade; once they are all gone, standing still a while lays the trail again. */
  private tickTrail(now: number): void {
    const trail = this.trail;
    if (!trail) return;
    trail.tick(this.me.pos);
    // Standing at one of the room's own games for the first time: found, so the trail leads on from here (OP-338).
    let found = false;
    for (const s of playSpotsAt(this.room.id, this.me.pos)) found = triedDoors().add(this.room.id, s.id) || found;
    if (found) return this.layTrail();
    if (this.me.walk || trail.showing) this.trailIdleAt = now;
    else if (now - this.trailIdleAt > TRAIL_IDLE_MS) this.layTrail();
  }

  /**
   * Travel from the map (OP-305): the owl beats its wings and rises up out of the room as it fades, so
   * the trip reads as a short flight and not a cut. In calm motion it only beats its wings.
   */
  private flyAway(ms: number): void {
    this.me.holdAloft({ flapAt: Date.now(), beat: TRAVEL_BEAT });
    if (!this.calm()) this.tweens.add({ targets: this.me.pose, y: this.me.pose.y - TRAVEL_RISE, duration: ms, ease: 'Sine.easeIn' });
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
   * what the collection keeps (the room server's, or this browser's), once that answers and a room has
   * this owl (takeKeptTravel).
   */
  private async refreshTravel(spawn: string | undefined): Promise<void> {
    const gen = this.gen;
    const room = this.room.id;
    this.travelKept = null;
    this.setTravel(travelAfter(this.travelNow(), room, spawn));
    const kept = await this.collection.service.travel().catch(() => null);
    if (gen !== this.gen || !kept) return;
    this.travelKept = { state: kept, room, spawn };
    this.takeKeptTravel();
  }

  /**
   * The room server's word on the map counts once a room has let this owl in (OP-358). On a network that
   * lets the page through and not the room's socket, the Worker still answers, but it has seen the owl
   * walk into no room: its map says "not through the gate" of an owl this page walked through the
   * turnstiles, and taken at its word every place inside asked for the turnstiles again after the first
   * trip. So what it said waits here until the room is online, and a page no room ever has keeps its
   * own map, as a browser with no room server does. A room server that does have the owl still turns a
   * travel away when the gate was left on another screen (notThroughGate).
   *
   * TODO-DOCS (OP-358): docs/ARCHITECTURE.md, v13 (travel from the map): the page takes the travel
   * book's answer (`GET /api/travel`) only once the room it is in has let its owl in.
   */
  private takeKeptTravel(): void {
    const kept = this.travelKept;
    if (!kept || (this.transport.kind === 'edge' && this.lastStatus !== 'online')) return;
    this.travelKept = null;
    this.setTravel(travelAfter(kept.state, kept.room, kept.spawn));
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

  /** How far back this room draws an owl standing on a ledge (OP-173): the tree's rooms only, so today's park draws as ever. */
  private raisedBand(): number {
    return seenFromSide(this.room) ? TREE_RAISED_BAND : 0;
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
    const back: RoomStart = home ? { room: home, spawn: NEST_SPAWN, from: { room: streetOf(this.walking()), spawn: 'from-nest-0' } } : { room: LOBBY_ROOM, spawn: undefined };
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
    if (!frame) cam.startFollow(this.followed(), true, this.followEase(), this.followEase());
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

  /**
   * W or the up arrow (OP-212): in a room seen from the side (the tree), through the doorway or up the
   * stair the owl stands in, at its height; a doorway shut for now says why. A press a moment before
   * the owl stands in one (landing on a stair's top) still counts (UP_GRACE_MS), and up held (the key,
   * or the thumbstick pushed up) takes the doorway the owl walks or stands in (checkDoors). Elsewhere up
   * walks the owl up, as the held keys do, and the press itself does nothing. `at`: when (ms since 1970).
   *
   * TODO-DOCS (OP-212): docs/MAP.md (the rules, and level 1 as built): in the tree a doorway or stair is
   * taken on up (W, the up arrow, the thumbstick pushed up, or the Go in action and E), or by a tap aimed
   * at it, never by walking into or standing in it; the keys walk only left and right there; the up arrow
   * drawn over the doorway the owl stands in. docs/ARCHITECTURE.md's client rules: rooms seen from above
   * keep walking in.
   */
  upKey(at = Date.now()): boolean {
    if (!this.built || this.leaving || !this.sideView()) return false;
    this.upAt = at;
    return true;
  }

  /** Whether the room is seen from the side (the tree, map 2): its doorways open on up, not on walking into them (OP-212). */
  private sideView(): boolean {
    return seenFromSide(this.room);
  }

  /**
   * The doorway the owl stands in that up (or Go in) would take it through, in a side view (OP-212): at
   * its height, leading somewhere now (an open doorway to another room, or a nest's door on the street).
   */
  private doorwayHere(): DoorDef | null {
    if (!this.sideView() || this.passingGate || this.errand) return null;
    const street = isStreetRoom(this.room.id);
    return doorwayUnder(
      this.room.doors,
      this.me.pos,
      (d) => this.atDoorLevel(d),
      (d) => {
        const to = this.doorTo(d);
        return to ? !this.realmClosed(to.room) : street && nestDoorIndex(d.id) !== null;
      },
    );
  }

  /** A tap that walked nowhere: aimed at the doorway the owl stands in (a side view, OP-212), it goes through. */
  private tapIntoDoorway(goal: Vec2): void {
    const here = this.doorwayHere();
    if (here && takesDoorway(here.rect, goal, false, false, true)) this.upAt = Date.now();
  }

  /**
   * The up arrow over the doorway the owl stands in (a side view, OP-212), drawn by the game: a dark
   * disc with a cream arrow (the doorway mark's colours), over the owl's head at the doorway's height,
   * bobbing unless motion is calm. Hidden when the owl stands in none.
   */
  private showUpHint(door: DoorDef | null): void {
    const id = door?.id ?? null;
    if (id === this.upHintDoor) return;
    this.upHintDoor = id;
    if (!door) {
      if (this.upHint) this.tweens.killTweensOf(this.upHint);
      this.upHint?.setVisible(false);
      return;
    }
    if (!this.upHint) {
      const g = this.add.graphics();
      g.fillStyle(0x0c1e36, 0.9).fillCircle(0, 0, UP_HINT.r);
      g.lineStyle(2, 0xf6f1e3, 0.6).strokeCircle(0, 0, UP_HINT.r);
      g.lineStyle(4, 0xf6f1e3, 1);
      g.beginPath();
      g.moveTo(-9, 2);
      g.lineTo(0, -8);
      g.lineTo(9, 2);
      g.moveTo(0, -8);
      g.lineTo(0, 10);
      g.strokePath();
      this.upHint = this.add.container(0, 0, [g]).setDepth(this.room.size.h + 70);
    }
    this.tweens.killTweensOf(this.upHint);
    const x = door.rect.x + door.rect.w / 2;
    const y = groundOf(this.room) - (door.top ?? 0) - UP_HINT.over * (this.room.owlScale ?? 1);
    this.upHint.setPosition(x, y).setVisible(true);
    if (!this.calm()) this.tweens.add({ targets: this.upHint, y: y - UP_HINT.bob, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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
    // The arcade's cabinets whose games are live: Play starts a run (a cabinet switched off says Hatching Soon).
    ...Object.fromEntries(CABINETS.filter((c) => c.live).map((c) => [c.spot, { label: `Play ${GAMES[c.game].name}`, run: () => void this.arcade?.play(c.game) }])),
    // The glass realm's portal: the climb, while the keepers' switch has the portal live.
    portal: { label: 'Climb', run: () => (this.realms.portal ? void this.climb?.play() : this.hud.toast(PORTAL_OFF)) },
    mirror: { label: NEST_WORDS.mirror, run: () => this.lookInMirror() },
    // The sealed hollow's doorway in the grove (OP-310), there only with `?friends=1`.
    'escape-door': { label: ESCAPE_WORDS.door, run: () => void this.doorway?.open() },
  };

  /**
   * A tap that was pressed and let go on the game itself. Phaser finds what is under a release
   * anywhere on the page, so a tap on a HUD button over an NPC owl would otherwise talk to it.
   */
  private onCanvas(p: Phaser.Input.Pointer): boolean {
    return p.downElement === this.game.canvas && p.upElement === this.game.canvas;
  }

  /** Tapping the realm's idol: pledge now if standing at it, otherwise walk up and pledge on arrival. */
  private onIdolTap(pointer: Phaser.Input.Pointer, event: Phaser.Types.Input.EventData, realm: string): void {
    if (this.leaving || !this.onCanvas(pointer) || pointer.getDistance() > TAP_SLOP * this.cfg.pixelRatio) return;
    event.stopPropagation();
    this.tapTakenAt = Date.now();
    this.errand = null;
    if (this.atIdol && this.idolRealm === realm) {
      void this.vote();
      return;
    }
    const spot = this.room.doors.find((d) => voteRealmAt(this.room, d.id) === realm);
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
    /** `shut`: the room it leads to turns this owl away (a keepers' room, a realm the keepers have not opened). */
    doors: Array<{ id: string; x: number; y: number; to: string | undefined; shut: boolean }>;
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
    /** Seen from the side (the tree, OP-212): the doorway the owl stands in that up would take it through, its up arrow shown over it. */
    doorway: string | null;
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
    /** The room's art drawn as size boxes (`?sizes=1`, sizeBoxes.ts): each key whose box is up. */
    sizeBoxes: string[];
    sizeLabels: string[];
    /** The words on the signs at the room's doorways (DoorDef.label). */
    doorSigns: string[];
    /** Seen from above, the words on the one doorway sign showing now (OP-309). */
    signShown: string | null;
    /** Where that sign's words stand (room px), if one shows. */
    signBox: { left: number; right: number; top: number; bottom: number } | null;
    /** The words of the course's tip showing now (OP-344), if any. */
    tipShown: string | null;
    /** Whether this device's owl has glided off one of the Great Hollow's roots (OP-347). */
    firstFlight: boolean;
    /** The words of the prompt over the visitor's own owl (OP-344), if any. */
    promptShown: string | null;
    /** The tall art gone see-through because the visitor's own owl is behind it (OP-346), by its art's key. */
    seeThrough: string[];
    /** The guardian at the heart of the Great Hollow (OP-359), where it is: null on any address without `?guardian=1`. */
    guardian: GuardianState | null;
    /** The feather trail (OP-307): the feathers out now (room px) and the doorways that glint; null in a course. */
    trail: { feathers: Vec2[]; glints: string[]; on: boolean } | null;
    floorShown: boolean;
    edges: number;
    /** The map's places walked into and whether the owl is through the front gate, as this page has them (OP-130). */
    travel: TravelState;
    /** The art tiles that scroll at rates of their own (OP-156): each one's key, scroll factor and where it is drawn. */
    layers: Array<{ key: string; rate: number; x: number; y: number; w: number; h: number; fade: { left: number; right: number } }>;
    /** How big the own owl is drawn against today's park (the tree's owls: 1.25). */
    owlScale: number;
    /** In a room of the tree, what it drew to read at a glance (OP-173): fronts (raised ones among them), shades, ledge edges and doorway marks; and whether the own owl is drawn behind the raised fronts now (it stands on a ledge). */
    tree: (TreeDress & { behind: boolean }) | null;
    /** Where the camera's view is, in room pixels (OP-156: a tree room's camera follows the owl as drawn). */
    view: { x: number; y: number; w: number; h: number };
    /** The ledge painter, when it is up (OP-156, `?paint=1`). */
    paint: PaintDebug | null;
    /** The owl walks this room as a spectator, as its welcome said (OP-191). */
    spectator: boolean;
    /** The dash (OP-224): whether the owl holds it here, whether it is spent this jump, and the dashes made in this room. */
    dash: { holds: boolean; spent: boolean; dashes: number };
    /** The room's wind currents (OP-275) and how many times the own owl was caught by one here. */
    wind: { currents: number; rides: number };
    /** In a parkour course: the course as the room has it for this owl (OP-224). */
    course: ReturnType<Course['debug']>;
    /** The sounds played for this owl on this page, the newest last (OP-350). */
    sounds: string[];
    /** The side camera (OP-351): its lead and the height it holds, and where it looks; null in a room seen from above. */
    sideCam: { lead: number; level: number; x: number; y: number } | null;
  } | null {
    if (!this.built) return null;
    return {
      sounds: this.sfx.heard().slice(-16),
      sideCam: this.sideCam ? { lead: this.sideCam.lead, level: this.sideCam.level, x: this.sideCam.x, y: this.sideCam.y } : null,
      spectator: this.spectator,
      dash: { holds: this.flier.dash !== undefined, spent: this.flier.dash?.spent ?? false, dashes: this.dashes },
      wind: { currents: this.room.winds?.length ?? 0, rides: this.windRides },
      course: this.course?.debug() ?? null,
      room: this.room.id,
      doors: this.room.doors.map((d) => ({ id: d.id, x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2, to: this.doorTo(d)?.room, shut: this.realmClosed(this.doorTo(d)?.room) })),
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
      // One entry a tile: a fading tile's strips are placed alike, so its middle stands for it.
      layers: this.parallax
        .filter(({ img }) => (img.getData('fade') ?? 'middle') === 'middle')
        .map(({ t, img }) => ({ key: t.key, rate: img.scrollFactorX, x: img.x, y: img.y, w: img.displayWidth, h: img.displayHeight, fade: tileFade(t) })),
      owlScale: this.me.scaleX / (OWL_SCALE * speciesOf(this.look).size),
      tree: this.treeDress && { fronts: this.treeDress.fronts, raised: this.treeDress.raised, shades: this.treeDress.shades, lips: this.treeDress.lips, marks: this.treeDress.marks, barriers: this.treeDress.barriers, landings: this.treeDress.landings, behind: this.me.depth < this.treeDress.raisedDepth },
      view: (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(this.cameras.main.worldView),
      wings: this.me.wingsOut,
      npcs: [...this.npcs.values()].map((n) => ({ id: n.id, x: n.def.pos.x, y: n.def.pos.y, mark: this.spectator ? null : this.quests.markFor(n.id), approach: n.approaching })),
      objects: interactablesIn(this.room.id).map((d) => ({ id: d.id, kind: d.kind, x: d.pos.x, y: d.pos.y, top: d.top ?? 0, here: this.piles.get(d.id)?.here ?? true })),
      items: [...this.items.values()].map((m) => ({ quest: m.quest, n: m.n, kind: m.kind, x: m.pos.x, y: m.pos.y, top: m.top })),
      actions: this.actions.map((a) => a.id),
      doorway: this.upHint?.visible ? this.upHintDoor : null,
      talkingTo: this.talkingTo,
      play: this.play?.debug() ?? null,
      wall: this.arcade?.wall() ?? null,
      street: isStreetRoom(this.room.id) ? this.street : null,
      nest: this.nestView
        ? { id: this.nestView.nestId, mine: this.nestMine, open: this.nestView.open, layout: this.nestView.layout, drawn: this.decor?.drawn() ?? {}, owned: this.owned, gift: this.nestGift, decorating: this.decorating, spot: this.decorSpot }
        : null,
      mirror: this.mirror ? { ...NEST_MIRROR, stage: this.mirrorFrame } : null,
      soft: [...this.soft],
      sizeBoxes: roomArtKeys(this.room.id, drawnRoom(this.room, this.cfg)).filter((k) => drawnAsSizeBox(k) && this.textures.exists(k)),
      sizeLabels: this.sizeLabels?.keys() ?? [],
      doorSigns: this.doorSigns?.labels() ?? [],
      signShown: this.doorSigns?.shown() ?? null,
      signBox: this.doorSigns?.shownBox() ?? null,
      tipShown: this.tips?.shown() ?? null,
      firstFlight: this.firstFlown,
      promptShown: this.reach?.shown() ?? null,
      seeThrough: this.seeThrough?.faded() ?? [],
      guardian: this.guardian?.state() ?? null,
      trail: this.trail ? { ...this.trail.debug(), on: this.trailOn } : null,
      floorShown: this.floorShown,
      edges: this.edgesDrawn,
      travel: this.travelNow(),
      paint: this.painter?.debug() ?? null,
    };
  }

  // ---------- NPC owls, interactables and quests ----------

  /** The room's residents: NPC owls, leaf piles, and glows under the things that stay put. */
  private addResidents(): void {
    const scale = itemScale(this.cfg.pixelRatio);
    for (const def of npcsIn(this.room.id)) this.npcs.set(def.id, new NpcOwl(this, def, scale, (npc, pointer, event) => this.onNpcTap(npc, pointer, event)));
    for (const def of interactablesIn(this.room.id)) {
      if (def.kind === 'leaf-pile') this.piles.set(def.id, new LeafPile(this, def));
      else if (FLOOR_KINDS.has(def.kind)) {
        const thing = new FloorThing(this, def);
        this.things.set(def.id, thing);
        if (KIND_RULES[def.kind].shared) this.piles.set(def.id, thing);
      } else this.glows.set(def.id, new SpotGlow(this, def));
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
      this.things.get(def.id)?.setNear(close);
      if (!close || this.piles.get(def.id)?.here === false) continue;
      out.push({ id: `use:${def.id}`, label: rules.label, run: () => void this.use(def.id) });
    }
    // Lanterns, fishing and the robot owl's game where the owl stands.
    if (this.play) out.push(...this.play.actions(pos));
    if (this.party) out.push(...this.party.actions(pos));
    return out;
  }

  /** Ask for the quest board; come back when the park day turns, or soon if the room did not answer. */
  private async refreshBoard(): Promise<void> {
    const gen = this.gen;
    const link = this.link;
    // A spectator's quests are locked (OP-191): asked for again once a ticket makes it a visitor.
    if (!link || this.spectator) return;
    const res = await link.board();
    if (gen !== this.gen || this.leaving || !this.scene.isActive()) return;
    this.boardTimer?.remove();
    if (!res.board) {
      if (res.reason === 'spectator') return;
      if (res.reason === 'offline') this.quests.setOffline(true);
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
    // A spectator's quests are locked (OP-191): no marks over the NPC owls, and no quest items drawn.
    for (const npc of this.npcs.values()) npc.setMark(this.spectator ? null : this.quests.markFor(npc.id));
    const wanted = new Map<string, { quest: string; n: number; kind: QuestItemMarker['kind']; x: number; y: number; top?: number }>();
    for (const q of this.spectator ? [] : (board?.active ?? [])) for (const it of q.items) if (it.room === this.room.id) wanted.set(`${q.id}#${it.n}`, { quest: q.id, ...it });
    for (const [key, m] of this.items) {
      if (wanted.has(key)) continue;
      m.destroy();
      this.items.delete(key);
    }
    for (const [key, it] of wanted) if (!this.items.has(key)) this.items.set(key, new QuestItemMarker(this, it.quest, it.n, it.kind, { x: it.x, y: it.y }, it.top ?? 0));
    this.askPuzzles();
    this.drawPuzzles();
  }

  // ---------- puzzle quests (OP-255): runs of locks, clues and keys ----------

  /** Ask for the run of each puzzle quest carried that this room has not asked about yet. */
  private askPuzzles(): void {
    if (this.spectator || !this.link) return;
    for (const q of this.quests.puzzleQuests) {
      if (q.ready || this.puzzlesAsked.has(q.id)) continue;
      this.puzzlesAsked.add(q.id);
      void this.puzzleStep('state', q.id);
    }
  }

  /** Draw this room's pieces of every run the owl is in: lock posts, clues to read, keys to pick up. */
  private drawPuzzles(): void {
    const room = this.room.id;
    const wanted = new Map<string, { quest: string; lock: string; kind: PuzzleMarkKind; n: number; x: number; y: number; top: number; look: PuzzleMarkLook }>();
    const add = (quest: string, lock: string, kind: PuzzleMarkKind, n: number, at: { x: number; y: number; top?: number }, look: PuzzleMarkLook) =>
      wanted.set(markKey(quest, lock, kind, n), { quest, lock, kind, n, x: at.x, y: at.y, top: at.top ?? 0, look });
    for (const [quest, view] of this.spectator ? [] : this.quests.puzzles) {
      if (!view.run) continue;
      for (const l of view.locks) {
        if (l.post.room === room) add(quest, l.id, 'lock', 0, l.post, { kind: 'lock', state: l.open ? 'open' : l.available ? 'ready' : 'waiting' });
        if (l.open || !l.available) continue;
        for (const c of l.clues) if (c.room === room) add(quest, l.id, 'clue', c.n, c, { kind: 'clue', symbol: c.symbol });
        if (l.key && !l.hasKey && l.key.room === room) add(quest, l.id, 'key', 0, l.key, { kind: 'key' });
      }
    }
    for (const [key, m] of this.puzzleMarks) {
      if (wanted.has(key)) continue;
      m.destroy();
      this.puzzleMarks.delete(key);
    }
    for (const [key, w] of wanted) {
      const m = this.puzzleMarks.get(key);
      if (m) m.setLook(w.look);
      else this.puzzleMarks.set(key, new PuzzleMarker(this, w.quest, w.lock, w.kind, w.n, { x: w.x, y: w.y }, w.top, w.look));
    }
  }

  private lockView(quest: string, lock: string): LockView | undefined {
    return this.quests.puzzles.get(quest)?.locks.find((l) => l.id === lock);
  }

  /** Standing at a piece works it: a clue is read, a key picked up, a key lock opened, a code lock's pad shown. */
  private checkPuzzles(now: number): void {
    if (this.spectator) return;
    const reach = PUZZLE_REACH - 12;
    let at: string | null = null;
    for (const [key, m] of this.puzzleMarks) {
      const d = distance(this.me.pos, m.pos);
      if (d > reach || !this.atLevel(m)) continue;
      const l = this.lockView(m.quest, m.lock);
      if (!l) continue;
      if (m.kind === 'lock') {
        if (l.open) continue;
        at = key;
        if (this.atLock === key) continue;
        this.atLock = key;
        if (!l.available) this.hud.toast(`${l.name} will not budge until the locks before it are open.`, 3200);
        else if (l.kind === 'code') this.hud.openLock(m.quest, l);
        else if (!l.hasKey) this.hud.toast(`${l.name} needs its key. ${l.hint}`, 3600);
        continue;
      }
      const retryAt = this.puzzleBusy.get(key);
      if (retryAt !== undefined && now < retryAt) continue;
      if (this.me.walking && d > reach / 2) continue;
      if (m.kind === 'clue' && this.cluePending(l, m.n)) void this.workPiece(m, 'look');
      else if (m.kind === 'key') void this.workPiece(m, 'take');
    }
    // A key lock opens as soon as the owl stands at it with its key.
    if (at) {
      const m = this.puzzleMarks.get(at);
      const l = m && this.lockView(m.quest, m.lock);
      if (m && l && l.kind === 'key' && l.hasKey && l.available && !this.puzzleBusy.has(at)) void this.workPiece(m, 'open');
    }
    if (!at && this.atLock) {
      const showing = this.hud.lockShowing();
      if (showing && this.atLock.startsWith(`${showing.quest}|${showing.lock}|`)) this.hud.closeLock();
      this.atLock = null;
    }
  }

  private cluePending(l: LockView, n: number): boolean {
    return !l.clues.find((c) => c.n === n)?.symbol;
  }

  /** Read a clue, take a key or open a key lock, as the owl stands at it. */
  private async workPiece(m: PuzzleMarker, op: 'look' | 'take' | 'open'): Promise<void> {
    this.puzzleBusy.set(m.key, Number.POSITIVE_INFINITY);
    const res = await this.puzzleStep(op, m.quest, op === 'look' ? { lock: m.lock, n: m.n } : { lock: m.lock });
    if (!res) return void this.puzzleBusy.set(m.key, Date.now() + PICKUP_RETRY_MS * 3);
    if (!res.ok) {
      this.puzzleBusy.set(m.key, Date.now() + (res.reason === 'far' ? PICKUP_RETRY_MS : PICKUP_RETRY_MS * 4));
      if (res.reason === 'spectator') this.offerDayTicket(SPECTATOR_WORDS.locked);
      return;
    }
    this.puzzleBusy.delete(m.key);
    m.pulse();
    const l = this.lockView(m.quest, m.lock);
    if (!l) return;
    if (op === 'look') {
      const symbol = l.clues.find((c) => c.n === m.n)?.symbol;
      if (symbol) this.hud.toast(`A clue for ${l.name}: symbol ${m.n + 1} of ${l.length} is the ${symbol}.`, 4200, '#9FE8FF');
    } else if (op === 'take') this.hud.toast(`You found the key to ${l.name}. Take it to ${l.place}.`, 4200, '#FFD36A');
    else this.hud.toast(`${l.name} is open!`, 3600, '#8FE3A8');
  }

  /** One step of a puzzle quest's run; the run and the board follow the answer. Null when nothing was asked. */
  private async puzzleStep(op: PuzzleStep | 'near', quest: string, args: PuzzleArgs = {}): Promise<PuzzleReply | null> {
    const link = this.link;
    if (!link || this.spectator) return null;
    const gen = this.gen;
    const res = await link.puzzle(op, quest, args);
    if (gen !== this.gen) return null;
    if (res.view) this.quests.setPuzzle(quest, res.view);
    if (res.near) this.quests.setNear(quest, res.near);
    if (res.board) this.applyBoard(res.board);
    this.showUpdates(res.updates);
    return res;
  }

  /** The Quests tab's buttons on a puzzle quest: start a run, look for owls close by, join one, leave. */
  async puzzleAction(op: 'start' | 'near' | 'join' | 'leave', quest: string, owl?: string): Promise<boolean> {
    if (this.spectator) {
      this.offerDayTicket(SPECTATOR_WORDS.locked);
      return false;
    }
    const res = await this.puzzleStep(op, quest, owl ? { with: owl } : {});
    if (!res) {
      this.hud.toast('The park did not catch that. Try again in a moment.', 3000);
      return false;
    }
    if (res.ok) {
      if (op === 'start') this.hud.toast(res.view?.run && res.view.mine ? 'Back to it! Your own opened locks came with you.' : 'A new run: fresh clues and fresh codes. Good luck!', 3600);
      else if (op === 'join') this.hud.toast(`You joined a run of ${res.view?.run?.members ?? 2} owls. Locks open from here on count for you too.`, 3800);
      else if (op === 'leave') this.hud.toast('You left the run. The locks you opened stay yours.', 3200);
      else if (op === 'near' && !res.near?.length) this.hud.toast('No owl close by is on this puzzle. Stand next to a friend who started a run.', 3600);
      return true;
    }
    const words: Record<string, string> = {
      far: 'Stand right next to that owl to join its run.',
      full: 'That run is full: four owls at most.',
      'no-run': 'That owl is not in a run of this puzzle.',
      'not-active': 'Take the quest on first.',
      self: 'That is your own run.',
    };
    this.hud.toast(words[res.reason ?? ''] ?? 'The park did not catch that. Try again in a moment.', 3200);
    return false;
  }

  /** The code pad's Try: the room checks the code. */
  async tryCode(quest: string, lock: string, code: PuzzleSymbol[]): Promise<boolean> {
    const res = await this.puzzleStep('open', quest, { lock, code });
    if (!res) {
      this.hud.lockNote('The park did not catch that. Try again.');
      return false;
    }
    if (res.ok) {
      const l = this.lockView(quest, lock);
      this.hud.closeLock();
      this.hud.toast(`${l?.name ?? 'The lock'} is open!`, 3600, '#8FE3A8');
      for (const m of this.puzzleMarks.values()) if (m.quest === quest && m.lock === lock && m.kind === 'lock') m.pulse();
      return true;
    }
    const words: Record<string, string> = {
      wrong: res.left ? `Not quite. ${res.left} ${res.left === 1 ? 'try' : 'tries'} before it jams.` : 'Not quite, and now it is jammed. Wait a moment.',
      jammed: 'The lock is jammed. Wait a moment.',
      far: 'Step right up to the lock first.',
      locked: 'The locks before this one are not open yet.',
    };
    this.hud.lockNote(words[res.reason ?? ''] ?? 'The park did not catch that. Try again.');
    return false;
  }

  /** The run of a puzzle quest as the page has it (the test hooks). */
  puzzleView(quest: string): PuzzleView | null {
    return this.quests.puzzles.get(quest) ?? null;
  }

  /** Walk to a piece of a run in this room (the test hooks): `kind` a lock, a clue (`n`) or a key. */
  walkToPiece(quest: string, lock: string, kind: PuzzleMarkKind, n = 0): boolean {
    const m = this.puzzleMarks.get(markKey(quest, lock, kind, n));
    if (!m) return false;
    this.walkTo(m.pos);
    return true;
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
    // The NPC owls' quests and Nova's shop are ticket holders' (OP-191).
    if (this.spectator) return this.offerDayTicket(SPECTATOR_WORDS.locked);
    if (!this.link) return void this.hud.toast(`${npc.def.name} is lost in thought. Try again in a moment.`, 3000);
    const gen = this.gen;
    this.busy = true;
    try {
      const res = await this.link.talk(id);
      if (gen !== this.gen || this.leaving) return;
      if (!res.ok) {
        if (res.reason === 'spectator') return this.offerDayTicket(SPECTATOR_WORDS.locked);
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
    // A free guest flops, browses and basks too (OP-243): the room server makes it count for nothing.
    const gen = this.gen;
    this.busy = true;
    try {
      const res = await this.link.use(id);
      if (gen !== this.gen || this.leaving) return;
      if (!res.ok) {
        if (res.reason === 'spectator') this.offerDayTicket(SPECTATOR_WORDS.locked);
        else if (res.reason === 'gone') this.hud.toast('Someone flopped in first. The leaves will blow back together soon.', 3200);
        else if (res.reason === 'far') this.hud.toast('A little closer...', 2000);
        else if (res.reason !== 'busy') this.hud.toast('The park did not catch that. Try again in a moment.', 3000);
        return;
      }
      if (def.kind === 'leaf-pile') {
        // A free guest's flop (OP-243): the leaves fly for everyone, nothing turns up, and it is told why once.
        const hint = res.practice ? this.leafHint().say() : null;
        if (hint) this.time.delayedCall(FLOP_LAND_MS + 150, () => gen === this.gen && this.hud.toast(hint, 3600));
        if (res.feathers > 0) {
          const n = res.feathers;
          this.time.delayedCall(FLOP_LAND_MS + 150, () => {
            if (gen !== this.gen) return;
            featherFind(this, def.pos, () => ({ x: this.me.pos.x, y: this.me.pos.y - this.flier.air.z }), () => this.collection.setFeathers(res.total), def.top ?? 0);
            this.sfx.play('feather');
            this.hud.toast(n === 1 ? 'A feather was hiding in the leaves! +1 feather' : `Feathers were hiding in the leaves! +${n} feathers`, 3200, '#FFD36A');
          });
        }
      } else if (def.kind === 'shiny') {
        // Picked up: a free guest's turns up nothing; otherwise now and then it was worth a feather.
        this.me.playEmote('peek');
        if (res.feathers > 0) {
          const n = res.feathers;
          this.time.delayedCall(300, () => {
            if (gen !== this.gen) return;
            featherFind(this, def.pos, () => ({ x: this.me.pos.x, y: this.me.pos.y - this.flier.air.z }), () => this.collection.setFeathers(res.total));
            this.sfx.play('feather');
            this.hud.toast(n === 1 ? 'A feather was tucked under it! +1 feather' : `Feathers were tucked under it! +${n} feathers`, 3200, '#FFD36A');
          });
        } else {
          const lines = USE_LINES[def.kind] ?? [];
          const line = lines[Math.floor(Math.random() * lines.length)];
          if (line) this.hud.toast(line, 2800);
        }
      } else {
        this.glows.get(id)?.pulse();
        const thing = this.things.get(id);
        if (thing) {
          thing.respond();
          // The owl joins in: shakes the water off, bounces, tilts its head at the stars.
          this.me.playEmote(def.kind === 'bird-bath' ? 'shiver' : def.kind === 'mushroom' ? 'hop' : 'tilt');
        }
        const lines = USE_LINES[def.kind] ?? [];
        const line = lines[Math.floor(Math.random() * lines.length)];
        if (line) this.hud.toast(line, 2800);
        if (!res.practice) this.collection.setFeathers(res.total);
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
    // A shiny thing is picked up where it lies; a leaf pile is flopped into.
    if (pile instanceof FloorThing) {
      if (by !== null) owl?.playEmote('peek');
      pile.poof(until);
      return;
    }
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
    if (!link || this.spectator) return;
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
    else if (res.reason === 'full') {
      // Each tier has its own room (OP-254).
      const cadence = getQuest(quest)?.cadence;
      const tier = cadence === 'daily' ? 'daily' : cadence === 'weekly' ? 'weekly' : cadence === 'monthly' ? 'monthly' : 'story';
      const slots = cadence ? ACTIVE_SLOTS[cadence] : MAX_ACTIVE_QUESTS;
      this.hud.toast(`You can carry ${slots} ${tier} quests at once. Finish or drop one first.`, 3800);
    }
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
    this.guardianCalled(this.playerId, e);
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

  /**
   * Shift or the pad's Dash (OP-224, dash.ts): in a parkour course, up in the air, once a jump, a short
   * burst along the held keys or the stick (else the way the owl faces), as far as the footing goes.
   * The room checks it as it checks a walk and the flight; it comes back on landing (flight.ts).
   */
  dashDown(at = Date.now()): boolean {
    if (!this.built || this.leaving || !this.flier.dash) return false;
    if (dashRefusal(this.flier.dash, true, this.flier.air.s !== GROUNDED, at) !== null) return false;
    const f = this.footingNow();
    const to = dashEnd(this.me.pos, dashHeading(this.keys?.direction() ?? null, this.me.facing()), f.walkable, f.shut);
    if (distance(to, this.me.pos) < 3) return false;
    this.flier = { ...this.flier, dash: spendDash(this.flier.dash, at) };
    this.dashes += 1;
    this.sfx.play('dash');
    this.walkGoal = null;
    this.wayTo = null;
    this.keyWalk = false;
    const walk: Walk = { from: { ...this.me.pos }, to, startedAt: Date.now(), dash: true };
    this.me.startWalk(walk);
    this.conn?.send({ t: 'move', id: this.playerId, walk });
    this.conn?.track(this.snapshot());
    return true;
  }

  /**
   * Held in a wind current (OP-275, wind.ts): carried downwind to its far end, as a walk the room checks
   * like any other. Keys held against the wind keep the owl where they steer it (it hangs in the air);
   * keys with it, or none, ride on.
   */
  private rideWind(w: WindCurrent, caught: boolean): void {
    if (caught) this.windRides += 1;
    const held = this.heldWay();
    if (held && Math.sign(held.x) === -w.dir) return;
    const to = { x: windEnd(w), y: this.me.pos.y };
    const walk = this.me.walk;
    if (walk && Math.abs(walk.to.x - to.x) < 3 && !walk.dash) return;
    if (Math.abs(this.me.pos.x - to.x) < 3) return;
    this.walkTo(to);
  }

  /**
   * A fall in a course, shown (OP-343). The owl is back where the fall takes it at once, as ever; the
   * camera goes with it in the same frame, where it used to slide back across the room after an owl
   * that had silently moved, and the room blinks dark and comes back, so the player sees that something
   * happened (the course says where the owl is). With calm motion on there is no blink. And it stays
   * where it is put until its player pushes afresh (OP-360).
   */
  private fellTo(at: Vec2, top = 0): void {
    this.placeAt(at, top);
    // A push held through the fall does not walk the owl off the ledge it is put on (doors.ts, heldAtFall).
    this.fallHeld = heldAtFall(this.keys?.direction() ?? null, this.keys?.rests() ?? 0);
    const cam = this.cameras.main;
    if (!this.mirrorFrame && !this.decorating) cam.startFollow(this.followed(), true, this.followEase(), this.followEase());
    if (!this.calm()) cam.fadeIn(FALL_BLINK_MS, 12, 30, 54);
  }

  /** Back where a fall in a course takes the owl (OP-224): there at once, standing, and the room told. */
  private placeAt(at: Vec2, top = 0): void {
    this.walkGoal = null;
    this.wayTo = null;
    this.keyWalk = false;
    this.me.place(at);
    this.stop();
    // Standing where it is put (a course's fall): on the floor, or up on the ledge of the bench it is back
    // at. Left as it was, an owl that fell in the air would go on falling there, and one put back under a
    // bench up on a ledge over a pit would stand on the pit's floor and fall again, over and over.
    if (top > 0 || this.flier.air.s !== GROUNDED || this.flier.air.z !== 0) {
      this.flier = { ...this.flier, air: { z: top, vz: 0, s: GROUNDED, f: 0 } };
      this.drawnAir = this.flier.air;
      this.me.fly(this.flier.air, Date.now());
      this.retellAir();
    }
  }

  /** Jump pressed now and let go `holdMs` after the press takes, set at once (the tests and the console). */
  jumpFor(holdMs: number): boolean {
    if (!this.jumpDown()) return false;
    this.jumpUp(this.jumpDownAt + holdMs);
    return true;
  }

  /**
   * What the room's perches are this frame, before the flight steps: the room's own, with the brush
   * stones' ink as it stands (OP-235: a landing on a stone, by this owl or one the page sees, paints it)
   * and without the neon signs that are dark (circuit.ts, by park time). So an owl stands on a bridge
   * while it lasts and on a sign while it is lit, and drops through once either is gone.
   */
  private standPerches(now: number): void {
    const { brush, signs } = this;
    if (!brush && !signs) return;
    let perches = this.ownRoom.perches ?? [];
    let key = '';
    if (brush) {
      const owls = [
        { id: this.playerId, x: this.me.pos.x, z: this.flier.air.z, grounded: this.flier.air.s === GROUNDED },
        ...[...this.peers.values()].map((o) => ({ id: o.id, x: o.pos.x, z: o.flightHeight(), grounded: o.airMode === GROUNDED })),
      ];
      brush.update(now, owls);
      const live = brush.perches(perches, now);
      perches = live.perches;
      key = live.key;
    }
    if (signs) {
      const park = now + this.clockSkew();
      signs.update(park);
      const lit = signs.perches(perches, park);
      perches = lit.perches;
      key += `#${lit.key}`;
    }
    if (key !== this.standKey) {
      this.standKey = key;
      this.room = { ...this.ownRoom, perches };
    }
  }

  /** The room server's clock less this page's (ms), as the socket reckons it; 0 without one. */
  private clockSkew(): number {
    const server = this.conn?.serverNow?.();
    return server === undefined ? 0 : server - Date.now();
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
      // Where the owl is at this step, along its walk (OP-353), not where the last frame drew it. A frame
      // holds many steps, and a frame's walk is 4 px at sixty frames a second and 26 at ten: read a frame
      // behind, the near edge of a ledge was not under an owl coming down onto it, so the same hop
      // landed on a quick device and fell short on a slow one.
      const place = this.me.placeAt(at);
      // The room's gusts keep the room server's time (updraft.ts): the column this owl is in, while it is on.
      // Else a wind current it glides into (wind.ts, OP-275) holds it at the current's height.
      const column = this.room.updrafts ? (liftAt(this.room.updrafts, place.x, this.flier.air.z, at + this.clockSkew())?.top ?? null) : null;
      const gust = column === null ? windAt(this.room.winds, place.x, this.flier.air.z) : undefined;
      // Else, in a room seen from above, the thermal it glides in carries it up to its top (thermal.ts, OP-340).
      const warm = column === null && !gust ? (thermalAt(this.room.thermals, place, this.flier.air.z)?.top ?? null) : null;
      const lift = column ?? gust?.z ?? warm;
      const wasLifted = this.flier.air.s === LIFTED;
      const stoodAt = this.flier.air.z;
      const before = this.flier.air;
      this.flier = stepFlier(this.flier, { pressed, held }, groundAt(this.room.perches, place, this.flier.air.z), this.abilities, lift);
      const air = this.flier.air;
      // What the step did is heard (OP-350): a jump, a flap, the wings spread, a landing.
      for (const c of airCues(before, air)) this.sfx.play(c.cue, c.strength);
      // Taken up by a thermal: the camera draws back with the owl's height from here until it is down again (frameRise).
      if (warm !== null && air.s === LIFTED && !this.rise) this.rise = { from: air.z, top: warm, covered: this.hud.coveredEdges(), back: false };
      if (gust && air.s === LIFTED && air.h === gust.z) this.rideWind(gust, !wasLifted);
      const level = footingLevel(this.room, air.z);
      if (level !== this.footLevel) {
        this.footLevel = level;
        this.reaim();
      }
      if (air.s !== GROUNDED) {
        if (grounded) {
          this.flown = { n: this.flown.n + 1, peak: 0, glided: false, ms: 0 };
          this.flownFrom = at;
          this.flownOff = { pos: { x: place.x, y: place.y }, z: stoodAt };
        }
        this.flown.peak = Math.max(this.flown.peak, air.z);
        if (air.s === GLIDING || air.s === LIFTED) this.flown.glided = true;
      } else if (!grounded) {
        this.flown.ms = at - this.flownFrom;
        this.landedFromFlight(place);
      }
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
        this.conn?.send({ t: 'air', id: this.playerId, air: airOut(air), at });
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
    if (this.heldWay()) {
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
    this.conn?.send({ t: 'air', id: this.playerId, air: airOut(air), at });
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
    this.hud.clearReply();
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
    // A walk asked for by a tap is the player's first move: the opening look comes in (townView.ts). Held keys do it in frameOpening.
    if (!fromKeys) this.cutOpening();
    const f = this.footingNow();
    let to = resolveTarget({ ...this.me.pos }, target, f.walkable, f.shut);
    // Kept for a jump to carry on (OP-084): a perch's top asked for from the floor stops at its face.
    this.walkGoal = goal;
    this.wayTo = null;
    // A tap that a straight walk stops short of, at a bend in the floor: there by the way around it,
    // the first leg now (OP-148). A perch's top asked for from the floor has no way round: its face.
    const aim = snapToWalkable(target, f.walkable);
    if (!fromKeys && distance(to, aim) > WAY_SHORT_PX) {
      const legs = wayAround({ ...this.me.pos }, aim, f.walkable, [...f.shut, ...doorwaysOff(this.room, this.me.pos, aim, (id) => this.realmClosed(id), this.walking())]);
      if (legs?.[0]) {
        to = resolveTarget({ ...this.me.pos }, legs[0], f.walkable, f.shut);
        this.wayTo = aim;
      }
    }
    if (distance(to, this.me.pos) < 3) return false;
    const walk: Walk = { from: { ...this.me.pos }, to, startedAt: Date.now() };
    this.keyWalk = fromKeys;
    if (!fromKeys) this.coasting = false;
    this.me.startWalk(walk);
    this.conn?.send({ t: 'move', id: this.playerId, walk });
    this.conn?.track(this.snapshot());
    return true;
  }

  /**
   * For the browser tests (OP-212): walk to `target` as the held keys walk, never through a doorway by
   * itself, and on to where it ends with no key held, so a test can stand the owl inside a doorway
   * however slow its runner's frames are.
   */
  walkAsKeys(target: Vec2): boolean {
    const walked = this.walkTo(target, true);
    this.coasting = walked;
    return walked;
  }

  /** On round a bend to where a tap asked (OP-148), from where the last leg ended: false when the owl can go no further. */
  private walkOn(): boolean {
    const aim = this.wayTo;
    if (aim && this.walkTo(aim, false, this.walkGoal)) return true;
    this.wayTo = null;
    return false;
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
    // The step since the last look, when both ends are on the walk the owl was on then: a straight line,
    // which a slow frame can carry well into a doorway or right over a narrow stretch of one (OP-124).
    // A place changed any other way (arriving, put right by the room) is no step.
    const last = this.doorLook;
    const walk = last?.walk ?? null;
    const onWalk = (p: Vec2) => walk !== null && distance(p, closestPointOnSegment(p, walk.from, walk.to)) < 1;
    const stepFrom = last && onWalk(last.pos) && onWalk(pos) ? last.pos : null;
    this.doorLook = { pos: { x: pos.x, y: pos.y }, walk: this.me.walk };
    // Seen from the side (the tree), a doorway opens on up, not on walking into it (OP-212).
    // Up pressed a moment ago (the up key or Go in), or held (the up key, or the thumbstick pushed up).
    const side = this.sideView();
    const pressed = side && upCounts(this.upAt, Date.now());
    if (this.upAt && !pressed) this.upAt = 0;
    const upNow = pressed || (side && !this.decorating && holdsUp(this.heldNow()));
    const spots: string[] = [];
    let idolRealm: string | null = null;
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
      const to = this.doorTo(door);
      const inside = pointInRect(pos, door.rect);
      // A doorway to another room takes the owl from where its step came in, a step across it included.
      const cameIn = (to && stepFrom ? entryPoint(door.rect, stepFrom, pos) : null) ?? (inside ? pos : null);
      if (!cameIn || !this.atDoorLevel(door)) continue;
      // The way back, to an owl still holding the keys it came in with: not until it lets go (a new press of up is a new push).
      if (this.backWaiting && !pressed && this.leadsBack(door)) continue;
      // Up pressed or held standing in it (a side view): through it; a press says a shut one's sign, once (OP-212).
      const up = upNow && inside && this.errand === null;
      const said = walkFinished || (up && pressed);
      if (up) this.upAt = 0;
      const nestDoor = isStreetRoom(this.room.id) ? nestDoorIndex(door.id) : null;
      if (nestDoor !== null) {
        if ((up || takesDoorway(door.rect, this.me.walk?.to ?? null, this.keyWalk, this.errand !== null, side)) && this.enterNest(nestDoor, said)) return;
        continue;
      }
      if (to) {
        if (this.realmClosed(to.room)) {
          // The arch into a gated realm the keepers have not opened: its blockade's phrase, and no way through.
          if (door.closedSign && said) this.hud.toast(door.closedSign);
          continue;
        }
        // A walk that ended past a doorway it crossed in its last frame goes through only as one that ends there would.
        if (!up && !takesDoorway(door.rect, (this.me.walk ?? (stepFrom ? walk : null))?.to ?? null, this.keyWalk, this.errand !== null, side)) continue;
        // A course's doorway that waits on its run (the way to the finish with parts left, OP-343): its words, and no way through yet.
        const waits = this.course?.holds(to.room) ?? null;
        if (waits !== null) {
          if (said) this.hud.toast(waits, 2600);
          continue;
        }
        triedDoors().add(this.room.id, door.id);
        if (door.id === 'gate') {
          void this.throughGate(door, cameIn);
          return;
        }
        // Out of a nest, the owl comes back out by the street door it went in by.
        const spawn = isNestRoom(this.room.id) && isStreetRoom(to.room) ? streetSpawnBack(this.cameFrom) : to.spawn;
        void this.goTo(to.room, spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined }, LEAVE_FADE_MS, laneThrough(this.room, door, cameIn));
        return;
      }
      // A Realm Vote spot, one of several or the room's one, offers the vote for its own realm.
      const votes = voteRealmAt(this.room, door.id);
      if (votes) {
        if (!spots.includes('idol')) spots.push('idol');
        idolRealm = votes;
      } else if (this.interactions[door.id]) spots.push(door.id);
      if (door.closedSign && said) this.hud.toast(door.closedSign);
      if (walkFinished && cabinetAt(this.room.id, door.id)?.live === false) this.hud.toast(CABINET_OFF);
    }
    // Standing in a doorway seen from the side: an up arrow over it, and Go in first among the actions
    // (the pad's Interact and E on a phone or a computer), which presses up (OP-212).
    if (this.doorway?.at(pos)) spots.push('escape-door');
    else this.doorway?.close();
    const here = side ? this.doorwayHere() : null;
    if (side) this.showUpHint(here);
    const goIn: Action[] = here ? [{ id: `door:${here.id}`, label: GO_IN, run: () => void this.upKey() }] : [];
    this.actions = [...goIn, ...this.actionsHere(spots), ...(this.hollow?.actions() ?? [])];
    this.hud.setActions(this.actions.map(({ id, label }) => ({ id, label })));
    // The same, over the owl itself (OP-344): not while it talks, sleeps, decorates, leaves, or says something of its own.
    const busy = this.talkingTo !== null || this.decorating || this.leaving || !!this.sleptAt || (this.bubbles?.showing().some((b) => b.id === this.me.id) ?? false);
    this.reach?.show(busy ? null : promptWords(this.actions[0], TOUCH_SCREEN));
    this.atIdol = spots.includes('idol');
    this.idolRealm = idolRealm;
    if (this.atIdol && walkFinished && this.pendingVote) {
      this.pendingVote = false;
      void this.vote();
    }
  }

  /** Remember today's pledge on the owl (visible to everyone) and tell the idol. */
  private pledged(realm: string): void {
    (this.pieces.idols?.[realm] ?? this.pieces.idol)?.react();
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
    // The Realm Vote is ticket holders' (OP-191): its line, then the Day Ticket.
    if (this.spectator) {
      this.hud.toast(SPECTATOR_WORDS.idol, 4000);
      return this.offerDayTicket(SPECTATOR_WORDS.idol);
    }
    this.voting = true;
    try {
      // At a realm's idol, or at its idol in a Commons of the hollow hall (`votesFor`).
      const realm = this.idolRealm ?? this.room.votesFor ?? this.room.id;
      const outcome = await castVote(this.transport, realm);
      switch (outcome.kind) {
        case 'voted':
          this.pledged(outcome.realm);
          this.hud.toast('Your vote for this realm is in. One vote a day, so come back tomorrow.', 4000);
          break;
        case 'already':
          if (outcome.votedFor === realm) this.pledged(realm);
          this.hud.toast(outcome.votedFor === realm ? 'You already voted for this realm today.' : 'You already voted today. Each day brings one vote.', 3500);
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

  /** Whether the pass that came from this ticket's offer has come (C42, OP-180). */
  private async passCame(id: string): Promise<boolean> {
    const wallet = (await this.transport.tickets?.wallet()) ?? [];
    return wallet.find((t) => t.id === id)?.freePass === 'claimed';
  }

  /**
   * The half-price annual pass, once per ticket: after the ticket card for an Opening Night Ticket
   * through the gate tonight (C42, `night`), or right after a Day Ticket bought at the turnstiles has
   * come (OP-180, `day`, with the opener the card before the store handed out for that purchase). The
   * park says whether this ticket's owl may have it (never an owl with an annual pass already); with
   * no code or no pass on sale, or for a Day Ticket outside opening night, there is no offer.
   */
  private async offerPass(id: string, words: FreePassOffer['words'], open?: Opener, afterMs = words === 'night' ? 2700 : 0): Promise<void> {
    const tickets = this.transport.tickets;
    if (!tickets) return;
    if (words === 'night') {
      const wallet = await tickets.wallet().catch(() => []);
      if (wallet.find((t) => t.id === id)?.freePass !== 'ready') return;
    }
    const link = await tickets.freePass(id).catch(() => null);
    if (!link || !offerOnce(id)) return;
    const show = () => this.hud.offerFreePass({ link, words, claimed: () => this.passCame(id), ...(open ? { open } : {}) });
    // After a scan, the ticket card has its moment first.
    if (afterMs > 0) setTimeout(show, afterMs);
    else show();
  }

  /**
   * The owl walks the park as a spectator, or not (OP-191), as each welcome says and as `admit` answers.
   * The HUD's badge follows. Flipped to a visitor, the quests, today's tasks and the collection are asked
   * for again (the quest items drawn), and a bought ticket's flip says so once.
   */
  private setSpectator(on: boolean): void {
    const was = this.spectator;
    this.spectator = on;
    this.registry.set('spectator', on);
    this.hud.setSpectator(on);
    if (on && !was) this.showBoard(this.quests.board);
    if (!on && was) {
      this.showBoard(this.quests.board);
      void this.refreshBoard();
      this.play?.attach(this.acts);
      void this.collection.refresh();
    }
    if (!on && this.admitting) {
      this.admitting = false;
      this.hud.toast(SPECTATOR_WORDS.admitted, 4500);
    }
  }

  /** The free guest's once-a-page word on leaf piles (OP-243), kept for the whole page across rooms. */
  private leafHint(): { say(): string | null } {
    let hint = this.registry.get('leafHint') as { say(): string | null } | undefined;
    if (!hint) {
      hint = createOnceHint(SPECTATOR_WORDS.leaves);
      this.registry.set('leafHint', hint);
    }
    return hint;
  }

  /** A spectator's Get a Day Ticket (OP-191): the turnstiles' own sale, with `line` above the card before the store. */
  offerDayTicket(line: string): void {
    void this.entry().then((entry) => this.sellDayTicket(line, entry));
  }

  /**
   * A spectator's game is over (OP-191): its line as a toast every time, then the Day Ticket's card,
   * at most once every few minutes for the whole page (FULL_OFFER_EVERY_MS).
   */
  private afterGameOffer(line: string): void {
    this.hud.toast(line, 4500);
    let pacer = this.registry.get('offerPacer') as OfferPacer | undefined;
    if (!pacer) {
      pacer = createOfferPacer();
      this.registry.set('offerPacer', pacer);
    }
    if (!pacer.due()) return;
    const gen = this.gen;
    this.time.delayedCall(1500, () => {
      if (gen === this.gen && !this.leaving && this.spectator) this.offerDayTicket(SPECTATOR_WORDS.keep);
    });
  }

  /**
   * A turnstile reached without a ticket that works, while the gate takes tickets (OP-180): the card
   * before the store says why and that a Day Ticket can be had right here, and its Continue opens
   * checkout. The ticket lands on this owl (its collector id, not this screen); once it has come the
   * owl walks through the turnstiles with it, and the half-price pass may be offered.
   */
  private async sellDayTicket(line: string, entry: Entry): Promise<void> {
    const tickets = this.transport.tickets;
    if (!tickets) return;
    const before = await tickets.wallet().catch(() => []);
    this.hud.sellAtGate({
      line,
      preview: earlyPreview(entry.gate),
      ticketsUrl: this.cfg.ticketsUrl || null,
      ...(tickets.checkout ? { checkout: () => tickets.checkout!(), checkoutPass: () => tickets.checkout!('annual') } : {}),
      wallet: () => tickets.wallet(),
      before: new Set(before.map((t) => t.id)),
      bought: (t, open) => this.ticketCame(t, open),
    });
  }

  /**
   * A ticket bought in checkout has come onto this owl (OP-190). An owl still at the lobby's turnstiles
   * walks back into the turnstile it tried, by itself, and the turnstiles scan the ticket as for any
   * owl that walks in (the first scan, the ticket card, on into the hub); a held ticket takes no owl in.
   * Then the half-price pass may be offered, after the ticket card's moment when the owl went in, with
   * `open`, the opener the card before the store handed that purchase. True when the owl goes in.
   */
  ticketCame(ticket: WalletEntry, open?: Opener): boolean {
    // A spectator inside the park (OP-191) is admitted where it stands; at the lobby's turnstiles it walks through them (OP-190).
    const goingIn = this.admitInPlace(ticket) || this.admitAtGate(ticket);
    // The Annual Pass was offered beside the Day Ticket before paying (OP-198): not again after, unless the switch says so.
    if (PASS_AFTER_DAY_TICKET && (ticket.kind === 'day' || ticket.kind === 'night')) void this.offerPass(ticket.id, 'day', open, goingIn ? 2700 : 0);
    return goingIn;
  }

  /**
   * A spectator's bought ticket (OP-191): the turnstiles scan it from where the owl stands, and the room
   * takes the admitted pass in place (`admit`), or failing that a new socket on it (`renew`); no reload.
   * The welcome or the answer then says the owl is a visitor (setSpectator). False when the owl is no
   * spectator here, or the ticket does not work yet.
   */
  private admitInPlace(ticket: WalletEntry): boolean {
    if (!this.spectator || !this.built || this.leaving) return false;
    if (ticket.status !== 'unused' && ticket.status !== 'active') return false;
    const tickets = this.transport.tickets;
    if (!tickets) return false;
    if (this.admitting) return true;
    this.admitting = true;
    const gen = this.gen;
    void (async () => {
      const scan = await tickets.scan(ticket.id).catch((): ScanReply => ({ ok: false, reason: 'offline' }));
      if (gen !== this.gen || this.leaving) return;
      if (!scan.ok) {
        this.admitting = false;
        this.hud.toast(gateRefusal(scan.reason, scan.kind).line, 4500);
        return;
      }
      const conn = this.conn;
      const taken = (await conn?.admit?.().catch(() => false)) ?? false;
      if (gen !== this.gen || this.leaving) return;
      // The room would not take the pass on this socket: a new one, on it (the welcome then says visitor).
      if (!taken) conn?.renew?.();
    })();
    return true;
  }

  /** Into the turnstiles with a ticket that came (OP-190): false when the owl is not at them, or the ticket does not work yet. */
  private admitAtGate(ticket: WalletEntry): boolean {
    const gate = this.room.doors.find((d) => d.id === 'gate') ?? null;
    const target = admitTarget({
      room: this.room.id,
      pos: this.built ? this.me.pos : { x: -1e6, y: -1e6 },
      gate: gate?.rect ?? null,
      status: ticket.status,
      busy: !this.built || this.leaving || !this.scene.isActive(),
    });
    if (!target) return false;
    this.errand = null;
    this.pendingVote = false;
    // Turned back a moment ago, the turnstiles are still deciding: the walk goes as soon as they are done.
    if (this.passingGate) this.time.delayedCall(1600, () => void this.walkTo(target));
    else this.walkTo(target);
    return true;
  }

  /**
   * The lobby's turnstiles scan a ticket this device holds (its first scan starts its time, C35):
   * the ticket card flips up and the owl goes on into the hub. Without a ticket that goes through,
   * the turnstiles let everyone in while the gate is open; once the park takes tickets
   * (GATE=ticket) they send the owl back out of the turnstile it tried and say why, offering a Day
   * Ticket right there when it has none that works (OP-180). With spectators on, they ask first
   * (OP-198): Buy a Day Ticket (the sale, the owl back out until the ticket comes) or Enter as a guest
   * (on in as a spectator, OP-191); neither steps the owl back out. The owl keeps its
   * lane: it stands still while the turnstiles decide and comes out in the hub as far across (OP-124).
   */
  private async throughGate(door: DoorDef, at: Vec2): Promise<void> {
    const to = this.doorTo(door);
    if (this.passingGate || this.leaving || !to) return;
    this.passingGate = true;
    this.me.walk = null;
    // It stands in the turnstile it came into, not one a slow frame's walk further along (OP-124).
    if (distance(at, this.me.pos) >= 0.5) this.me.place(at);
    const lane = laneThrough(this.room, door, at);
    const scan: ScanReply = this.transport.tickets ? await this.transport.tickets.scan() : { ok: false, reason: 'none' };
    if (this.leaving) return;
    const entry = await this.entry();
    if (this.leaving) return;
    const way = turnstileWay(scan, entry);
    /**
     * Back out of the turnstile it tried, 70 below them (in a side view, the tree's front gate, 140 back
     * the way it came along the floor); the turnstiles take the next owl in a moment.
     */
    const stepBack = () => {
      this.walkTo(seenFromSide(this.room) ? { x: door.rect.x - 140, y: this.me.pos.y } : { x: this.me.pos.x, y: door.rect.y + door.rect.h + 70 });
      this.time.delayedCall(1500, () => {
        this.passingGate = false;
      });
    };
    /** On through the turnstiles into the hub; the ticket card (if any) stays up a moment first. */
    const goIn = (ms: number) => this.time.delayedCall(ms, () => void this.goTo(to.room, to.spawn, { room: this.room.id, spawn: this.registry.get('spawnName') as string | undefined }, LEAVE_FADE_MS, lane));
    if (way.go === 'back') {
      // OP-180: without a ticket that works, a Day Ticket right here; otherwise why the turnstiles stay shut.
      if (way.sale && this.transport.tickets) void this.sellDayTicket(way.line, entry);
      else this.hud.toast(way.line, 4500);
      stepBack();
      return;
    }
    if (way.go === 'spectate' && way.sale && this.transport.tickets) {
      // OP-198: the owl stands in the turnstile while they ask: buy a Day Ticket (back out, the sale, and in
      // by itself once it has come, OP-190), or enter as a guest (a spectator, OP-191); neither steps it back out.
      const gen = this.gen;
      const here = () => gen === this.gen && !this.leaving;
      this.hud.askAtGate({
        lines: [way.line],
        buy: () => {
          if (!here()) return;
          stepBack();
          void this.sellDayTicket(SPECTATOR_WORDS.keep, entry);
        },
        guest: () => {
          if (!here()) return;
          this.pieces.gate?.react();
          this.hud.toast(SPECTATOR_WORDS.guestIn, 4500);
          goIn(700);
        },
        stay: () => {
          if (here()) stepBack();
        },
      });
      return;
    }
    this.pieces.gate?.react();
    if (scan.ok) this.hud.showTicket(gateCard(scan, Date.now()));
    // A spectator whose ticket did not go through yet (held for the store's check, or not its night): why, and on in.
    else if (way.go === 'spectate') this.hud.toast(way.line, 4500);
    else this.hud.toast('Welcome to Owl Park!', 2600);
    if (scan.ok && scan.kind === 'opening-night') void this.offerPass(scan.id, 'night');
    goIn(scan.ok ? 1400 : 700);
  }

  /** The gift shop's door: the store, after the card before the store (OP-153); soon, until it has a page. */
  private openShop(): void {
    // The stores are ticket holders' (OP-191): the gift shop's door sells a Day Ticket instead.
    if (this.spectator) return this.offerDayTicket(SPECTATOR_WORDS.locked);
    const url = this.cfg.shopUrl;
    if (url) this.hud.askStore({ run: (open) => void open(url, '_blank', 'noopener') });
    else this.hud.toast('The gift shop opens soon.');
  }

  private async goTo(roomId: string, spawn: string, from: RoomStart['from'], fadeMs = LEAVE_FADE_MS, lane?: Lane, via?: RoomStart['via']): Promise<void> {
    // Counted before the room fades: keys let go during the fade or the next room's load are let go all the same.
    const rests = this.keys?.rests();
    const side = this.sideView();
    if (await this.leaveRoom(fadeMs)) this.scene.start('room', { room: roomId, spawn, from, lane, via, rests, side } satisfies RoomStart);
  }

  /** The owl stops, the room fades and its connection closes. False when the room is already being left. */
  private async leaveRoom(fadeMs = LEAVE_FADE_MS): Promise<boolean> {
    if (this.leaving) return false;
    this.leaving = true;
    this.sfx.play('door');
    this.hud.setHints([]);
    // What the HUD shows of this room (a course's strip, the actions) fades with it (OP-346).
    this.hud.setRoomDark(true);
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
    this.painter?.destroy();
    this.painter = null;
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
    for (const m of this.puzzleMarks.values()) m.destroy();
    this.puzzleMarks.clear();
    this.hud.closeLock();
    for (const npc of this.npcs.values()) npc.destroy();
    this.npcs.clear();
    // A shiny thing is in both lists: destroyed once, from the floor's.
    for (const pile of this.piles.values()) if (!(pile instanceof FloorThing)) pile.destroy();
    this.piles.clear();
    for (const thing of this.things.values()) thing.destroy();
    this.things.clear();
    for (const glow of this.glows.values()) glow.destroy();
    this.glows.clear();
    this.play?.destroy();
    this.play = null;
    this.party?.destroy();
    this.party = null;
    this.arcade?.destroy();
    this.arcade = null;
    this.climb?.destroy();
    this.climb = null;
    this.course?.destroy();
    this.course = null;
    this.hollow?.destroy();
    this.hollow = null;
    this.doorway?.destroy();
    this.doorway = null;
    this.escapeLink = null;
    this.updrafts?.destroy();
    this.updrafts = null;
    this.winds?.destroy();
    this.winds = null;
    this.brush?.destroy();
    this.brush = null;
    this.signs?.destroy();
    this.signs = null;
    this.standKey = '';
    this.courseLink = null;
    this.hud.setDash(false);
    this.hud.clearReply();
    this.bubbles?.clear();
    this.bubbles = null;
    this.trail?.destroy();
    this.trail = null;
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
      void this.goTo(`nest-${nestId}`, 'default', { room: this.room.id, spawn: `from-nest-${n}` });
      return true;
    }
    if (!walkFinished) return false;
    // The visitor's own door before the street has said which nest is theirs: ask again.
    if (d?.kind === 'own') void this.askStreet();
    else this.hud.toast(NEST_WORDS.closedForNow);
    return false;
  }

  /**
   * Whether this nest is the owl's own, from its home nest (OP-303): the room server says so too as it
   * sends the nest, but when the park cannot connect it says nothing, and the map still puts the owl
   * in Your nest, not on the street. Only ever yes: whose nest it is stays the room server's to say.
   */
  private async knowOwnNest(): Promise<void> {
    const gen = this.gen;
    const nestId = await this.collection.service.homeNest().catch(() => null);
    if (gen !== this.gen || this.leaving || this.nestMine || !nestId || nestRoomId(nestId) !== this.room.id) return;
    this.nestMine = true;
    this.showWaysOut();
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
    void this.goTo(isStreetRoom(this.cameFrom?.room) ? this.cameFrom!.room : streetOf(this.walking()), streetSpawnBack(this.cameFrom), undefined);
  }

  /**
   * A gated realm the keepers have not opened (the realms switch). Rooms without `gated` are never
   * closed this way, and the tree (map 2) is open to a tab holding a keeper's token (OP-156), as the
   * room server lets it in: a way back to the tree from a realm it opens into is a way through.
   */
  private realmClosed(roomId: string | undefined): boolean {
    const room = roomId ? ROOMS[roomId] : undefined;
    // A keepers' room (the courses, OP-224) is shut to any owl without a keeper's token, as the room server turns it away.
    if (room?.keeperOnly) return storedKeeper() === null;
    // The switch's own rule (realmShut): the tree is open too while it takes a share of the arrivals (OP-156).
    if (!room || !realmShut(room, this.realms)) return false;
    return !(mapOf(room) === 2 && storedKeeper() !== null);
  }

  /** Where `door` leads this owl: the tree's way for an owl walking the tree (OP-162), the new map's for one walking it. */
  private doorTo(door: DoorDef): DoorDef['to'] {
    return doorTarget(door, this.walking(), this.cameFrom?.room);
  }

  /**
   * The park this owl walks (walkingMap), while it can: with the tree shut to it (dark again, and no
   * keeper's token), an owl of the tree takes today's park's ways, so its nest's door and a realm's
   * way out still lead somewhere rather than to a closed tree (OP-156).
   */
  private walking(): WalkMap {
    const map = walkingMap();
    return map === 2 && this.realmClosed(TREE_ARRIVAL.room) ? 1 : map;
  }

  /** Whether the owl stands at the height `door` is taken at (a side view's doorway, OP-162); any height for a doorway without one. */
  private atDoorLevel(door: DoorDef): boolean {
    return door.top === undefined || (this.flier.air.s === GROUNDED && Math.abs(this.flier.air.z - door.top) <= PERCH_SLACK);
  }

  /**
   * The floor behind each closed realm's blockade (OP-127): the way into the arch is floor for when
   * the realm opens, but while it is closed an owl stops at the blockade's foot (the door's marker)
   * instead of walking in behind it.
   */
  private shutFloor(): Rect[] {
    return this.room.doors.flatMap((d) => (d.marker && this.realmClosed(d.to?.room) ? [{ x: d.rect.x, y: 0, w: d.rect.w, h: d.marker.y + 2 }] : []));
  }

  /**
   * Whether a doorway leads back where the owl just came from: its way to that room, or on the street
   * the nest door the owl came out in front of (an owl out of a nest stands before the door it went in by).
   */
  private leadsBack(door: DoorDef): boolean {
    const from = this.cameFrom?.room;
    if (!from) return false;
    const n = isStreetRoom(this.room.id) ? nestDoorIndex(door.id) : null;
    if (n === null) return this.doorTo(door)?.room === from;
    return isNestRoom(from) && this.registry.get('spawnName') === `from-nest-${n}`;
  }

  /**
   * The doorway back where the owl came from, to an owl still holding the keys it came in with
   * (doors.ts, backWaits): floor it stops at the edge of, so letting go leaves it standing before the
   * doorway and not in it. Seen from the side a doorway is stood in, and up takes it.
   */
  private backFloor(): Rect[] {
    if (!this.backWaiting || !this.me || this.sideView()) return [];
    return this.room.doors.filter((d) => this.leadsBack(d) && !pointInRect(this.me.pos, d.rect)).map((d) => d.rect);
  }

  /** Where the owl can walk at the height it is now (OP-084, perches.ts): the floor and the perch tops at or below it, less the floor shut for now. */
  private footingNow(): { walkable: Polygon[]; shut: Shut[] } {
    // The room's two sides, so the whole owl stays on screen at the end of a floor (OP-296).
    const edges = sideEdges(this.room, this.me ? (OWL_W * Math.abs(this.me.scaleX)) / 2 : 0);
    return footing(this.room, this.flier.air.z, [...edges, ...this.shutFloor(), ...this.backFloor(), ...(this.course?.shut() ?? [])]);
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

  /**
   * The realm this owl is in (or was entering) is closed: back to the hub, by the arch it came through.
   * From the tree's street, outside its front gate (OP-128), the owl has come through no gate: to the
   * nests' street instead, in front of its own door, outside the park as it was.
   */
  private onRealmClosed(sign: string): void {
    if (this.leaving) return;
    this.hud.toast(sign || 'Pardon Our Feathers', 3000);
    // Off the tree's street, onto the nests' street in the middle of the lane: not on the own nest's doorstep, which would walk it in.
    if (this.room.id === TREE_STREET_ROOM) return void this.goTo(STREET_ROOM, 'default', undefined);
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
    this.cameras.main.startFollow(this.followed(), true, this.followEase(), this.followEase());
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
    cam.startFollow(this.followed(), true, this.followEase(), this.followEase());
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
      cam.setBounds(0, 0, this.room.size.w, this.room.size.h);
      cam.setFollowOffset(0, 0);
      const x = this.mirror ? (this.me.pos.x + NEST_MIRROR.x) / 2 : this.me.pos.x;
      cam.centerOn(x, this.me.pos.y - 90);
      return;
    }
    const h = Math.max(1, height - Math.round(this.sheetPx * this.cfg.pixelRatio));
    cam.setViewport(0, 0, width, h);
    // The opening look (townView.ts) sets the camera itself each frame until it is over.
    if (this.opening) {
      this.opening.covered = this.hud.coveredEdges();
      return this.frameOpening(Date.now());
    }
    // So does an owl's ride on a thermal (frameRise).
    if (this.rise?.back) {
      this.rise.covered = this.hud.coveredEdges();
      return this.frameRise();
    }
    // Cover the room across, and a screen of it down: a room taller than a screen (the Great Hollow's
    // plazas) scrolls down under the camera as it does along, following the owl, its owls no smaller.
    // The town view (OP-336) draws back from that in a room seen from above.
    cam.setZoom(this.viewZoom({ w: width, h }));
    // Doorways, landings, hatches and leaf piles at the room's edges can scroll out from under the HUD,
    // seen from the side (OP-278) or from above (OP-292); the
    // Decorate sheet's own view stops above it already.
    const covered = this.sheetPx > 0 ? { top: 0, bottom: 0 } : this.viewEdges(this.hud.coveredEdges());
    const b = cameraBounds(this.room.size, covered, this.cfg.pixelRatio / cam.zoom);
    cam.setBounds(b.x, b.y, b.w, b.h);
    // A room taller than a screen, seen from above: the owl stands lower on screen, the back of the room in view (hudInset.ts).
    cam.setFollowOffset(0, followLead(this.room.size.h, seenFromSide(this.room), h / cam.zoom, ROOM_H));
    for (const { t, img } of this.parallax) this.placeParallax(t, img);
  }

  /** Whether this room has the town view (OP-336, townView.ts): every room seen from above. */
  private townViewed(): boolean {
    return !seenFromSide(this.room);
  }

  /**
   * How far past the room's top and bottom the camera may scroll for what the HUD covers (hudInset.ts).
   * The town view shows a room seen from above from its back wall down, often its whole depth, so there
   * the camera stays on the room at the top (nothing an owl uses is up the back wall, and the screen
   * would show a bare band over it); the floor's front edge still comes out from under the HUD.
   */
  private viewEdges(covered: CoveredEdges): CoveredEdges {
    return this.townViewed() ? { top: 0, bottom: covered.bottom } : covered;
  }

  /** The camera's zoom while it follows the owl on a screen this size (the game's own pixels). */
  private viewZoom(screen: { w: number; h: number }): number {
    return this.townViewed() ? townZoom(this.room.size, screen, this.cfg.pixelRatio) : screenZoom(this.room.size, screen);
  }

  /**
   * The opening look (OP-336, townView.ts): through the turnstiles the Great Hollow opens on its whole
   * oval, holds long enough to be read and eases in on the owl. Only an oval read whole has one (a room
   * with a bowl), and only for an owl that walked in through the gate. Its time is counted from when
   * the room has faded in, so none of the look is spent under the fade.
   */
  private startOpening(spawn: string | undefined): void {
    if (!this.townViewed() || !this.room.bowl || !walkedThroughGate(this.room.id, spawn)) return;
    const cam = this.cameras.main;
    this.opening = { at: Date.now() + ROOM_FADE_IN_MS, cutAt: null, covered: this.hud.coveredEdges() };
    cam.stopFollow();
    cam.removeBounds();
    // Past the room's edges the screen is the dark of the tree's wood, as round the oval itself.
    cam.setBackgroundColor(artTrialFor(globalThis.location?.search ?? '', this.room.id)?.beyond ?? BOWL_BEYOND);
    this.frameOpening(this.opening.at);
  }

  /**
   * The player's own first move brings the opening look in: a walk a tap asked for (walkTo), a jump, or
   * the keys pushed afresh since the doorway (frameOpening). The owl moves at once; the camera comes in
   * once the whole room has shown its least (townView.ts, openingAt).
   */
  private cutOpening(): void {
    if (this.opening && this.opening.cutAt === null) this.opening.cutAt = Date.now() - this.opening.at;
  }

  /** The owl's own view just now: the zoom it is followed at, and where that camera rests (`covered`: what the HUD covers, hudInset.ts). */
  private nearLook(covered: CoveredEdges): Look {
    const { width, height } = this.scale.gameSize;
    const zoom = this.viewZoom({ w: width, h: height });
    const view = { w: width / zoom, h: height / zoom };
    const bounds = cameraBounds(this.room.size, this.viewEdges(covered), this.cfg.pixelRatio / zoom);
    const at = this.followed();
    const lead = followLead(this.room.size.h, seenFromSide(this.room), view.h, ROOM_H);
    return { zoom, ...restAt({ x: at.x, y: at.y - lead }, view, bounds) };
  }

  /** One frame of the opening look; over, the camera follows the owl again as in any room. */
  private frameOpening(now: number): void {
    const o = this.opening;
    if (!o) return;
    const cam = this.cameras.main;
    // Keys held since before the doorway are not a move (they brought the owl here); let go and pushed again, they are.
    const pushed = (this.keys?.direction() ?? null) !== null && (this.keys?.rests() ?? 0) !== this.restsThen;
    if (pushed || this.flier.air.s !== GROUNDED) this.cutOpening();
    const k = openingAt(now - o.at, o.cutAt);
    if (k <= 0) {
      this.opening = null;
      cam.setBackgroundColor('rgba(0,0,0,0)');
      this.fitCamera();
      cam.startFollow(this.followed(), true, this.followEase(), this.followEase());
      return;
    }
    const { width, height } = this.scale.gameSize;
    const whole: Look = { zoom: wholeZoom(this.room.size, { w: width, h: height }), x: this.room.size.w / 2, y: this.room.size.h / 2 };
    const look = lookBetween(this.nearLook(o.covered), whole, k);
    cam.setZoom(look.zoom);
    cam.centerOn(look.x, look.y);
  }

  /**
   * One frame of an owl's ride on a thermal (OP-340): the camera drawn back by the owl's height, from
   * its own view where the thermal took it to the whole room at the thermal's top, and in again as its
   * glide brings it down. Down, or back at the height it was taken at, the camera follows as ever. Also
   * the first time the owl stands in a thermal here, a line says what it is for.
   */
  private frameRise(): void {
    if (!this.thermalTold && this.flier.air.s === GROUNDED && thermalAt(this.room.thermals, this.me.pos, 0)) {
      this.thermalTold = true;
      this.hud.toast(THERMAL_WORDS, 4200, '#FFD36A');
    }
    const r = this.rise;
    if (!r || this.opening) return;
    const cam = this.cameras.main;
    const air = this.flier.air;
    const k = riseBack(air.z, r.top, r.from);
    if (air.s === GROUNDED || (k <= 0 && air.s !== LIFTED)) {
      this.rise = null;
      if (!r.back) return;
      cam.setBackgroundColor('rgba(0,0,0,0)');
      this.fitCamera();
      cam.startFollow(this.followed(), true, this.followEase(), this.followEase());
      return;
    }
    if (!r.back) {
      r.back = true;
      cam.stopFollow();
      cam.removeBounds();
      cam.setBackgroundColor(artTrialFor(globalThis.location?.search ?? '', this.room.id)?.beyond ?? BOWL_BEYOND);
    }
    const { width, height } = this.scale.gameSize;
    const look = lookBetween(this.nearLook(r.covered), wholeLook(this.room.size, { w: width, h: height }, RISE_HEAD), k);
    cam.setZoom(look.zoom);
    cam.centerOn(look.x, look.y);
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
