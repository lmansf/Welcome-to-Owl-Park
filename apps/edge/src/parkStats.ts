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
 *
 * Nothing here is kept while the log is off. Written against `SqlStorage`, so Node tests it.
 *
 * TODO-DOCS (OP-111): docs/ARCHITECTURE.md, beside the collection log (OP-107): the player stats
 * (this file, the room object's hello, look, minute heartbeat and close calls, `game.dim_player` and
 * `game.add_player_versions`, `game.fact_session`, `game.v_player_lifetime` in apps/park-log/sql/
 * players.sql), and the privacy boundary for under-13 players the ticket sets out: the park side holds
 * no email or name; purchases and the one Logan-only table tying a ticket to an owl come with the
 * store and the ticket gate (OP-024, OP-010), and play data is only ever joined outward to the buyer.
 */
import { DEFAULT_SPECIES, SPECIES, isHexColour, type SpeciesId } from '@owl-park/shared';
import { cleanVisit, type CollectLog, type Visit } from './collectLog';

/** A visit not seen for this long is over: two of the room objects' minute heartbeats and some. */
export const VISIT_GRACE_MS = 3 * 60_000;

/** A visit as one of its owl's sockets reports it. */
export interface Sighting extends Visit {
  cid: string;
}

/** What of an owl's look the stats keep: its kind and its body colour. */
export interface StatsLook {
  species?: string;
  body?: string;
}

const SPECIES_IDS = new Set<string>(SPECIES.map((s) => s.id));

type VisitRow = { pass: string; cid: string; started: number; seen: number; device: string | null; rooms: string; gained: number };

export class ParkStats {
  constructor(
    private readonly sql: SqlStorage,
    private readonly log: CollectLog,
  ) {
    sql.exec(`CREATE TABLE IF NOT EXISTS stats_players (cid TEXT PRIMARY KEY, species TEXT NOT NULL, color TEXT NOT NULL, at INTEGER NOT NULL)`);
    sql.exec(
      `CREATE TABLE IF NOT EXISTS stats_visits (pass TEXT PRIMARY KEY, cid TEXT NOT NULL, started INTEGER NOT NULL, seen INTEGER NOT NULL, device TEXT, rooms TEXT NOT NULL, gained INTEGER NOT NULL DEFAULT 0)`,
    );
  }

  /** An owl in a room (its hello, or a new look): its visit goes on, and a changed kind or colour is a new version. */
  seen(s: Sighting, look: StatsLook, now: number): void {
    if (!this.log.on) return;
    this.sighted(s, now);
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

  /** A collectible came in this visit. */
  gained(pass: string | null | undefined): void {
    if (pass) this.sql.exec(`UPDATE stats_visits SET gained = gained + 1 WHERE pass = ?`, pass);
  }

  /** Visits quiet for VISIT_GRACE_MS are over: each goes to the log. Returns when the next could be over, or null for none left. */
  close(now: number): number | null {
    const over = this.sql.exec<VisitRow>(`SELECT * FROM stats_visits WHERE seen <= ?`, now - VISIT_GRACE_MS).toArray();
    for (const v of over) {
      this.log.session({ cid: v.cid, pass: v.pass, started: v.started, ended: v.seen, device: v.device === 'phone' || v.device === 'desktop' ? v.device : null, rooms: rooms(v.rooms), gained: v.gained });
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
}

function rooms(text: string): string[] {
  try {
    const v = JSON.parse(text) as unknown;
    return Array.isArray(v) ? v.filter((r): r is string => typeof r === 'string') : [];
  } catch {
    return [];
  }
}
