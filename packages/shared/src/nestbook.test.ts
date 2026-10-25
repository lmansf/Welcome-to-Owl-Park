import { describe, expect, it } from 'vitest';
import { CollectionBook, MemoryCollectionStore } from './book';
import { FURNITURE, FURNITURE_GIFT_FEATHERS, NEST_SPOTS, STARTER_FURNITURE, isNestId, sanitizeLayout, type NestLayout, type NestLook } from './homes';
import { MemoryNestStore, NestBook, STARTER_LAYOUT, STREET_POOL, sanitizeNestLook, secureNestId, type NestRow } from './nestbook';
import { nextParkDayAt, parkDay, rotationRandom } from './parktime';
import type { StyleSet } from './styles';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const DAY = 24 * 3600_000;
const A = 'c_owlaaaaa';
const B = 'c_owlbbbbb';
const COLOURS: NestLook = { body: '#2F3E5C', belly: '#E0D4F0', accent: '#FF2AA1' };
const ALL = FURNITURE.map((f) => f.id);
/** What a new owl owns, in catalogue order. */
const STARTERS = ALL.filter((id) => STARTER_FURNITURE.includes(id));
const FLOOR = NEST_SPOTS.filter((s) => s.place === 'floor').map((s) => s.id);
const WALL = NEST_SPOTS.filter((s) => s.place === 'wall').map((s) => s.id);
const cryptoBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/** A nest book over memory stores; nest ids come from `ids` in turn, then from the cryptographic source. */
function rig(ids: string[] = [], random: () => number = () => 0, sets?: readonly StyleSet[]) {
  const store = new MemoryNestStore();
  const book = new CollectionBook(new MemoryCollectionStore());
  let n = 0;
  const newId = () => ids[n++] ?? secureNestId(cryptoBytes);
  return { store, book, nests: new NestBook(store, book, { newId, random, ...(sets ? { sets } : {}) }) };
}

/** A stored nest, as a store would hold it. */
const row = (cid: string, nestId: string, extra: Partial<NestRow> = {}): NestRow => ({ cid, nestId, open: true, layout: {}, look: COLOURS, giftDay: null, updated: 0, ...extra });

/** Every collector id in a value sent anywhere: there must never be one. */
const cids = (v: unknown) => JSON.stringify(v).match(/c_[A-Za-z0-9]+/g) ?? [];

describe('a nest on first sight', () => {
  it('is made once: a random id, the starter furniture arranged in it, open to visitors', () => {
    const { store, nests } = rig(['k3x9q2ab']);
    const mine = nests.mine(A, COLOURS, MON);
    expect(mine).toEqual({
      nest: { nestId: 'k3x9q2ab', open: true, layout: STARTER_LAYOUT, look: COLOURS },
      owned: STARTERS,
      gift: { taken: false, next: nextParkDayAt(MON) },
    });
    expect(nests.mine(A, COLOURS, MON + DAY).nest.nestId).toBe('k3x9q2ab');
    // Nobody has arranged it yet: it is not "recently arranged" on the street.
    expect(store.nestOf(A)?.updated).toBe(0);
    expect(cids(mine)).toEqual([]);
  });

  it('arranges exactly the starter pieces, each in a spot of its place', () => {
    expect(sanitizeLayout(STARTER_LAYOUT)).toEqual(STARTER_LAYOUT);
    expect(Object.values(STARTER_LAYOUT).sort()).toEqual([...STARTER_FURNITURE].sort());
  });

  it("keeps only its owner's three colours for the flag, and a change of colours arranges nothing", () => {
    const { store, nests } = rig();
    nests.mine(A, { ...COLOURS, pledge: 'grove', species: 'barn', wear: { head: 'crown~0' } } as NestLook, MON);
    expect(store.nestOf(A)?.look).toEqual(COLOURS);
    const later = { body: '#3E6B48', belly: '#F6F1E3', accent: '#00E5FF' };
    expect(nests.mine(A, later, MON + 1000).nest.look).toEqual(later);
    expect(store.nestOf(A)?.updated).toBe(0);
    // A look that is not three colours leaves the flag as it was.
    expect(nests.mine(A, { body: 'red' } as unknown as NestLook, MON + 2000).nest.look).toEqual(later);
    expect(nests.mine(A, null, MON + 3000).nest.look).toEqual(later);
    expect(sanitizeNestLook({ ...COLOURS, wear: { head: 'crown~0' } })).toEqual(COLOURS);
    for (const bad of [null, 'red', { ...COLOURS, body: 'red' }, { body: COLOURS.body, belly: COLOURS.belly }]) expect(sanitizeNestLook(bad)).toBeNull();
  });

  it('tries a fresh id when one is taken, and gives up after five', () => {
    const { nests } = rig(['aaaaaaaa', 'aaaaaaaa', 'NOT-AN-ID', 'bbbbbbbb']);
    expect(nests.mine(A, null, MON).nest.nestId).toBe('aaaaaaaa');
    expect(nests.mine(B, null, MON).nest.nestId).toBe('bbbbbbbb');
    const stuck = rig(Array.from({ length: 6 }, () => 'aaaaaaaa'));
    stuck.nests.mine(A, null, MON);
    expect(() => stuck.nests.mine(B, null, MON)).toThrow('no free nest id');
    expect(stuck.store.nestOf(B)).toBeNull();
  });
});

describe('nest ids from random bytes', () => {
  it('maps the bytes below 252 evenly onto the letters and digits and draws again for the rest', () => {
    const draws = [
      [255, 254, 253, 252, 0, 1, 35, 36],
      [71, 72, 107, 251, 9, 9, 9, 9],
    ];
    let i = 0;
    expect(secureNestId(() => Uint8Array.from(draws[i++]!))).toBe('ab9a9a99');
    expect(i).toBe(2);
    // Every byte below 252 stands for one of 36 characters, seven bytes each.
    const counts = new Map<string, number>();
    for (let b = 0; b < 252; b++) {
      const c = secureNestId(() => new Uint8Array(8).fill(b))[0]!;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    expect(counts.size).toBe(36);
    expect(new Set(counts.values())).toEqual(new Set([7]));
  });

  it('makes nest ids from the cryptographic source, and gives up on a source with nothing usable', () => {
    const ids = new Set(Array.from({ length: 200 }, () => secureNestId(cryptoBytes)));
    for (const id of ids) expect(isNestId(id), id).toBe(true);
    expect(ids.size).toBe(200);
    expect(() => secureNestId((n) => new Uint8Array(n).fill(255))).toThrow('no random bytes');
  });
});

describe('decorating a nest', () => {
  it('puts an owned piece in a spot, moves it, takes it away, and keeps the time it was arranged', () => {
    const { store, nests } = rig(['k3x9q2ab']);
    nests.mine(A, COLOURS, MON);
    const lampAt = Object.entries(STARTER_LAYOUT).find(([, item]) => item === 'lamp')![0];
    const free = FLOOR.find((s) => !(s in STARTER_LAYOUT))!;
    const moved = nests.setSpot(A, free, 'lamp', MON + 10);
    expect(moved).toEqual({ ok: true, nest: { nestId: 'k3x9q2ab', open: true, layout: sanitizeLayout({ ...STARTER_LAYOUT, [lampAt]: undefined, [free]: 'lamp' }), look: COLOURS } });
    expect(store.nestOf(A)?.updated).toBe(MON + 10);
    const away = nests.setSpot(A, free, null, MON + 20);
    expect(away.ok && Object.values(away.nest.layout)).not.toContain('lamp');
    // Taking from an empty spot, or putting a piece where it stands, arranges nothing.
    expect(nests.setSpot(A, free, null, MON + 30).ok).toBe(true);
    expect(store.nestOf(A)?.updated).toBe(MON + 20);
  });

  it('refuses an unknown spot or piece, a piece in the wrong place and one the owl does not own', () => {
    const { store, nests } = rig();
    nests.mine(A, null, MON);
    const before = store.nestOf(A);
    expect(nests.setSpot(A, 'f9', 'lamp', MON + 1)).toEqual({ ok: false, reason: 'spot' });
    expect(nests.setSpot(A, FLOOR[0]!, 'sofa', MON + 1)).toEqual({ ok: false, reason: 'unknown' });
    expect(nests.setSpot(A, WALL[0]!, 'lamp', MON + 1)).toEqual({ ok: false, reason: 'wrong-place' });
    expect(nests.setSpot(A, FLOOR[0]!, 'armchair', MON + 1)).toEqual({ ok: false, reason: 'not-owned' });
    expect(nests.setSpot(A, WALL[0]!, 'wall-clock', MON + 1)).toEqual({ ok: false, reason: 'not-owned' });
    expect(store.nestOf(A)).toEqual(before);
  });

  it('opens and closes a nest to visitors', () => {
    const { store, nests } = rig();
    nests.mine(A, null, MON);
    expect(nests.setOpen(A, false, MON + 5)).toMatchObject({ ok: true, nest: { open: false } });
    expect(store.nestOf(A)).toMatchObject({ open: false, updated: MON + 5 });
    expect(nests.setOpen(A, false, MON + 9)).toMatchObject({ ok: true, nest: { open: false } });
    expect(store.nestOf(A)?.updated).toBe(MON + 5);
    expect(nests.setOpen(A, true, MON + 9)).toMatchObject({ ok: true, nest: { open: true } });
  });

  it('makes the nest first when its owner has none yet', () => {
    const { store, nests } = rig(['k3x9q2ab']);
    expect(nests.setOpen(A, false, MON)).toMatchObject({ ok: true, nest: { nestId: 'k3x9q2ab', open: false } });
    expect(store.furniture(A).sort()).toEqual([...STARTER_FURNITURE].sort());
  });
});

describe('visiting a nest', () => {
  it('tells its owner what it owns and its gift, and anyone else only the nest', () => {
    const { nests } = rig(['k3x9q2ab']);
    const { nest } = nests.mine(A, COLOURS, MON);
    expect(nests.visit('k3x9q2ab', A, MON)).toEqual({ nest, mine: true, owned: STARTERS, gift: { taken: false, next: nextParkDayAt(MON) } });
    expect(nests.visit('k3x9q2ab', B, MON)).toEqual({ nest, mine: false });
    expect(nests.visit('k3x9q2ab', null, MON)).toEqual({ nest, mine: false });
    expect(cids(nests.visit('k3x9q2ab', A, MON))).toEqual([]);
  });

  it('finds no nest for an id nobody has, or for anything that is not a nest id', () => {
    const { nests } = rig(['k3x9q2ab']);
    nests.mine(A, null, MON);
    for (const id of ['zzzzzzzz', 'K3X9Q2AB', 'nest-k3x9q2ab', A, '']) expect(nests.visit(id, A, MON), id).toBeNull();
  });
});

describe('a stored nest gone wrong', () => {
  it('reads a broken layout and look cleaned, and decorates from the cleaned layout', () => {
    const { store, nests } = rig();
    store.insertNest(row(A, 'k3x9q2ab', { layout: { f1: 'sofa', w1: 'lamp', f2: 'rug', f3: 'rug', f4: 'lamp' } as NestLayout, look: { body: 'red' } as unknown as NestLook }));
    for (const item of STARTER_FURNITURE) store.addFurniture(A, item, 'starter', MON);
    expect(nests.visit('k3x9q2ab', B, MON)).toEqual({ nest: { nestId: 'k3x9q2ab', open: true, layout: { f2: 'rug', f4: 'lamp' } }, mine: false });
    expect(nests.setSpot(A, 'f5', 'potted-fern', MON)).toEqual({ ok: true, nest: { nestId: 'k3x9q2ab', open: true, layout: { f2: 'rug', f4: 'lamp', f5: 'potted-fern' } } });
    expect(store.nestOf(A)?.layout).toEqual({ f2: 'rug', f4: 'lamp', f5: 'potted-fern' });
  });

  it('rebuilds a memory store from its snapshot, skipping anything malformed', () => {
    const { store, nests } = rig(['k3x9q2ab', 'zz99zz99']);
    nests.mine(A, COLOURS, MON);
    nests.mine(B, null, MON);
    nests.setOpen(B, false, MON + 1);
    const copy = MemoryNestStore.from(JSON.parse(JSON.stringify(store.snapshot())));
    expect(copy.snapshot()).toEqual(store.snapshot());
    const junk = MemoryNestStore.from({
      nests: [
        null,
        'k3x9q2ab',
        { cid: A, nestId: 'TOO-LONG-ID' },
        { nestId: 'abcd1234' },
        { cid: A, nestId: 'abcd1234', open: 'yes', layout: { f1: 'rug', w9: 'lamp' }, look: { body: 'red' }, giftDay: 7, updated: 'soon' },
        { cid: B, nestId: 'abcd1234', open: true }, // the id is taken
      ],
      furniture: [[A, 'rug', 'starter', MON], [A, 'sofa', 'gift', MON], [A, 'lamp', 'stolen', 'x'], ['', 'rug', 'gift', 0], 'rug', null],
    });
    expect(junk.nestOf(A)).toEqual({ cid: A, nestId: 'abcd1234', open: false, layout: { f1: 'rug' }, look: null, giftDay: null, updated: 0 });
    expect(junk.nestOf(B)).toBeNull();
    expect(junk.furniture(A)).toEqual(['rug', 'lamp']);
    expect(junk.snapshot().furniture).toEqual([
      [A, 'rug', 'starter', MON],
      [A, 'lamp', 'gift', 0],
    ]);
    for (const bad of [null, undefined, 'x', 42, [], { nests: 'x', furniture: {} }]) expect(MemoryNestStore.from(bad).snapshot()).toEqual({ nests: [], furniture: [] });
  });
});

describe("the day's furniture gift", () => {
  it('is a piece the owl does not own yet, once a park day', () => {
    const { nests, book } = rig(['k3x9q2ab']);
    nests.mine(A, null, MON);
    const missing = ALL.filter((id) => !STARTER_FURNITURE.includes(id));
    const first = nests.claimGift(A, MON);
    expect(first).toEqual({ ok: true, item: missing[0], feathers: 0, total: 0, owned: ALL.filter((id) => STARTER_FURNITURE.includes(id) || id === missing[0]), next: nextParkDayAt(MON) });
    expect(nests.claimGift(A, MON + 3600_000)).toEqual({ ok: false, reason: 'taken', owned: first.owned, next: nextParkDayAt(MON) });
    expect(nests.visit('k3x9q2ab', A, MON)?.gift).toEqual({ taken: true, next: nextParkDayAt(MON) });
    // A new park day, a new gift: the next piece missing.
    const tomorrow = nextParkDayAt(MON);
    expect(nests.visit('k3x9q2ab', A, tomorrow)?.gift).toEqual({ taken: false, next: nextParkDayAt(tomorrow) });
    expect(nests.claimGift(A, tomorrow)).toMatchObject({ ok: true, item: missing[1], feathers: 0 });
    expect(book.feathers(A, tomorrow)).toBe(0);
  });

  it('turns over at midnight in the park', () => {
    const { nests } = rig();
    const late = Date.UTC(2026, 9, 21, 3, 59); // 23:59 on 20 October in New York
    expect(nests.claimGift(A, late).ok).toBe(true);
    expect(nests.claimGift(A, late + 30_000).ok).toBe(false);
    expect(parkDay(late + 60_000)).toBe('2026-10-21');
    expect(nests.claimGift(A, late + 60_000).ok).toBe(true);
  });

  it('pays feathers once the owl owns every piece, through the collection book', () => {
    const { store, nests, book } = rig();
    nests.mine(A, null, MON);
    for (const id of ALL) store.addFurniture(A, id, 'gift', MON);
    expect(nests.claimGift(A, MON)).toEqual({ ok: true, item: null, feathers: FURNITURE_GIFT_FEATHERS, total: FURNITURE_GIFT_FEATHERS, owned: ALL, next: nextParkDayAt(MON) });
    expect(book.feathers(A, MON)).toBe(FURNITURE_GIFT_FEATHERS);
    expect(nests.claimGift(A, MON + DAY)).toMatchObject({ ok: true, item: null, total: 2 * FURNITURE_GIFT_FEATHERS });
  });

  it('picks the piece with the random source, and only ever one the owl lacks', () => {
    const { store, nests } = rig([], () => 0.999999);
    expect(nests.claimGift(A, MON)).toMatchObject({ ok: true, item: ALL.filter((id) => !STARTER_FURNITURE.includes(id)).at(-1) });
    for (let d = 1; d < 30; d++) {
      const before = new Set(store.furniture(A));
      const res = nests.claimGift(A, MON + d * DAY);
      if (res.ok && res.item) expect(before.has(res.item)).toBe(false);
    }
    expect(store.furniture(A).sort()).toEqual([...ALL].sort());
  });
});

describe("a style set's capstone", () => {
  // A made-up set of the park's own pieces: the real sets come with the realms.
  const SET: StyleSet = { style: 'hub', name: 'Test set', collectibles: ['acorn-cap'], furniture: ['armchair'], capstone: 'bookshelf' };
  const sources = (store: MemoryNestStore) => store.snapshot().furniture.filter(([cid]) => cid === A).map(([, item, source]) => `${item}:${source}`);

  it('is given, once, when the park next reads the furniture of an owl that has the whole set', () => {
    const { store, book, nests } = rig(['k3x9q2ab'], () => 0, [SET]);
    expect(nests.mine(A, null, MON).owned).toEqual(STARTERS);
    book.grant(A, 'acorn-cap~4', 'quest', MON);
    expect(nests.furniture(A, MON)).toEqual(STARTERS); // the armchair is still missing
    store.addFurniture(A, 'armchair', 'gift', MON);
    expect(nests.mine(A, null, MON + 1).owned).toEqual(ALL.filter((id) => STARTER_FURNITURE.includes(id) || id === 'armchair' || id === 'bookshelf'));
    expect(nests.furniture(A, MON + 2)).toContain('bookshelf');
    expect(sources(store).filter((s) => s.startsWith('bookshelf'))).toEqual(['bookshelf:set']);
    expect(store.snapshot().furniture.find(([, item]) => item === 'bookshelf')?.[3]).toBe(MON + 1);
  });

  it("comes with the day's gift that completes the set", () => {
    const { store, book, nests } = rig([], () => 0, [SET]);
    book.grant(A, 'acorn-cap~0', 'gift', MON);
    expect(nests.furniture(A, MON)).toEqual([]); // no nest yet: no furniture, so nothing to give
    const res = nests.claimGift(A, MON);
    expect(res).toMatchObject({ ok: true, item: 'armchair' });
    expect(res.owned).toContain('bookshelf');
    expect(sources(store)).toContain('bookshelf:set');
  });

  it('is never given while no set exists', () => {
    const { store, book, nests } = rig(['k3x9q2ab'], () => 0, []);
    book.grant(A, 'acorn-cap~0', 'quest', MON);
    store.addFurniture(A, 'armchair', 'gift', MON);
    expect(nests.mine(A, null, MON).owned).not.toContain('bookshelf');
  });
});

describe('the street', () => {
  /** `n` other owls' nests, `n0000001` arranged at 1 ms and so on: the higher, the more recent. */
  function street(n: number, random: () => number = rotationRandom('street')) {
    const r = rig(['k3x9q2ab'], random);
    for (let i = 1; i <= n; i++) r.store.insertNest(row(`c_other${String(i).padStart(4, '0')}`, `n${String(i).padStart(7, '0')}`, { updated: i }));
    r.nests.mine(A, COLOURS, MON);
    r.nests.setSpot(A, FLOOR.find((s) => !(s in STARTER_LAYOUT))!, 'rug', MON); // its own, the most recent of all
    return r;
  }

  it("shows open nests only, never the visitor's own, and at most the doors asked for", () => {
    const { store, nests } = street(8);
    store.setOpen('c_other0008', false, 100);
    for (let k = 0; k < 20; k++) {
      const doors = nests.street(A, 5);
      expect(doors).toHaveLength(5);
      const ids = doors.map((d) => d.nestId);
      expect(new Set(ids).size).toBe(5);
      expect(ids).not.toContain('k3x9q2ab');
      expect(ids).not.toContain('n0000008');
    }
    expect(nests.street(A, 0)).toEqual([]);
    expect(nests.street(A, NaN)).toEqual([]);
    expect(nests.street(A, 50)).toHaveLength(7);
    // The visitor's own nest is on another owl's street.
    expect(nests.street('c_other0001', 50).map((d) => d.nestId)).toContain('k3x9q2ab');
  });

  it('picks at random from the nests arranged most recently, a fresh mix each time', () => {
    const { nests } = street(STREET_POOL + 10);
    const seen = new Set<string>();
    const mixes = new Set<string>();
    for (let k = 0; k < 300; k++) {
      const ids = nests.street(A, 5).map((d) => d.nestId);
      ids.forEach((id) => seen.add(id));
      mixes.add(ids.join());
    }
    // The ten arranged longest ago never come up; every one of the forty most recent does.
    expect(seen.size).toBe(STREET_POOL);
    for (let i = 1; i <= 10; i++) expect(seen.has(`n${String(i).padStart(7, '0')}`)).toBe(false);
    expect(mixes.size).toBeGreaterThan(250);
  });

  it("carries each nest's id and its owner's three colours, nothing else", () => {
    const { store, nests } = street(3);
    store.setLook('c_other0002', { ...COLOURS, species: 'barn', wear: { head: 'crown~0' } } as NestLook);
    store.insertNest(row('c_nolook01', 'nolook01', { look: null, updated: 50 }));
    const doors = nests.street(A, 5);
    expect(doors).toHaveLength(4);
    for (const d of doors) {
      expect(Object.keys(d).sort()).toEqual(['look', 'nestId']);
      if (d.nestId === 'nolook01') expect(d.look).toBeNull();
      else expect(d.look).toEqual(COLOURS);
    }
    expect(cids(doors)).toEqual([]);
  });
});
