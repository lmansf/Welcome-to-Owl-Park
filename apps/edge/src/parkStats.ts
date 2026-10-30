/**
 * The player stats (OP-111), kept in the collections object beside the collection log's outbox
 * (collectLog.ts), whose rows they send the same way and as anonymously:
 *
 * - Each owl's kind and body colour as it last showed them. Its first visit sends a first version,
 *   and every change of either sends a new one, so the owner's `game.dim_player` keeps the owl's
 *   history (a type 2 dimension). The kind is the fixed list of species; the colour is `#rrggbb`.
 * - Each visit in progress, one per page load by its pass's id: when it began, when it was last seen
 *   (a hello, the room object's minute heartbeat for every owl it holds, a socket's close), its
 *   device, the rooms it went into and the collectibles it brought. A visit quiet for VISIT_GRACE_MS
 *   is over and goes to the log as one session row; it ends when it was last seen.
 * - Each room the visit goes into (OP-113), from the owl's hello there until its next hello (in the
 *   next room, or in this one again after its line dropped, which begins a new time there) or the
 *   end of the visit: a visit's rooms follow one another without a gap or an overlap, so their times
 *   add up to the visit's. With each, how the owl came in (`EntrySource`) and the collectibles it got
 *   there; time with the Menu open counts, as the owl is still in the room. They go to the log with
 *   their visit, right after its row.
 *
 * Nothing here is kept while the log is off. Written against `SqlStorage`, so Node tests it.
 *
 * TODO-DOCS (OP-111): docs/ARCHITECTURE.md, beside the collection log (OP-107): the player stats
 * (this file, the room object's hello, look, minute heartbeat and close calls, `game.dim_player` and
 * `game.add_player_versions`, `game.fact_session`, `game.v_player_lifetime` in apps/park-log/sql/
 * players.sql), and the privacy boundary for under-13 players the ticket sets out: the park side holds
 * no email or name; purchases and the one Logan-only table tying a ticket to an owl come with the
 * store and the ticket gate (OP-024, OP-010), and play data is only ever joined outward to the buyer.
 *
 * TODO-DOCS (OP-113): docs/ARCHITECTURE.md, in the same model: `game.fact_realm_visit` (a row for
 * each room a visit went into, under its session, from this file's rooms), its views
 * `game.v_realm_time` and `game.v_player_realm`, and `minutes_by_realm` in `game.v_player_lifetime`
 * (apps/park-log/sql/realms.sql): how the times add up to the visit's, and what each entry source means.
 */
import { DEFAULT_SPECIES, SPECIES, isHexColour, type SpeciesId } from '@owl-park/shared';
import { moduleLog } from './logs';
import { cleanVisit, type CollectLog, type EntrySource, type Visit } from './collectLog';

/** A visit not seen for this long is over: two of the room objects' minute heartbeats and some. */
export const VISIT_GRACE_MS = 3 * 60_000;

/** Times in rooms one visit keeps apart: past this (a line dropping over and over), the last runs on to the visit's end. */
export const REALM_VISITS_MAX = 500;

/** A visit as one of its owl's sockets reports it. */
export interface Sighting extends Visit {
  cid: string;
  /** Its hello: the owl came into the room just now, and its time there begins (OP-113). */
  entered?: boolean;
  /** The room is the owl's own nest, where Play lands it. */
  own?: boolean;
  /** It came by travel from the Menu's map (OP-130). */
  travel?: boolean;
}

/** What of an owl's look the stats keep: its kind and its body colour. */
export interface StatsLook {
  species?: string;
  body?: string;
}

const SPECIES_IDS = new Set<string>(SPECIES.map((s) => s.id));

type VisitRow = { pass: string; cid: string; started: number; seen: number; device: string | null; rooms: string; gained: number };
/** A time in one room: `place` is the room's own id (which nest it was), kept here only; `room` is the log's name for it. */
type RoomTime = { pass: string; seq: number; cid: string; place: string; room: string; entered: number; exited: number | null; source: EntrySource; gained: number };

export class ParkStats {
  constructor(
    private readonly sql: SqlStorage,
    private readonly log: CollectLog,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS stats_players (cid TEXT PRIMARY KEY, species TEXT NOT NULL, color TEXT NOT NULL, at INTEGER NOT NULL)`);
    sql.exec(
      `CREATE TABLE IF NOT EXISTS stats_visits (pass TEXT PRIMARY KEY, cid TEXT NOT NULL, started INTEGER NOT NULL, seen INTEGER NOT NULL, device TEXT, rooms TEXT NOT NULL, gained INTEGER NOT NULL DEFAULT 0)`,
    );
    sql.exec(
      `CREATE TABLE IF NOT EXISTS stats_rooms (pass TEXT NOT NULL, seq INTEGER NOT NULL, cid TEXT NOT NULL, place TEXT NOT NULL, room TEXT NOT NULL, entered INTEGER NOT NULL, exited INTEGER, source TEXT NOT NULL, gained INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (pass, seq))`,
    );
  }

  /** An owl in a room (its hello, or a new look): its visit goes on, and a changed kind or colour is a new version. */
  seen(s: Sighting, look: StatsLook, now: number): void {
    if (!this.log.on) return;
    this.sighted(s, now);
    if (s.entered) this.entered(s, now);
    const species: SpeciesId = typeof look.species === 'string' && SPECIES_IDS.has(look.species) ? (look.species as SpeciesId) : DEFAULT_SPECIES;
    if (!isHexColour(look.body)) return;
    const color = look.body.toLowerCase();
    const was = this.sql.exec<{ species: string; color: string }>(`SELECT species, color FROM stats_players WHERE cid = ?`, s.cid).toArray()[0];
    if (was && was.species === species && was.color === color) return;
    this.sql.exec(`INSERT OR REPLACE INTO stats_players (cid, species, color, at) VALUES (?, ?, ?, ?)`, s.cid, species, color, now);
    this.log.player({ cid: s.cid, species, color, at: now, reason: was ? 'chosen' : 'first' });
  }

  /** The room objects' heartbeat, and a socket's close: these visits are still going (or were, until now). */
  alive(sightings: readonly Sighting[], now: number): void {
    if (!this.log.on) return;
    for (const s of sightings) this.sighted(s, now);
  }

  /** A collectible came in this visit, in the room the owl is in. */
  gained(pass: string | null | undefined): void {
    if (!pass) return;
    this.sql.exec(`UPDATE stats_visits SET gained = gained + 1 WHERE pass = ?`, pass);
    this.sql.exec(`UPDATE stats_rooms SET gained = gained + 1 WHERE pass = ? AND exited IS NULL`, pass);
  }

  /** Visits quiet for VISIT_GRACE_MS are over: each goes to the log, its rooms right after it. Returns when the next could be over, or null for none left. */
  close(now: number): number | null {
    const over = this.sql.exec<VisitRow>(`SELECT * FROM stats_visits WHERE seen <= ?`, now - VISIT_GRACE_MS).toArray();
    for (const v of over) {
      this.log.session({ cid: v.cid, pass: v.pass, started: v.started, ended: v.seen, device: v.device === 'phone' || v.device === 'desktop' ? v.device : null, rooms: rooms(v.rooms), gained: v.gained });
      // The room the owl was last in ends when the visit was last seen.
      const times = this.sql.exec<RoomTime>(`SELECT * FROM stats_rooms WHERE pass = ? ORDER BY seq`, v.pass).toArray();
      for (const t of times) this.log.realmVisit({ cid: t.cid, pass: t.pass, seq: t.seq, room: t.room, entered: t.entered, exited: t.exited ?? Math.max(t.entered, v.seen), source: t.source, gained: t.gained });
      this.sql.exec(`DELETE FROM stats_rooms WHERE pass = ?`, v.pass);
      this.sql.exec(`DELETE FROM stats_visits WHERE pass = ?`, v.pass);
    }
    const next = this.sql.exec<{ seen: number | null }>(`SELECT MIN(seen) AS seen FROM stats_visits`).one().seen;
    return next === null ? null : next + VISIT_GRACE_MS;
  }

  private sighted(s: Sighting, now: number): void {
    const v = cleanVisit(s);
    if (!v.pass) return;
    const was = this.sql.exec<VisitRow>(`SELECT * FROM stats_visits WHERE pass = ?`, v.pass).toArray()[0];
    if (!was) {
      this.sql.exec(`INSERT INTO stats_visits (pass, cid, started, seen, device, rooms) VALUES (?, ?, ?, ?, ?, ?)`, v.pass, s.cid, now, now, v.device, JSON.stringify(v.room ? [v.room] : []));
      return;
    }
    const list = rooms(was.rooms);
    if (v.room && !list.includes(v.room)) list.push(v.room);
    this.sql.exec(`UPDATE stats_visits SET seen = MAX(seen, ?), device = COALESCE(device, ?), rooms = ? WHERE pass = ?`, now, v.device, JSON.stringify(list), v.pass);
  }

  /**
   * The owl came into a room (OP-113): its time in the room before ends now, and one here begins.
   * The visit's first room is Play's (its own nest, or the lobby when the nests did not answer) or
   * else the one the page's address named; any other is walked or travelled into (OP-130), or, when
   * it is the room the owl was already in, come back to after a dropped line.
   */
  private entered(s: Sighting, now: number): void {
    const v = cleanVisit(s);
    if (!v.pass || !v.room || typeof s.room !== 'string') return;
    const place = s.room;
    const last = this.sql.exec<RoomTime>(`SELECT * FROM stats_rooms WHERE pass = ? ORDER BY seq DESC LIMIT 1`, v.pass).toArray()[0];
    if (last && last.seq >= REALM_VISITS_MAX) return;
    const open = last && last.exited === null ? last : null;
    const source: EntrySource = open?.place === place ? 'reconnect' : s.travel === true ? 'travel' : last ? 'walked' : v.room === 'lobby' || (v.room === 'nest' && s.own) ? 'spawn' : 'deep_link';
    if (open) this.sql.exec(`UPDATE stats_rooms SET exited = MAX(entered, ?) WHERE pass = ? AND seq = ?`, now, v.pass, open.seq);
    this.sql.exec(`INSERT INTO stats_rooms (pass, seq, cid, place, room, entered, source) VALUES (?, ?, ?, ?, ?, ?, ?)`, v.pass, (last?.seq ?? 0) + 1, s.cid, place, v.room, now, source);
  }
}

function rooms(text: string): string[] {
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string') : [];
  } catch (e) {
    moduleLog.error('collections', 'read_failed', 'A stored list of rooms could not be read: it counts as none.', { error: e });
    return [];
  }
}
