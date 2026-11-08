/**
 * The park's analytics log (OP-107, OP-111): a Supabase Edge Function in the owner's fraud pipeline
 * project, beside the park's orders, so one project holds all of Owl Park's analytics. The park's
 * collections object posts a batch of rows whenever owls come by collectibles
 * (`apps/edge/src/collectLog.ts`), the catalogue of every collectible whenever a deploy changes it,
 * and the player stats' rows (`apps/edge/src/parkStats.ts`):
 *
 * - `kind: "collect"`: the rows into `game.collect_log`, one per collector and collectible; a row
 *   already there (by its event id, or for that collector and collectible) is skipped, so a batch sent
 *   twice lands once.
 * - `kind: "catalogue"`: every collectible there is, into `game.collectible_catalogue`, which the
 *   views count for "% collected"; one no longer listed stays, marked out of the catalogue.
 * - `kind: "player"` (OP-111): versions of owls, into `game.dim_player` (a type 2 dimension): each
 *   closes its owl's current version and opens its own, unless the owl already looks so.
 * - `kind: "session"` (OP-111): visits that are over, into `game.fact_session`, each tied to the
 *   owl's version as it was when the visit began.
 * - `kind: "realm_visit"` (OP-113): each room a visit went into, into `game.fact_realm_visit`, sent
 *   after the visit's own row; one whose visit is not there is left out.
 * - `kind: "feedback"` (OP-166): notes visitors sent from the Feedback form, into `game.feedback`,
 *   for the owner's morning feedback run; one already there (by its event id) is skipped. The only
 *   rows here that carry words a visitor typed: they are kept as text and never read as anything else.
 * - `kind: "purchase"` (OP-192): ticket events (an order paid, its tickets put on an owl, refunded or
 *   cancelled, a ticket's first scan), into `game.fact_purchase`; one already there (by its event id)
 *   is skipped. Anonymous like the rest: the order and the owl are salted hashes.
 * - `kind: "contact"` (OP-192): a paid order's buyer (email and the store's customer id), into the
 *   owner's `contacts` schema, never the `game` one: the only rows here that name a person. The
 *   Worker sends them straight from the store; one order sent again lands once.
 * - `kind: "room_stay"` (OP-265): live stays, one event as an owl comes into a room (`enter`) and
 *   one as its stay ends (`leave`, with why), applied in order by `game.apply_room_stays`: an enter
 *   closes the visit's open stay and opens its own in the same transaction. A batch sent twice
 *   changes nothing the second time.
 * - `kind: "quest_progress"` (OP-266): each step of each quest an owl takes, one event as it begins
 *   (`start`) and one as it ends (`end`, with how: done, abandoned, expired, retired), applied in
 *   order by `game.apply_quest_progress`, so `game.quest_progress` holds an open row for every owl's
 *   current step. A batch sent twice changes nothing the second time. Never a puzzle's code or key.
 * - `kind: "quest_catalogue"` (OP-266): every quest and every step of each (handing in included),
 *   into `game.dim_quest` and `game.dim_quest_step` by `game.set_quest_catalogue`; one no longer
 *   listed stays, marked out of the catalogue.
 * - `kind: "play_event"` (OP-304): what an owl did in play that the stays and quest steps do not
 *   show: a parkour run begun, a bench or part reached, a fall (where, to 10 px), a clear (its time),
 *   a thing used (a leaf pile, a stall, the moonbeam). Into `game.play_event`, one already there (by
 *   its event id) skipped.
 * - `dry_run: true` (the owner's check, never the park): keeps nothing, and says whether the tables answer.
 *
 * Every other row is anonymous by construction, and checked again here before anything is kept: the
 * collector and the visit are hashes, the device is phone or desktop, the place a room's neutral id,
 * and no other field is taken. A row that fails the check is left out and the rest are kept. The
 * park's key (`FRAUD_SCORE_KEY`, the fraud link's, sent as a bearer token) is checked here: the
 * function is deployed with the platform's JWT check off. This file is plain web code, so the tests
 * run it under Node.
 */

/** The largest request taken: the catalogue of about 1,200 collectibles is under 100 kB. */
const MAX_BODY = 512 * 1024;
/** The most rows in one batch (the park sends 100) and collectibles in one catalogue. */
export const MAX_ROWS = 500;
export const MAX_ITEMS = 10_000;

/** The shortest key taken: the Worker's is a long random string. */
const MIN_KEY = 16;

export const COLLECTIBLE_TYPES = ['quest', 'shop', 'gift', 'seasonal', 'starter', 'grant', 'purchase', 'find'] as const;
export type CollectibleType = (typeof COLLECTIBLE_TYPES)[number];
/** The park's owl kinds (its species list): a fixed list, never free text. */
export const OWL_TYPES = ['great-horned', 'barn', 'burrowing', 'snowy', 'screech'] as const;
export const CHANGE_REASONS = ['first', 'chosen', 'quest', 'seasonal'] as const;
/** A room's kind of place, and how an owl came into it (OP-113). */
export const REALM_KINDS = ['realm', 'hub', 'nest'] as const;
export const ENTRY_SOURCES = ['walked', 'spawn', 'deep_link', 'reconnect', 'travel'] as const;
/** How a live stay began (OP-265): never a reconnect, which continues the stay it came back to. */
export const STAY_ENTRIES = ['walked', 'spawn', 'deep_link', 'travel'] as const;
/** Why a live stay ended (OP-265). */
export const EXIT_REASONS = ['moved', 'logoff', 'timeout', 'server_restart'] as const;
/** What a visit was past the turnstiles (OP-192): a full visitor's or a spectator's (OP-191). */
export const VISITOR_KINDS = ['visitor', 'spectator'] as const;
/** What happened to a ticket order, or to a ticket at the gate (OP-192). */
export const PURCHASE_EVENTS = ['paid', 'claimed', 'refunded', 'cancelled', 'scanned'] as const;
/** How a quest step ended (OP-266). */
export const QUEST_OUTCOMES = ['done', 'abandoned', 'expired', 'retired'] as const;
/** What a quest step asks (OP-266): the quest book's goals, and handing the quest in. */
export const GOAL_KINDS = ['talk', 'visit', 'interact', 'emote', 'gather', 'puzzle', 'hand_in'] as const;
export const QUEST_TYPES = ['talk', 'visit', 'interact', 'emote', 'gather', 'mixed', 'puzzle'] as const;
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const QUEST_LENGTHS = ['short', 'medium', 'long'] as const;
export const CADENCES = ['story', 'daily', 'weekly', 'monthly'] as const;
/** The most quests, and steps, one quest catalogue holds. */
export const MAX_QUESTS = 2000;
export const MAX_QUEST_STEPS = 20_000;
/** The park's ticket kinds: a fixed list, never free text. */
export const TICKET_KINDS = ['day', 'night', 'annual', 'event', 'opening-night'] as const;

/** A row of `game.collect_log` as the park sends it, after the check. */
export interface LogRow {
  event_id: string;
  collector_id: string;
  collectible_id: string;
  collectible_type: CollectibleType;
  realm: string | null;
  acquired_at: string;
  session_id: string | null;
  device_class: 'phone' | 'desktop' | null;
  first_entry_at: string | null;
  backfill: boolean;
}

/** A version of an owl, for `game.dim_player`. */
export interface PlayerRow {
  event_id: string;
  collector_id: string;
  owl_type: (typeof OWL_TYPES)[number];
  color: string;
  changed_at: string;
  change_reason: (typeof CHANGE_REASONS)[number];
}

/** A visit that is over, for `game.fact_session`. */
export interface SessionRow {
  session_id: string;
  collector_id: string;
  started_at: string;
  ended_at: string;
  device_class: 'phone' | 'desktop' | null;
  realms_entered: number;
  collectibles_gained: number;
  /** A full visitor's or a spectator's past the turnstiles, or null (never past them, or a Worker from before OP-192). */
  visitor_kind: (typeof VISITOR_KINDS)[number] | null;
}

/** A ticket event, for `game.fact_purchase` (OP-192). */
export interface PurchaseRow {
  event_id: string;
  event: (typeof PURCHASE_EVENTS)[number];
  order_key: string | null;
  collector_id: string | null;
  occurred_at: string;
  ticket_kinds: (typeof TICKET_KINDS)[number][];
  tickets: number;
  amount_cents: number | null;
  upsell: boolean;
  held: boolean;
  via: 'claim' | 'checkout' | null;
  valid_until: string | null;
}

/** A paid order's buyer, for the owner's `contacts` schema (OP-192): never a `game` table. */
export interface ContactRow {
  shopify_order_id: string;
  order_key: string;
  email: string;
  shopify_customer_id: string | null;
  ordered_at: string;
}

/** A time in one room, for `game.fact_realm_visit`. */
export interface RealmVisitRow {
  visit_id: string;
  session_id: string;
  collector_id: string;
  realm: string;
  realm_kind: (typeof REALM_KINDS)[number];
  /** The park the owl walked there: 1 today's park, 2 the tree (OP-128). A Worker from before it sends none: 1. */
  map_id: 1 | 2;
  entered_at: string;
  exited_at: string;
  entry_source: (typeof ENTRY_SOURCES)[number];
  collectibles_gained: number;
}

/** A live stay's event, for `game.room_stay` (OP-265). */
export type RoomStayRow =
  | {
      event: 'enter';
      stay_id: string;
      session_id: string;
      collector_id: string;
      at: string;
      realm: string;
      realm_kind: (typeof REALM_KINDS)[number];
      map_id: 1 | 2;
      entry_source: (typeof STAY_ENTRIES)[number];
    }
  | { event: 'leave'; stay_id: string; at: string; exit_reason: (typeof EXIT_REASONS)[number] };

/** A quest step's event, for `game.quest_progress` (OP-266). */
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
  | { event: 'end'; progress_id: string; at: string; session_id: string | null; realm: string | null; outcome: (typeof QUEST_OUTCOMES)[number] };

/** What a play event is (OP-304). */
export const PLAY_EVENTS = ['course_start', 'course_bench', 'course_part', 'course_fall', 'course_clear', 'interact'] as const;

/** A play event, for `game.play_event` (OP-304). */
export interface PlayEventRow {
  event_id: string;
  event: (typeof PLAY_EVENTS)[number];
  collector_id: string;
  session_id: string | null;
  run_id: string | null;
  occurred_at: string;
  realm: string | null;
  course_id: string | null;
  thing: string | null;
  pos_x: number | null;
  pos_y: number | null;
  ms: number | null;
  practice: boolean;
}

/** A quest, for `game.dim_quest` (OP-266). */
export interface QuestRefRow {
  quest_id: string;
  title: string;
  giver_npc: string;
  giver_room: string | null;
  quest_type: (typeof QUEST_TYPES)[number];
  difficulty: (typeof DIFFICULTIES)[number];
  length: (typeof QUEST_LENGTHS)[number];
  cadence: (typeof CADENCES)[number];
  template: string | null;
  step_count: number;
  reward_feathers: number;
  reward_item: string | null;
  requires: string[];
  puzzle_id: string | null;
}

/** A step of a quest, for `game.dim_quest_step` (OP-266). */
export interface QuestStepRefRow {
  quest_id: string;
  step_no: number;
  goal_kind: (typeof GOAL_KINDS)[number];
  target_room: string | null;
  target_realm_kind: (typeof REALM_KINDS)[number] | null;
  target_npc: string | null;
  target_thing: string | null;
  need_count: number;
  distinct_only: boolean;
  step_text: string;
}

export const FEEDBACK_KINDS = ['bug', 'idea', 'praise', 'other'] as const;
/** The park's own limits on a note's words (packages/shared feedback.ts). */
export const FEEDBACK_MIN_CHARS = 3;
export const FEEDBACK_MAX_CHARS = 1000;

/** A note a visitor sent, for `game.feedback`. */
export interface FeedbackRow {
  event_id: string;
  park_feedback_id: number | null;
  collector_id: string;
  session_id: string | null;
  kind: (typeof FEEDBACK_KINDS)[number];
  body: string;
  realm: string | null;
  realm_kind: (typeof REALM_KINDS)[number] | null;
  device_class: 'phone' | 'desktop' | null;
  submitted_at: string;
}

/** A row of `game.collectible_catalogue`. */
export interface CatalogueRow {
  collectible_id: string;
  kind: string;
  rarity: string | null;
  realm: string | null;
}

/** Where the rows go: the `game` schema through a database connection (`gameTables`), or a fake in tests. */
export interface Tables {
  /** Throws unless the tables answer (the dry run's check of the key). */
  check(): Promise<void>;
  /** Keeps the rows not there yet (by event id, or collector and collectible); returns how many those were. */
  addRows(rows: LogRow[]): Promise<number>;
  /** Makes the catalogue this list: each one in it, and every other one marked out of the catalogue. */
  setCatalogue(items: CatalogueRow[]): Promise<void>;
  /** Applies the versions in order; returns how many were new versions. */
  addPlayers(rows: PlayerRow[]): Promise<number>;
  /** Keeps the visits not there yet; returns how many those were. */
  addSessions(rows: SessionRow[]): Promise<number>;
  /** Keeps the times in rooms not there yet whose visit is; returns how many those were. */
  addRealmVisits(rows: RealmVisitRow[]): Promise<number>;
  /** Applies live stays' events in order (OP-265); returns how many changed a row. */
  addRoomStays(rows: RoomStayRow[]): Promise<number>;
  /** Applies quest steps' events in order (OP-266); returns how many changed a row. */
  addQuestProgress(rows: QuestProgressRow[]): Promise<number>;
  /** Makes the quest reference tables these lists (OP-266): each in them, and every other one marked out of the catalogue. */
  setQuestCatalogue(quests: QuestRefRow[], steps: QuestStepRefRow[]): Promise<void>;
  /** Keeps the play events not there yet (OP-304); returns how many those were. */
  addPlayEvents(rows: PlayEventRow[]): Promise<number>;
  /** Keeps the notes not there yet; returns how many those were. */
  addFeedback(rows: FeedbackRow[]): Promise<number>;
  /** Keeps the ticket events not there yet; returns how many those were. */
  addPurchases(rows: PurchaseRow[]): Promise<number>;
  /** Keeps each buyer and the order they paid for; returns how many orders were new. */
  addContacts(rows: ContactRow[]): Promise<number>;
}

export interface Deps {
  /** FRAUD_SCORE_KEY, the key the park's Worker sends. Unset: every request is refused. */
  key: string | undefined;
  /** Null when the function cannot reach the tables: it says so, and the park sends again later. */
  tables: Tables | null;
}

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH = /^[0-9a-f]{64}$/;
/** A collection variant (`witch-hat~3`, `hoot`) or a piece of nest furniture (`furniture:rug`). */
const COLLECTIBLE = /^(furniture:)?[a-z0-9][a-z0-9-]{0,47}(~[0-9]{1,2})?$/;
/** A room's neutral id, a collectible's kind or a rarity: a short lower-case word. */
const WORD = /^[a-z]{1,20}$/;
/** A room the park's log names: a word, or a level of the tree (`l0` to `l5`, OP-128), so a letter then letters or digits. */
const ROOM_WORD = /^[a-z][a-z0-9]{0,19}$/;
/** A room a live stay names (OP-265): as ROOM_WORD, with the hyphen the park's room ids use (`l5-street`, `trail-1`). */
const STAY_ROOM = /^[a-z][a-z0-9-]{0,19}$/;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function iso(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** A word or nothing: undefined when the value is neither (the row is then left out). */
function wordOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && WORD.test(v) ? v : undefined;
}

/** A room's name or none, as `wordOrNull`; undefined when it is neither. */
function roomOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && ROOM_WORD.test(v) ? v : undefined;
}

/** Whether two keys are the same, compared by their digests so the time taken says nothing of either. */
async function sameKey(given: string, want: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(want))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i]! ^ y[i]!;
  return d === 0;
}

/** A row as the table takes it, or the reason it is left out. Only the table's fields are copied: anything else sent is dropped. */
export function checkRow(v: unknown): LogRow | string {
  const r = obj(v);
  if (typeof r['event_id'] !== 'string' || !UUID.test(r['event_id'])) return 'event_id';
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  if (typeof r['collectible_id'] !== 'string' || !COLLECTIBLE.test(r['collectible_id'])) return 'collectible_id';
  if (!COLLECTIBLE_TYPES.includes(r['collectible_type'] as CollectibleType)) return 'collectible_type';
  const realm = roomOrNull(r['realm']);
  if (realm === undefined) return 'realm';
  const acquired = iso(r['acquired_at']);
  if (!acquired) return 'acquired_at';
  const session = r['session_id'] ?? null;
  if (session !== null && (typeof session !== 'string' || !UUID.test(session))) return 'session_id';
  const device = r['device_class'] ?? null;
  if (device !== null && device !== 'phone' && device !== 'desktop') return 'device_class';
  const firstSent = r['first_entry_at'] ?? null;
  const first = firstSent === null ? null : iso(firstSent);
  if (firstSent !== null && first === null) return 'first_entry_at';
  const backfill = r['backfill'] ?? false;
  if (typeof backfill !== 'boolean') return 'backfill';
  return {
    event_id: r['event_id'],
    collector_id: r['collector_id'],
    collectible_id: r['collectible_id'],
    collectible_type: r['collectible_type'] as CollectibleType,
    realm,
    acquired_at: acquired,
    session_id: session as string | null,
    device_class: device as LogRow['device_class'],
    first_entry_at: first,
    backfill,
  };
}

const COLOUR = /^#[0-9a-f]{6}$/;
const count = (v: unknown, max: number): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null);

/** A version of an owl as the table takes it, or the reason it is left out. */
export function checkPlayer(v: unknown): PlayerRow | string {
  const r = obj(v);
  if (typeof r['event_id'] !== 'string' || !UUID.test(r['event_id'])) return 'event_id';
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  if (!OWL_TYPES.includes(r['owl_type'] as PlayerRow['owl_type'])) return 'owl_type';
  if (typeof r['color'] !== 'string' || !COLOUR.test(r['color'])) return 'color';
  const changed = iso(r['changed_at']);
  if (!changed) return 'changed_at';
  if (!CHANGE_REASONS.includes(r['change_reason'] as PlayerRow['change_reason'])) return 'change_reason';
  return {
    event_id: r['event_id'],
    collector_id: r['collector_id'],
    owl_type: r['owl_type'] as PlayerRow['owl_type'],
    color: r['color'],
    changed_at: changed,
    change_reason: r['change_reason'] as PlayerRow['change_reason'],
  };
}

/** A visit as the table takes it, or the reason it is left out. */
export function checkSession(v: unknown): SessionRow | string {
  const r = obj(v);
  if (typeof r['session_id'] !== 'string' || !UUID.test(r['session_id'])) return 'session_id';
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  const started = iso(r['started_at']);
  if (!started) return 'started_at';
  const ended = iso(r['ended_at']);
  if (!ended || ended < started) return 'ended_at';
  const device = r['device_class'] ?? null;
  if (device !== null && device !== 'phone' && device !== 'desktop') return 'device_class';
  const realms = count(r['realms_entered'], 100);
  if (realms === null) return 'realms_entered';
  const gained = count(r['collectibles_gained'], 10_000);
  if (gained === null) return 'collectibles_gained';
  // A Worker from before OP-192 sends none: the visit is kept without one.
  const kind = r['visitor_kind'] ?? null;
  if (kind !== null && !VISITOR_KINDS.includes(kind as SessionRow['visitor_kind'] & string)) return 'visitor_kind';
  return {
    session_id: r['session_id'],
    collector_id: r['collector_id'],
    started_at: started,
    ended_at: ended,
    device_class: device as SessionRow['device_class'],
    realms_entered: realms,
    collectibles_gained: gained,
    visitor_kind: kind as SessionRow['visitor_kind'],
  };
}

/** A ticket event as the table takes it, or the reason it is left out (OP-192). */
export function checkPurchase(v: unknown): PurchaseRow | string {
  const r = obj(v);
  if (typeof r['event_id'] !== 'string' || !UUID.test(r['event_id'])) return 'event_id';
  const event = r['event'] as PurchaseRow['event'];
  if (!PURCHASE_EVENTS.includes(event)) return 'event';
  const order = r['order_key'] ?? null;
  if (order !== null && (typeof order !== 'string' || !UUID.test(order))) return 'order_key';
  // Every event but a scan names its order; a scan of a ticket the keepers gave has none.
  if (order === null && event !== 'scanned') return 'order_key';
  const owl = r['collector_id'] ?? null;
  if (owl !== null && (typeof owl !== 'string' || !HASH.test(owl))) return 'collector_id';
  if (owl === null && (event === 'claimed' || event === 'scanned')) return 'collector_id';
  const at = iso(r['occurred_at']);
  if (!at) return 'occurred_at';
  const kinds = r['ticket_kinds'] ?? [];
  if (!Array.isArray(kinds) || kinds.length > MAX_ROWS || !kinds.every((k) => TICKET_KINDS.includes(k as PurchaseRow['ticket_kinds'][number]))) return 'ticket_kinds';
  const tickets = count(r['tickets'], 10_000);
  if (tickets === null) return 'tickets';
  const cents = r['amount_cents'] ?? null;
  if (cents !== null && count(cents, 100_000_000) === null) return 'amount_cents';
  const upsell = r['upsell'] ?? false;
  if (typeof upsell !== 'boolean') return 'upsell';
  const held = r['held'] ?? false;
  if (typeof held !== 'boolean') return 'held';
  const via = r['via'] ?? null;
  if (via !== null && via !== 'claim' && via !== 'checkout') return 'via';
  const untilSent = r['valid_until'] ?? null;
  const until = untilSent === null ? null : iso(untilSent);
  if (untilSent !== null && until === null) return 'valid_until';
  return {
    event_id: r['event_id'],
    event,
    order_key: order as string | null,
    collector_id: owl as string | null,
    occurred_at: at,
    ticket_kinds: kinds as PurchaseRow['ticket_kinds'],
    tickets,
    amount_cents: cents as number | null,
    upsell,
    held,
    via: via as PurchaseRow['via'],
    valid_until: until,
  };
}

/** An email as the park keys emails (trimmed, lower case, at most 254 characters, one @ with a dot after it). */
const EMAIL = /^[^\s@<>()[\]\\,;:"\u0000-\u001F\u007F]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const STORE_ID = /^\d{1,20}$/;

/** A buyer as the contacts take it, or the reason it is left out (OP-192). The email is checked for shape only, never sent anywhere. */
export function checkContact(v: unknown): ContactRow | string {
  const r = obj(v);
  if (typeof r['shopify_order_id'] !== 'string' || !STORE_ID.test(r['shopify_order_id'])) return 'shopify_order_id';
  if (typeof r['order_key'] !== 'string' || !UUID.test(r['order_key'])) return 'order_key';
  const email = r['email'];
  if (typeof email !== 'string' || email.length > 254 || email !== email.trim().toLowerCase() || !EMAIL.test(email)) return 'email';
  const customer = r['shopify_customer_id'] ?? null;
  if (customer !== null && (typeof customer !== 'string' || !STORE_ID.test(customer))) return 'shopify_customer_id';
  const at = iso(r['ordered_at']);
  if (!at) return 'ordered_at';
  return { shopify_order_id: r['shopify_order_id'], order_key: r['order_key'], email, shopify_customer_id: customer as string | null, ordered_at: at };
}

/** A time in one room as the table takes it, or the reason it is left out. */
export function checkRealmVisit(v: unknown): RealmVisitRow | string {
  const r = obj(v);
  if (typeof r['visit_id'] !== 'string' || !UUID.test(r['visit_id'])) return 'visit_id';
  if (typeof r['session_id'] !== 'string' || !UUID.test(r['session_id'])) return 'session_id';
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  if (typeof r['realm'] !== 'string' || !ROOM_WORD.test(r['realm'])) return 'realm';
  if (!REALM_KINDS.includes(r['realm_kind'] as RealmVisitRow['realm_kind'])) return 'realm_kind';
  const map = r['map_id'] ?? 1;
  if (map !== 1 && map !== 2) return 'map_id';
  const entered = iso(r['entered_at']);
  if (!entered) return 'entered_at';
  const exited = iso(r['exited_at']);
  if (!exited || exited < entered) return 'exited_at';
  if (!ENTRY_SOURCES.includes(r['entry_source'] as RealmVisitRow['entry_source'])) return 'entry_source';
  const gained = count(r['collectibles_gained'], 10_000);
  if (gained === null) return 'collectibles_gained';
  return {
    visit_id: r['visit_id'],
    session_id: r['session_id'],
    collector_id: r['collector_id'],
    realm: r['realm'],
    realm_kind: r['realm_kind'] as RealmVisitRow['realm_kind'],
    map_id: map,
    entered_at: entered,
    exited_at: exited,
    entry_source: r['entry_source'] as RealmVisitRow['entry_source'],
    collectibles_gained: gained,
  };
}

/** A live stay's event as the table takes it (OP-265), or the reason it is left out. */
export function checkRoomStay(v: unknown): RoomStayRow | string {
  const r = obj(v);
  if (typeof r['stay_id'] !== 'string' || !UUID.test(r['stay_id'])) return 'stay_id';
  const at = iso(r['at']);
  if (!at) return 'at';
  if (r['event'] === 'leave') {
    if (!EXIT_REASONS.includes(r['exit_reason'] as (typeof EXIT_REASONS)[number])) return 'exit_reason';
    return { event: 'leave', stay_id: r['stay_id'], at, exit_reason: r['exit_reason'] as (typeof EXIT_REASONS)[number] };
  }
  if (r['event'] !== 'enter') return 'event';
  if (typeof r['session_id'] !== 'string' || !UUID.test(r['session_id'])) return 'session_id';
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  if (typeof r['realm'] !== 'string' || !STAY_ROOM.test(r['realm'])) return 'realm';
  if (!REALM_KINDS.includes(r['realm_kind'] as (typeof REALM_KINDS)[number])) return 'realm_kind';
  const map = r['map_id'] ?? 1;
  if (map !== 1 && map !== 2) return 'map_id';
  if (!STAY_ENTRIES.includes(r['entry_source'] as (typeof STAY_ENTRIES)[number])) return 'entry_source';
  return {
    event: 'enter',
    stay_id: r['stay_id'],
    session_id: r['session_id'],
    collector_id: r['collector_id'],
    at,
    realm: r['realm'],
    realm_kind: r['realm_kind'] as (typeof REALM_KINDS)[number],
    map_id: map,
    entry_source: r['entry_source'] as (typeof STAY_ENTRIES)[number],
  };
}

/** A course's id, a piece's, or a thing used as its kind and id (`leaf-pile:hub-leaves-1`). */
const PLAY_THING = /^[a-z0-9][a-z0-9-]{0,47}(:[a-z0-9][a-z0-9-]{0,63})?$/;
const COURSE_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
/** The largest place in a room the log takes (the widest rooms are under 10,000 px). */
const MAX_POS = 100_000;
/** The longest run time taken: a run is forgotten after an hour, so a day is plenty. */
const MAX_MS = 86_400_000;

const intOrNull = (v: unknown, lo: number, hi: number): number | null | undefined => {
  if (v === null || v === undefined) return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined;
};

/** A play event as the table takes it (OP-304), or the reason it is left out. */
export function checkPlayEvent(v: unknown): PlayEventRow | string {
  const r = obj(v);
  if (typeof r['event_id'] !== 'string' || !UUID.test(r['event_id'])) return 'event_id';
  if (!PLAY_EVENTS.includes(r['event'] as (typeof PLAY_EVENTS)[number])) return 'event';
  const event = r['event'] as (typeof PLAY_EVENTS)[number];
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  const session = r['session_id'] ?? null;
  if (session !== null && (typeof session !== 'string' || !UUID.test(session))) return 'session_id';
  const run = r['run_id'] ?? null;
  if (run !== null && (typeof run !== 'string' || !UUID.test(run))) return 'run_id';
  const at = iso(r['occurred_at']);
  if (!at) return 'occurred_at';
  const realm = stayRoomOrNull(r['realm']);
  if (realm === undefined) return 'realm';
  const course = r['course_id'] ?? null;
  if (course !== null && (typeof course !== 'string' || !COURSE_ID.test(course))) return 'course_id';
  if (event !== 'interact' && course === null) return 'course_id';
  const thing = r['thing'] ?? null;
  if (thing !== null && (typeof thing !== 'string' || !PLAY_THING.test(thing))) return 'thing';
  if (event === 'interact' && thing === null) return 'thing';
  const x = intOrNull(r['pos_x'], -MAX_POS, MAX_POS);
  if (x === undefined) return 'pos_x';
  const y = intOrNull(r['pos_y'], -MAX_POS, MAX_POS);
  if (y === undefined) return 'pos_y';
  // Where an owl stood is kept for a fall alone.
  if (event !== 'course_fall' && (x !== null || y !== null)) return 'pos_x';
  const ms = intOrNull(r['ms'], 0, MAX_MS);
  if (ms === undefined) return 'ms';
  const practice = r['practice'] ?? false;
  if (typeof practice !== 'boolean') return 'practice';
  return {
    event_id: r['event_id'],
    event,
    collector_id: r['collector_id'],
    session_id: session as string | null,
    run_id: run as string | null,
    occurred_at: at,
    realm,
    course_id: course as string | null,
    thing: thing as string | null,
    pos_x: x,
    pos_y: y,
    ms,
    practice,
  };
}

/** A quest's id, an NPC's, a template's or a puzzle's: lower-case words joined by hyphens (`story-welcome`, `leaves-bramble-easy`). */
const QUEST_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** A quest's period: '' for a story quest, else its park day, week or month (`2026-11-04`, `W2026-11-02`, `M2026-11`). */
const PERIOD = /^$|^[WM]?[0-9]{4}-[0-9]{2}(-[0-9]{2})?$/;
/** Words shown to visitors (a quest's title, a step's): no control characters, and short. */
const SHOWN = /^[^\u0000-\u001f\u007f]{1,200}$/;

function idOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && QUEST_ID.test(v) ? v : undefined;
}

/** A room a quest names, as a live stay's (`STAY_ROOM`), or none; undefined when it is neither. */
function stayRoomOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && STAY_ROOM.test(v) ? v : undefined;
}

/** A quest step's event as the table takes it (OP-266), or the reason it is left out. */
export function checkQuestProgress(v: unknown): QuestProgressRow | string {
  const r = obj(v);
  if (typeof r['progress_id'] !== 'string' || !UUID.test(r['progress_id'])) return 'progress_id';
  const at = iso(r['at']);
  if (!at) return 'at';
  const session = r['session_id'] ?? null;
  if (session !== null && (typeof session !== 'string' || !UUID.test(session))) return 'session_id';
  const realm = stayRoomOrNull(r['realm']);
  if (realm === undefined) return 'realm';
  if (r['event'] === 'end') {
    if (!QUEST_OUTCOMES.includes(r['outcome'] as (typeof QUEST_OUTCOMES)[number])) return 'outcome';
    return { event: 'end', progress_id: r['progress_id'], at, session_id: session as string | null, realm, outcome: r['outcome'] as (typeof QUEST_OUTCOMES)[number] };
  }
  if (r['event'] !== 'start') return 'event';
  if (typeof r['run_id'] !== 'string' || !UUID.test(r['run_id'])) return 'run_id';
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  if (typeof r['quest_id'] !== 'string' || !QUEST_ID.test(r['quest_id'])) return 'quest_id';
  if (typeof r['period'] !== 'string' || !PERIOD.test(r['period'])) return 'period';
  const step = r['step_no'];
  if (typeof step !== 'number' || !Number.isInteger(step) || step < 1 || step > 100) return 'step_no';
  const expires = r['expires_at'] === null || r['expires_at'] === undefined ? null : iso(r['expires_at']);
  if (expires === null && r['expires_at'] !== null && r['expires_at'] !== undefined) return 'expires_at';
  return {
    event: 'start',
    progress_id: r['progress_id'],
    run_id: r['run_id'],
    collector_id: r['collector_id'],
    session_id: session as string | null,
    quest_id: r['quest_id'],
    period: r['period'],
    step_no: step,
    at,
    realm,
    expires_at: expires,
  };
}

const smallCount = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** A quest as `game.dim_quest` takes it (OP-266), or null to refuse the catalogue. */
export function checkQuestRef(v: unknown): QuestRefRow | null {
  const q = obj(v);
  if (typeof q['quest_id'] !== 'string' || !QUEST_ID.test(q['quest_id'])) return null;
  if (typeof q['title'] !== 'string' || !SHOWN.test(q['title'])) return null;
  if (typeof q['giver_npc'] !== 'string' || !QUEST_ID.test(q['giver_npc'])) return null;
  const giverRoom = stayRoomOrNull(q['giver_room']);
  const template = idOrNull(q['template']);
  const puzzle = idOrNull(q['puzzle_id']);
  if (giverRoom === undefined || template === undefined || puzzle === undefined) return null;
  if (!QUEST_TYPES.includes(q['quest_type'] as QuestRefRow['quest_type'])) return null;
  if (!DIFFICULTIES.includes(q['difficulty'] as QuestRefRow['difficulty'])) return null;
  if (!QUEST_LENGTHS.includes(q['length'] as QuestRefRow['length'])) return null;
  if (!CADENCES.includes(q['cadence'] as QuestRefRow['cadence'])) return null;
  if (!smallCount(q['step_count'], 1, 99) || !smallCount(q['reward_feathers'], 0, 100_000)) return null;
  const item = q['reward_item'] ?? null;
  if (item !== null && (typeof item !== 'string' || !(item === 'pick' || COLLECTIBLE.test(item)))) return null;
  const requires = q['requires'] ?? [];
  if (!Array.isArray(requires) || requires.length > 20 || !requires.every((x) => typeof x === 'string' && QUEST_ID.test(x))) return null;
  return {
    quest_id: q['quest_id'],
    title: q['title'],
    giver_npc: q['giver_npc'],
    giver_room: giverRoom,
    quest_type: q['quest_type'] as QuestRefRow['quest_type'],
    difficulty: q['difficulty'] as QuestRefRow['difficulty'],
    length: q['length'] as QuestRefRow['length'],
    cadence: q['cadence'] as QuestRefRow['cadence'],
    template,
    step_count: q['step_count'],
    reward_feathers: q['reward_feathers'],
    reward_item: item as string | null,
    requires: requires as string[],
    puzzle_id: puzzle,
  };
}

/** A quest's step as `game.dim_quest_step` takes it (OP-266), or null to refuse the catalogue. */
export function checkQuestStepRef(v: unknown): QuestStepRefRow | null {
  const s = obj(v);
  if (typeof s['quest_id'] !== 'string' || !QUEST_ID.test(s['quest_id'])) return null;
  if (!smallCount(s['step_no'], 1, 100)) return null;
  if (!GOAL_KINDS.includes(s['goal_kind'] as QuestStepRefRow['goal_kind'])) return null;
  const room = stayRoomOrNull(s['target_room']);
  const npc = idOrNull(s['target_npc']);
  const thing = idOrNull(s['target_thing']);
  if (room === undefined || npc === undefined || thing === undefined) return null;
  const kind = s['target_realm_kind'] ?? null;
  if (kind !== null && !REALM_KINDS.includes(kind as (typeof REALM_KINDS)[number])) return null;
  if (!smallCount(s['need_count'], 1, 1000) || typeof s['distinct_only'] !== 'boolean') return null;
  if (typeof s['step_text'] !== 'string' || !SHOWN.test(s['step_text'])) return null;
  return {
    quest_id: s['quest_id'],
    step_no: s['step_no'],
    goal_kind: s['goal_kind'] as QuestStepRefRow['goal_kind'],
    target_room: room,
    target_realm_kind: kind as QuestStepRefRow['target_realm_kind'],
    target_npc: npc,
    target_thing: thing,
    need_count: s['need_count'],
    distinct_only: s['distinct_only'],
    step_text: s['step_text'],
  };
}

/** A note as the table takes it, or the reason it is left out. The words are checked for size and control characters only: they are the visitor's. */
export function checkFeedback(v: unknown): FeedbackRow | string {
  const r = obj(v);
  if (typeof r['event_id'] !== 'string' || !UUID.test(r['event_id'])) return 'event_id';
  const parkId = r['park_feedback_id'] ?? null;
  if (parkId !== null && count(parkId, Number.MAX_SAFE_INTEGER) === null) return 'park_feedback_id';
  if (typeof r['collector_id'] !== 'string' || !HASH.test(r['collector_id'])) return 'collector_id';
  const session = r['session_id'] ?? null;
  if (session !== null && (typeof session !== 'string' || !UUID.test(session))) return 'session_id';
  if (!FEEDBACK_KINDS.includes(r['kind'] as FeedbackRow['kind'])) return 'kind';
  const body = r['body'];
  // The park sends its words cleaned (newlines kept, every other control character out); anything else is not the park's.
  if (typeof body !== 'string' || body.length < FEEDBACK_MIN_CHARS || body.length > FEEDBACK_MAX_CHARS || /[\u0000-\u0009\u000B-\u001F\u007F]/.test(body)) return 'body';
  const realm = roomOrNull(r['realm']);
  if (realm === undefined) return 'realm';
  const realmKind = r['realm_kind'] ?? null;
  if (realmKind !== null && !REALM_KINDS.includes(realmKind as (typeof REALM_KINDS)[number])) return 'realm_kind';
  const device = r['device_class'] ?? null;
  if (device !== null && device !== 'phone' && device !== 'desktop') return 'device_class';
  const submitted = iso(r['submitted_at']);
  if (!submitted) return 'submitted_at';
  return {
    event_id: r['event_id'],
    park_feedback_id: parkId as number | null,
    collector_id: r['collector_id'],
    session_id: session as string | null,
    kind: r['kind'] as FeedbackRow['kind'],
    body,
    realm,
    realm_kind: realmKind as FeedbackRow['realm_kind'],
    device_class: device as FeedbackRow['device_class'],
    submitted_at: submitted,
  };
}

/** A catalogue entry as the table takes it (the park sends `id`), or null to leave it out. */
export function checkItem(v: unknown): CatalogueRow | null {
  const i = obj(v);
  if (typeof i['id'] !== 'string' || !COLLECTIBLE.test(i['id'])) return null;
  if (typeof i['kind'] !== 'string' || !WORD.test(i['kind'])) return null;
  const rarity = wordOrNull(i['rarity']);
  const realm = wordOrNull(i['realm']);
  if (rarity === undefined || realm === undefined) return null;
  return { collectible_id: i['id'], kind: i['kind'], rarity, realm };
}

/** A batch of rows of one kind: each checked, the good ones kept, and what became of them. */
async function keepRows<T>(kind: string, body: Record<string, unknown>, check: (v: unknown) => T | string, add: (rows: T[]) => Promise<number>): Promise<Response> {
  const sent = Array.isArray(body['rows']) ? body['rows'] : null;
  if (!sent) return json({ error: 'rows must be a list' }, 400);
  if (sent.length > MAX_ROWS) return json({ error: `at most ${MAX_ROWS} rows a batch` }, 413);
  const rows: T[] = [];
  const skipped: Record<string, number> = {};
  for (const v of sent) {
    const r = check(v);
    if (typeof r === 'string') skipped[r] = (skipped[r] ?? 0) + 1;
    else rows.push(r);
  }
  const left = sent.length - rows.length;
  // Which field failed, never what was in it.
  if (left) console.error(`[owl-park-log] ${left} of ${sent.length} ${kind} rows left out:`, JSON.stringify(skipped));
  const kept = rows.length ? await add(rows) : 0;
  return json({ ok: true, kept, duplicates: rows.length - kept, skipped: left });
}

async function catalogue(body: Record<string, unknown>, tables: Tables): Promise<Response> {
  const sent = Array.isArray(body['items']) ? body['items'] : null;
  if (!sent || !sent.length) return json({ error: 'items must be a list' }, 400);
  if (sent.length > MAX_ITEMS) return json({ error: `at most ${MAX_ITEMS} items` }, 413);
  const items = sent.map(checkItem);
  // A catalogue is all or nothing: a part of it would mark the rest out of the catalogue.
  if (items.some((i) => i === null)) return json({ error: 'an item is not a collectible' }, 400);
  await tables.setCatalogue(items as CatalogueRow[]);
  return json({ ok: true, items: items.length });
}

async function questCatalogue(body: Record<string, unknown>, tables: Tables): Promise<Response> {
  const sentQuests = Array.isArray(body['quests']) ? body['quests'] : null;
  const sentSteps = Array.isArray(body['steps']) ? body['steps'] : null;
  if (!sentQuests || !sentQuests.length || !sentSteps || !sentSteps.length) return json({ error: 'quests and steps must be lists' }, 400);
  if (sentQuests.length > MAX_QUESTS || sentSteps.length > MAX_QUEST_STEPS) return json({ error: `at most ${MAX_QUESTS} quests and ${MAX_QUEST_STEPS} steps` }, 413);
  const quests = sentQuests.map(checkQuestRef);
  const steps = sentSteps.map(checkQuestStepRef);
  // All or nothing, as the collectibles' catalogue: a part of it would mark the rest out.
  if (quests.some((q) => q === null)) return json({ error: 'a quest is not one' }, 400);
  if (steps.some((s) => s === null)) return json({ error: 'a step is not one' }, 400);
  const ids = new Set((quests as QuestRefRow[]).map((q) => q.quest_id));
  if (ids.size !== quests.length) return json({ error: 'a quest is listed twice' }, 400);
  if ((steps as QuestStepRefRow[]).some((s) => !ids.has(s.quest_id))) return json({ error: 'a step names a quest not listed' }, 400);
  await tables.setQuestCatalogue(quests as QuestRefRow[], steps as QuestStepRefRow[]);
  return json({ ok: true, quests: quests.length, steps: steps.length });
}

/** The kinds of request the park sends. */
export const KINDS = ['collect', 'catalogue', 'player', 'session', 'realm_visit', 'feedback', 'purchase', 'contact', 'room_stay', 'quest_progress', 'quest_catalogue', 'play_event'] as const;

const isKind = (v: unknown): v is (typeof KINDS)[number] => KINDS.includes(v as (typeof KINDS)[number]);

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const key = deps.key?.trim() ?? '';
  if (key.length < MIN_KEY) return json({ error: 'not set up' }, 503);
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ') || !(await sameKey(auth.slice(7).trim(), key))) return json({ error: 'unauthorized' }, 401);
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY) return json({ error: 'too large' }, 413);
  const text = await req.text();
  if (text.length > MAX_BODY) return json({ error: 'too large' }, 413);
  let body: Record<string, unknown>;
  try {
    body = obj(JSON.parse(text));
  } catch {
    return json({ error: 'not JSON' }, 400);
  }
  if (body['dry_run'] === true) {
    const tables = deps.tables ? await deps.tables.check().then(() => 'ok', (e) => `unreachable: ${message(e)}`) : 'not set up';
    return json({ ok: true, dry_run: true, tables });
  }
  const kind = body['kind'];
  if (!isKind(kind)) {
    return json({ error: `kind must be ${KINDS.slice(0, -1).join(', ')} or ${KINDS.at(-1)}` }, 400);
  }
  // Without its tables the function keeps nothing, and says so: the park keeps the rows and sends them again.
  const tables = deps.tables;
  if (!tables) return json({ error: 'no tables' }, 503);
  try {
    switch (kind) {
      case 'collect':
        return await keepRows(kind, body, checkRow, (rows) => tables.addRows(rows));
      case 'player':
        return await keepRows(kind, body, checkPlayer, (rows) => tables.addPlayers(rows));
      case 'session':
        return await keepRows(kind, body, checkSession, (rows) => tables.addSessions(rows));
      case 'realm_visit':
        return await keepRows(kind, body, checkRealmVisit, (rows) => tables.addRealmVisits(rows));
      case 'feedback':
        return await keepRows(kind, body, checkFeedback, (rows) => tables.addFeedback(rows));
      case 'purchase':
        return await keepRows(kind, body, checkPurchase, (rows) => tables.addPurchases(rows));
      case 'contact':
        return await keepRows(kind, body, checkContact, (rows) => tables.addContacts(rows));
      case 'room_stay':
        return await keepRows(kind, body, checkRoomStay, (rows) => tables.addRoomStays(rows));
      case 'quest_progress':
        return await keepRows(kind, body, checkQuestProgress, (rows) => tables.addQuestProgress(rows));
      case 'play_event':
        return await keepRows(kind, body, checkPlayEvent, (rows) => tables.addPlayEvents(rows));
      case 'catalogue':
        return await catalogue(body, tables);
      case 'quest_catalogue':
        return await questCatalogue(body, tables);
    }
  } catch (e) {
    console.error(`[owl-park-log] the ${String(body['kind'])} was not kept:`, message(e));
    return json({ error: 'not kept' }, 503);
  }
}

/** The schema the park's rows go to, in the fraud pipeline's project (as the park's orders, OP-052). */
export const SCHEMA = 'game';

/** What the tables need of a Postgres client: a query with numbered parameters. postgres.js's `sql.unsafe` is one. */
export interface Db {
  unsafe(query: string, params: unknown[]): PromiseLike<unknown>;
}

const LOG_COLUMNS = 'event_id, collector_id, collectible_id, collectible_type, realm, acquired_at, session_id, device_class, first_entry_at, backfill';
const CATALOGUE_COLUMNS = 'collectible_id, kind, rarity, realm';
const SESSION_COLUMNS = 'session_id, collector_id, started_at, ended_at, device_class, realms_entered, collectibles_gained, visitor_kind';
const PURCHASE_COLUMNS = 'event_id, event, order_key, collector_id, occurred_at, ticket_kinds, tickets, amount_cents, upsell, held, via, valid_until';
/** The owner's buyers (OP-192): a schema of their own, apart from the park's anonymous `game` tables. */
export const CONTACTS_SCHEMA = 'contacts';
const REALM_VISIT_COLUMNS = 'visit_id, session_id, collector_id, realm, realm_kind, map_id, entered_at, exited_at, entry_source, collectibles_gained';
const PLAY_EVENT_COLUMNS = 'event_id, event, collector_id, session_id, run_id, occurred_at, realm, course_id, thing, pos_x, pos_y, ms, practice';
const FEEDBACK_COLUMNS = 'event_id, park_feedback_id, collector_id, session_id, kind, body, realm, realm_kind, device_class, submitted_at';

/**
 * The park's tables in the `game` schema, over a direct connection to the project's database (the
 * function's own SUPABASE_DB_URL): the schema is not in the project's public API at all, and the
 * connection's role owns it. A batch goes as one parameter, its JSON, and the database gives each
 * value its column's type, so nothing the park sends is spliced into the query.
 */
export function gameTables(db: Db): Tables {
  return {
    async check() {
      await db.unsafe(`select 1 from ${SCHEMA}.collect_log limit 1`, []);
    },
    async addRows(rows) {
      // Sent as text and read as JSON by the database: a client that encodes JSON parameters itself
      // (postgres.js does) would otherwise encode it twice and keep a string.
      const kept = await db.unsafe(
        `insert into ${SCHEMA}.collect_log (${LOG_COLUMNS}) select ${LOG_COLUMNS} from jsonb_populate_recordset(null::${SCHEMA}.collect_log, $1::text::jsonb) on conflict do nothing returning event_id`,
        [JSON.stringify(rows)],
      );
      return Array.isArray(kept) ? kept.length : 0;
    },
    async setCatalogue(items) {
      // One statement: every item in, and anything not among them marked out (the same snapshot throughout).
      await db.unsafe(
        `with items as (select ${CATALOGUE_COLUMNS} from jsonb_populate_recordset(null::${SCHEMA}.collectible_catalogue, $1::text::jsonb)),
        upserted as (
          insert into ${SCHEMA}.collectible_catalogue (${CATALOGUE_COLUMNS}, in_catalogue, updated_at)
          select ${CATALOGUE_COLUMNS}, true, now() from items
          on conflict (collectible_id) do update set kind = excluded.kind, rarity = excluded.rarity, realm = excluded.realm, in_catalogue = true, updated_at = now()
          returning collectible_id
        )
        update ${SCHEMA}.collectible_catalogue c set in_catalogue = false, updated_at = now()
        where c.in_catalogue and not exists (select 1 from items i where i.collectible_id = c.collectible_id)`,
        [JSON.stringify(items)],
      );
    },
    async addPlayers(rows) {
      // The database applies them one by one, in order (sql/players.sql): close the current version, open the new.
      const res = await db.unsafe(`select ${SCHEMA}.add_player_versions($1::text::jsonb) as kept`, [JSON.stringify(rows)]);
      const kept = Array.isArray(res) ? Number((res[0] as { kept?: unknown } | undefined)?.kept ?? 0) : 0;
      return Number.isFinite(kept) ? kept : 0;
    },
    async addSessions(rows) {
      // Each visit tied to the owl's version as it was when the visit began (its first, if none was yet).
      const kept = await db.unsafe(
        `insert into ${SCHEMA}.fact_session (${SESSION_COLUMNS}, player_sk)
        select ${SESSION_COLUMNS.split(', ').map((c) => `s.${c}`).join(', ')},
          coalesce(
            (select d.player_sk from ${SCHEMA}.dim_player d where d.collector_id = s.collector_id and d.valid_from <= s.started_at order by d.valid_from desc limit 1),
            (select d.player_sk from ${SCHEMA}.dim_player d where d.collector_id = s.collector_id order by d.valid_from limit 1)
          )
        from jsonb_populate_recordset(null::${SCHEMA}.fact_session, $1::text::jsonb) s
        on conflict (session_id) do nothing
        returning session_id`,
        [JSON.stringify(rows)],
      );
      return Array.isArray(kept) ? kept.length : 0;
    },
    async addRealmVisits(rows) {
      // The park sends a visit's rooms after the visit itself, so its row is here: one whose visit is
      // not (refused, or lost) is left out rather than failing the batch and holding up the rest.
      // Each tied to the owl's version as it was when it came into the room, as the visits are.
      const kept = await db.unsafe(
        `insert into ${SCHEMA}.fact_realm_visit (${REALM_VISIT_COLUMNS}, player_sk)
        select ${REALM_VISIT_COLUMNS.split(', ').map((c) => `r.${c}`).join(', ')},
          coalesce(
            (select d.player_sk from ${SCHEMA}.dim_player d where d.collector_id = r.collector_id and d.valid_from <= r.entered_at order by d.valid_from desc limit 1),
            (select d.player_sk from ${SCHEMA}.dim_player d where d.collector_id = r.collector_id order by d.valid_from limit 1)
          )
        from jsonb_populate_recordset(null::${SCHEMA}.fact_realm_visit, $1::text::jsonb) r
        where exists (select 1 from ${SCHEMA}.fact_session s where s.session_id = r.session_id)
        on conflict (visit_id) do nothing
        returning visit_id`,
        [JSON.stringify(rows)],
      );
      return Array.isArray(kept) ? kept.length : 0;
    },
    async addPurchases(rows) {
      const kept = await db.unsafe(
        `insert into ${SCHEMA}.fact_purchase (${PURCHASE_COLUMNS}) select ${PURCHASE_COLUMNS} from jsonb_populate_recordset(null::${SCHEMA}.fact_purchase, $1::text::jsonb) on conflict (event_id) do nothing returning event_id`,
        [JSON.stringify(rows)],
      );
      return Array.isArray(kept) ? kept.length : 0;
    },
    async addContacts(rows) {
      // The database keeps each buyer by email and each order once (sql/profiles.sql): the rows go as the one JSON parameter.
      const res = await db.unsafe(`select ${CONTACTS_SCHEMA}.add_contacts($1::text::jsonb) as kept`, [JSON.stringify(rows)]);
      const kept = Array.isArray(res) ? Number((res[0] as { kept?: unknown } | undefined)?.kept ?? 0) : 0;
      return Number.isFinite(kept) ? kept : 0;
    },
    async addRoomStays(rows) {
      // In order, in one call and so one transaction (sql/room_stays.sql): an enter closes the visit's open stay and opens its own.
      const res = await db.unsafe(`select ${SCHEMA}.apply_room_stays($1::text::jsonb) as kept`, [JSON.stringify(rows)]);
      const kept = Array.isArray(res) ? Number((res[0] as { kept?: unknown } | undefined)?.kept ?? 0) : 0;
      return Number.isFinite(kept) ? kept : 0;
    },
    async addQuestProgress(rows) {
      // In order, in one call and so one transaction (sql/quest_progress.sql): a step's start closes the run's open step before it.
      const res = await db.unsafe(`select ${SCHEMA}.apply_quest_progress($1::text::jsonb) as kept`, [JSON.stringify(rows)]);
      const kept = Array.isArray(res) ? Number((res[0] as { kept?: unknown } | undefined)?.kept ?? 0) : 0;
      return Number.isFinite(kept) ? kept : 0;
    },
    async setQuestCatalogue(quests, steps) {
      // One call, so one transaction: every quest and step in, and any not among them marked out.
      await db.unsafe(`select ${SCHEMA}.set_quest_catalogue($1::text::jsonb, $2::text::jsonb)`, [JSON.stringify(quests), JSON.stringify(steps)]);
    },
    async addPlayEvents(rows) {
      const kept = await db.unsafe(
        `insert into ${SCHEMA}.play_event (${PLAY_EVENT_COLUMNS}) select ${PLAY_EVENT_COLUMNS} from jsonb_populate_recordset(null::${SCHEMA}.play_event, $1::text::jsonb) on conflict (event_id) do nothing returning event_id`,
        [JSON.stringify(rows)],
      );
      return Array.isArray(kept) ? kept.length : 0;
    },
    async addFeedback(rows) {
      // The words go in the batch's one JSON parameter like every other field: never part of the query.
      const kept = await db.unsafe(
        `insert into ${SCHEMA}.feedback (${FEEDBACK_COLUMNS}) select ${FEEDBACK_COLUMNS} from jsonb_populate_recordset(null::${SCHEMA}.feedback, $1::text::jsonb) on conflict (event_id) do nothing returning event_id`,
        [JSON.stringify(rows)],
      );
      return Array.isArray(kept) ? kept.length : 0;
    },
  };
}
