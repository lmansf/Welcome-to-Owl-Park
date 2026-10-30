/**
 * Travel from the map (OP-130), in the Collections object's SQLite beside the collections: for each
 * owl (its collector id), the places of the map it has walked into, and whether it has walked through
 * the front gate since it was last outside the park. The room objects tell it every room an owl joins;
 * a travel into the park asks it whether the owl may go. Kept here rather than in a room object
 * because an owl's rooms may be in different room objects. Written without platform APIs beyond
 * `SqlStorage`, so Node tests it.
 */
import { gateAfter, visitedPlace, type TravelState } from '@owl-park/shared';

export class TravelBook {
  constructor(private readonly sql: SqlStorage) {
    sql.exec(
      `CREATE TABLE IF NOT EXISTS travel_places (
        cid TEXT NOT NULL,
        place TEXT NOT NULL,
        first_at INTEGER NOT NULL,
        PRIMARY KEY (cid, place)
      )`,
    );
    sql.exec('CREATE TABLE IF NOT EXISTS travel_gate (cid TEXT PRIMARY KEY, through_at INTEGER NOT NULL)');
  }

  /** An owl joined a room at a spawn: the place it walked into kept, and the gate walked through, or the owl outside again. */
  entered(cid: string, room: string, spawn: string | undefined, now: number): void {
    const place = visitedPlace(room);
    if (place) this.sql.exec('INSERT OR IGNORE INTO travel_places (cid, place, first_at) VALUES (?, ?, ?)', cid, place, now);
    const gate = gateAfter(room, spawn);
    if (gate === true) this.sql.exec('INSERT OR REPLACE INTO travel_gate (cid, through_at) VALUES (?, ?)', cid, now);
    else if (gate === false) this.sql.exec('DELETE FROM travel_gate WHERE cid = ?', cid);
  }

  /** Whether the owl has walked through the front gate since it was last outside the park. */
  throughGate(cid: string): boolean {
    return this.sql.exec('SELECT 1 FROM travel_gate WHERE cid = ?', cid).toArray().length > 0;
  }

  /** What its page is told: the places it has walked into, in the order it first did, and whether it is through the gate. */
  state(cid: string): TravelState {
    const places = this.sql
      .exec<{ place: string }>('SELECT place FROM travel_places WHERE cid = ? ORDER BY first_at, place', cid)
      .toArray()
      .map((r) => r.place);
    return { places, gate: this.throughGate(cid) };
  }
}
