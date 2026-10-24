import { describe, expect, it } from 'vitest';
import { CollectionBook, DUPLICATE_FEATHERS, LEAF_FEATHERS_PER_DAY, PRESENTS, QuestBook, STARTER_PACK, parkDay, parseVariant, shopRotation, type QuestSpots } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { SqlCollectionStore } from '../src/sqlStore';
import { isCollectorId, mintCollector, mintPass, randomCollectorId, verifyCollector, verifyPass } from '../src/pass';
import { sqlStorage } from './sqlite';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const DAY = 24 * 3600_000;
const CID = 'c_abcdefgh';
const SPOTS: QuestSpots = Object.fromEntries(Object.values(ROOMS).map((r) => [r.id, r.spots ?? []]));

function rig() {
  const store = new SqlCollectionStore(sqlStorage());
  const book = new CollectionBook(store);
  return { store, book, quests: new QuestBook(store, book, SPOTS) };
}

describe('SqlCollectionStore', () => {
  it('moves quest items saved under the one-screen rooms along with the rooms, once', () => {
    const sql = sqlStorage();
    const item = (room: string, x: number, n: number) => ({ n, step: 0, room, x, y: 840, kind: 'acorn' as const, taken: false });
    new SqlCollectionStore(sql).putQuest({ cid: CID, quest: 'story-hazel-acorns', period: '', step: 0, count: 0, seen: [], items: [item('grove', 380, 0), item('market', 330, 1)], acceptedAt: MON, doneAt: null });
    sql.exec(`DELETE FROM meta`); // as the store was before the rooms grew
    const xs = () => new SqlCollectionStore(sql).quests(CID)[0]!.items.map((i) => i.x);
    expect(xs()).toEqual([1980, 330]);
    expect(xs()).toEqual([1980, 330]);
  });

  it('keeps a collector, the starter pack and the presents, grants and owned wear', () => {
    const { store, book } = rig();
    expect(book.ensure(CID, 'America/New_York', MON)).toMatchObject({ cid: CID, tz: 'America/New_York', feathers: 0 });
    expect(store.owned(CID).sort()).toEqual([...STARTER_PACK, ...PRESENTS.map((p) => p.variant)].sort());
    expect(book.ensure(CID, 'Europe/Paris', MON + 1).tz).toBe('America/New_York');
    expect(book.grant(CID, 'cape~2', 'granted', MON)).toEqual({ ok: true, variant: 'cape~2', added: true });
    expect(book.grant(CID, 'cape~2', 'granted', MON)).toEqual({ ok: true, variant: 'cape~2', added: false });
    expect(book.setEquipped(CID, undefined, { neck: 'cape~2', head: 'crown~0' }, MON)).toEqual({ neck: 'cape~2' });
    const inv = book.inventory(CID, undefined, MON);
    expect(inv).toMatchObject({ cid: CID, feathers: 0, equipped: { neck: 'cape~2' } });
    expect(inv.owned).toHaveLength(STARTER_PACK.length + PRESENTS.length + 1);
  });

  it('gives a collector made before a present that present when its collection is read, once', () => {
    const { store, book } = rig();
    store.insertCollector({ cid: CID, tz: 'UTC', tzSetAt: MON, feathers: 0, equipped: undefined, createdAt: MON });
    for (const v of STARTER_PACK) store.addOwned(CID, v, 'granted', MON);
    const presents = PRESENTS.map((p) => p.variant);
    expect(store.owned(CID)).not.toContain(presents[0]);
    expect(book.inventory(CID, undefined, MON + 1).owned).toEqual(expect.arrayContaining(presents));
    expect(book.owned(CID, undefined, MON + 2).filter((v) => presents.includes(v))).toEqual(presents);
    // A present the collector already holds is a duplicate if it comes again.
    expect(book.award(CID, presents[0]!, 'quest', MON + 3)).toMatchObject({ dup: true, feathers: DUPLICATE_FEATHERS[parseVariant(presents[0])!.rarity] });
  });

  it('pays a duplicate in feathers and sells from the shop once', () => {
    const { store, book } = rig();
    expect(book.award(CID, 'cape~2', 'quest', MON)).toEqual({ variant: 'cape~2', dup: false, feathers: 0 });
    const payout = DUPLICATE_FEATHERS[parseVariant('cape~2')!.rarity];
    expect(book.award(CID, 'cape~2', 'quest', MON)).toEqual({ variant: 'cape~2', dup: true, feathers: payout });
    expect(book.feathers(CID, MON)).toBe(payout);
    const item = shopRotation(MON).weekly.find((o) => !store.hasOwned(CID, o.variant))!;
    store.setFeathers(CID, item.price + 5);
    expect(book.buy(CID, item.variant, MON)).toEqual({ ok: true, variant: item.variant, price: item.price, feathers: 5 });
    expect(book.buy(CID, item.variant, MON)).toEqual({ ok: false, reason: 'owned', feathers: 5 });
    // Today's gift, once: kept in the same per-day table as the leaf-pile feathers.
    const gift = shopRotation(MON).gift!;
    expect(book.claimGift(CID, MON)).toMatchObject({ ok: true, variant: gift.variant });
    expect(book.claimGift(CID, MON)).toMatchObject({ ok: false, reason: 'taken' });
    expect(store.earned(CID, parkDay(MON), 'gift')).toBe(1);
    expect(book.shop(CID, MON).giftTaken).toBe(true);
  });

  it('caps leaf feathers per park day and forgets earlier days', () => {
    const { store, book } = rig();
    let total = 0;
    for (let i = 0; i < 30; i++) total += book.earnCapped(CID, 'leaves', 3, LEAF_FEATHERS_PER_DAY, MON).added;
    expect(total).toBe(LEAF_FEATHERS_PER_DAY);
    expect(store.earned(CID, parkDay(MON), 'leaves')).toBe(LEAF_FEATHERS_PER_DAY);
    expect(book.earnCapped(CID, 'leaves', 3, LEAF_FEATHERS_PER_DAY, MON + DAY).added).toBe(3);
    expect(store.earned(CID, parkDay(MON), 'leaves')).toBe(0);
    expect(book.feathers(CID, MON + DAY)).toBe(LEAF_FEATHERS_PER_DAY + 3);
  });

  it('keeps quest rows through accept, steps, items, hand-in and abandon', () => {
    const { store, quests } = rig();
    expect(quests.accept(CID, 'story-welcome', MON, 'hub').ok).toBe(true);
    quests.event(CID, { kind: 'talk', npc: 'pip' }, MON, 'hub');
    expect(store.quests(CID)).toEqual([expect.objectContaining({ quest: 'story-welcome', period: '', step: 1, count: 0, seen: [], items: [], acceptedAt: MON, doneAt: null })]);
    quests.event(CID, { kind: 'visit', room: 'grove' }, MON, 'grove');
    quests.event(CID, { kind: 'interact', what: 'leaf-pile', id: 'grove-leaves-1', room: 'grove' }, MON, 'grove');
    quests.event(CID, { kind: 'talk', npc: 'nova' }, MON, 'market');
    quests.event(CID, { kind: 'emote', emote: 'hoot', room: 'hub', near: ['bramble'] }, MON, 'hub');
    expect(quests.handIn(CID, 'story-welcome', 'bramble', MON, () => 0.5)).toMatchObject({ ok: true, award: { variant: 'leaf-crown~0', dup: false } });
    expect(store.quests(CID)[0]!.doneAt).toBe(MON);

    // Quest items survive the JSON round trip, taken flags included.
    expect(quests.accept(CID, 'story-hazel-acorns', MON, 'grove').ok).toBe(true);
    const acorns = () => store.quests(CID).find((r) => r.quest === 'story-hazel-acorns')!;
    const [first] = acorns().items;
    expect(acorns().items).toHaveLength(3);
    expect(quests.gather(CID, 'story-hazel-acorns', first!.n, 'grove', first!, MON).ok).toBe(true);
    expect(acorns().items.find((i) => i.n === first!.n)!.taken).toBe(true);
    expect(quests.abandon(CID, 'story-hazel-acorns', MON).ok).toBe(true);
    expect(store.quests(CID).map((r) => r.quest)).toEqual(['story-welcome']);
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
    const pass = await mintPass(secret, { id: 'v_abcdefgh12', exp: 9_999_999_999, iat: 1_790_000_000, adm: false, cid, tz: 'Asia/Kolkata' });
    expect(await verifyCollector(secret, pass)).toBeNull(); // not a collector token
    expect(await verifyPass(secret, pass)).toEqual({ id: 'v_abcdefgh12', exp: 9_999_999_999, iat: 1_790_000_000, adm: false, cid, tz: 'Asia/Kolkata' });
  });

  it('drops a malformed collector id or zone from a pass', async () => {
    const pass = await mintPass(secret, { id: 'v_abcdefgh12', exp: 9_999_999_999, adm: false, cid: 'nope', tz: 'Mars/Base' });
    expect(await verifyPass(secret, pass)).toEqual({ id: 'v_abcdefgh12', exp: 9_999_999_999, adm: false });
  });
});
