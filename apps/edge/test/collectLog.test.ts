import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollectionBook, FURNITURE, PRESENTS, STARTER_FURNITURE, STARTER_PACK, allVariants } from '@owl-park/shared';
import {
  CollectLog,
  LOG_OUTBOX_MAX,
  LOG_RETRY_MS,
  collectibleType,
  deviceClass,
  furnitureId,
  logConfig,
  logRoom,
  realmKind,
  ROOM_KINDS,
  saltedHash,
  type LogConfig,
  type LogRow,
} from '../src/collectLog';
import { ROOMS } from '../src/rooms';
import { SqlCollectionStore } from '../src/sqlStore';
import { SqlNestStore } from '../src/sqlNestStore';
import type { Env } from '../src/env';
import { sqlStorage } from './sqlite';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const CID = 'c_abcdefghij';
const PASS = 'v_visitAAAA1';
const CONFIG: LogConfig = { url: 'https://log.example/functions/v1/owl-park-log', key: 'k'.repeat(32), salt: 's'.repeat(24) };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Sent {
  url: string;
  init: RequestInit;
  body: { kind: string; rows?: LogRow[]; items?: Array<{ id: string; kind: string }>; version?: string };
}

/** A log on a fresh object's SQLite, the collection book writing to it, and a stand-in for the log's address. */
function rig(opts: { config?: LogConfig | null; answer?: (sent: Sent) => Promise<Response> | Response } = {}) {
  const sql = sqlStorage();
  const sent: Sent[] = [];
  const wakes: number[] = [];
  let clock = MON;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const s: Sent = { url, init, body: JSON.parse(String(init.body)) };
    sent.push(s);
    return opts.answer ? opts.answer(s) : new Response('{"ok":true}', { status: 200 });
  });
  const log = new CollectLog(sql, opts.config === undefined ? CONFIG : opts.config, { fetch, now: () => clock, wake: (at) => wakes.push(at) });
  let visit: { pass?: string; device?: 'phone' | 'desktop'; room?: string } | null = { pass: PASS, device: 'phone', room: 'grove' };
  const store = new SqlCollectionStore(sql, (cid, variant, source, at) => log.record({ cid, collectible: variant, type: collectibleType(variant, source), at, visit }));
  const nests = new SqlNestStore(sql, (cid, item, source, at) => log.record({ cid, collectible: furnitureId(item), type: collectibleType(item, source), at, visit }));
  return {
    sql,
    log,
    book: new CollectionBook(store),
    store,
    nests,
    sent,
    wakes,
    fetch,
    setVisit: (v: typeof visit) => (visit = v),
    tick: (ms: number) => (clock += ms),
    rows: () => sent.filter((s) => s.body.kind === 'collect').flatMap((s) => s.body.rows!),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('the collection log (OP-107)', () => {
  it('is on only with an https address (or a stand-in on this machine), a key and a salt', () => {
    const env = { PARK_LOG_URL: CONFIG.url, FRAUD_SCORE_KEY: CONFIG.key, FRAUD_HASH_SALT: CONFIG.salt };
    expect(logConfig(env)).toEqual(CONFIG);
    const { PARK_LOG_URL: _url, ...noAddress } = env;
    expect(logConfig(noAddress)).toBeNull();
    expect(logConfig({ ...env, FRAUD_SCORE_KEY: 'short' })).toBeNull();
    expect(logConfig({ ...env, FRAUD_HASH_SALT: '' })).toBeNull();
    expect(logConfig({ ...env, PARK_LOG_URL: 'http://log.example/x' })).toBeNull();
    expect(logConfig({ ...env, PARK_LOG_URL: 'not a url' })).toBeNull();
    expect(logConfig({ ...env, PARK_LOG_URL: 'http://localhost:8790/log' })?.url).toBe('http://localhost:8790/log');
  });

  it('tells a phone from a desktop and nothing finer, and names rooms by their neutral ids', () => {
    expect(deviceClass(null, '?1')).toBe('phone');
    expect(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148', null)).toBe('phone');
    expect(deviceClass('Mozilla/5.0 (Linux; Android 15) Chrome/130.0 Safari/537.36', '?0')).toBe('phone');
    expect(deviceClass('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36', '?0')).toBe('desktop');
    expect(deviceClass(null, null)).toBeNull();
    expect(logRoom('grove')).toBe('grove');
    // Every owl's nest is one place in the log: a nest's id would point at whose nest it is.
    expect(logRoom('nest-abc123def4')).toBe('nest');
    expect(logRoom('somewhere')).toBeNull();
    expect(logRoom(undefined)).toBeNull();
  });

  it('knows what kind of place every room is (OP-113)', () => {
    expect(Object.keys(ROOMS).filter((id) => !Object.hasOwn(ROOM_KINDS, id))).toEqual([]);
    expect(['grove', 'market', 'arcade', 'glass'].map(realmKind)).toEqual(['realm', 'realm', 'realm', 'realm']);
    expect(['lobby', 'hub', 'homes'].map(realmKind)).toEqual(['hub', 'hub', 'hub']);
    expect(realmKind(logRoom('nest-abc123def4')!)).toBe('nest');
  });

  it('names how each collectible came', () => {
    expect(collectibleType('cape~2', 'quest')).toBe('quest');
    expect(collectibleType('cape~2', 'shop')).toBe('shop');
    expect(collectibleType('cape~2', 'gift')).toBe('gift');
    expect(collectibleType('cape~2', 'bought')).toBe('purchase');
    expect(collectibleType('cape~2', 'found')).toBe('find');
    expect(collectibleType('cape~2', 'granted')).toBe('grant');
    expect(collectibleType(PRESENTS[0]!.variant, 'granted')).toBe('seasonal');
    expect(collectibleType(STARTER_PACK[0], 'granted')).toBe('starter');
    expect(collectibleType('rug', 'starter')).toBe('starter');
    expect(collectibleType('armchair', 'gift')).toBe('gift');
    expect(collectibleType('bookshelf', 'set')).toBe('grant'); // a style set's capstone
  });

  it('writes a row for each collectible as it is first owned, and sends rows that name no one', async () => {
    const t = rig();
    t.book.ensure(CID, 'America/New_York', MON); // the starter pack and the presents
    expect(t.book.grant(CID, 'cape~2', 'quest', MON + 60_000)).toMatchObject({ added: true });
    expect(t.book.grant(CID, 'cape~2', 'quest', MON + 90_000)).toMatchObject({ added: false }); // owned already: no row
    expect(t.log.waiting()).toBe(STARTER_PACK.length + PRESENTS.length + 1);
    await t.log.flush();
    expect(t.log.waiting()).toBe(0);
    const rows = t.rows();
    expect(rows.map((r) => r.collectible_id).sort()).toEqual([...STARTER_PACK, ...PRESENTS.map((p) => p.variant), 'cape~2'].sort());
    const cape = rows.find((r) => r.collectible_id === 'cape~2')!;
    expect(cape).toEqual({
      event_id: expect.stringMatching(UUID),
      collector_id: await saltedHash(CONFIG.salt, 'collector', CID),
      collectible_id: 'cape~2',
      collectible_type: 'quest',
      realm: 'grove',
      acquired_at: new Date(MON + 60_000).toISOString(),
      session_id: expect.stringMatching(UUID),
      device_class: 'phone',
      first_entry_at: new Date(MON).toISOString(),
      backfill: false,
    });
    // Nothing that names the owl, its pass or its address leaves: only hashes, kinds and times.
    const text = JSON.stringify(t.sent.map((s) => s.body));
    expect(text).not.toContain(CID);
    expect(text).not.toContain(PASS);
    expect(new Set(rows.map((r) => r.collector_id)).size).toBe(1);
    expect(new Set(rows.map((r) => r.session_id)).size).toBe(1);
    expect(new Set(rows.map((r) => r.event_id)).size).toBe(rows.length);
    expect(rows.filter((r) => r.collectible_type === 'seasonal').map((r) => r.collectible_id)).toEqual(PRESENTS.map((p) => p.variant));
    // The key goes as a bearer token, and a send has a time limit.
    expect(t.sent[0]!.url).toBe(CONFIG.url);
    expect((t.sent[0]!.init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${CONFIG.key}`);
    expect(t.sent[0]!.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('logs nest furniture under its own ids, and a new visit as a new session', async () => {
    const t = rig();
    t.book.ensure(CID, undefined, MON);
    await t.log.flush();
    t.setVisit({ pass: 'v_visitBBBB2', device: 'desktop', room: 'nest-abc123def4' });
    for (const piece of STARTER_FURNITURE) t.nests.addFurniture(CID, piece, 'starter', MON + 1000);
    expect(t.nests.addFurniture(CID, 'armchair', 'gift', MON + 2000)).toBe(true);
    await t.log.flush();
    const rows = t.rows();
    const pieces = rows.filter((r) => r.collectible_id.startsWith('furniture:'));
    expect(pieces.map((r) => [r.collectible_id, r.collectible_type])).toEqual([...STARTER_FURNITURE.map((p) => [`furniture:${p}`, 'starter']), ['furniture:armchair', 'gift']]);
    expect(pieces.every((r) => r.realm === 'nest' && r.device_class === 'desktop')).toBe(true);
    expect(new Set(rows.map((r) => r.session_id)).size).toBe(2);
  });

  it('sends the catalogue once, after the rows, and again only when it changes', async () => {
    const t = rig();
    t.book.ensure(CID, undefined, MON);
    await t.log.flush();
    expect(t.sent.map((s) => s.body.kind)).toEqual(['collect', 'catalogue']);
    const items = t.sent[1]!.body.items!;
    expect(items).toHaveLength(allVariants().length + FURNITURE.length);
    expect(items.find((i) => i.id === 'witch-hat~3')).toEqual({ id: 'witch-hat~3', kind: 'wear', rarity: 'uncommon', realm: null });
    expect(items.find((i) => i.id === 'furniture:rug')).toEqual({ id: 'furniture:rug', kind: 'furniture', rarity: null, realm: null });
    t.book.grant(CID, 'cape~2', 'quest', MON);
    await t.log.flush();
    expect(t.sent.map((s) => s.body.kind)).toEqual(['collect', 'catalogue', 'collect']);
  });

  it('keeps the rows when a send fails, wakes to try again later, and sends them then', async () => {
    let up = false;
    const t = rig({ answer: () => (up ? new Response('{}') : new Response('down', { status: 503 })) });
    t.book.ensure(CID, undefined, MON);
    await t.log.flush();
    const waiting = t.log.waiting();
    expect(waiting).toBeGreaterThan(0);
    // The round's safety net, then the retry after the failed send.
    expect(t.wakes.at(-1)).toBe(MON + LOG_RETRY_MS[0]!);
    await t.log.flush();
    expect(t.wakes.at(-1)).toBe(MON + LOG_RETRY_MS[1]!);
    up = true;
    await t.log.flush();
    expect(t.log.waiting()).toBe(0);
    expect(t.rows().length).toBe(3 * waiting); // the same rows each time: their event ids make them land once
  });

  it('counts a send slower than a second as failed, so a pickup never waits on the log', async () => {
    const t = rig({
      answer: (s) =>
        new Promise<Response>((_, reject) => {
          s.init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    t.book.ensure(CID, undefined, MON);
    const started = Date.now();
    await t.log.flush();
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(t.log.waiting()).toBeGreaterThan(0);
  });

  it('drops a batch the log refuses for good, and keeps one refused for the wrong key', async () => {
    let status = 401;
    const t = rig({ answer: () => new Response('no', { status }) });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    t.book.ensure(CID, undefined, MON);
    await t.log.flush();
    expect(t.log.waiting()).toBeGreaterThan(0);
    status = 400;
    await t.log.flush();
    expect(t.log.waiting()).toBe(0);
  });

  it('backfills what the collections hold at the times they were acquired, under the same event ids as live rows', async () => {
    const t = rig();
    t.book.ensure(CID, undefined, MON);
    t.book.grant(CID, 'cape~2', 'quest', MON + 5000);
    t.nests.addFurniture(CID, 'armchair', 'gift', MON + 6000);
    await t.log.flush();
    const live = t.rows();
    expect(t.log.backfill()).toBe(live.length);
    await t.log.flush();
    const back = t.rows().slice(live.length);
    expect(back.map((r) => r.event_id).sort()).toEqual(live.map((r) => r.event_id).sort());
    const cape = back.find((r) => r.collectible_id === 'cape~2')!;
    expect(cape).toMatchObject({ backfill: true, session_id: null, device_class: null, realm: null, acquired_at: new Date(MON + 5000).toISOString(), first_entry_at: new Date(MON).toISOString() });
  });

  it('keeps nothing and sends nothing while it is off', async () => {
    const t = rig({ config: null });
    t.book.ensure(CID, undefined, MON);
    expect(t.log.on).toBe(false);
    expect(t.log.waiting()).toBe(0);
    expect(t.log.backfill()).toBe(0);
    await t.log.flush();
    expect(t.fetch).not.toHaveBeenCalled();
  });

  it('stops keeping rows for the log once its outbox is full, and the grant goes through all the same', () => {
    const t = rig({ answer: () => new Response('down', { status: 503 }) });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    t.sql.exec(
      `INSERT INTO log_outbox (kind, data) WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?) SELECT 'collect', '{}' FROM n`,
      LOG_OUTBOX_MAX,
    );
    expect(t.book.grant(CID, 'cape~2', 'quest', MON)).toMatchObject({ ok: true, added: true });
    expect(t.store.hasOwned(CID, 'cape~2')).toBe(true);
    expect(t.log.waiting()).toBe(LOG_OUTBOX_MAX);
  });
});

// The collections object itself: the Workers runtime's base class stands in, as in RoomObject.test.ts.
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

describe('the collections object and its log', () => {
  async function objectRig() {
    const { Collections } = await import('../src/Collections');
    const pending: Promise<unknown>[] = [];
    let alarm: number | null = null;
    const ctx = {
      storage: { sql: sqlStorage(), getAlarm: async () => alarm, setAlarm: async (at: number) => void (alarm = at) },
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
    };
    const sent: LogRow[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { kind: string; rows?: LogRow[] };
        if (body.kind === 'collect') sent.push(...body.rows!);
        return new Response('{"ok":true}');
      }),
    );
    const env = { PARK_LOG_URL: CONFIG.url, FRAUD_SCORE_KEY: CONFIG.key, FRAUD_HASH_SALT: CONFIG.salt } as unknown as Env;
    const obj = new Collections(ctx as unknown as DurableObjectState, env);
    const settle = async () => {
      while (pending.length) await pending.shift();
    };
    return { obj, sent, settle, alarm: () => alarm };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('sends a row for each grant with the visit its call came in, before the call has long returned', async () => {
    const t = await objectRig();
    await t.obj.inventory(CID, 'America/New_York', { pass: PASS, device: 'phone' });
    await t.obj.myNest(CID, null, { pass: PASS, device: 'phone', room: 'homes' });
    await t.obj.claimFurnitureGift(CID, { pass: PASS, device: 'phone' });
    await t.obj.grant(CID, 'cape~2', 'granted');
    await t.settle();
    const by = (id: string) => t.sent.find((r) => r.collectible_id === id);
    expect(t.sent).toHaveLength(STARTER_PACK.length + PRESENTS.length + STARTER_FURNITURE.length + 2);
    expect(by(STARTER_PACK[0])).toMatchObject({ collectible_type: 'starter', device_class: 'phone', realm: null, session_id: expect.stringMatching(UUID) });
    expect(by(`furniture:${STARTER_FURNITURE[0]}`)).toMatchObject({ collectible_type: 'starter', realm: 'homes' });
    expect(t.sent.filter((r) => r.collectible_type === 'gift')).toHaveLength(1);
    // A grant by the keepers' route has no visit.
    expect(by('cape~2')).toMatchObject({ collectible_type: 'grant', session_id: null, device_class: null, realm: null });
    expect(await t.obj.logState()).toEqual({ on: true, waiting: 0 });
  });

  it('backfills on the owner\'s word', async () => {
    const t = await objectRig();
    await t.obj.inventory(CID, undefined, { pass: PASS });
    await t.settle();
    const live = t.sent.length;
    expect(await t.obj.backfillLog()).toMatchObject({ on: true, queued: live });
    await t.settle();
    expect(t.sent.slice(live).every((r) => r.backfill)).toBe(true);
  });
});
