/**
 * The climb's book (designs/the-stained-glass-climb.md): one open run per collector, kept in a
 * store (the collections object's SQLite on the server, this browser's storage in the local
 * mode), and one row per band a run reached, with its verdict and its pay. Written without
 * platform APIs so the room server and the local mode run the same rules.
 *
 * A run is started or resumed by `climb`, survives any socket, and is forgotten an hour after it
 * started. An `ascent` names the band reached: every band above the run's banked band up to it is
 * checked against its floor, paid once a park day under the activities' shared cap, and recorded.
 * A band climbed within its brisk window (the high road's time and a fifth, judged from the band
 * below's arrival) pays a brisk feather on top. Reaching the clouds grants the realm's item the
 * first time ever.
 */
import { BAND_COUNT, type ClimbTier, type ClimbWhy } from './edge';
import type { CollectionBook } from './book';
import { hashSeed, moonTier, nightFor, parkDay, parkMoon } from './parktime';
import { isObj } from './validate';
import { BAND_FEATHERS, BRISK_FEATHERS, CLIMB_ROW_KEEP_DAYS, CLIMB_RUN_MAX_MS, NIGHTS, briskMs, isNightKey, leastClimbMs, plausibleBand, type Night } from './climb';

/** The item the clouds grant once (a common head wearable, its first colourway). */
export const CLOUDS_ITEM = 'glass-circlet~0';

export interface RunRow {
  cid: string;
  seed: number;
  night: string;
  /** The layout the run started under: floors are judged by it even if the night's layout changes later. */
  layout: string;
  startedAt: number;
  banked: number;
}

export type BandVerdict = 'ok' | 'paid-today';

export interface BandRow {
  cid: string;
  seed: number;
  band: number;
  /** The park day the band arrived (the day it was paid under). */
  day: string;
  arrivedAt: number;
  verdict: BandVerdict;
  floorMs: number;
  elapsedMs: number;
  /** The band's table value (with the brisk feather when it was earned), and what was added after the day's cap and the once-a-day rule. */
  due: number;
  added: number;
  /** The band was climbed within its brisk window. */
  brisk: boolean;
  why: ClimbWhy | null;
  night: string;
  /** The run reference a visitor can quote: eight hex characters of a hash of the collector and the seed. */
  ref: string;
}

export interface ClimbStore {
  openRun(cid: string): RunRow | null;
  /** Insert or replace the collector's run. */
  putRun(row: RunRow): void;
  /** Insert or replace the row for (cid, seed, band). */
  upsertBand(row: BandRow): void;
  bands(cid: string, seed: number): BandRow[];
  /** The bands with a row of verdict `ok` on this park day, lowest first. */
  paidBands(cid: string, day: string): number[];
  byRef(ref: string): BandRow[];
  /** Forget band rows that arrived before this moment. */
  sweep(before: number): void;
}

export interface ClimbFlags {
  /** The owl stands at the portal (the room object's word). */
  atPortal: boolean;
  /** The realms switch's `portal`. */
  portalLive: boolean;
  /** The realms switch's special night, if any. */
  special: string | null;
}

export type ClimbStart =
  | { ok: true; seed: number; startedAt: number; night: string; tier: ClimbTier; banked: number; remainingCap: number; bestBandToday: number; resumed: boolean; previousForgotten: boolean }
  | { ok: false; reason: 'far' | 'closed' };

export type AscentResult =
  | { ok: true; banked: number; added: number; feathers: number; total: number; brisk: number; why?: ClimbWhy; item?: { variant: string; first: true }; ref: string }
  | { ok: false; reason: 'idle' | 'too-fast' | 'forgotten' };

/** What a keeper sees for a run reference: never the collector id. */
export interface ClimbLookup {
  night: string;
  layout: string;
  startedAt: number;
  bands: Array<Omit<BandRow, 'cid'>>;
}

/** The run reference: FNV-1a of `cid:seed`, eight lowercase hex characters. */
export function climbRef(cid: string, seed: number): string {
  return hashSeed(`${cid}:${seed}`).toString(16).padStart(8, '0');
}

export const isClimbRef = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}$/.test(v);

const forgotten = (run: RunRow, now: number) => now - run.startedAt > CLIMB_RUN_MAX_MS;

export class ClimbBook {
  constructor(
    private readonly store: ClimbStore,
    private readonly book: CollectionBook,
    private readonly newSeed: () => number,
  ) {}

  /** The night a run is judged under: the one it started with, on the layout it started with. */
  private nightOf(run: RunRow): Night {
    const base = NIGHTS[run.night] ?? NIGHTS[moonTier(parkMoon(parkDay(run.startedAt)))]!;
    return { ...base, layout: run.layout };
  }

  private cap(cid: string, now: number): { remaining: number; total: number } {
    const total = this.book.earnedToday(cid, 'play', now);
    return { remaining: Math.max(0, this.book.playCap() - total), total };
  }

  /** Start a run (at the portal, while it is live) or resume the collector's open one, whatever the flags say. */
  start(cid: string, flags: ClimbFlags, now: number): ClimbStart {
    const day = parkDay(now);
    let run = this.store.openRun(cid);
    let resumed = false;
    let previousForgotten = false;
    if (run && forgotten(run, now)) {
      previousForgotten = true;
      run = null;
    }
    if (run) resumed = true;
    else {
      if (!flags.portalLive) return { ok: false, reason: 'closed' };
      if (!flags.atPortal) return { ok: false, reason: 'far' };
      const key = nightFor(day, flags.special, isNightKey);
      run = { cid, seed: this.newSeed() >>> 0, night: key, layout: NIGHTS[key]!.layout, startedAt: now, banked: 0 };
      this.store.putRun(run);
    }
    const paid = this.store.paidBands(cid, day);
    const { remaining } = this.cap(cid, now);
    return {
      ok: true,
      seed: run.seed,
      startedAt: run.startedAt,
      night: run.night,
      tier: this.nightOf(run).tier,
      banked: run.banked,
      remainingCap: remaining,
      bestBandToday: paid.length ? Math.max(...paid) : 0,
      resumed,
      previousForgotten,
    };
  }

  /** A band reached: every unpaid band above the banked one up to it, checked, paid and recorded. */
  band(cid: string, seed: number, band: number, now: number): AscentResult {
    const run = this.store.openRun(cid);
    if (!run || run.seed !== seed) return { ok: false, reason: 'idle' };
    if (forgotten(run, now)) return { ok: false, reason: 'forgotten' };
    if (!Number.isInteger(band) || band < 1 || band > BAND_COUNT) return { ok: false, reason: 'idle' };
    const ref = climbRef(cid, seed);
    const day = parkDay(now);
    const night = this.nightOf(run);
    const elapsed = now - run.startedAt;
    const rows = this.store.bands(cid, seed);
    if (band <= run.banked) {
      // Already banked: the row as it stands, nothing paid again.
      const row = rows.find((b) => b.band === band);
      return { ok: true, banked: run.banked, added: 0, feathers: this.book.feathers(cid, now), total: this.cap(cid, now).total, brisk: 0, why: 'paid-today', ref: row?.ref ?? ref };
    }
    // Every floor first: a frame that fails one writes nothing.
    for (let b = run.banked + 1; b <= band; b++) if (!plausibleBand(night, b, elapsed)) return { ok: false, reason: 'too-fast' };
    const paidToday = new Set(this.store.paidBands(cid, day));
    let added = 0;
    let feathers = this.book.feathers(cid, now);
    let why: ClimbWhy | undefined;
    let item: { variant: string; first: true } | undefined;
    let briskBands = 0;
    for (let b = run.banked + 1; b <= band; b++) {
      // Brisk: only the first band of this frame can be timed, from the band below's arrival (or the
      // start); bands caught up in one frame were not seen arriving, so they take the table value alone.
      const from = b === run.banked + 1 ? (b === 1 ? run.startedAt : (rows.find((r) => r.band === b - 1)?.arrivedAt ?? null)) : null;
      const window = briskMs(night, b);
      const brisk = from !== null && window > 0 && now - from <= window;
      if (brisk) briskBands++;
      const due = (BAND_FEATHERS[b - 1] ?? 0) + (brisk ? BRISK_FEATHERS : 0);
      let got = 0;
      let verdict: BandVerdict = 'ok';
      let w: ClimbWhy | null = null;
      if (paidToday.has(b)) {
        verdict = 'paid-today';
        w = 'paid-today';
      } else {
        const paid = this.book.play(cid, due, null, now);
        got = paid.added;
        feathers = paid.total;
        if (got < due) w = 'capped';
      }
      added += got;
      if (b === BAND_COUNT) {
        const grant = this.book.grant(cid, CLOUDS_ITEM, 'granted', now);
        if (grant.ok && grant.added) item = { variant: CLOUDS_ITEM, first: true };
        else if (!w) w = 'item-already-given';
      }
      this.store.upsertBand({ cid, seed, band: b, day, arrivedAt: now, verdict, floorMs: leastFloor(night, b), elapsedMs: elapsed, due, added: got, brisk, why: w, night: run.night, ref });
      why = w ?? undefined;
    }
    this.store.putRun({ ...run, banked: band });
    this.store.sweep(now - CLIMB_ROW_KEEP_DAYS * 24 * 60 * 60 * 1000);
    return { ok: true, banked: band, added, feathers, total: this.cap(cid, now).total, brisk: briskBands, ...(why ? { why } : {}), ...(item ? { item } : {}), ref };
  }

  /** A run by its reference, for a keeper: its night, when it started, and its bands, without the collector id. */
  lookup(ref: string): ClimbLookup | null {
    const rows = this.store.byRef(ref);
    const first = rows[0];
    if (!first) return null;
    const run = this.store.openRun(first.cid);
    const same = run && run.seed === first.seed ? run : null;
    return {
      night: first.night,
      layout: same?.layout ?? NIGHTS[first.night]?.layout ?? '',
      startedAt: same?.startedAt ?? Math.min(...rows.map((r) => r.arrivedAt - r.elapsedMs)),
      bands: rows.map(({ cid: _cid, ...rest }) => rest).sort((a, b) => a.band - b.band),
    };
  }
}

/** The floor a band was judged against, for its row (0 when the layout is unknown). */
function leastFloor(night: Night, band: number): number {
  const v = leastClimbMs(night, band);
  return Number.isFinite(v) ? v : 0;
}

// ---------- in memory ----------

export interface MemoryClimbSnapshot {
  runs: RunRow[];
  bands: BandRow[];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const WHYS = new Set(['capped', 'paid-today', 'item-already-given']);

function cleanRun(v: unknown): RunRow | null {
  if (!isObj(v) || typeof v['cid'] !== 'string' || !v['cid'] || typeof v['night'] !== 'string' || typeof v['layout'] !== 'string') return null;
  return { cid: v['cid'], seed: num(v['seed']) >>> 0, night: v['night'], layout: v['layout'], startedAt: num(v['startedAt']), banked: Math.min(BAND_COUNT, Math.max(0, Math.floor(num(v['banked'])))) };
}

function cleanBand(v: unknown): BandRow | null {
  if (!isObj(v) || typeof v['cid'] !== 'string' || !v['cid'] || typeof v['day'] !== 'string' || typeof v['night'] !== 'string' || !isClimbRef(v['ref'])) return null;
  const band = num(v['band']);
  if (!Number.isInteger(band) || band < 1 || band > BAND_COUNT) return null;
  const why = typeof v['why'] === 'string' && WHYS.has(v['why']) ? (v['why'] as ClimbWhy) : null;
  return { cid: v['cid'], seed: num(v['seed']) >>> 0, band, day: v['day'], arrivedAt: num(v['arrivedAt']), verdict: v['verdict'] === 'paid-today' ? 'paid-today' : 'ok', floorMs: num(v['floorMs']), elapsedMs: num(v['elapsedMs']), due: num(v['due']), added: num(v['added']), brisk: v['brisk'] === true, why, night: v['night'], ref: v['ref'] };
}

/** In-memory store for tests and the local mode. */
export class MemoryClimbStore implements ClimbStore {
  private runs = new Map<string, RunRow>();
  private rows: BandRow[] = [];

  snapshot(): MemoryClimbSnapshot {
    return { runs: [...this.runs.values()].map((r) => ({ ...r })), bands: this.rows.map((b) => ({ ...b })) };
  }

  /** Rebuild from a snapshot; anything malformed is skipped rather than trusted. */
  static from(input: unknown): MemoryClimbStore {
    const store = new MemoryClimbStore();
    const snap = isObj(input) ? input : {};
    for (const v of Array.isArray(snap['runs']) ? snap['runs'] : []) {
      const run = cleanRun(v);
      if (run) store.putRun(run);
    }
    for (const v of Array.isArray(snap['bands']) ? snap['bands'] : []) {
      const row = cleanBand(v);
      if (row) store.upsertBand(row);
    }
    return store;
  }

  openRun(cid: string) {
    const r = this.runs.get(cid);
    return r ? { ...r } : null;
  }
  putRun(row: RunRow) {
    this.runs.set(row.cid, { ...row });
  }
  upsertBand(row: BandRow) {
    this.rows = this.rows.filter((b) => !(b.cid === row.cid && b.seed === row.seed && b.band === row.band));
    this.rows.push({ ...row });
  }
  bands(cid: string, seed: number) {
    return this.rows.filter((b) => b.cid === cid && b.seed === seed).map((b) => ({ ...b }));
  }
  paidBands(cid: string, day: string) {
    return [...new Set(this.rows.filter((b) => b.cid === cid && b.day === day && b.verdict === 'ok').map((b) => b.band))].sort((a, b) => a - b);
  }
  byRef(ref: string) {
    return this.rows.filter((b) => b.ref === ref).map((b) => ({ ...b }));
  }
  sweep(before: number) {
    this.rows = this.rows.filter((b) => b.arrivedAt >= before);
  }
}
