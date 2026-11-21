import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/env';
import { EXPORT_CRON, jobOf } from '../src/crons';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import { forgetOverflow } from '../src/overflowState';
import { EXPORT_KEEP_DAYS, type ObjectDump, dayOfKey, dumpTables, exportKey, isDay, loadTables, manifestKey, readDump, recordsIn, utcDay } from '../src/parkExport';
import { compLine } from '../src/routes/admin';
import { sqlStorage } from './sqlite';
import { logged } from './logged';

// ---- The weekly export of the park's stored data to R2 (OP-185), and a file loaded back into a fresh object ----

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
// Loaded with the file, not inside a test (OP-131).
const worker = (await import('../src/index')).default;
const { Collections } = await import('../src/Collections');
const { VoteLedger } = await import('../src/VoteLedger');
const { Overflow } = await import('../src/Overflow');

const KEY = 'test-signing-key-0123456789abcdef';
const ADMIN = 'keepers-key-0123456789';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const CID = 'c_abcdefghij';
const OTHER = 'c_klmnopqrst';
/** Sunday 2026-11-08, 08:00 UTC: the export's cron. */
const SUNDAY = Date.UTC(2026, 10, 8, 8, 0, 0);
const DAY = '2026-11-08';
const SEAL = 'sealed-address-AAAAAAAAAAAAAAAAAAAAAAAA';
const HASH = 'email-hash-BBBBBBBBBBBBBBBB';
const ORDER = 'comp-0123456789abc';

/** R2 as the export uses it: put, get, list (a page at a time) and delete. */
class FakeBucket {
  readonly files = new Map<string, string>();
  readonly deleted: string[] = [];
  constructor(private readonly page = 1000) {}
  async put(key: string, value: string) {
    this.files.set(key, value);
    return { key, size: value.length };
  }
  async get(key: string) {
    const text = this.files.get(key);
    return text === undefined ? null : { key, size: text.length, text: async () => text };
  }
  async list(o: { prefix?: string; cursor?: string }) {
    const keys = [...this.files.keys()].filter((k) => k.startsWith(o.prefix ?? '')).sort();
    const from = Number(o.cursor ?? 0);
    const objects = keys.slice(from, from + this.page).map((key) => ({ key, size: new TextEncoder().encode(this.files.get(key)!).byteLength }));
    const truncated = from + this.page < keys.length;
    return { objects, truncated, ...(truncated ? { cursor: String(from + this.page) } : {}), delimitedPrefixes: [] };
  }
  async delete(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      this.deleted.push(k);
      this.files.delete(k);
    }
  }
}

/** A Durable Object's state over a fresh SQLite of its own. */
const state = () => ({
  storage: { sql: sqlStorage(), getAlarm: async () => null, setAlarm: async () => {}, transactionSync: <T>(fn: () => T) => fn() },
  waitUntil: () => {},
});

/** The park's three exported objects, real, each over its own fresh storage, behind a Worker env. */
function parkOf(bucket: FakeBucket | null) {
  const asked: string[] = [];
  const env = {
    ...(bucket ? { PARK_EXPORTS: bucket } : {}),
    ASSETS: { fetch: async () => new Response('<!doctype html>') },
    ROOMS: { idFromName: (n: string) => n, get: () => ({ fetch: async () => Response.json({}) }) },
    GATE: 'open',
    PASS_SIGNING_KEY: KEY,
    ADMIN_KEY: ADMIN,
    RATE_LIMITS: 'off',
  } as Record<string, unknown>;
  const collections = new Collections(state() as unknown as DurableObjectState, env as unknown as Env);
  const votes = new VoteLedger(state() as unknown as DurableObjectState, env as unknown as Env);
  const overflow = new Overflow(state() as unknown as DurableObjectState, env as unknown as Env);
  const spy = <T extends object>(name: string, o: T) =>
    new Proxy(o, {
      get: (t, p) => {
        if (typeof p === 'string' && p.endsWith('Copy')) asked.push(`${name}.${p}`);
        return Reflect.get(t, p, t);
      },
    });
  env['COLLECTIONS'] = { getByName: () => spy('collections', collections) };
  env['VOTES'] = { getByName: () => spy('votes', votes), idFromName: (n: string) => n, get: () => ({ fetch: (u: string, i?: RequestInit) => votes.fetch(new Request(u, i)) }) };
  env['OVERFLOW'] = { getByName: () => spy('overflow', overflow), idFromName: (n: string) => n, get: () => ({ fetch: (u: string, i?: RequestInit) => overflow.fetch(new Request(u, i)) }) };
  const sqlOf = (o: object) => ((o as unknown as { ctx: { storage: { sql: SqlStorage } } }).ctx.storage.sql);
  return { env: env as unknown as Env, collections, votes, overflow, asked, sql: { collections: sqlOf(collections), votes: sqlOf(votes), overflow: sqlOf(overflow) } };
}
type Park = ReturnType<typeof parkOf>;

/** Owls with collections, feathers, a nest and an account protected by an email; tickets on an order; a busy-night setting. */
async function fill(p: Park) {
  await p.collections.inventory(CID, 'America/New_York');
  await p.collections.grant(CID, 'cape~2', 'granted');
  await p.collections.inventory(OTHER, 'Europe/London');
  await p.collections.myNest(CID, null);
  await p.collections.accountStand(CID, null);
  expect(await p.collections.accountProtectLink(CID, HASH, SEAL, 'ip-hash', 'nonce-0123456789')).not.toBeNull();
  expect(await p.collections.accountConfirm('nonce-0123456789', null)).toMatchObject({ cid: CID, account: { protected: true } });
  const issued = await p.votes.fetch(new Request('https://park/tickets/issue', { method: 'POST', body: JSON.stringify({ order: ORDER, lines: [compLine({ kind: 'day', quantity: 2 })], held: false }) }));
  expect(issued.status).toBe(200);
  const set = await p.overflow.fetch(new Request('https://park/settings', { method: 'POST', body: JSON.stringify({ line: { mode: 'auto', threshold: 12 } }) }));
  expect(set.status).toBe(200);
}

/** What an owl and an order look like from the outside: the collection, the feathers, the account; the tickets. */
async function seen(p: Park) {
  const inv = await p.collections.inventory(CID, 'America/New_York');
  const stand = await p.collections.accountStand(CID, null);
  const tickets = (await (await p.votes.fetch(new Request('https://park/tickets/mirror', { method: 'POST', body: JSON.stringify({ order: ORDER }) }))).json()) as unknown;
  const settings = ((await (await p.overflow.fetch(new Request('https://park/state'))).json()) as { line: unknown }).line;
  return { owned: [...inv.owned].sort(), feathers: inv.feathers, account: stand === 'moved' ? stand : stand.account, tickets, settings };
}

const call = (e: Env, path: string, init: RequestInit = {}) => worker.fetch(new Request(`https://park.example${path}`, init), e, CTX);
const post = (e: Env, path: string, body: unknown, headers: Record<string, string> = { 'X-Admin-Key': ADMIN }) =>
  call(e, path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const cron = (e: Env, at = SUNDAY) => worker.scheduled({ cron: EXPORT_CRON, scheduledTime: at, noRetry() {} } as ScheduledController, e);
const fileOf = (b: FakeBucket, kind: string, date = DAY) => JSON.parse(b.files.get(exportKey({ kind: kind as 'votes', name: 'park', date }))!) as ObjectDump;

let cap: ReturnType<typeof captureLogs>;
beforeEach(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => SUNDAY);
  forgetGate();
  forgetOverflow();
  forgetLimits();
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.restoreAllMocks();
});

describe('the weekly export (OP-185)', () => {
  it('runs on its own cron, Sundays at 08:00 UTC', () => {
    expect(EXPORT_CRON).toBe('0 8 * * 0');
    expect(jobOf(EXPORT_CRON)).toBe('export');
  });

  it('writes one dated file per object, beside a manifest, with every table’s rows and no sealed address', async () => {
    const bucket = new FakeBucket();
    const p = parkOf(bucket);
    await fill(p);
    await cron(p.env);
    expect([...bucket.files.keys()].sort()).toEqual([`exports/${DAY}/collections/park.json`, `exports/${DAY}/manifest.json`, `exports/${DAY}/overflow/park.json`, `exports/${DAY}/votes/park.json`]);

    const c = fileOf(bucket, 'collections');
    expect(c).toMatchObject({ format: 'owl-park-export', version: 1, kind: 'collections', name: 'park', date: DAY, at: new Date(SUNDAY).toISOString() });
    expect(c.tables['collectors']!.map((r) => r['cid']).sort()).toEqual([CID, OTHER]);
    expect(c.tables['collectors']!.find((r) => r['cid'] === CID)).toMatchObject({ tz: 'America/New_York', feathers: expect.any(Number) });
    expect(c.tables['owned']).toContainEqual(expect.objectContaining({ cid: CID, variant: 'cape~2', source: 'granted' }));
    expect(c.tables['nests']).toContainEqual(expect.objectContaining({ cid: CID }));
    expect(Object.keys(c.tables)).toEqual(expect.arrayContaining(['quests', 'earned', 'furniture', 'travel_places', 'feedback']));
    // The account goes with its email's keyed hash; its sealed address goes nowhere, nor does the link's.
    const account = c.tables['owl_accounts']!.find((r) => r['cid'] === CID)!;
    expect(account).toMatchObject({ email_hash: HASH, friend_code: expect.any(String) });
    expect(account).not.toHaveProperty('email_seal');
    expect(c.tables['account_links']!.length).toBe(1);
    expect(c.tables['account_links']![0]).not.toHaveProperty('email_seal');
    expect(bucket.files.get(`exports/${DAY}/collections/park.json`)).not.toContain(SEAL);
    expect(c.leftOut).toEqual(expect.arrayContaining(['owl_accounts.email_seal', 'account_links.email_seal', 'log_outbox']));
    expect(c.tables).not.toHaveProperty('log_outbox');

    const v = fileOf(bucket, 'votes');
    expect(v.tables['tickets']!.map((r) => r['order_id'])).toEqual([ORDER, ORDER]);
    expect(v.tables['ticket_orders']).toEqual([expect.objectContaining({ order_id: ORDER })]);
    expect(fileOf(bucket, 'overflow').tables['overflow_settings']).toContainEqual(expect.objectContaining({ key: 'line' }));

    const manifest = JSON.parse(bucket.files.get(manifestKey(DAY))!) as { files: Array<{ key: string; bytes: number }>; missed: number; by: string };
    expect(manifest).toMatchObject({ date: DAY, by: 'cron', missed: 0 });
    expect(manifest.files.map((f) => f.key).sort()).toEqual([`exports/${DAY}/collections/park.json`, `exports/${DAY}/overflow/park.json`, `exports/${DAY}/votes/park.json`]);
    const bytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
    logged(cap.lines, 'park_export', { component: 'worker', level: 'info', by: 'cron', date: DAY, objects: 3, missed: 0, bytes, pruned: 0 });
  });

  it('deletes only files dated more than four weeks back, and keeps keys it did not write', async () => {
    const bucket = new FakeBucket(2);
    const back = (days: number) => utcDay(SUNDAY - days * 86_400_000);
    for (const d of [35, EXPORT_KEEP_DAYS + 1, EXPORT_KEEP_DAYS, 7]) {
      await bucket.put(`exports/${back(d)}/collections/park.json`, '{}');
      await bucket.put(`exports/${back(d)}/manifest.json`, '{}');
    }
    await bucket.put('exports/readme.txt', 'kept');
    await bucket.put('notes/2020-01-01.json', 'kept');
    const p = parkOf(bucket);
    await cron(p.env);
    expect(bucket.deleted.sort()).toEqual([`exports/${back(35)}/collections/park.json`, `exports/${back(35)}/manifest.json`, `exports/${back(29)}/collections/park.json`, `exports/${back(29)}/manifest.json`].sort());
    expect(bucket.files.has(`exports/${back(28)}/collections/park.json`)).toBe(true);
    expect(bucket.files.has(`exports/${back(7)}/manifest.json`)).toBe(true);
    expect(bucket.files.has('exports/readme.txt')).toBe(true);
    expect(bucket.files.has('notes/2020-01-01.json')).toBe(true);
    logged(cap.lines, 'park_export', { pruned: 4, objects: 3 });
  });

  it('says so when an object is not copied, and copies the rest', async () => {
    const bucket = new FakeBucket();
    const p = parkOf(bucket);
    (p.votes as unknown as { exportCopy: () => Promise<never> }).exportCopy = async () => {
      throw new Error('the vote ledger is away');
    };
    await cron(p.env);
    logged(cap.lines, 'write_failed', { component: 'worker', level: 'error', object: 'votes:park', by: 'cron' });
    logged(cap.lines, 'park_export', { level: 'warn', objects: 2, missed: 1 });
    expect(bucket.files.has(`exports/${DAY}/votes/park.json`)).toBe(false);
    expect(bucket.files.has(`exports/${DAY}/collections/park.json`)).toBe(true);
  });

  it('is a logged no-op without the bucket: no object is asked, and nothing else breaks', async () => {
    const p = parkOf(null);
    await fill(p);
    await expect(cron(p.env)).resolves.toBeUndefined();
    logged(cap.lines, 'park_export_skipped', { component: 'worker', level: 'warn', by: 'cron', reason: 'no-bucket' });
    expect(p.asked).toEqual([]);
    expect(cap.lines.map((l) => l.event)).not.toContain('unhandled_error');
    // The keepers' routes say there is no bucket.
    const last = await call(p.env, '/api/admin/export', { headers: { 'X-Admin-Key': ADMIN } });
    expect(last.status).toBe(503);
    logged(cap.lines, 'park_export_skipped', { component: 'worker.admin', by: 'key', reason: 'no-bucket' });
    expect((await post(p.env, '/api/admin/export', {})).status).toBe(503);
    const r = await post(p.env, '/api/admin/restore', { kind: 'collections', date: DAY });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ ok: false, reason: 'no-bucket' });
    logged(cap.lines, 'park_restore_refused', { reason: 'no-bucket', object: 'collections:park' });
    // The park still answers.
    expect((await call(p.env, '/api/health')).status).not.toBe(500);
  });
});

describe('the keepers’ export routes (OP-185)', () => {
  it('report the last export: its day, its objects and their bytes, and every day kept', async () => {
    const bucket = new FakeBucket(3);
    const p = parkOf(bucket);
    await fill(p);
    await bucket.put('exports/2026-11-01/collections/park.json', '{}');
    await cron(p.env);
    const r = await call(p.env, '/api/admin/export', { headers: { 'X-Admin-Key': ADMIN } });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { date: string; objects: number; bytes: number; complete: boolean; files: string[]; kept: string[] };
    const sizes = ['collections', 'overflow', 'votes'].map((k) => new TextEncoder().encode(bucket.files.get(`exports/${DAY}/${k}/park.json`)!).byteLength);
    expect(body).toEqual({ date: DAY, objects: 3, bytes: sizes.reduce((a, b) => a + b, 0), complete: true, files: [`exports/${DAY}/collections/park.json`, `exports/${DAY}/overflow/park.json`, `exports/${DAY}/votes/park.json`], kept: ['2026-11-01', DAY] });
  });

  it('answer an empty bucket with no export, and refuse without the key', async () => {
    const p = parkOf(new FakeBucket());
    expect(await (await call(p.env, '/api/admin/export', { headers: { 'X-Admin-Key': ADMIN } })).json()).toEqual({ date: null, objects: 0, bytes: 0, complete: false, files: [], kept: [] });
    expect((await call(p.env, '/api/admin/export')).status).toBe(403);
    expect((await post(p.env, '/api/admin/restore', { kind: 'votes', date: DAY }, {})).status).toBe(403);
  });

  it('run an export at once with the key, as its cron does', async () => {
    const bucket = new FakeBucket();
    const p = parkOf(bucket);
    const r = await post(p.env, '/api/admin/export', {});
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ date: utcDay(SUNDAY), objects: 3, missed: 0 });
    logged(cap.lines, 'park_export', { by: 'key' });
    expect(bucket.files.has(manifestKey(DAY))).toBe(true);
  });
});

describe('a restore (OP-185)', () => {
  it('loads each exported file into a fresh object: the same owls, collections, feathers, account and tickets', async () => {
    const bucket = new FakeBucket();
    const before = parkOf(bucket);
    await fill(before);
    await cron(before.env);
    const want = await seen(before);

    const after = parkOf(bucket);
    for (const kind of ['collections', 'votes', 'overflow']) {
      const r = await post(after.env, '/api/admin/restore', { kind, date: DAY });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ ok: true, key: `exports/${DAY}/${kind}/park.json`, skipped: [] });
      logged(cap.lines, 'park_restore', { component: 'worker.admin', level: 'info', object: `${kind}:park`, date: DAY, force: false });
    }
    expect(await seen(after)).toEqual(want);
    expect(want.owned).toContain('cape~2');
    expect(want.account).toMatchObject({ protected: true });
    // Table by table the same, but for what a file never holds.
    for (const kind of ['collections', 'votes', 'overflow'] as const) {
      const t = { kind, name: 'park', date: DAY };
      expect(dumpTables(after.sql[kind], t, SUNDAY).tables).toEqual(dumpTables(before.sql[kind], t, SUNDAY).tables);
    }
    expect(after.sql.collections.exec(`SELECT email_seal FROM owl_accounts WHERE cid = ?`, CID).one()).toEqual({ email_seal: null });
  });

  it('refuses an object that holds records, and replaces them only when forced', async () => {
    const bucket = new FakeBucket();
    const p = parkOf(bucket);
    await fill(p);
    await cron(p.env);
    await p.collections.grant(CID, 'cape~3', 'granted');

    const r = await post(p.env, '/api/admin/restore', { kind: 'collections', date: DAY });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ ok: false, reason: 'not-empty', rows: expect.any(Number) });
    logged(cap.lines, 'park_restore_refused', { component: 'worker.admin', level: 'warn', object: 'collections:park', reason: 'not-empty', force: false });
    expect(await p.collections.owned(CID)).toContain('cape~3');

    const forced = await post(p.env, '/api/admin/restore', { kind: 'collections', date: DAY, force: true });
    expect(forced.status).toBe(200);
    logged(cap.lines, 'park_restore', { object: 'collections:park', force: true });
    expect(await p.collections.owned(CID)).not.toContain('cape~3');
    expect(await p.collections.owned(CID)).toContain('cape~2');
  });

  it('refuses a day with no file, a file that is not the object’s, and a request that does not add up', async () => {
    const bucket = new FakeBucket();
    const p = parkOf(bucket);
    const none = await post(p.env, '/api/admin/restore', { kind: 'votes', date: DAY });
    expect(none.status).toBe(404);
    logged(cap.lines, 'park_restore_refused', { reason: 'no-file', object: 'votes:park' });

    await bucket.put(`exports/${DAY}/votes/park.json`, 'not json');
    expect((await post(p.env, '/api/admin/restore', { kind: 'votes', date: DAY })).status).toBe(422);
    // The collections' file put where the vote ledger's goes is not the vote ledger's.
    await bucket.put(`exports/${DAY}/votes/park.json`, JSON.stringify(dumpTables(p.sql.collections, { kind: 'collections', name: 'park', date: DAY }, SUNDAY)));
    expect((await post(p.env, '/api/admin/restore', { kind: 'votes', date: DAY })).status).toBe(422);
    logged(cap.lines, 'park_restore_refused', { reason: 'bad-file' });

    for (const body of [{ kind: 'rooms', date: DAY }, { kind: 'votes', date: '2026-13-01' }, { kind: 'votes' }, { kind: 'votes', date: DAY, force: 'yes' }]) expect((await post(p.env, '/api/admin/restore', body)).status).toBe(400);
    expect((await call(p.env, '/api/admin/restore', { headers: { 'X-Admin-Key': ADMIN } })).status).toBe(403);
  });
});

describe('the export’s tables, out and back (parkExport.ts)', () => {
  const target = { kind: 'collections' as const, name: 'park', date: DAY };

  it('skips tables and columns the object no longer has, and gives missing columns their defaults', () => {
    const sql = sqlStorage();
    sql.exec(`CREATE TABLE owls (cid TEXT PRIMARY KEY, feathers INTEGER NOT NULL DEFAULT 7)`);
    const dump: ObjectDump = { format: 'owl-park-export', version: 1, kind: 'collections', name: 'park', date: DAY, at: '', leftOut: [], tables: { owls: [{ cid: 'a', feathers: 3, gone: 1 }, { cid: 'b' }, {}], old: [{ x: 1 }] } };
    expect(loadTables(sql, dump, false, (fn) => fn())).toEqual({ ok: true, tables: 1, rows: 2, skipped: ['owls.gone', 'old'] });
    expect(sql.exec(`SELECT cid, feathers FROM owls ORDER BY cid`).toArray()).toEqual([
      { cid: 'a', feathers: 3 },
      { cid: 'b', feathers: 7 },
    ]);
  });

  it('counts a fresh object’s own layout mark as no records, and keeps bytes as base64', () => {
    const sql = sqlStorage();
    sql.exec(`CREATE TABLE meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL)`);
    sql.exec(`INSERT INTO meta (k, v) VALUES ('layout', 3)`);
    sql.exec(`CREATE TABLE blobs (id INTEGER PRIMARY KEY, b BLOB, flag INTEGER)`);
    expect(recordsIn(sql)).toBe(0);
    sql.exec(`INSERT INTO blobs (id, b) VALUES (1, ?)`, new Uint8Array([0, 255, 7]));
    expect(recordsIn(sql)).toBe(1);
    const dump = dumpTables(sql, target, SUNDAY);
    expect(dump.tables['blobs']).toEqual([{ id: 1, b: { $bytes: 'AP8H' }, flag: null }]);
    expect(dump.tables['meta']).toEqual([{ k: 'layout', v: 3 }]);
  });

  it('reads only a file of its own format, kind and name', () => {
    const ok = JSON.stringify({ format: 'owl-park-export', version: 1, kind: 'collections', name: 'park', date: DAY, at: '', leftOut: [], tables: { a: [{ x: 1 }] } });
    expect(readDump(ok, target)).not.toBeNull();
    expect(readDump(ok, { kind: 'votes', name: 'park' })).toBeNull();
    expect(readDump(ok, { kind: 'collections', name: 'room:hub' })).toBeNull();
    expect(readDump(ok.replace('"version":1', '"version":2'), target)).toBeNull();
    expect(readDump(ok.replace('owl-park-export', 'other'), target)).toBeNull();
    expect(readDump(ok.replace('[{"x":1}]', '[1]'), target)).toBeNull();
    expect(readDump(ok.replace('{"a":[{"x":1}]}', '[]'), target)).toBeNull();
    expect(readDump('{', target)).toBeNull();
  });

  it('dates keys by their UTC day, and knows a real day from a look-alike', () => {
    expect(utcDay(SUNDAY)).toBe(DAY);
    expect(isDay(DAY)).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-1-08')).toBe(false);
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay(20261108)).toBe(false);
    expect(dayOfKey(`exports/${DAY}/votes/park.json`)).toBe(DAY);
    expect(dayOfKey('exports/readme.txt')).toBeNull();
    expect(dayOfKey(`notes/${DAY}/x.json`)).toBeNull();
  });
});
