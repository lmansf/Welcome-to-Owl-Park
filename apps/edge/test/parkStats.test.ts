import { describe, expect, it, vi } from 'vitest';
import { CollectLog, saltedHash, saltedUuid, type LogConfig, type PlayerRow, type RealmVisitRow, type RoomStayRow, type SessionRow } from '../src/collectLog';
import { ParkStats, REALM_VISITS_MAX, VISIT_GRACE_MS, stayMap, visitMaps, type Sighting } from '../src/parkStats';
import { SqlCollectionStore } from '../src/sqlStore';
import { sqlStorage } from './sqlite';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const CID = 'c_abcdefghij';
const CONFIG: LogConfig = { url: 'https://log.example/functions/v1/owl-park-log', key: 'k'.repeat(32), salt: 's'.repeat(24) };
const PASS = 'v_visitAAAA1';
const ME = { cid: CID, pass: PASS, device: 'phone' as const, room: 'hub' };
const BARN = { species: 'barn', body: '#7A5C99' };

function rig(config: LogConfig | null = CONFIG) {
  const sql = sqlStorage();
  new SqlCollectionStore(sql);
  const bodies: Array<{ kind: string; rows?: unknown[] }> = [];
  const kinds = () => bodies.map((b) => b.kind);
  const log = new CollectLog(sql, config, {
    fetch: async (_url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      return new Response('{"ok":true}');
    },
    now: () => MON,
    wake: () => undefined,
  });
  const stats = new ParkStats(sql, log);
  return {
    sql,
    log,
    stats,
    kinds,
    sent: async <T>(kind: string): Promise<T[]> => {
      await log.flush();
      return bodies.filter((b) => b.kind === kind).flatMap((b) => b.rows as T[]);
    },
  };
}

describe('the player stats (OP-111)', () => {
  it("sends an owl's first version on its first visit, and a new one only when its kind or colour changes", async () => {
    const t = rig();
    t.stats.seen(ME, BARN, MON);
    t.stats.seen({ ...ME, room: 'grove' }, { ...BARN, body: '#7a5c99' }, MON + 60_000); // the same colour, written another way
    t.stats.seen(ME, { species: 'snowy', body: '#7A5C99' }, MON + 120_000);
    t.stats.seen(ME, { species: 'snowy', body: '#F2E1C1' }, MON + 180_000);
    t.stats.seen(ME, { body: '#F2E1C1' }, MON + 240_000); // no kind: the great horned owl
    const rows = await t.sent<PlayerRow>('player');
    expect(rows.map((r) => [r.owl_type, r.color, r.change_reason])).toEqual([
      ['barn', '#7a5c99', 'first'],
      ['snowy', '#7a5c99', 'chosen'],
      ['snowy', '#f2e1c1', 'chosen'],
      ['great-horned', '#f2e1c1', 'chosen'],
    ]);
    expect(rows[0]).toEqual({
      event_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      collector_id: await saltedHash(CONFIG.salt, 'collector', CID),
      owl_type: 'barn',
      color: '#7a5c99',
      changed_at: new Date(MON).toISOString(),
      change_reason: 'first',
    });
    expect(new Set(rows.map((r) => r.event_id)).size).toBe(rows.length);
    // An unknown kind counts as the default; a look without a proper colour changes nothing.
    t.stats.seen(ME, { species: 'dragon', body: 'red' }, MON + 300_000);
    expect(await t.sent<PlayerRow>('player')).toHaveLength(4);
  });

  it('makes one session of a visit across its rooms, ending when it was last seen, once it has been quiet long enough', async () => {
    const t = rig();
    t.stats.seen(ME, BARN, MON);
    t.stats.alive([{ ...ME, room: 'grove' }], MON + 60_000);
    t.stats.seen({ ...ME, room: 'market' }, BARN, MON + 90_000);
    t.stats.gained(PASS);
    t.stats.gained(PASS);
    t.stats.alive([ME], MON + 10 * 60_000); // its last socket closed, ten minutes in
    // Not over yet: it may come back in.
    expect(t.stats.close(MON + 10 * 60_000 + VISIT_GRACE_MS - 1)).toBe(MON + 10 * 60_000 + VISIT_GRACE_MS);
    expect(await t.sent<SessionRow>('session')).toEqual([]);
    // Quiet for the grace: over, and sent once.
    expect(t.stats.close(MON + 10 * 60_000 + VISIT_GRACE_MS)).toBeNull();
    expect(t.stats.close(MON + 60 * 60_000)).toBeNull();
    const sessions = await t.sent<SessionRow>('session');
    expect(sessions).toEqual([
      {
        session_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        collector_id: await saltedHash(CONFIG.salt, 'collector', CID),
        started_at: new Date(MON).toISOString(),
        ended_at: new Date(MON + 10 * 60_000).toISOString(),
        device_class: 'phone',
        realms_entered: 3,
        collectibles_gained: 2,
        // The room server said nothing of spectators: a visit from before OP-192 goes without a kind.
        visitor_kind: null,
      },
    ]);
    // Nothing that names the owl or its pass leaves.
    expect(JSON.stringify(sessions)).not.toContain(CID);
    expect(JSON.stringify(sessions)).not.toContain(PASS);
  });

  it('keeps two page loads apart as two sessions, and the same visit under the session id its collection rows carry', async () => {
    const t = rig();
    t.stats.seen(ME, BARN, MON);
    t.stats.seen({ ...ME, pass: 'v_visitBBBB2', device: 'desktop' }, BARN, MON + 30_000);
    t.log.record({ cid: CID, collectible: 'cape~2', type: 'quest', at: MON + 40_000, visit: ME });
    t.stats.close(MON + VISIT_GRACE_MS + 60_000);
    await t.log.flush();
    const sessions = await t.sent<SessionRow>('session');
    expect(sessions.map((s) => s.device_class).sort()).toEqual(['desktop', 'phone']);
    const collected = await t.sent<{ session_id: string }>('collect');
    expect(sessions.map((s) => s.session_id)).toContain(collected[0]!.session_id);
  });

  it('says of each visit whether it went past the turnstiles as a spectator or a full visitor, so free owls are counted too (OP-192)', async () => {
    const t = rig();
    const kinds = async () => Object.fromEntries((await t.sent<SessionRow>('session')).map((s) => [s.started_at, s.visitor_kind]));
    // A free owl: its nest and the street say nothing; the hub as a spectator.
    t.stats.seen({ ...ME, pass: 'v_spectate01', room: 'nest-abcdefgh' }, BARN, MON);
    t.stats.seen({ ...ME, pass: 'v_spectate01', room: 'hub', spec: true }, BARN, MON + 60_000);
    t.stats.alive([{ ...ME, pass: 'v_spectate01', room: 'homes' }], MON + 120_000);
    // A spectator whose ticket went through mid-visit: a visitor's visit from then on, whatever comes after.
    t.stats.seen({ ...ME, pass: 'v_convert001', room: 'hub', spec: true }, BARN, MON + 1_000);
    t.stats.alive([{ ...ME, pass: 'v_convert001', room: 'hub', spec: false }], MON + 61_000);
    t.stats.alive([{ ...ME, pass: 'v_convert001', room: 'grove', spec: true }], MON + 62_000);
    // A visit that never went past the turnstiles: no kind.
    t.stats.seen({ ...ME, pass: 'v_outside001', room: 'lobby' }, BARN, MON + 2_000);
    t.stats.close(MON + 3600_000);
    expect(await kinds()).toEqual({
      [new Date(MON).toISOString()]: 'spectator',
      [new Date(MON + 1_000).toISOString()]: 'visitor',
      [new Date(MON + 2_000).toISOString()]: null,
    });
  });

  it('adds the visit kind to an object that kept visits before OP-192, and sends those without one', async () => {
    const sql = sqlStorage();
    new SqlCollectionStore(sql);
    sql.exec(`CREATE TABLE stats_visits (pass TEXT PRIMARY KEY, cid TEXT NOT NULL, started INTEGER NOT NULL, seen INTEGER NOT NULL, device TEXT, rooms TEXT NOT NULL, gained INTEGER NOT NULL DEFAULT 0)`);
    sql.exec(`INSERT INTO stats_visits (pass, cid, started, seen, device, rooms) VALUES (?, ?, ?, ?, ?, ?)`, PASS, CID, MON, MON, 'phone', '["hub"]');
    const bodies: Array<{ kind: string; rows?: SessionRow[] }> = [];
    const log = new CollectLog(sql, CONFIG, { fetch: async (_u, init) => (bodies.push(JSON.parse(String(init.body))), new Response('{"ok":true}')), now: () => MON, wake: () => undefined });
    const stats = new ParkStats(sql, log);
    stats.alive([{ ...ME, spec: true }], MON + 60_000);
    stats.close(MON + 3600_000);
    await log.flush();
    expect(bodies.filter((b) => b.kind === 'session').flatMap((b) => b.rows!).map((r) => r.visitor_kind)).toEqual(['spectator']);
  });

  it('keeps nothing while the log is off', () => {
    const t = rig(null);
    t.stats.seen(ME, BARN, MON);
    t.stats.alive([ME], MON);
    expect(t.sql.exec(`SELECT COUNT(*) AS n FROM stats_visits`).one()).toEqual({ n: 0 });
    expect(t.sql.exec(`SELECT COUNT(*) AS n FROM stats_players`).one()).toEqual({ n: 0 });
    expect(t.stats.close(MON + 3600_000)).toBeNull();
  });
});

describe('time per room (OP-113)', () => {
  const MIN = 60_000;
  const NEST = 'nest-abcdefgh';
  /** The owl's hello in a room. */
  const into = (room: string, extra: Partial<Sighting> = {}): Sighting => ({ ...ME, room, entered: true, ...extra });
  const minutes = (r: RealmVisitRow) => (Date.parse(r.exited_at) - Date.parse(r.entered_at)) / MIN;

  it("follows the owl from room to room without a gap, so the rooms' times add up to the visit's, and sends them after it", async () => {
    const t = rig();
    t.stats.seen(into(NEST, { own: true }), BARN, MON);
    t.stats.gained(PASS);
    t.stats.seen(into('homes'), BARN, MON + 2 * MIN);
    // The nest's socket closes a moment after the street's hello: it changes nothing here.
    t.stats.alive([{ ...ME, room: NEST }], MON + 2 * MIN + 500);
    t.stats.seen(into('hub'), BARN, MON + 3 * MIN);
    t.stats.gained(PASS);
    t.stats.gained(PASS);
    // The line drops and the owl comes back into the hub: a new time there.
    t.stats.seen(into('hub'), BARN, MON + 5 * MIN);
    t.stats.seen({ ...ME, room: 'hub' }, { ...BARN, body: '#F2E1C1' }, MON + 6 * MIN); // a new look is no new room
    t.stats.alive([{ ...ME, room: 'hub' }], MON + 10 * MIN); // its last socket closed
    t.stats.close(MON + 10 * MIN + VISIT_GRACE_MS);
    const [session] = await t.sent<SessionRow>('session');
    const rows = await t.sent<RealmVisitRow>('realm_visit');
    expect(rows.map((r) => [r.realm, r.realm_kind, r.entry_source, minutes(r), r.collectibles_gained])).toEqual([
      ['nest', 'nest', 'spawn', 2, 1],
      ['homes', 'hub', 'walked', 1, 0],
      ['hub', 'hub', 'walked', 2, 2],
      ['hub', 'hub', 'reconnect', 5, 0],
    ]);
    // One after another from the visit's start to its end, under its session id.
    expect(rows[0]!.entered_at).toBe(session!.started_at);
    expect(rows.at(-1)!.exited_at).toBe(session!.ended_at);
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.entered_at).toBe(rows[i - 1]!.exited_at);
    expect(rows.reduce((n, r) => n + minutes(r), 0)).toBe(10);
    expect(rows.reduce((n, r) => n + r.collectibles_gained, 0)).toBe(session!.collectibles_gained);
    expect(new Set(rows.map((r) => r.session_id))).toEqual(new Set([session!.session_id]));
    expect(new Set(rows.map((r) => r.visit_id)).size).toBe(4);
    expect(rows[0]!.collector_id).toBe(await saltedHash(CONFIG.salt, 'collector', CID));
    // The visit's row goes first, so the log has it when its rooms arrive; nothing names the owl, its pass or its nest.
    expect(t.kinds().indexOf('session')).toBeLessThan(t.kinds().indexOf('realm_visit'));
    for (const text of [CID, PASS, NEST]) expect(JSON.stringify(rows)).not.toContain(text);
    expect(t.sql.exec(`SELECT COUNT(*) AS n FROM stats_rooms`).one()).toEqual({ n: 0 });
  });

  it("tells how a visit's first room began: Play's nest or the lobby, else the page's address", async () => {
    const t = rig();
    const first = [
      ['v_visitAAAA1', into(NEST, { own: true })],
      ['v_visitBBBB2', into('lobby')],
      ['v_visitCCCC3', into(NEST)], // another owl's nest
      ['v_visitDDDD4', into('glass')],
    ] as const;
    first.forEach(([pass, s], i) => t.stats.seen({ ...s, pass }, BARN, MON + i));
    t.stats.close(MON + VISIT_GRACE_MS + 10);
    const rows = await t.sent<RealmVisitRow>('realm_visit');
    expect(rows.map((r) => [r.realm, r.entry_source])).toEqual([
      ['nest', 'spawn'],
      ['lobby', 'spawn'],
      ['nest', 'deep_link'],
      ['glass', 'deep_link'],
    ]);
  });

  it('says which park each room was walked in: the tree for its levels, and for the market and the nest a tree owl comes through (OP-113, OP-128)', async () => {
    const t = rig();
    t.stats.seen(into(NEST, { own: true }), BARN, MON);
    t.stats.seen(into('l1'), BARN, MON + MIN);
    t.stats.seen(into('market'), BARN, MON + 2 * MIN);
    t.stats.seen(into('market'), BARN, MON + 3 * MIN); // its line dropped: still the tree's
    t.stats.seen(into('l1'), BARN, MON + 4 * MIN);
    t.stats.seen({ ...into('hub'), pass: 'v_visitEEEE5' }, BARN, MON + 5 * MIN); // another visit, today's park
    t.stats.seen({ ...into('market'), pass: 'v_visitEEEE5' }, BARN, MON + 6 * MIN);
    t.stats.close(MON + 6 * MIN + VISIT_GRACE_MS);
    const rows = await t.sent<RealmVisitRow>('realm_visit');
    expect(rows.map((r) => [r.realm, r.map_id])).toEqual([
      ['nest', 2],
      ['l1', 2],
      ['market', 2],
      ['market', 2],
      ['l1', 2],
      ['hub', 1],
      ['market', 1],
    ]);
  });

  it('counts a visit of shared rooms only for today\'s park', () => {
    expect(visitMaps([])).toEqual([]);
    expect(visitMaps(['nest-abcdefgh', 'market'])).toEqual([1, 1]);
    expect(visitMaps(['market', 'hub', 'market'])).toEqual([1, 1, 1]);
    expect(visitMaps(['market', 'l1', 'hub', 'nest-abcdefgh'])).toEqual([2, 2, 1, 1]);
  });

  it("walks from one nest into another, though the log names both the same: Go home from another owl's nest", async () => {
    const t = rig();
    t.stats.seen(into('nest-otherowl1'), BARN, MON);
    t.stats.seen(into(NEST, { own: true }), BARN, MON + MIN);
    t.stats.close(MON + MIN + VISIT_GRACE_MS);
    expect((await t.sent<RealmVisitRow>('realm_visit')).map((r) => r.entry_source)).toEqual(['deep_link', 'walked']);
  });

  it(`keeps at most ${REALM_VISITS_MAX} times a visit, the last running on to its end`, async () => {
    const t = rig();
    for (let i = 0; i <= REALM_VISITS_MAX; i++) t.stats.seen(into(i % 2 ? 'hub' : 'grove'), BARN, MON + i * 1000);
    t.stats.close(MON + 3600_000);
    const rows = await t.sent<RealmVisitRow>('realm_visit');
    expect(rows).toHaveLength(REALM_VISITS_MAX);
    expect(rows.at(-1)!.exited_at).toBe(new Date(MON + REALM_VISITS_MAX * 1000).toISOString());
  });

  it('keeps no rooms while the log is off', () => {
    const t = rig(null);
    t.stats.seen(into('hub'), BARN, MON);
    t.stats.gained(PASS);
    expect(t.sql.exec(`SELECT COUNT(*) AS n FROM stats_rooms`).one()).toEqual({ n: 0 });
  });
});

describe('room stays, live (OP-265)', () => {
  const MIN = 60_000;
  const NEST = 'nest-abcdefgh';
  const into = (room: string, extra: Partial<Sighting> = {}): Sighting => ({ ...ME, room, entered: true, ...extra });
  const at = (ms: number) => new Date(ms).toISOString();
  /** Each event as [event, room or why, when], in the order sent. */
  const events = (rows: RoomStayRow[]) => rows.map((r) => (r.event === 'enter' ? ['enter', r.realm, r.entry_source, r.at] : ['leave', r.exit_reason, r.at]));

  it('sends an enter as the owl comes into a room and closes the stay before as moved, at the same moment', async () => {
    const t = rig();
    t.stats.seen(into(NEST, { own: true }), BARN, MON);
    t.stats.seen(into('homes'), BARN, MON + 2 * MIN);
    t.stats.alive([{ ...ME, room: NEST, left: 'bye' }], MON + 2 * MIN + 500); // the nest's socket closes after the street's hello
    t.stats.seen(into('hub', { travel: true }), BARN, MON + 3 * MIN);
    const rows = await t.sent<RoomStayRow>('room_stay');
    expect(events(rows)).toEqual([
      ['enter', 'nest', 'spawn', at(MON)],
      ['leave', 'moved', at(MON + 2 * MIN)],
      ['enter', 'homes', 'walked', at(MON + 2 * MIN)],
      ['leave', 'moved', at(MON + 3 * MIN)],
      ['enter', 'hub', 'travel', at(MON + 3 * MIN)],
    ]);
    // Each leave closes the stay the enter before it opened, all under the visit's session.
    const stays = rows.map((r) => r.stay_id);
    expect(stays[1]).toBe(stays[0]);
    expect(stays[3]).toBe(stays[2]);
    expect(new Set(stays).size).toBe(3);
    const enter = rows[0] as Extract<RoomStayRow, { event: 'enter' }>;
    expect(enter.session_id).toBe(await saltedUuid(CONFIG.salt, 'session', PASS));
    expect(enter.collector_id).toBe(await saltedHash(CONFIG.salt, 'collector', CID));
    expect(enter.stay_id).toBe(await saltedUuid(CONFIG.salt, 'room-stay', `${PASS}|1`));
    for (const text of [CID, PASS, NEST]) expect(JSON.stringify(rows)).not.toContain(text);
  });

  it('continues the stay when a dropped line comes back into the same room: no new row, and a timeout only if it never does', async () => {
    const t = rig();
    t.stats.seen(into('grove'), BARN, MON);
    t.stats.alive([{ ...ME, room: 'grove', left: 'drop' }], MON + MIN);
    t.stats.seen(into('grove'), BARN, MON + MIN + 5000); // back in
    t.stats.alive([{ ...ME, room: 'grove' }], MON + 2 * MIN); // the minute heartbeat
    t.stats.alive([{ ...ME, room: 'grove', left: 'drop' }], MON + 4 * MIN); // lost again, for good
    t.stats.close(MON + 4 * MIN + VISIT_GRACE_MS);
    expect(events(await t.sent<RoomStayRow>('room_stay'))).toEqual([
      ['enter', 'grove', 'deep_link', at(MON)],
      ['leave', 'timeout', at(MON + 4 * MIN)],
    ]);
    expect(t.sql.exec(`SELECT COUNT(*) AS n FROM stats_live`).one()).toEqual({ n: 0 });
  });

  it('ends a stay as a log off when the page said goodbye and the owl did not come back, at when it was last seen', async () => {
    const t = rig();
    t.stats.seen(into('lobby'), BARN, MON);
    t.stats.alive([{ ...ME, room: 'lobby', left: 'bye' }], MON + 7 * MIN);
    t.stats.close(MON + 7 * MIN + VISIT_GRACE_MS - 1); // not quiet long enough yet
    expect(await t.sent<RoomStayRow>('room_stay')).toHaveLength(1);
    t.stats.close(MON + 7 * MIN + VISIT_GRACE_MS);
    expect(events(await t.sent<RoomStayRow>('room_stay'))).toEqual([
      ['enter', 'lobby', 'spawn', at(MON)],
      ['leave', 'logoff', at(MON + 7 * MIN)],
    ]);
  });

  it('counts a goodbye only from the room the owl is in: a heartbeat there after a goodbye from the last room leaves a timeout', async () => {
    const t = rig();
    t.stats.seen(into('hub'), BARN, MON);
    t.stats.seen(into('grove'), BARN, MON + MIN);
    t.stats.alive([{ ...ME, room: 'hub', left: 'bye' }], MON + MIN + 200); // the hub's page socket, closed as it walked on
    t.stats.alive([{ ...ME, room: 'grove' }], MON + 2 * MIN);
    t.stats.close(MON + 2 * MIN + VISIT_GRACE_MS); // the grove's line went quiet with no close
    expect(events(await t.sent<RoomStayRow>('room_stay')).at(-1)).toEqual(['leave', 'timeout', at(MON + 2 * MIN)]);
  });

  it('ends every stay with the nightly restart, and starts a new one when the owl comes back in, even into the same room', async () => {
    const t = rig();
    t.stats.seen(into('l1'), BARN, MON);
    t.stats.alive([{ ...ME, room: 'l1', left: 'restart' }], MON + 5 * MIN);
    t.stats.alive([{ ...ME, room: 'l1', left: 'drop' }], MON + 5 * MIN + 100); // the restart's close itself: nothing more
    t.stats.seen(into('lobby'), BARN, MON + 6 * MIN); // Play again from the home screen
    t.stats.seen(into('l1'), BARN, MON + 7 * MIN);
    t.stats.alive([{ ...ME, room: 'l1', left: 'restart' }], MON + 8 * MIN);
    t.stats.seen(into('l1'), BARN, MON + 9 * MIN); // the same room again, after a restart: a new stay
    t.stats.close(MON + 9 * MIN + VISIT_GRACE_MS);
    const rows = await t.sent<RoomStayRow>('room_stay');
    expect(events(rows)).toEqual([
      ['enter', 'l1', 'deep_link', at(MON)],
      ['leave', 'server_restart', at(MON + 5 * MIN)],
      ['enter', 'lobby', 'spawn', at(MON + 6 * MIN)],
      ['leave', 'moved', at(MON + 7 * MIN)],
      ['enter', 'l1', 'walked', at(MON + 7 * MIN)],
      ['leave', 'server_restart', at(MON + 8 * MIN)],
      ['enter', 'l1', 'walked', at(MON + 9 * MIN)],
      ['leave', 'timeout', at(MON + 9 * MIN)],
    ]);
    // The visit's stays keep counting across the restart, so no two share an id.
    expect(new Set(rows.map((r) => r.stay_id)).size).toBe(4);
    const enters = rows.filter((r): r is Extract<RoomStayRow, { event: 'enter' }> => r.event === 'enter');
    // The lobby is today's park; the tree's level 1 is the tree's.
    expect(enters.map((r) => r.map_id)).toEqual([2, 1, 2, 2]);
  });

  it("keeps two visits' stays apart, and changes nothing for the times per room sent with each visit", async () => {
    const t = rig();
    t.stats.seen(into('hub'), BARN, MON);
    t.stats.seen({ ...into('grove'), pass: 'v_visitBBBB2' }, BARN, MON + MIN);
    t.stats.seen(into('market'), BARN, MON + 2 * MIN);
    t.stats.close(MON + 2 * MIN + VISIT_GRACE_MS);
    const rows = await t.sent<RoomStayRow>('room_stay');
    expect(events(rows).slice(0, 4)).toEqual([
      ['enter', 'hub', 'deep_link', at(MON)],
      ['enter', 'grove', 'deep_link', at(MON + MIN)],
      ['leave', 'moved', at(MON + 2 * MIN)],
      ['enter', 'market', 'walked', at(MON + 2 * MIN)],
    ]);
    // Both visits end together, in either order, each at when it was last seen.
    expect(events(rows).slice(4)).toEqual(expect.arrayContaining([['leave', 'timeout', at(MON + MIN)], ['leave', 'timeout', at(MON + 2 * MIN)]]));
    expect(rows).toHaveLength(6);
    expect((await t.sent<RealmVisitRow>('realm_visit')).map((r) => r.realm).sort()).toEqual(['grove', 'hub', 'market']);
  });

  it('logs a tree owl\'s nest, its visit\'s first stay, in the tree when the page says the owl walks the tree', async () => {
    const t = rig();
    t.stats.seen(into(NEST, { own: true, map: 2 }), BARN, MON); // Play lands it in its nest; it walks the tree
    t.stats.seen(into('l5-street'), BARN, MON + MIN);
    t.stats.seen(into('market', { map: 2 }), BARN, MON + 2 * MIN); // a realm both parks share, walked from the tree
    t.stats.seen(into('hub', { map: 2 }), BARN, MON + 3 * MIN); // a room of today's park alone is in today's park, whatever the page says
    t.stats.close(MON + 3 * MIN + VISIT_GRACE_MS);
    const enters = (await t.sent<RoomStayRow>('room_stay')).filter((r): r is Extract<RoomStayRow, { event: 'enter' }> => r.event === 'enter');
    expect(enters.map((r) => [r.realm, r.map_id])).toEqual([
      ['nest', 2],
      ['l5-street', 2],
      ['market', 2],
      ['hub', 1],
    ]);
  });

  it('logs a nest in today\'s park when the page says so, or says nothing', async () => {
    const t = rig();
    t.stats.seen(into(NEST, { own: true, map: 1 }), BARN, MON);
    t.stats.seen({ ...into(NEST, { own: true }), pass: 'v_visitBBBB2' }, BARN, MON + MIN);
    t.stats.close(MON + MIN + VISIT_GRACE_MS);
    const enters = (await t.sent<RoomStayRow>('room_stay')).filter((r): r is Extract<RoomStayRow, { event: 'enter' }> => r.event === 'enter');
    expect(enters.map((r) => r.map_id)).toEqual([1, 1]);
  });

  it('puts a shared room in the park of the stay before it, and a first one in today\'s park', () => {
    expect(stayMap('l3', null)).toBe(2);
    expect(stayMap('hub', 2)).toBe(1);
    expect(stayMap('market', 2)).toBe(2);
    expect(stayMap('market', null)).toBe(1);
    expect(stayMap(NEST, 2)).toBe(2);
  });

  it('sends nothing while the log is off', () => {
    const t = rig(null);
    t.stats.seen(into('hub'), BARN, MON);
    t.stats.alive([{ ...ME, room: 'hub', left: 'restart' }], MON + MIN);
    expect(t.sql.exec(`SELECT COUNT(*) AS n FROM stats_live`).one()).toEqual({ n: 0 });
    expect(t.log.waiting()).toBe(0);
  });
});

// The collections object and the room object together: the runtime's base class stands in, as in RoomObject.test.ts.
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

// Loaded with the file, not inside a test (OP-131): what a module does as it loads then belongs to no test,
// as Stryker's ignoreStatic expects. Loaded inside this test, every module constant of the Worker's it
// reached (a pass's id pattern, a ticket's lifetime) was tried against this test alone, which never reads them.
const { Collections } = await import('../src/Collections');

describe('the collections object and the player stats', () => {
  it('wakes when a visit could be over, and sends its session from the alarm', async () => {
    vi.useFakeTimers({ now: MON, toFake: ['Date'] });
    try {
      const pending: Promise<unknown>[] = [];
      let alarm: number | null = null;
      const ctx = {
        storage: { sql: sqlStorage(), getAlarm: async () => alarm, setAlarm: async (at: number) => void (alarm = at) },
        waitUntil: (p: Promise<unknown>) => void pending.push(p),
      };
      const sent: Array<{ kind: string; rows?: unknown[] }> = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) => {
          sent.push(JSON.parse(String(init.body)));
          return new Response('{"ok":true}');
        }),
      );
      const settle = async () => {
        while (pending.length) await pending.shift();
      };
      const env = { PARK_LOG_URL: CONFIG.url, FRAUD_SCORE_KEY: CONFIG.key, FRAUD_HASH_SALT: CONFIG.salt };
      const obj = new Collections(ctx as unknown as DurableObjectState, env as never);
      await obj.seen(ME, BARN);
      await settle();
      expect(sent.filter((b) => b.kind === 'player').flatMap((b) => b.rows!)).toHaveLength(1);
      // Woken by the time the visit could be over (sooner while rows were waiting to go).
      expect(alarm).not.toBeNull();
      expect(alarm!).toBeLessThanOrEqual(MON + VISIT_GRACE_MS);
      // The alarm fires (the runtime clears it as it does) once the visit has been quiet long enough.
      alarm = null;
      vi.setSystemTime(MON + VISIT_GRACE_MS);
      await obj.alarm();
      await settle();
      expect(sent.filter((b) => b.kind === 'session').flatMap((b) => b.rows!)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
