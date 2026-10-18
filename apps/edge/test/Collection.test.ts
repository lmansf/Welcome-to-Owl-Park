import { beforeEach, describe, expect, it } from 'vitest';
import { CRAFT_COST, DUPLICATE_FEATHERS, PICKUP_RADIUS, STARTER_PACK, TZ_CHANGE_COOLDOWN_DAYS, allSpots, parseVariant, windowKeyAt } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { CollectionBook, MemoryCollectionStore } from '@owl-park/shared';
import { dropSeed, isCollectorId, mintCollector, mintPass, randomCollectorId, verifyCollector, verifyPass } from '../src/pass';

const DAY = 24 * 3600_000;
const seed = (k: number) => new Uint8Array(32).map((_, i) => (i * 31 + k * 7) & 0xff);

describe('CollectionBook', () => {
  let store: MemoryCollectionStore;
  let book: CollectionBook;
  // 10:00 in New York on 18 October 2026 (the morning window).
  const morning = Date.UTC(2026, 9, 18, 14, 0);

  beforeEach(() => {
    store = new MemoryCollectionStore();
    book = new CollectionBook(store, allSpots(ROOMS));
  });

  const openWindow = (cid: string, at: number, k = 1) => {
    const cur = book.current(cid, 'America/New_York', at);
    return cur.rows ?? book.storeDrops(cid, cur.window, seed(k));
  };

  it('creates a collector once, with its home zone and the starter pack', () => {
    const c = book.ensure('c_abcdefgh', 'America/New_York', morning);
    expect(c.tz).toBe('America/New_York');
    expect(store.owned('c_abcdefgh').sort()).toEqual([...STARTER_PACK].sort());
    expect(book.ensure('c_abcdefgh', 'Europe/Paris', morning + 1).tz).toBe('America/New_York');
    expect(book.ensure('c_zzzzzzzz', 'Not/AZone', morning).tz).toBe('UTC');
  });

  it('generates a window once and keeps it as the collection grows', () => {
    const first = openWindow('c_abcdefgh', morning);
    expect(first.length).toBeGreaterThanOrEqual(2);
    store.addOwned('c_abcdefgh', first[0]!.variant, 'found', morning);
    const again = book.current('c_abcdefgh', undefined, morning + 60_000);
    expect(again.rows?.map((r) => r.variant)).toEqual(first.map((r) => r.variant));
    expect(again.window).toBe('2026-10-18:AM');
  });

  it('opens a new window at local noon and forgets the old one', () => {
    openWindow('c_abcdefgh', morning);
    const noon = Date.UTC(2026, 9, 18, 16, 0); // 12:00 EDT
    expect(book.current('c_abcdefgh', undefined, noon).rows).toBeNull();
    openWindow('c_abcdefgh', noon, 2);
    expect(store.drops('c_abcdefgh', '2026-10-18:AM')).toEqual([]);
    expect(store.drops('c_abcdefgh', '2026-10-18:PM').length).toBeGreaterThanOrEqual(2);
  });

  it('lets the owl pick up a drop only while standing on it, once', () => {
    const [d] = openWindow('c_abcdefgh', morning);
    const at = { x: d!.x, y: d!.y };
    expect(book.claim('c_abcdefgh', undefined, d!.n, d!.room === 'hub' ? 'grove' : 'hub', at, morning)).toEqual({ ok: false, n: d!.n, reason: 'far' });
    expect(book.claim('c_abcdefgh', undefined, d!.n, d!.room, { x: d!.x + PICKUP_RADIUS + 5, y: d!.y }, morning)).toEqual({ ok: false, n: d!.n, reason: 'far' });
    const ok = book.claim('c_abcdefgh', undefined, d!.n, d!.room, { x: d!.x + 20, y: d!.y - 20 }, morning);
    expect(ok).toEqual({ ok: true, n: d!.n, variant: d!.variant, dup: false, feathers: 0 });
    expect(store.hasOwned('c_abcdefgh', d!.variant)).toBe(true);
    expect(book.claim('c_abcdefgh', undefined, d!.n, d!.room, at, morning)).toEqual({ ok: false, n: d!.n, reason: 'gone' });
    expect(book.claim('c_abcdefgh', undefined, 9, d!.room, at, morning)).toEqual({ ok: false, n: 9, reason: 'gone' });
    // The info a client sees lists only what is left.
    const cur = book.current('c_abcdefgh', undefined, morning);
    expect(book.info(cur.collector, cur.window, cur.next, cur.rows!).drops.map((v) => v.n)).not.toContain(d!.n);
  });

  it('pays feathers for a duplicate', () => {
    const [d] = openWindow('c_abcdefgh', morning);
    store.addOwned('c_abcdefgh', d!.variant, 'crafted', morning);
    const res = book.claim('c_abcdefgh', undefined, d!.n, d!.room, d!, morning);
    const payout = DUPLICATE_FEATHERS[parseVariant(d!.variant)!.rarity];
    expect(res).toEqual({ ok: true, n: d!.n, variant: d!.variant, dup: true, feathers: payout });
    expect(store.getCollector('c_abcdefgh')!.feathers).toBe(payout);
  });

  it('refuses a drop from a window that has ended', () => {
    const [d] = openWindow('c_abcdefgh', morning);
    const evening = Date.UTC(2026, 9, 18, 22, 0);
    expect(book.claim('c_abcdefgh', undefined, d!.n, d!.room, d!, evening)).toEqual({ ok: false, n: d!.n, reason: 'gone' });
  });

  it('crafts a chosen variant for feathers', () => {
    book.ensure('c_abcdefgh', 'UTC', morning);
    expect(book.craft('c_abcdefgh', undefined, 'crown~3', morning)).toEqual({ ok: false, reason: 'feathers', feathers: 0 });
    store.setFeathers('c_abcdefgh', CRAFT_COST.epic + 7);
    expect(book.craft('c_abcdefgh', undefined, 'crown~3', morning)).toEqual({ ok: true, variant: 'crown~3', feathers: 7 });
    expect(book.craft('c_abcdefgh', undefined, 'crown~3', morning)).toEqual({ ok: false, reason: 'owned', feathers: 7 });
    expect(book.craft('c_abcdefgh', undefined, 'crown~42', morning)).toEqual({ ok: false, reason: 'unknown', feathers: 7 });
    expect(book.craft('c_abcdefgh', undefined, 'hoot', morning).ok).toBe(false); // starter: already owned
  });

  it('changes the home zone at most once per cooldown, creation included', () => {
    book.ensure('c_abcdefgh', 'America/New_York', morning);
    expect(book.setTimeZone('c_abcdefgh', undefined, 'Mars/Base', morning)).toMatchObject({ ok: false, reason: 'invalid' });
    expect(book.setTimeZone('c_abcdefgh', undefined, 'America/New_York', morning)).toMatchObject({ ok: true });
    const locked = book.setTimeZone('c_abcdefgh', undefined, 'Europe/Paris', morning + DAY);
    expect(locked).toEqual({ ok: false, reason: 'locked', tz: 'America/New_York', tzLockedUntil: morning + TZ_CHANGE_COOLDOWN_DAYS * DAY });
    const later = morning + TZ_CHANGE_COOLDOWN_DAYS * DAY + 1;
    expect(book.setTimeZone('c_abcdefgh', undefined, 'Europe/Paris', later)).toEqual({ ok: true, tz: 'Europe/Paris', tzLockedUntil: later + TZ_CHANGE_COOLDOWN_DAYS * DAY });
    expect(book.inventory('c_abcdefgh', undefined, later).window).toBe(windowKeyAt(later, 'Europe/Paris'));
  });

  it('remembers only owned wear, and grants idempotently', () => {
    book.ensure('c_abcdefgh', 'UTC', morning);
    expect(book.grant('c_abcdefgh', 'cape~2', 'bought', morning)).toEqual({ ok: true, variant: 'cape~2', added: true });
    expect(book.grant('c_abcdefgh', 'cape~2', 'bought', morning)).toEqual({ ok: true, variant: 'cape~2', added: false });
    expect(book.grant('c_abcdefgh', 'cape~99', 'bought', morning)).toEqual({ ok: false, reason: 'unknown' });
    expect(book.setEquipped('c_abcdefgh', undefined, { neck: 'cape~2', head: 'crown~0' }, morning)).toEqual({ neck: 'cape~2' });
    expect(book.inventory('c_abcdefgh', undefined, morning)).toMatchObject({ equipped: { neck: 'cape~2' }, feathers: 0, tz: 'UTC' });
  });
});

describe('collector tokens and passes', () => {
  const secret = 'test-secret-for-unit-tests-only';

  it('signs collector tokens that only verify as collector tokens', async () => {
    const cid = randomCollectorId();
    expect(isCollectorId(cid)).toBe(true);
    const token = await mintCollector(secret, cid);
    expect(await verifyCollector(secret, token)).toBe(cid);
    expect(await verifyCollector('another-secret-entirely-xx', token)).toBeNull();
    expect(await verifyPass(secret, token)).toBeNull(); // not a pass
    const pass = await mintPass(secret, { id: 'v_abcdefgh12', exp: 9_999_999_999, adm: false, cid, tz: 'Asia/Kolkata' });
    expect(await verifyCollector(secret, pass)).toBeNull(); // not a collector token
    expect(await verifyPass(secret, pass)).toEqual({ id: 'v_abcdefgh12', exp: 9_999_999_999, adm: false, cid, tz: 'Asia/Kolkata' });
  });

  it('drops a malformed collector id or zone from a pass', async () => {
    const pass = await mintPass(secret, { id: 'v_abcdefgh12', exp: 9_999_999_999, adm: false, cid: 'nope', tz: 'Mars/Base' });
    expect(await verifyPass(secret, pass)).toEqual({ id: 'v_abcdefgh12', exp: 9_999_999_999, adm: false });
  });

  it('derives a stable 32-byte seed per collector and window', async () => {
    const a = await dropSeed(secret, 'c_abcdefgh', '2026-10-18:AM');
    expect(a).toHaveLength(32);
    expect(await dropSeed(secret, 'c_abcdefgh', '2026-10-18:AM')).toEqual(a);
    expect(await dropSeed(secret, 'c_abcdefgh', '2026-10-18:PM')).not.toEqual(a);
    expect(await dropSeed(secret, 'c_abcdefgi', '2026-10-18:AM')).not.toEqual(a);
  });
});
