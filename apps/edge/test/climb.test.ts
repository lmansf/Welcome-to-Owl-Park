import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIMB_RUN_MAX_MS, ClimbBook, CollectionBook, MemoryClimbStore, MemoryCollectionStore, NIGHTS, climbRef, leastClimbMs, parkDay, type BandRow, type ClimbStore } from '@owl-park/shared';
import type { Env } from '../src/env';
import { SqlClimbStore } from '../src/sqlClimbStore';
import { sqlStorage } from './sqlite';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const CID = 'c_owlaaaaa';
const AT = { atPortal: true, portalLive: true, special: 'easy' };
const EASY = NIGHTS['easy']!;
const reach = (band: number, from = MON) => from + leastClimbMs(EASY, band) + 250;
const bandRow = (cid: string, seed: number, band: number, extra: Partial<BandRow> = {}): BandRow => ({
  cid,
  seed,
  band,
  day: parkDay(MON),
  arrivedAt: MON + band * 10_000,
  verdict: 'ok',
  floorMs: leastClimbMs(EASY, band),
  elapsedMs: band * 10_000,
  due: 1,
  added: 1,
  brisk: false,
  why: null,
  night: 'easy',
  ref: climbRef(cid, seed),
  ...extra,
});

/** Both stores keep the same promises: in memory (the local mode) and the collections object's SQLite tables. */
const STORES: Array<[string, () => ClimbStore]> = [
  ['memory', () => new MemoryClimbStore()],
  ['sqlite', () => new SqlClimbStore(sqlStorage())],
];

for (const [name, make] of STORES) {
  describe(`the climb store (${name})`, () => {
    it('keeps one run per collector, the newest replacing the last', () => {
      const s = make();
      expect(s.openRun(CID)).toBeNull();
      s.putRun({ cid: CID, seed: 7, night: 'easy', layout: 'city-1', startedAt: MON, banked: 0 });
      s.putRun({ cid: 'c_owlbbbbb', seed: 8, night: 'hard', layout: 'city-1', startedAt: MON, banked: 2 });
      expect(s.openRun(CID)).toEqual({ cid: CID, seed: 7, night: 'easy', layout: 'city-1', startedAt: MON, banked: 0 });
      s.putRun({ cid: CID, seed: 9, night: 'medium', layout: 'city-1', startedAt: MON + 5, banked: 1 });
      expect(s.openRun(CID)).toMatchObject({ seed: 9, night: 'medium', banked: 1 });
      expect(s.openRun('c_owlbbbbb')).toMatchObject({ seed: 8 });
    });

    it('keeps one row per band of a run, lists the day’s paid bands, finds a run by its reference and sweeps old rows', () => {
      const s = make();
      s.upsertBand(bandRow(CID, 7, 1));
      s.upsertBand(bandRow(CID, 7, 2, { verdict: 'paid-today', added: 0, why: 'paid-today' }));
      s.upsertBand(bandRow(CID, 7, 2, { verdict: 'paid-today', added: 0, why: 'paid-today', elapsedMs: 21_000 }));
      s.upsertBand(bandRow(CID, 8, 3, { why: 'capped', added: 0, due: 2, brisk: true }));
      s.upsertBand(bandRow('c_owlbbbbb', 7, 1));
      expect(s.bands(CID, 7)).toEqual([bandRow(CID, 7, 1), bandRow(CID, 7, 2, { verdict: 'paid-today', added: 0, why: 'paid-today', elapsedMs: 21_000 })]);
      expect(s.paidBands(CID, parkDay(MON))).toEqual([1, 3]);
      expect(s.paidBands(CID, '2026-10-20')).toEqual([]);
      expect(s.byRef(climbRef(CID, 8))).toEqual([bandRow(CID, 8, 3, { why: 'capped', added: 0, due: 2, brisk: true })]);
      expect(s.byRef(climbRef('c_owlbbbbb', 7))).toHaveLength(1);
      expect(s.byRef('00000000')).toEqual([]);
      s.sweep(MON + 25_000);
      expect(s.bands(CID, 7).map((b) => b.band)).toEqual([]);
      expect(s.bands(CID, 8).map((b) => b.band)).toEqual([3]);
    });

    it('settles runs the same way as the book’s memory store', () => {
      const climb = new ClimbBook(make(), new CollectionBook(new MemoryCollectionStore()), () => 4242);
      expect(climb.start(CID, AT, MON)).toMatchObject({ ok: true, seed: 4242, night: 'easy', banked: 0 });
      expect(climb.band(CID, 4242, 2, reach(2))).toMatchObject({ ok: true, banked: 2, added: 2, total: 2, ref: climbRef(CID, 4242) });
      expect(climb.band(CID, 4242, 3, MON + 100)).toEqual({ ok: false, reason: 'too-fast' });
      expect(climb.start(CID, { atPortal: false, portalLive: false, special: null }, reach(3))).toMatchObject({ ok: true, resumed: true, banked: 2 });
      expect(climb.band(CID, 4242, 6, reach(6))).toMatchObject({ ok: true, banked: 6, added: 8, item: { variant: 'glass-circlet~0', first: true } });
      expect(climb.band(CID, 4242, 1, MON + CLIMB_RUN_MAX_MS + 1)).toEqual({ ok: false, reason: 'forgotten' });
      const found = climb.lookup(climbRef(CID, 4242));
      expect(found).toMatchObject({ night: 'easy', layout: 'city-2', startedAt: MON });
      expect(found!.bands.map((b) => b.band)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(JSON.stringify(found)).not.toContain(CID);
    });
  });
}

describe('the climb tables', () => {
  it('reads a row whose reference or band no longer holds as nothing rather than failing', () => {
    const sql = sqlStorage();
    const s = new SqlClimbStore(sql);
    s.upsertBand(bandRow(CID, 7, 1));
    s.upsertBand(bandRow(CID, 7, 2));
    sql.exec(`UPDATE climb_bands SET ref = 'nope' WHERE band = 1`);
    sql.exec(`UPDATE climb_bands SET why = 'odd' WHERE band = 2`);
    expect(s.bands(CID, 7)).toEqual([bandRow(CID, 7, 2)]);
  });
});

// ---- The keepers' lookup through the Worker ----

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
const worker = (await import('../src/index')).default;
const ADMIN_KEY = 'admin-key-0123456789abcdef';

describe('the keepers’ climb lookup', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers a run by its reference behind the admin key, and says what it does not know', async () => {
    const climb = new ClimbBook(new MemoryClimbStore(), new CollectionBook(new MemoryCollectionStore()), () => 77);
    climb.start(CID, AT, MON);
    climb.band(CID, 77, 2, reach(2));
    const COLLECTIONS = { getByName: () => ({ climbLookup: async (ref: string) => climb.lookup(ref) }) };
    const env = { COLLECTIONS, ADMIN_KEY, GATE: 'open' } as unknown as Env;
    const ask = (q: string, key = ADMIN_KEY) => worker.fetch(new Request(`https://park.example/api/admin/climb${q}`, { headers: { 'X-Admin-Key': key } }), env, {} as ExecutionContext);
    const ref = climbRef(CID, 77);
    expect((await ask(`?ref=${ref}`, 'wrong')).status).toBe(403);
    expect((await ask('?ref=zz')).status).toBe(400);
    expect((await ask('')).status).toBe(400);
    const missing = await ask('?ref=00000000');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'not found' });
    const found = await ask(`?ref=${ref}`);
    expect(found.status).toBe(200);
    const body = (await found.json()) as { night: string; bands: Array<{ band: number; ref: string }> };
    expect(body).toMatchObject({ night: 'easy', layout: 'city-2', startedAt: MON });
    expect(body.bands.map((b) => b.band)).toEqual([1, 2]);
    expect(JSON.stringify(body)).not.toContain(CID);
  });
});
