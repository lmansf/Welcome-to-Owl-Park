import { describe, expect, it, vi } from 'vitest';
import { CollectLog, saltedHash, type LogConfig, type PlayerRow, type RealmVisitRow, type SessionRow } from '../src/collectLog';
import { ParkStats, REALM_VISITS_MAX, VISIT_GRACE_MS, type Sighting } from '../src/parkStats';
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

describe('the collections object and the player stats', () => {
  it('wakes when a visit could be over, and sends its session from the alarm', async () => {
    const { Collections } = await import('../src/Collections');
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
