import { describe, expect, it } from 'vitest';
import { CollectionBook, MemoryCollectionStore } from './book';
import { BAND_FEATHERS, BRISK_FEATHERS, CLIMB_RUN_MAX_MS, NIGHTS, briskMs, leastClimbMs } from './climb';
import { CLOUDS_ITEM, ClimbBook, MemoryClimbStore, climbRef, isClimbRef, type ClimbFlags } from './climbbook';
import { PLAY_FEATHERS_PER_DAY } from './activities';
import { nextParkDayAt } from './parktime';

/** 2026-10-19 12:00 Eastern (16:00 UTC), a Monday. */
const MON = Date.UTC(2026, 9, 19, 16, 0, 0);
const CID = 'c_owlaaaaa';
const AT: ClimbFlags = { atPortal: true, portalLive: true, special: 'easy' };
const EASY = NIGHTS['easy']!;
/** A moment at which `band` could honestly have been reached: its floor plus a little. */
const reach = (band: number) => MON + leastClimbMs(EASY, band) + 250;

function setup(seeds = [7, 8, 9]) {
  const store = new MemoryClimbStore();
  const book = new CollectionBook(new MemoryCollectionStore());
  let i = 0;
  const climb = new ClimbBook(store, book, () => seeds[i++ % seeds.length]!);
  return { store, book, climb };
}

describe('the climb book: starting and resuming', () => {
  it('opens a run at the live portal, pinned to the night, and refuses far or closed without one', () => {
    const { climb } = setup();
    expect(climb.start(CID, { ...AT, portalLive: false }, MON)).toEqual({ ok: false, reason: 'closed' });
    expect(climb.start(CID, { ...AT, atPortal: false }, MON)).toEqual({ ok: false, reason: 'far' });
    const r = climb.start(CID, AT, MON);
    expect(r).toEqual({ ok: true, seed: 7, startedAt: MON, night: 'easy', tier: 'easy', banked: 0, remainingCap: PLAY_FEATHERS_PER_DAY, bestBandToday: 0, resumed: false, previousForgotten: false });
  });

  it('returns the open run on any later ask, whatever the flags say and wherever the owl stands', () => {
    const { climb } = setup();
    climb.start(CID, AT, MON);
    const again = climb.start(CID, { atPortal: false, portalLive: false, special: null }, MON + 60_000);
    expect(again).toMatchObject({ ok: true, seed: 7, startedAt: MON, resumed: true, previousForgotten: false });
  });

  it('forgets a run an hour after it started, and says so on the next start', () => {
    const { climb } = setup();
    climb.start(CID, AT, MON);
    expect(climb.band(CID, 7, 1, MON + CLIMB_RUN_MAX_MS + 1)).toEqual({ ok: false, reason: 'forgotten' });
    expect(climb.start(CID, AT, MON + CLIMB_RUN_MAX_MS + 1)).toMatchObject({ ok: true, seed: 8, resumed: false, previousForgotten: true, banked: 0 });
  });

  it('takes the moon’s night when no special night is lit', () => {
    const { climb } = setup();
    const r = climb.start(CID, { ...AT, special: null }, MON);
    expect(r.ok && ['easy', 'medium', 'hard'].includes(r.night)).toBe(true);
    const unknown = setup().climb.start(CID, { ...AT, special: 'blood-moon' }, MON);
    expect(unknown.ok && ['easy', 'medium', 'hard'].includes(unknown.night)).toBe(true);
  });
});

describe('the climb book: bands', () => {
  it('pays every band from the banked one up to the one reached, and the answer carries the reference', () => {
    const { climb, store, book } = setup();
    climb.start(CID, AT, MON);
    expect(climb.band(CID, 7, 1, reach(1))).toEqual({ ok: true, banked: 1, added: 1, feathers: book.feathers(CID, MON), total: 1, brisk: 0, ref: climbRef(CID, 7) });
    const r = climb.band(CID, 7, 3, reach(3));
    expect(r).toMatchObject({ ok: true, banked: 3, added: BAND_FEATHERS[1]! + BAND_FEATHERS[2]!, total: 4 });
    expect(store.bands(CID, 7).map((b) => [b.band, b.verdict, b.due, b.added, b.why])).toEqual([
      [1, 'ok', 1, 1, null],
      [2, 'ok', 1, 1, null],
      [3, 'ok', 2, 2, null],
    ]);
    expect(isClimbRef(store.bands(CID, 7)[0]!.ref)).toBe(true);
    expect(store.bands(CID, 7)[2]).toMatchObject({ floorMs: leastClimbMs(EASY, 3), elapsedMs: reach(3) - MON, night: 'easy', day: '2026-10-19' });
  });

  it('a second run today re-banks the bands without paying them again', () => {
    const { climb } = setup();
    climb.start(CID, AT, MON);
    climb.band(CID, 7, 3, reach(3));
    // Forgotten, then a new run on the same day.
    const later = MON + CLIMB_RUN_MAX_MS + 1;
    expect(climb.start(CID, AT, later)).toMatchObject({ ok: true, seed: 8, bestBandToday: 3, remainingCap: PLAY_FEATHERS_PER_DAY - 4 });
    const r = climb.band(CID, 8, 3, later + leastClimbMs(EASY, 3) + 250);
    expect(r).toMatchObject({ ok: true, banked: 3, added: 0, total: 4, why: 'paid-today' });
    // Band 4 came within its brisk window of band 3's arrival: the table's two feathers and the brisk one.
    const r4 = climb.band(CID, 8, 4, later + leastClimbMs(EASY, 4) + 250);
    expect(r4).toMatchObject({ ok: true, banked: 4, added: 3, total: 7, brisk: 1 });
    expect(r4).not.toHaveProperty('why');
  });

  it('a run across park midnight pays its later bands into the new day and not the earlier ones again', () => {
    const { climb, store } = setup();
    const start = nextParkDayAt(MON) - 20_000;
    climb.start(CID, AT, start);
    climb.band(CID, 7, 1, start + leastClimbMs(EASY, 1) + 250);
    const after = nextParkDayAt(MON) + leastClimbMs(EASY, 2) + 250;
    expect(climb.band(CID, 7, 2, after)).toMatchObject({ ok: true, banked: 2, added: 1, total: 1 });
    expect(store.bands(CID, 7).map((b) => b.day)).toEqual(['2026-10-19', '2026-10-20']);
    expect(store.paidBands(CID, '2026-10-20')).toEqual([2]);
  });

  it('clips a band at the activities’ cap, recording what was due', () => {
    const { climb, book, store } = setup();
    book.play(CID, PLAY_FEATHERS_PER_DAY - 4, null, MON);
    climb.start(CID, AT, MON);
    const r = climb.band(CID, 7, 4, reach(4));
    expect(r).toMatchObject({ ok: true, banked: 4, added: 4, total: PLAY_FEATHERS_PER_DAY, why: 'capped' });
    expect(store.bands(CID, 7).map((b) => [b.band, b.due, b.added, b.why])).toEqual([
      [1, 1, 1, null],
      [2, 1, 1, null],
      [3, 2, 2, null],
      [4, 2, 0, 'capped'],
    ]);
    expect(climb.start(CID, AT, MON + 1000)).toMatchObject({ ok: true, resumed: true, remainingCap: 0 });
  });

  it('pays a brisk feather for a storey climbed within the high road’s window, judged from the storey below', () => {
    const { climb, store } = setup();
    climb.start(CID, AT, MON);
    // Band 1 has no high road: never brisk.
    expect(briskMs(EASY, 1)).toBe(0);
    expect(climb.band(CID, 7, 1, reach(1))).toMatchObject({ ok: true, added: 1, brisk: 0 });
    // Band 2 within its window of band 1's arrival: a feather more, recorded on the row.
    const quick = reach(1) + briskMs(EASY, 2) - 500;
    expect(climb.band(CID, 7, 2, quick)).toMatchObject({ ok: true, banked: 2, added: BAND_FEATHERS[1]! + BRISK_FEATHERS, total: 3, brisk: 1 });
    expect(store.bands(CID, 7)[1]).toMatchObject({ band: 2, brisk: true, due: BAND_FEATHERS[1]! + BRISK_FEATHERS, added: 2 });
    // Band 3 dawdled: the table value alone.
    const slow = quick + briskMs(EASY, 3) + 3000;
    expect(climb.band(CID, 7, 3, slow)).toMatchObject({ ok: true, banked: 3, added: BAND_FEATHERS[2], brisk: 0 });
    expect(store.bands(CID, 7)[2]).toMatchObject({ band: 3, brisk: false });
    // Two bands in one frame: the first is timed from band 3's arrival (and was quick), the one caught
    // up with it was not seen arriving and takes the table value alone.
    const two = climb.band(CID, 7, 5, slow + 100);
    expect(two).toMatchObject({ ok: true, banked: 5, added: BAND_FEATHERS[3]! + BRISK_FEATHERS + BAND_FEATHERS[4]!, brisk: 1 });
    expect(store.bands(CID, 7).slice(3).map((r) => [r.band, r.brisk])).toEqual([
      [4, true],
      [5, false],
    ]);
  });

  it('refuses a band reached too fast and writes nothing', () => {
    const { climb, store } = setup();
    climb.start(CID, AT, MON);
    expect(climb.band(CID, 7, 2, MON + leastClimbMs(EASY, 2) - 2000)).toEqual({ ok: false, reason: 'too-fast' });
    expect(store.bands(CID, 7)).toEqual([]);
    expect(store.openRun(CID)?.banked).toBe(0);
    // Band 1 honest, band 2 not: the frame fails as a whole.
    expect(climb.band(CID, 7, 2, MON + leastClimbMs(EASY, 1) + 250)).toEqual({ ok: false, reason: 'too-fast' });
    expect(store.bands(CID, 7)).toEqual([]);
  });

  it('grants the clouds’ item the first time, and says it was already given the next', () => {
    const { climb, book } = setup();
    climb.start(CID, AT, MON);
    const r = climb.band(CID, 7, 6, reach(6));
    expect(r).toMatchObject({ ok: true, banked: 6, added: 10, item: { variant: CLOUDS_ITEM, first: true } });
    expect(book.owned(CID, undefined, MON)).toContain(CLOUDS_ITEM);
    const later = MON + CLIMB_RUN_MAX_MS + 1;
    climb.start(CID, AT, later);
    const again = climb.band(CID, 8, 6, later + leastClimbMs(EASY, 6) + 250);
    expect(again).toMatchObject({ ok: true, banked: 6, added: 0, why: 'paid-today' });
    expect(again).not.toHaveProperty('item');
    // The next park day the bands pay again, but the item is not given twice.
    const next = nextParkDayAt(later) + 1000;
    climb.start(CID, AT, next);
    const day2 = climb.band(CID, 9, 6, next + leastClimbMs(EASY, 6) + 250);
    expect(day2).toMatchObject({ ok: true, added: 10, why: 'item-already-given' });
    expect(day2).not.toHaveProperty('item');
  });

  it('answers a resend with the row as it stands, and another seed with idle', () => {
    const { climb } = setup();
    expect(climb.band(CID, 7, 1, reach(1))).toEqual({ ok: false, reason: 'idle' });
    climb.start(CID, AT, MON);
    climb.band(CID, 7, 2, reach(2));
    expect(climb.band(CID, 7, 2, reach(2) + 5000)).toMatchObject({ ok: true, banked: 2, added: 0, why: 'paid-today', ref: climbRef(CID, 7) });
    expect(climb.band(CID, 7, 1, reach(2) + 5000)).toMatchObject({ ok: true, banked: 2, added: 0, why: 'paid-today' });
    expect(climb.band(CID, 99, 3, reach(3))).toEqual({ ok: false, reason: 'idle' });
    expect(climb.band(CID, 7, 0, reach(3))).toEqual({ ok: false, reason: 'idle' });
    expect(climb.band(CID, 7, 7, reach(3))).toEqual({ ok: false, reason: 'idle' });
  });

  it('looks a run up by its reference without the collector id, and knows no stranger', () => {
    const { climb } = setup();
    climb.start(CID, AT, MON);
    climb.band(CID, 7, 2, reach(2));
    const ref = climbRef(CID, 7);
    const found = climb.lookup(ref);
    expect(found).toMatchObject({ night: 'easy', layout: EASY.layout, startedAt: MON });
    expect(found!.bands.map((b) => b.band)).toEqual([1, 2]);
    expect(JSON.stringify(found)).not.toContain(CID);
    expect(climb.lookup('00000000')).toBeNull();
  });

  it('sweeps band rows older than the keeping window on a write', () => {
    const { climb, store } = setup();
    climb.start(CID, AT, MON);
    climb.band(CID, 7, 1, reach(1));
    const much = MON + 31 * 24 * 60 * 60 * 1000;
    climb.start(CID, AT, much);
    climb.band(CID, 8, 1, much + leastClimbMs(EASY, 1) + 250);
    expect(store.bands(CID, 7)).toEqual([]);
    expect(store.bands(CID, 8)).toHaveLength(1);
  });
});

describe('the memory climb store', () => {
  it('round-trips through a snapshot and skips what is malformed', () => {
    const { climb, store } = setup();
    climb.start(CID, AT, MON);
    climb.band(CID, 7, 2, reach(2));
    const snap = JSON.parse(JSON.stringify(store.snapshot())) as { runs: unknown[]; bands: unknown[] };
    snap.bands.push({ cid: CID, band: 9 }, 'junk');
    snap.runs.push({ nope: true });
    const back = MemoryClimbStore.from(snap);
    expect(back.openRun(CID)).toEqual(store.openRun(CID));
    expect(back.bands(CID, 7)).toEqual(store.bands(CID, 7));
    expect(MemoryClimbStore.from(null).openRun(CID)).toBeNull();
  });
});
