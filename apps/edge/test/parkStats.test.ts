import { describe, expect, it, vi } from 'vitest';
import { CollectLog, saltedHash, type LogConfig, type PlayerRow, type SessionRow } from '../src/collectLog';
import { ParkStats, VISIT_GRACE_MS } from '../src/parkStats';
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
