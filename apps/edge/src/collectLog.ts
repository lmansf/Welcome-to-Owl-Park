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
 * TODO-DOCS (OP-107): docs/ARCHITECTURE.md: the collection log (this outbox, the `owl-park-log`
 * function in apps/park-log, `game.collect_log` and `game.collectible_catalogue` with the views
 * `game.collect_player_stats` and `game.collect_item_stats`) and its privacy rule (anonymous by
 * construction: salted hashes for the collector and the visit, phone or desktop, neutral room ids;
 * never a name, email, order, ticket or pass). docs/COLLECTIBLES.md: the same rule, and that every
 * grant is logged when the log is on. docs/DEPLOY.md: PARK_LOG_URL with FRAUD_SCORE_KEY and
 * FRAUD_HASH_SALT turn it on (apps/park-log/README.md, steps 3 to 6), and the backfill
 * (`POST /api/admin/collect-log`).
 *
 * TODO-DOCS (OP-166): docs/FEEDBACK.md, "Where notes are kept": with the log on, every note is also
 * copied to `game.feedback` in the owner's analytics project (the `feedback` kind here and in
 * apps/park-log), with the words, the kind, the room, phone or desktop and the hashed collector and
 * visit; never the screen size or the browser's description. The owner's morning run reads it.
 */
import { FURNITURE, PRESENTS, STARTER_PACK, allVariants, parseVariant, type FeedbackKind, type FurnitureSource, type Source, type SpeciesId } from '@owl-park/shared';
import { moduleLog } from './logs';
import { ROOMS } from './rooms';

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
export const ROOM_KINDS: Readonly<Record<string, RealmKind>> = { lobby: 'hub', hub: 'hub', homes: 'hub', grove: 'realm', market: 'realm', arcade: 'realm', glass: 'realm', l1: 'hub' };

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
    entered_at: iso(d.entered),
    exited_at: iso(Math.max(d.entered, d.exited)),
    entry_source: d.source,
    collectibles_gained: d.gained,
  };
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

/** Each kind of row the outbox holds, and how its data becomes the row the log takes. */
const ROWS: Record<string, (salt: string, data: never) => Promise<unknown>> = {
  collect: collectRow,
  player: playerRow,
  session: sessionRow,
  realm_visit: realmVisitRow,
  feedback: feedbackRow,
};

export class CollectLog {
  private sending: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private catalogue: { version: string; items: CatalogueItem[] } | null = null;
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
    const taken = this.sql.exec<{ v: string }>(`SELECT v FROM log_meta WHERE k = 'catalogue'`).toArray()[0]?.v;
    if (taken === catalogue.version) return;
    const sent = await this.post(config, { kind: 'catalogue', version: catalogue.version, items: catalogue.items });
    if (sent === 'retry') return this.retryLater();
    if (sent === 'ok') {
      this.sql.exec(`INSERT OR REPLACE INTO log_meta (k, v) VALUES ('catalogue', ?)`, catalogue.version);
      moduleLog.info('collections.log', 'collect_logged', 'The collection log took the catalogue.', { kind: 'catalogue', rows: catalogue.items.length });
    } else moduleLog.error('collections.log', 'collect_log_dropped', 'The collection log refused the catalogue: it is sent again with the next change to it.', { kind: 'catalogue' });
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
