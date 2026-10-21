import { describe, expect, it } from 'vitest';
import { CollectionBook, FURNITURE, FURNITURE_GIFT_FEATHERS, MemoryNestStore, NEST_SPOTS, NestBook, STARTER_FURNITURE, STARTER_LAYOUT, secureNestId, type NestLook, type NestRow, type NestStore } from '@owl-park/shared';
import { SqlNestStore } from '../src/sqlNestStore';
import { SqlCollectionStore } from '../src/sqlStore';
import { sqlStorage } from './sqlite';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const A = 'c_owlaaaaa';
const B = 'c_owlbbbbb';
const COLOURS: NestLook = { body: '#2F3E5C', belly: '#E0D4F0', accent: '#FF2AA1' };
const row = (cid: string, nestId: string, extra: Partial<NestRow> = {}): NestRow => ({ cid, nestId, open: true, layout: { f1: 'rug' }, look: COLOURS, giftDay: null, updated: 0, ...extra });

/** Both stores keep the same promises: in memory (the local mode) and the collections object's SQLite tables. */
const STORES: Array<[string, () => NestStore]> = [
  ['memory', () => new MemoryNestStore()],
  ['sqlite', () => new SqlNestStore(sqlStorage())],
];

for (const [name, make] of STORES) {
  describe(`the nest store (${name})`, () => {
    it('keeps one nest per collector under an id of its own', () => {
      const s = make();
      expect(s.insertNest(row(A, 'k3x9q2ab'))).toBe(true);
      expect(s.insertNest(row(A, 'zz99zz99'))).toBe(false); // one nest each
      expect(s.insertNest(row(B, 'k3x9q2ab'))).toBe(false); // ids never repeat
      expect(s.nestOf(A)).toEqual(row(A, 'k3x9q2ab'));
      expect(s.nestById('k3x9q2ab')).toEqual(row(A, 'k3x9q2ab'));
      expect(s.nestOf(B)).toBeNull();
      expect(s.nestById('zz99zz99')).toBeNull();
    });

    it('changes the layout and the doors with the time they were arranged, and the colours and the gift without it', () => {
      const s = make();
      s.insertNest(row(A, 'k3x9q2ab'));
      s.setLayout(A, { f2: 'lamp', w1: 'wall-clock' }, MON);
      s.setOpen(A, false, MON + 1);
      s.setLook(A, { body: '#3E6B48', belly: '#F6F1E3', accent: '#00E5FF' });
      s.setGiftDay(A, '2026-10-19');
      expect(s.nestOf(A)).toEqual({ cid: A, nestId: 'k3x9q2ab', open: false, layout: { f2: 'lamp', w1: 'wall-clock' }, look: { body: '#3E6B48', belly: '#F6F1E3', accent: '#00E5FF' }, giftDay: '2026-10-19', updated: MON + 1 });
    });

    it('keeps the furniture each collector owns, each piece once', () => {
      const s = make();
      expect(s.addFurniture(A, 'rug', 'starter', MON)).toBe(true);
      expect(s.addFurniture(A, 'rug', 'gift', MON + 1)).toBe(false);
      expect(s.addFurniture(A, 'armchair', 'gift', MON + 1)).toBe(true);
      expect(s.addFurniture(B, 'rug', 'starter', MON)).toBe(true);
      expect(s.furniture(A)).toEqual(['rug', 'armchair']);
      expect(s.furniture(B)).toEqual(['rug']);
      expect(s.furniture('c_nobody00')).toEqual([]);
    });

    it("lists open nests but the collector's own, the most recently arranged first, at most as many as asked", () => {
      const s = make();
      s.insertNest(row(A, 'aaaaaaaa', { updated: 50 }));
      s.insertNest(row(B, 'bbbbbbbb', { updated: 10, look: null }));
      s.insertNest(row('c_owlccccc', 'cccccccc', { updated: 30 }));
      s.insertNest(row('c_owldddd0', 'dddddddd', { updated: 40, open: false }));
      s.insertNest(row('c_owleeee0', 'eeeeeeee', { updated: 20 }));
      expect(s.recentOpen(A, 10)).toEqual([
        { nestId: 'cccccccc', look: COLOURS },
        { nestId: 'eeeeeeee', look: COLOURS },
        { nestId: 'bbbbbbbb', look: null },
      ]);
      expect(s.recentOpen(B, 2).map((d) => d.nestId)).toEqual(['aaaaaaaa', 'cccccccc']);
      expect(s.recentOpen('', 0)).toEqual([]);
    });

    it('lists nests arranged at the same time (or never) newest first', () => {
      const s = make();
      for (const [i, id] of ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd'].entries()) s.insertNest(row(`c_owl0000${i}`, id));
      expect(s.recentOpen('', 3).map((d) => d.nestId)).toEqual(['dddddddd', 'cccccccc', 'bbbbbbbb']);
    });
  });
}

describe("the nests' SQLite tables", () => {
  it('reads a broken layout or look as an empty nest and no colours', () => {
    const sql = sqlStorage();
    const s = new SqlNestStore(sql);
    s.insertNest(row(A, 'k3x9q2ab'));
    sql.exec(`UPDATE nests SET layout = 'not json', look = '{"body":"red"}' WHERE cid = ?`, A);
    expect(s.nestOf(A)).toMatchObject({ layout: {}, look: null });
    sql.exec(`UPDATE nests SET layout = '{"f1":"sofa","w1":"lamp","f2":"rug","f3":"rug"}', look = '[1,2]' WHERE cid = ?`, A);
    expect(s.nestOf(A)).toMatchObject({ layout: { f2: 'rug' }, look: null });
    expect(s.recentOpen(B, 5)).toEqual([{ nestId: 'k3x9q2ab', look: null }]);
  });

  it('stores only the three colours of a look, and only known pieces in known spots', () => {
    const sql = sqlStorage();
    const s = new SqlNestStore(sql);
    s.insertNest(row(A, 'k3x9q2ab', { look: { ...COLOURS, species: 'barn', wear: { head: 'crown~0' } } as NestLook, layout: { f1: 'rug', w9: 'lamp' } as NestRow['layout'] }));
    s.setLook(A, { ...COLOURS, pledge: 'grove' } as NestLook);
    const raw = sql.exec<{ look: string; layout: string }>(`SELECT look, layout FROM nests WHERE cid = ?`, A).toArray()[0]!;
    expect(Object.keys(JSON.parse(raw.look)).sort()).toEqual(['accent', 'belly', 'body']);
    expect(JSON.parse(raw.layout)).toEqual({ f1: 'rug' });
  });

  it("finds the street's nests through its index, in order, without reading them all", () => {
    const sql = sqlStorage();
    new SqlNestStore(sql);
    const plan = sql
      .exec<{ detail: string }>(`EXPLAIN QUERY PLAN SELECT nest_id, look FROM nests WHERE open = 1 AND cid <> ? ORDER BY updated DESC LIMIT ?`, A, 40)
      .toArray()
      .map((r) => r.detail);
    expect(plan.join(' | ')).toMatch(/USING INDEX nests_street/);
    expect(plan.join(' | ')).not.toMatch(/TEMP B-TREE|SCAN nests\b(?! USING)/);
  });

  it('runs the book over SQLite: a new nest, decorating, the gift and the street', () => {
    const sql = sqlStorage();
    const book = new CollectionBook(new SqlCollectionStore(sql));
    const nests = new NestBook(new SqlNestStore(sql), book, { newId: () => secureNestId((n) => crypto.getRandomValues(new Uint8Array(n))), random: () => 0 });
    const mine = nests.mine(A, COLOURS, MON);
    expect(mine.nest).toMatchObject({ open: true, layout: STARTER_LAYOUT, look: COLOURS });
    expect(mine.owned.sort()).toEqual([...STARTER_FURNITURE].sort());
    expect(nests.visit(mine.nest.nestId, B, MON)).toEqual({ nest: mine.nest, mine: false });
    expect(nests.setSpot(A, 'w1', 'lamp', MON + 1)).toEqual({ ok: false, reason: 'wrong-place' });
    const gift = nests.claimGift(A, MON);
    expect(gift).toMatchObject({ ok: true, feathers: 0 });
    const item = gift.ok ? gift.item : null;
    expect(item).toBe(FURNITURE.find((f) => !STARTER_FURNITURE.includes(f.id))?.id); // the first piece missing, with this random source
    const spot = NEST_SPOTS.find((s) => s.place === FURNITURE.find((f) => f.id === item)?.place && !(s.id in STARTER_LAYOUT))!.id;
    expect(nests.setSpot(A, spot, item, MON + 2)).toMatchObject({ ok: true, nest: { layout: { [spot]: item } } });
    expect(nests.claimGift(A, MON + 3)).toMatchObject({ ok: false, reason: 'taken' });
    // Owning every piece, the gift is feathers through the collection book.
    const store = new SqlNestStore(sql);
    for (const f of FURNITURE) store.addFurniture(B, f.id, 'gift', MON);
    expect(nests.claimGift(B, MON)).toMatchObject({ ok: true, item: null, feathers: FURNITURE_GIFT_FEATHERS, total: FURNITURE_GIFT_FEATHERS });
    expect(book.feathers(B, MON)).toBe(FURNITURE_GIFT_FEATHERS);
    // Each sees the other's nest on the street, never its own.
    expect(nests.street(A, 5).map((d) => d.nestId)).toEqual([nests.mine(B, null, MON).nest.nestId]);
    expect(nests.street(B, 5)).toEqual([{ nestId: mine.nest.nestId, look: COLOURS }]);
    nests.setOpen(A, false, MON + 4);
    expect(nests.street(B, 5)).toEqual([]);
  });
});
