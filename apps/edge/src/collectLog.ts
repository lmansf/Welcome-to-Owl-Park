/**
 * The collection log (OP-107): a row for every collectible an owl comes by (a wearable, pet, effect
 * or emote, or a piece of nest furniture), for the owner's analytics in the fraud pipeline's Supabase
 * project beside the park's orders: how much each owl collects and how fast. The player stats
 * (OP-111, parkStats.ts) send their rows the same way: a version of an owl's kind and colour
 * whenever either changes, a row for each visit once it is over, and (OP-113) a row for each room
 * the visit went into, from the moment the owl came in until it went on. The collections object
 * writes each one into its own SQLite as the collectible is granted (the outbox here), in the same
 * step as the grant, and sends it on at once, a batch at a time with a 1 s limit. A send that fails
 * or is slow leaves the rows for the object's alarm to retry, so a pickup never waits on the log and
 * never fails because of it, and the log's event ids make a row sent twice land once.
 *
 * What leaves the park is anonymous by construction: the collector and the visit go as salted hashes
 * (FRAUD_HASH_SALT, the fraud link's salt, so the owner's tables join on them), the device only as
 * phone or desktop, the place as the room's neutral id. No name, email, order, ticket, pass or
 * address is ever in a row; the collector's own id never leaves the collections object.
 *
 * The log is on once the Worker has PARK_LOG_URL (the `owl-park-log` function, apps/park-log),
 * FRAUD_SCORE_KEY (the key that function checks, the fraud link's) and FRAUD_HASH_SALT. Without them
 * nothing is kept or sent. Written against `SqlStorage` and an injected fetch, so Node tests it.
 *
 * Ticket events (OP-192) go the same way: an order paid, its tickets put on an owl, refunded or
 * cancelled, and a ticket's first scan, so the owner can count free owls beside paid ones. The order,
 * the owl and the ticket leave as salted hashes; the buyer's email never comes here (the Worker sends
 * it to the owner's contacts on its own, buyerLog.ts).
 *
 * Quest progress (OP-266, questLog.ts) goes the same way: each step of each quest an owl takes, as it
 * begins and as it ends, and the catalogue of quests and their steps whenever a deploy changes it.
 */
import {
  FURNITURE,
  PRESENTS,
  QUESTS,
  STARTER_PACK,
  allVariants,
  getNpc,
  goalCount,
  goalText,
  parseVariant,
  questPuzzle,
  type FeedbackKind,
  type FurnitureSource,
  type Goal,
  type Source,
  type SpeciesId,
} from '@owl-park/shared';
import { moduleLog } from './logs';
import { ROOMS } from './rooms';
import type { TicketKind } from './tickets';

export interface LogConfig {
  url: string;
  key: string;
  salt: string;
}

/** The log once its address, key and salt are set; null leaves it off. Only https, but for a stand-in on this machine. */
export function logConfig(env: { PARK_LOG_URL?: string; FRAUD_SCORE_KEY?: string; FRAUD_HASH_SALT?: string }): LogConfig | null {
  const url = env.PARK_LOG_URL?.trim() ?? '';
  const key = env.FRAUD_SCORE_KEY?.trim() ?? '';
  const salt = env.FRAUD_HASH_SALT?.trim() ?? '';
  if (!url || key.length < 16 || salt.length < 16) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch (e) {
    moduleLog.error('collections.log', 'collect_log_failed', 'PARK_LOG_URL is not an address: the collection log stays off.', { error: e });
    return null;
  }
  const local = u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
  return u.protocol === 'https:' || local ? { url: u.toString(), key, salt } : null;
}

// ---------- the anonymous parts of a row ----------

const enc = new TextEncoder();

async function sha256(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A salted hash of an identifier, never the identifier (as the fraud link hashes its guests, devices and cards). */
export async function saltedHash(salt: string, kind: string, value: string): Promise<string> {
  return sha256(`${salt}:${kind}:${value}`);
}

/** A salted hash in the shape of a uuid. */
export async function saltedUuid(salt: string, kind: string, value: string): Promise<string> {
  const h = await saltedHash(salt, kind, value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Phone (a phone or tablet) or desktop, and nothing finer. */
export type DeviceClass = 'phone' | 'desktop';

/** The device's class from the browser's own words: its mobile hint when it sends one, else its user agent. Neither is kept. */
export function deviceClass(userAgent: string | null, mobileHint: string | null): DeviceClass | null {
  if (mobileHint === '?1') return 'phone';
  if (!userAgent) return mobileHint === '?0' ? 'desktop' : null;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent) ? 'phone' : 'desktop';
}

/** What the caller knows of the visit a collectible came in. */
export interface Visit {
  /** The pass's visitor id: one per page load, so one per visit. It leaves only as a salted hash. */
  pass?: string;
  device?: DeviceClass | null;
  /** The room it happened in, when it happened in one (a socket's room; a nest of any owl is `nest`). */
  room?: string | null;
}

const PASS_ID = /^v_[A-Za-z0-9]{6,24}$/;

/** The room a row names: one of the park's rooms by its neutral id, every owl's nest as `nest`, else none. */
export function logRoom(room: unknown): string | null {
  if (typeof room !== 'string') return null;
  if (room.startsWith('nest-')) return 'nest';
  return Object.prototype.hasOwnProperty.call(ROOMS, room) ? room : null;
}

/** What kind of place a row's room is (OP-113): one of the realms, the park's shared rooms, or an owl's nest. */
export type RealmKind = 'realm' | 'hub' | 'nest';

/**
 * Each of the park's rooms by its kind of place: the realms (the arcade is the market's), and the
 * rooms every owl passes through (the lobby, the hub, the street of nests). A new room goes in here:
 * the tests hold every room to it.
 */
export const ROOM_KINDS: Readonly<Record<string, RealmKind>> = { lobby: 'hub', hub: 'hub', homes: 'hub', grove: 'realm', market: 'realm', arcade: 'realm', glass: 'realm', l1: 'hub', l2: 'hub', l3: 'hub', l4: 'hub', l5: 'hub', 'l5-street': 'hub', l0: 'hub', 'l0-arcade': 'realm', 'trail-head': 'realm', 'trail-1': 'realm', 'trail-2': 'realm', 'trail-3': 'realm', 'm3-stair-1': 'hub', 'm3-stair-2': 'hub', 'm3-stair-3': 'hub', 'm3-ground': 'hub', 'm3-under': 'hub', 'm3-cave': 'realm' };

/** The kind of place a room the log names (`logRoom`) is: every nest is `nest`. */
export function realmKind(room: string): RealmKind {
  if (room === 'nest') return 'nest';
  return Object.hasOwn(ROOM_KINDS, room) ? ROOM_KINDS[room]! : 'hub';
}

/** A visit as the log keeps it, whatever was passed. */
export function cleanVisit(v: Visit | null | undefined): { pass: string | null; device: DeviceClass | null; room: string | null } {
  return {
    pass: typeof v?.pass === 'string' && PASS_ID.test(v.pass) ? v.pass : null,
    device: v?.device === 'phone' || v?.device === 'desktop' ? v.device : null,
    room: logRoom(v?.room),
  };
}

/** How a collectible came: the row's `collectible_type`. */
export type CollectibleType = 'quest' | 'shop' | 'gift' | 'seasonal' | 'starter' | 'grant' | 'purchase' | 'find';
export const COLLECTIBLE_TYPES: readonly CollectibleType[] = ['quest', 'shop', 'gift', 'seasonal', 'starter', 'grant', 'purchase', 'find'];

/** A collectible's type from the source its collection (or its nest) keeps: a present from the park is seasonal. */
export function collectibleType(id: string, source: Source | FurnitureSource): CollectibleType {
  switch (source) {
    case 'quest':
    case 'shop':
    case 'gift':
    case 'starter':
      return source;
    case 'bought':
      return 'purchase';
    case 'found':
    case 'crafted':
      return 'find';
    case 'granted':
      if (PRESENTS.some((p) => p.variant === id)) return 'seasonal';
      return (STARTER_PACK as readonly string[]).includes(id) ? 'starter' : 'grant';
    case 'set':
      return 'grant'; // a style set's capstone (OP-110), given by the park
  }
}

/** The log's id for a piece of furniture: apart from the collection's variants (`witch-hat~3`, `hoot`), which have no colon. */
export const furnitureId = (item: string) => `furniture:${item}`;

// ---------- the catalogue: every collectible there is, for the views' "% collected" ----------

export interface CatalogueItem {
  id: string;
  kind: string;
  rarity: string | null;
  /** Where it can be had: null for anywhere in the park, which is every collectible today. */
  realm: string | null;
}

/** The collection's variants (what the owl builder counts, "N of 1,180 collected") and the nest's furniture. */
export function logCatalogue(): CatalogueItem[] {
  return [
    ...allVariants().map((id) => {
      const v = parseVariant(id)!;
      return { id, kind: v.item.kind, rarity: v.rarity, realm: null };
    }),
    ...FURNITURE.map((f) => ({ id: furnitureId(f.id), kind: 'furniture', rarity: null, realm: null })),
  ];
}

// ---------- the outbox ----------

/** A collectible come by, as the collections object hands it over. */
export interface Acquisition {
  cid: string;
  /** A collection variant id, or `furnitureId(piece)`. */
  collectible: string;
  type: CollectibleType;
  at: number;
  visit?: Visit | null;
}

/** One row of the log as it is sent: every field the table has, and nothing that names anyone. */
export interface LogRow {
  event_id: string;
  collector_id: string;
  collectible_id: string;
  collectible_type: CollectibleType;
  realm: string | null;
  acquired_at: string;
  session_id: string | null;
  device_class: DeviceClass | null;
  first_entry_at: string | null;
  backfill: boolean;
}

/** An acquisition as the outbox keeps it: raw, in this object only, until it is hashed on its way out. */
interface CollectData {
  cid: string;
  collectible: string;
  type: CollectibleType;
  at: number;
  /** When the collector's collection began. */
  first: number | null;
  pass: string | null;
  device: DeviceClass | null;
  room: string | null;
  backfill: boolean;
}

/** A row waiting in the outbox: its kind and its data (a type, not an interface: the SQL cursor's rows are records). */
type Waiting = { id: number; kind: string; data: string };

export interface LogDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now: () => number;
  /** Wake the object at this time to send again (its alarm), unless it is woken sooner. */
  wake: (at: number) => void;
}

/** Rows sent in one request. */
export const LOG_BATCH = 100;
/** A send that takes longer than this counts as failed, and its rows go again later. */
export const LOG_SEND_MS = 1000;
/** Rows the outbox holds while the log cannot be reached: past this, newer ones are not kept for it. */
export const LOG_OUTBOX_MAX = 50_000;
/** Waits before each retry after a failed send, the last one repeating. */
export const LOG_RETRY_MS: readonly number[] = [30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000];

/** How a send went: sent, to try again later, or refused for good (a malformed batch never gets better). */
type Sent = 'ok' | 'retry' | 'drop';

const iso = (ms: number) => new Date(ms).toISOString();

/** The row the log takes for an acquisition, hashed with the salt. */
async function collectRow(salt: string, d: CollectData): Promise<LogRow> {
  return {
    // One id per collector and collectible: the same acquisition sent twice, or backfilled after it was sent, lands once.
    event_id: await saltedUuid(salt, 'acquired', `${d.cid}|${d.collectible}`),
    collector_id: await saltedHash(salt, 'collector', d.cid),
    collectible_id: d.collectible,
    collectible_type: d.type,
    realm: d.room,
    acquired_at: iso(d.at),
    session_id: d.pass ? await saltedUuid(salt, 'session', d.pass) : null,
    device_class: d.device,
    first_entry_at: d.first === null ? null : iso(d.first),
    backfill: d.backfill,
  };
}

// ---------- the player stats' rows (OP-111) ----------

/** Why an owl has a new version: its first visit, or it chose another kind or colour (quests and seasons may change looks later). */
export type PlayerReason = 'first' | 'chosen';

/** A version of an owl as the outbox keeps it. */
export interface PlayerData {
  cid: string;
  species: SpeciesId;
  /** Its body colour, `#rrggbb`. */
  color: string;
  at: number;
  reason: PlayerReason;
}

/** A version of an owl as the log takes it: its kind and colour from `changed_at` on, and nothing else about it. */
export interface PlayerRow {
  event_id: string;
  collector_id: string;
  owl_type: SpeciesId;
  color: string;
  changed_at: string;
  change_reason: PlayerReason;
}

async function playerRow(salt: string, d: PlayerData): Promise<PlayerRow> {
  return {
    event_id: await saltedUuid(salt, 'player', `${d.cid}|${d.at}|${d.species}|${d.color}`),
    collector_id: await saltedHash(salt, 'collector', d.cid),
    owl_type: d.species,
    color: d.color,
    changed_at: iso(d.at),
    change_reason: d.reason,
  };
}

/** A visit that is over, as the outbox keeps it. */
export interface SessionData {
  cid: string;
  pass: string;
  started: number;
  /** When the visit was last seen: its last socket's close, or its last heartbeat if the tab died. */
  ended: number;
  device: DeviceClass | null;
  rooms: string[];
  gained: number;
  /** What the visit was past the turnstiles (OP-192): a full visitor's, a spectator's, or null for one that never went past them. */
  kind?: 'visitor' | 'spectator' | null;
}

/** A visit as the log takes it: the same session id as its collection rows. */
export interface SessionRow {
  session_id: string;
  collector_id: string;
  started_at: string;
  ended_at: string;
  device_class: DeviceClass | null;
  realms_entered: number;
  collectibles_gained: number;
  visitor_kind: 'visitor' | 'spectator' | null;
}

async function sessionRow(salt: string, d: SessionData): Promise<SessionRow> {
  return {
    session_id: await saltedUuid(salt, 'session', d.pass),
    collector_id: await saltedHash(salt, 'collector', d.cid),
    started_at: iso(d.started),
    ended_at: iso(Math.max(d.started, d.ended)),
    device_class: d.device,
    realms_entered: d.rooms.length,
    collectibles_gained: d.gained,
    visitor_kind: d.kind === 'visitor' || d.kind === 'spectator' ? d.kind : null,
  };
}

/**
 * How an owl came into a room (OP-113): walked in from another room of the same visit (a door, the
 * way out, the turnstile), spawned as the page began (Play's nest, or the lobby), came straight in by
 * the page's address, came back into the same room after its line dropped, or travelled there by the
 * Menu's map (OP-130, which also took the place of Go home).
 */
export type EntrySource = 'walked' | 'spawn' | 'deep_link' | 'reconnect' | 'travel';

/** A time in one room, as the outbox keeps it: sent with its visit once the visit is over. */
export interface RealmVisitData {
  cid: string;
  pass: string;
  /** Its place in the visit: 1 for the first room. */
  seq: number;
  /** The room as the log names it (`logRoom`). */
  room: string;
  /** The park the owl was walking there (`visitMaps`): 1 today's park, 2 the tree (OP-128). */
  map: 1 | 2;
  entered: number;
  exited: number;
  source: EntrySource;
  gained: number;
}

/** A time in one room as the log takes it, under the session id of its visit. */
export interface RealmVisitRow {
  visit_id: string;
  session_id: string;
  collector_id: string;
  realm: string;
  realm_kind: RealmKind;
  map_id: 1 | 2;
  entered_at: string;
  exited_at: string;
  entry_source: EntrySource;
  collectibles_gained: number;
}

async function realmVisitRow(salt: string, d: RealmVisitData): Promise<RealmVisitRow> {
  return {
    visit_id: await saltedUuid(salt, 'realm-visit', `${d.pass}|${d.seq}`),
    session_id: await saltedUuid(salt, 'session', d.pass),
    collector_id: await saltedHash(salt, 'collector', d.cid),
    realm: d.room,
    realm_kind: realmKind(d.room),
    map_id: d.map === 2 ? 2 : 1,
    entered_at: iso(d.entered),
    exited_at: iso(Math.max(d.entered, d.exited)),
    entry_source: d.source,
    collectibles_gained: d.gained,
  };
}

// ---------- room stays, live (OP-265) ----------

/** Why an owl's stay in a room ended (OP-265): another room, the page closed, the line dropped or went quiet, or the nightly restart. */
export type ExitReason = 'moved' | 'logoff' | 'timeout' | 'server_restart';

/** How a live stay began: as `EntrySource`, but never a reconnect, which continues the stay it came back to. */
export type StayEntry = Exclude<EntrySource, 'reconnect'>;

/**
 * A live stay's event, as the outbox keeps it (OP-265): sent as it happens, not with its visit. `seq`
 * numbers the visit's stays, so the stay's id is the same whenever its events are sent.
 */
export type RoomStayData =
  | { event: 'enter'; cid: string; pass: string; seq: number; at: number; room: string; map: 1 | 2; source: StayEntry }
  | { event: 'leave'; cid: string; pass: string; seq: number; at: number; reason: ExitReason };

/** A live stay's event as the log takes it: the owl and the visit as salted hashes, the room by its neutral id. */
export type RoomStayRow =
  | { event: 'enter'; stay_id: string; session_id: string; collector_id: string; at: string; realm: string; realm_kind: RealmKind; map_id: 1 | 2; entry_source: StayEntry }
  | { event: 'leave'; stay_id: string; at: string; exit_reason: ExitReason };

async function roomStayRow(salt: string, d: RoomStayData): Promise<RoomStayRow> {
  const stay_id = await saltedUuid(salt, 'room-stay', `${d.pass}|${d.seq}`);
  if (d.event === 'leave') return { event: 'leave', stay_id, at: iso(d.at), exit_reason: d.reason };
  return {
    event: 'enter',
    stay_id,
    session_id: await saltedUuid(salt, 'session', d.pass),
    collector_id: await saltedHash(salt, 'collector', d.cid),
    at: iso(d.at),
    realm: d.room,
    realm_kind: realmKind(d.room),
    map_id: d.map === 2 ? 2 : 1,
    entry_source: d.source,
  };
}

// ---------- quest progress (OP-266) ----------

/** How a quest step ended (OP-266): done, the quest given up, its day, week or month over, or the quest taken out of the catalogue. */
export type QuestOutcome = 'done' | 'abandoned' | 'expired' | 'retired';

/**
 * A quest step's event, as the outbox keeps it (OP-266): a step begun or ended, for one run of a quest
 * (one acceptance: `accepted` tells a quest given up and taken again apart). `step` counts from 0, and
 * the step after the last is handing the quest in. Never anything of a puzzle's run: no code, key or guess.
 */
export type QuestProgressData =
  | { event: 'start'; cid: string; quest: string; period: string; accepted: number; step: number; at: number; pass: string | null; room: string | null; expires: number | null }
  | { event: 'end'; cid: string; quest: string; period: string; accepted: number; step: number; at: number; pass: string | null; room: string | null; outcome: QuestOutcome };

/** A quest step's event as the log takes it: the owl and the visit as salted hashes, the room by its neutral id, the step from 1. */
export type QuestProgressRow =
  | {
      event: 'start';
      progress_id: string;
      run_id: string;
      collector_id: string;
      session_id: string | null;
      quest_id: string;
      period: string;
      step_no: number;
      at: string;
      realm: string | null;
      expires_at: string | null;
    }
  | { event: 'end'; progress_id: string; at: string; session_id: string | null; realm: string | null; outcome: QuestOutcome };

async function questProgressRow(salt: string, d: QuestProgressData): Promise<QuestProgressRow> {
  const run = `${d.cid}|${d.quest}|${d.period}|${d.accepted}`;
  const progress_id = await saltedUuid(salt, 'quest-step', `${run}|${d.step}`);
  const session_id = d.pass ? await saltedUuid(salt, 'session', d.pass) : null;
  // Already the log's name for the room (`logRoom`, or a live stay's), as the caller keeps it.
  const realm = d.room;
  if (d.event === 'end') return { event: 'end', progress_id, at: iso(d.at), session_id, realm, outcome: d.outcome };
  return {
    event: 'start',
    progress_id,
    run_id: await saltedUuid(salt, 'quest-run', run),
    collector_id: await saltedHash(salt, 'collector', d.cid),
    session_id,
    quest_id: d.quest,
    period: d.period,
    step_no: d.step + 1,
    at: iso(d.at),
    realm,
    expires_at: d.expires === null ? null : iso(d.expires),
  };
}

/** A quest as the reference table `game.dim_quest` takes it (OP-266). */
export interface QuestCatalogueQuest {
  quest_id: string;
  title: string;
  giver_npc: string;
  giver_room: string | null;
  quest_type: string;
  difficulty: string;
  length: string;
  cadence: string;
  template: string | null;
  /** Its work steps; handing it in is one more (`hand_in`) in the steps table. */
  step_count: number;
  reward_feathers: number;
  reward_item: string | null;
  requires: string[];
  puzzle_id: string | null;
}

/** A step of a quest as `game.dim_quest_step` takes it (OP-266): where it happens, and what it asks. */
export interface QuestCatalogueStep {
  quest_id: string;
  step_no: number;
  goal_kind: Goal['kind'] | 'hand_in';
  /** The room it happens in (a talk's or a hand-in's is the NPC's), or null where any room will do. */
  target_room: string | null;
  target_realm_kind: RealmKind | null;
  target_npc: string | null;
  /** What it asks for: a kind of thing to use, an item to find, an emote, a puzzle. */
  target_thing: string | null;
  need_count: number;
  distinct_only: boolean;
  step_text: string;
}

const npcRoom = (npc: string | undefined): string | null => (npc ? logRoom(getNpc(npc)?.room) : null);

function goalStep(questId: string, stepNo: number, goal: Goal): QuestCatalogueStep {
  let room: string | null = null;
  let npc: string | null = null;
  let thing: string | null = null;
  switch (goal.kind) {
    case 'talk':
      npc = goal.npc;
      room = npcRoom(goal.npc);
      break;
    case 'visit':
      room = logRoom(goal.room);
      break;
    case 'interact':
      room = logRoom(goal.room);
      thing = goal.what;
      break;
    case 'emote':
      npc = goal.npc ?? null;
      room = goal.room ? logRoom(goal.room) : npcRoom(goal.npc);
      thing = goal.emote;
      break;
    case 'gather':
      room = logRoom(goal.room);
      thing = goal.item;
      break;
    case 'puzzle':
      // Its locks sit in several rooms: the step names the puzzle only (OP-266 question 1).
      thing = goal.puzzle;
      break;
  }
  return {
    quest_id: questId,
    step_no: stepNo,
    goal_kind: goal.kind,
    target_room: room,
    target_realm_kind: room ? realmKind(room) : null,
    target_npc: npc,
    target_thing: thing,
    need_count: goalCount(goal),
    distinct_only: goal.kind === 'interact' && goal.distinct === true,
    step_text: goalText(goal),
  };
}

/** Every quest and every step of each, handing in included, for the log's reference tables (OP-266). */
export function questCatalogue(): { quests: QuestCatalogueQuest[]; steps: QuestCatalogueStep[] } {
  const quests: QuestCatalogueQuest[] = [];
  const steps: QuestCatalogueStep[] = [];
  for (const q of QUESTS) {
    const giverRoom = npcRoom(q.giver);
    quests.push({
      quest_id: q.id,
      title: q.title,
      giver_npc: q.giver,
      giver_room: giverRoom,
      quest_type: q.type,
      difficulty: q.difficulty,
      length: q.length,
      cadence: q.cadence,
      template: q.template ?? null,
      step_count: q.steps.length,
      reward_feathers: q.reward.feathers,
      reward_item: q.reward.item,
      requires: [...(q.requires ?? [])],
      puzzle_id: questPuzzle(q),
    });
    q.steps.forEach((s, i) => steps.push(goalStep(q.id, i + 1, s.goal)));
    steps.push({
      quest_id: q.id,
      step_no: q.steps.length + 1,
      goal_kind: 'hand_in',
      target_room: giverRoom,
      target_realm_kind: giverRoom ? realmKind(giverRoom) : null,
      target_npc: q.giver,
      target_thing: null,
      need_count: 1,
      distinct_only: false,
      step_text: `Hand it in to ${getNpc(q.giver)?.name ?? 'its giver'}`,
    });
  }
  return { quests, steps };
}

// ---------- visitors' feedback (OP-166) ----------

/** A note a visitor sent, as the outbox keeps it: raw, in this object only, until it is hashed on its way out. */
export interface FeedbackData {
  cid: string;
  /** The note's id on the room server (feedbackBox.ts), so the keepers' page and the log's row can be matched. */
  id: number;
  kind: FeedbackKind;
  text: string;
  at: number;
  pass: string | null;
  device: DeviceClass | null;
  room: string | null;
}

/**
 * A note as the log takes it: the visitor's own words (the point of it, already cleaned by
 * `parseFeedback`) and the kind, with the same anonymous parts as every other row. Never the screen
 * size or the browser's own description, which the room server keeps for the keepers' page.
 */
export interface FeedbackLogRow {
  event_id: string;
  park_feedback_id: number;
  collector_id: string;
  session_id: string | null;
  kind: FeedbackKind;
  body: string;
  realm: string | null;
  realm_kind: RealmKind | null;
  device_class: DeviceClass | null;
  submitted_at: string;
}

async function feedbackRow(salt: string, d: FeedbackData): Promise<FeedbackLogRow> {
  return {
    // One id per note on the room server: a note sent twice lands once.
    event_id: await saltedUuid(salt, 'feedback', `${d.id}|${d.cid}|${d.at}`),
    park_feedback_id: d.id,
    collector_id: await saltedHash(salt, 'collector', d.cid),
    session_id: d.pass ? await saltedUuid(salt, 'session', d.pass) : null,
    kind: d.kind,
    body: d.text,
    realm: d.room,
    realm_kind: d.room ? realmKind(d.room) : null,
    device_class: d.device,
    submitted_at: iso(d.at),
  };
}

// ---------- tickets and passes (OP-192) ----------

/**
 * What happened to a ticket order, or to a ticket at the gate: the order was paid (its tickets made),
 * its tickets went onto an owl (a claim link, or the gate's checkout), some were refunded, all were
 * cancelled, or a ticket's first scan started its time on an owl.
 */
export type PurchaseEvent = 'paid' | 'claimed' | 'refunded' | 'cancelled' | 'scanned';

/** A ticket event as the outbox keeps it: raw, in this object only, until the order, the owl and the ticket are hashed on their way out. */
export interface PurchaseData {
  event: PurchaseEvent;
  /** The store's order number, or null for a ticket the keepers gave (it has no order in the store). */
  order: string | null;
  /** The owl the tickets went onto, or the one that scanned; null for the order's own events. */
  cid: string | null;
  at: number;
  /** paid: each ticket's kind, one per ticket; scanned: the ticket's own. */
  kinds: TicketKind[];
  /** Tickets made, moved or refunded (1 for a scan). */
  tickets: number;
  /** paid: what the order came to; refunded: what went back. In cents; null where the store did not say. */
  cents: number | null;
  /** paid: the order is the annual pass offered after a ticket (opening night's half price, OP-062, OP-180). */
  upsell?: boolean;
  /** paid: its tickets wait for the owner's fraud check. */
  held?: boolean;
  /** claimed: by the emailed claim link, or by the gate's checkout. */
  via?: 'claim' | 'checkout' | null;
  /** scanned: when the ticket's time runs out. */
  until?: number | null;
  /** What makes one event of its kind apart from another: a refund's id, a scanned ticket's id. Leaves only hashed. */
  ref?: string | null;
}

/** A ticket event as the log takes it: the order and the owl as salted hashes, never a name, an email, an order number or a ticket's id. */
export interface PurchaseRow {
  event_id: string;
  event: PurchaseEvent;
  order_key: string | null;
  collector_id: string | null;
  occurred_at: string;
  ticket_kinds: TicketKind[];
  tickets: number;
  amount_cents: number | null;
  upsell: boolean;
  held: boolean;
  via: 'claim' | 'checkout' | null;
  valid_until: string | null;
}

/** The salted key of a store order, the one the purchase rows and the owner's contacts share (OP-192). */
export function orderKey(salt: string, order: string): Promise<string> {
  return saltedUuid(salt, 'order', order);
}

async function purchaseRow(salt: string, d: PurchaseData): Promise<PurchaseRow> {
  // One id per order and kind of event (and per owl a claim moved it to, refund, or scanned ticket): one sent twice lands once.
  const ref = d.ref ?? (d.event === 'refunded' ? String(d.at) : '');
  return {
    event_id: await saltedUuid(salt, 'purchase', `${d.event}|${d.order ?? ''}|${d.event === 'claimed' || d.event === 'scanned' ? (d.cid ?? '') : ''}|${ref}`),
    event: d.event,
    order_key: d.order ? await orderKey(salt, d.order) : null,
    collector_id: d.cid ? await saltedHash(salt, 'collector', d.cid) : null,
    occurred_at: iso(d.at),
    ticket_kinds: d.kinds,
    tickets: d.tickets,
    amount_cents: d.cents,
    upsell: d.upsell === true,
    held: d.held === true,
    via: d.via ?? null,
    valid_until: typeof d.until === 'number' ? iso(d.until) : null,
  };
}

/** Each kind of row the outbox holds, and how its data becomes the row the log takes. */
const ROWS: Record<string, (salt: string, data: never) => Promise<unknown>> = {
  collect: collectRow,
  player: playerRow,
  session: sessionRow,
  realm_visit: realmVisitRow,
  room_stay: roomStayRow,
  quest_progress: questProgressRow,
  feedback: feedbackRow,
  purchase: purchaseRow,
};

export class CollectLog {
  private sending: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private catalogue: { version: string; items: CatalogueItem[] } | null = null;
  private questList: { version: string; quests: QuestCatalogueQuest[]; steps: QuestCatalogueStep[] } | null = null;
  private fullSince = 0;

  constructor(
    private readonly sql: SqlStorage,
    private readonly config: LogConfig | null,
    private readonly deps: LogDeps,
  ) {
    // One outbox for every kind of row, in the order they happened.
    sql.exec(`CREATE TABLE IF NOT EXISTS log_outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, data TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS log_meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
  }

  /** Whether the log is set up. */
  get on(): boolean {
    return this.config !== null;
  }

  /** Rows waiting to be sent. */
  waiting(): number {
    return this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM log_outbox`).one().n;
  }

  /** Keep a row of this kind to send. False when the outbox is full (the log unreachable for days). */
  private keep(kind: string, data: object): boolean {
    if (this.waiting() >= LOG_OUTBOX_MAX) {
      const now = this.deps.now();
      if (now - this.fullSince > 3600_000) {
        this.fullSince = now;
        moduleLog.error('collections.log', 'collect_log_full', 'The collection log’s outbox is full and the log is not taking rows: newer rows are not kept for it (told once an hour).', { rows: LOG_OUTBOX_MAX });
      }
      return false;
    }
    this.sql.exec(`INSERT INTO log_outbox (kind, data) VALUES (?, ?)`, kind, JSON.stringify(data));
    return true;
  }

  /** When a collector's collection began (its first sight), from the collections' own table. */
  private firstSeen(cid: string): number | null {
    return this.sql.exec<{ created_at: number }>(`SELECT created_at FROM collectors WHERE cid = ?`, cid).toArray()[0]?.created_at ?? null;
  }

  /** Keep an acquisition to send. Synchronous, so it is written in the same step as the grant. */
  record(a: Acquisition): void {
    if (!this.config) return;
    const v = cleanVisit(a.visit);
    const data: CollectData = { cid: a.cid, collectible: a.collectible, type: a.type, at: a.at, first: this.firstSeen(a.cid), ...v, backfill: false };
    this.keep('collect', data);
  }

  /** Keep a version of an owl to send (OP-111). */
  player(d: PlayerData): void {
    if (this.config) this.keep('player', d);
  }

  /** Keep a visit that is over to send (OP-111). */
  session(d: SessionData): void {
    if (this.config) this.keep('session', d);
  }

  /** Keep a time in one room to send (OP-113): after its visit's own row, which the log keeps first. */
  realmVisit(d: RealmVisitData): void {
    if (this.config) this.keep('realm_visit', d);
  }

  /** Keep a live stay's event to send (OP-265): an owl came into a room, or its stay there ended. */
  roomStay(d: RoomStayData): void {
    if (this.config) this.keep('room_stay', d);
  }

  /** Keep a quest step's event to send (OP-266): a step begun, or ended and how. */
  questProgress(d: QuestProgressData): void {
    if (this.config) this.keep('quest_progress', d);
  }

  /** Keep a ticket event to send (OP-192): the order, the owl and the ticket hashed on their way out. */
  purchase(d: PurchaseData): void {
    if (this.config) this.keep('purchase', d);
  }

  /** Keep a note a visitor sent to send (OP-166): the room as the log names rooms, the visit hashed on its way out. */
  feedback(d: { cid: string; id: number; kind: FeedbackKind; text: string; at: number; visit?: Visit | null }): void {
    if (!this.config) return;
    const v = cleanVisit(d.visit);
    const data: FeedbackData = { cid: d.cid, id: d.id, kind: d.kind, text: d.text, at: d.at, ...v };
    this.keep('feedback', data);
  }

  /**
   * Every collectible the collections already hold, queued as backfill rows (OP-107's question 4):
   * at the time each was acquired, with no visit, room or device, flagged `backfill`. A row the log
   * already has (sent as it happened, or by an earlier backfill) keeps its event id and lands once.
   */
  backfill(): number {
    if (!this.config) return 0;
    const room = Math.max(0, LOG_OUTBOX_MAX - this.waiting());
    const owned = this.sql.exec<{ cid: string; variant: string; source: Source; at: number }>(`SELECT cid, variant, source, at FROM owned ORDER BY at LIMIT ?`, room).toArray();
    const pieces = this.hasTable('furniture')
      ? this.sql.exec<{ cid: string; item: string; source: FurnitureSource; at: number }>(`SELECT cid, item, source, at FROM furniture ORDER BY at LIMIT ?`, Math.max(0, room - owned.length)).toArray()
      : [];
    const rows = [
      ...owned.map((r) => ({ cid: r.cid, collectible: r.variant, type: collectibleType(r.variant, r.source), at: r.at })),
      ...pieces.map((r) => ({ cid: r.cid, collectible: furnitureId(r.item), type: collectibleType(r.item, r.source), at: r.at })),
    ];
    let queued = 0;
    for (const r of rows) {
      const data: CollectData = { ...r, first: this.firstSeen(r.cid), pass: null, device: null, room: null, backfill: true };
      if (this.keep('collect', data)) queued++;
    }
    return queued;
  }

  private hasTable(name: string): boolean {
    return this.sql.exec(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`, name).toArray().length > 0;
  }

  /** Send what is waiting, now: one send at a time, and another round when more came meanwhile. Never throws. */
  flush(): Promise<void> {
    if (!this.config) return Promise.resolve();
    if (this.sending) {
      this.again = true;
      return this.sending;
    }
    this.sending = (async () => {
      try {
        do {
          this.again = false;
          await this.round(this.config!);
        } while (this.again);
      } catch (e) {
        moduleLog.error('collections.log', 'collect_log_failed', 'Sending to the collection log failed: the rows wait in the outbox for the next round.', { error: e });
      } finally {
        this.sending = null;
      }
    })();
    return this.sending;
  }

  private async round(config: LogConfig): Promise<void> {
    // The grant's own step finishes first: a new collector's starter pack is several rows.
    await Promise.resolve();
    // Should this round be cut short (the object put away mid-send), the alarm takes over.
    if (this.waiting() > 0) this.deps.wake(this.deps.now() + LOG_RETRY_MS[0]!);
    if (this.failures > 0) moduleLog.info('collections.log', 'collect_log_retried', 'Sending to the collection log again after it failed.', { attempt: this.failures + 1, rows: this.waiting() });
    for (;;) {
      const waiting = this.sql.exec<Waiting>(`SELECT id, kind, data FROM log_outbox ORDER BY id LIMIT ?`, LOG_BATCH).toArray();
      if (!waiting.length) break;
      // One kind a request: the run of rows of the first one's kind, in the order they happened.
      const kind = waiting[0]!.kind;
      let n = 1;
      while (n < waiting.length && waiting[n]!.kind === kind) n++;
      const run = waiting.slice(0, n);
      const toRow = ROWS[kind];
      if (!toRow) {
        moduleLog.error('collections.log', 'collect_log_dropped', 'Rows of a kind the collection log does not know were dropped.', { kind, rows: run.length });
      } else {
        const rows = await Promise.all(run.map((w) => toRow(config.salt, JSON.parse(w.data) as never)));
        const sent = await this.post(config, { kind, rows });
        if (sent === 'retry') return this.retryLater();
        if (sent === 'drop') moduleLog.error('collections.log', 'collect_log_dropped', 'The collection log refused a batch for good: its rows are dropped.', { kind, rows: rows.length });
        else moduleLog.info('collections.log', 'collect_logged', 'The collection log took a batch of rows.', { kind, rows: rows.length });
        this.failures = 0;
      }
      this.sql.exec(`DELETE FROM log_outbox WHERE id <= ?`, run.at(-1)!.id);
    }
    // The catalogue, whenever it has changed since the log last took it (a deploy with a new drop).
    const catalogue = await this.currentCatalogue();
    if (!(await this.sendCatalogue(config, 'catalogue', catalogue.version, { items: catalogue.items }, catalogue.items.length))) return;
    // The quests and their steps (OP-266), the same way: whenever a deploy changes them.
    const quests = await this.currentQuests();
    await this.sendCatalogue(config, 'quest_catalogue', quests.version, { quests: quests.quests, steps: quests.steps }, quests.quests.length);
  }

  /**
   * Send a catalogue of this kind unless the log already took this version of it. False when the log
   * could not be reached (the round stops, and its alarm tries again).
   */
  private async sendCatalogue(config: LogConfig, kind: string, version: string, body: object, rows: number): Promise<boolean> {
    const taken = this.sql.exec<{ v: string }>(`SELECT v FROM log_meta WHERE k = ?`, kind).toArray()[0]?.v;
    if (taken === version) return true;
    const sent = await this.post(config, { kind, version, ...body });
    if (sent === 'retry') {
      this.retryLater();
      return false;
    }
    if (sent === 'ok') {
      this.sql.exec(`INSERT OR REPLACE INTO log_meta (k, v) VALUES (?, ?)`, kind, version);
      moduleLog.info('collections.log', 'collect_logged', 'The collection log took a catalogue.', { kind, rows });
    } else moduleLog.error('collections.log', 'collect_log_dropped', 'The collection log refused a catalogue: it is sent again with the next round.', { kind });
    return true;
  }

  private retryLater(): void {
    const wait = LOG_RETRY_MS[Math.min(this.failures, LOG_RETRY_MS.length - 1)]!;
    this.failures++;
    this.deps.wake(this.deps.now() + wait);
  }

  private async currentCatalogue(): Promise<{ version: string; items: CatalogueItem[] }> {
    if (!this.catalogue) {
      const items = logCatalogue();
      this.catalogue = { version: (await sha256(JSON.stringify(items))).slice(0, 16), items };
    }
    return this.catalogue;
  }

  private async currentQuests(): Promise<{ version: string; quests: QuestCatalogueQuest[]; steps: QuestCatalogueStep[] }> {
    if (!this.questList) {
      const c = questCatalogue();
      this.questList = { version: (await sha256(JSON.stringify(c))).slice(0, 16), ...c };
    }
    return this.questList;
  }

  private async post(config: LogConfig, body: unknown): Promise<Sent> {
    try {
      const res = await this.deps.fetch(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(LOG_SEND_MS),
      });
      if (res.ok) return 'ok';
      // Not set up yet, the wrong key, too busy, or down: later. Anything else is the request itself.
      const later = res.status === 401 || res.status === 403 || res.status === 408 || res.status === 429 || res.status >= 500;
      if (later) moduleLog.warn('collections.log', 'collect_log_failed', 'The collection log did not take a batch: it is tried again later.', { status: res.status });
      return later ? 'retry' : 'drop';
    } catch (e) {
      // Unreachable, or slower than LOG_SEND_MS.
      moduleLog.warn('collections.log', 'collect_log_failed', 'The collection log did not answer: the batch is tried again later.', { error: e });
      return 'retry';
    }
  }
}
