import { describe, expect, it } from 'vitest';
import { ROOMS } from '../rooms';
import { CollectionBook, MemoryCollectionStore } from './book';
import { distance } from './geometry';
import { INTERACTABLES } from './interactables';
import { NPCS } from './npcs';
import { nextParkMonthAt, parkMonth, parkWeek } from './parktime';
import { MONTHLY_POOL, MONTHLY_PUZZLE_POOL, PUZZLE_QUESTS, QUESTS, TOWN_NPCS, WEEKLY_PUZZLE_POOL, getQuest, questPuzzle } from './questCatalog';
import { QuestBook, monthlyQuestIds, weeklyPuzzleIds, weeklyQuestIds, type QuestSpots } from './questbook';
import { ACTIVE_SLOTS, DAILY_QUEST_FEATHERS, MONTHLY_QUEST_FEATHERS, MONTHLY_REWARD_ODDS, WEEKLY_QUEST_FEATHERS, WEEKLY_REWARD_ODDS, rewardOdds } from './quests';
import {
  MemoryPuzzleStore,
  PUZZLES,
  PUZZLE_JAM_MS,
  PUZZLE_JAM_TRIES,
  PUZZLE_RUN_MAX,
  PUZZLE_SYMBOLS,
  PuzzleBook,
  getPuzzle,
  layoutRun,
  type PuzzleView,
} from './puzzles';

/** 2026-11-03 12:00 Eastern (17:00 UTC), a Tuesday. */
const NOW = Date.UTC(2026, 10, 3, 17, 0, 0);
const DAY = 86_400_000;
const SPOTS: QuestSpots = Object.fromEntries(Object.values(ROOMS).map((r) => [r.id, r.spots ?? []]));
const MONTH = parkMonth(NOW);

function rig() {
  let n = 0;
  const store = new MemoryPuzzleStore();
  const book = new PuzzleBook(store, SPOTS, { newSeed: () => `seed${++n}`, newId: () => `run${n}` });
  return { store, book };
}

/** The layout a view's run uses, for a test that plays as the room would (standing on each piece). */
function layoutOf(book: PuzzleBook, store: MemoryPuzzleStore, view: PuzzleView) {
  const run = store.run(view.run!.id)!;
  return layoutRun(getPuzzle(view.puzzle)!, run.seed, SPOTS);
}

/** Work one lock to open for `cid` in its run: read every clue or take the key, then open it. */
function solve(book: PuzzleBook, store: MemoryPuzzleStore, cid: string, puzzle: string, lock: string, period = MONTH) {
  const view = book.view(cid, puzzle, period, NOW)!;
  const p = getPuzzle(puzzle)!;
  const i = p.locks.findIndex((l) => l.id === lock);
  const lay = layoutOf(book, store, view)[i]!;
  const def = p.locks[i]!;
  if (def.kind === 'code') lay.hidden.forEach((h, n) => expect(book.look(cid, puzzle, lock, n, h.room, h, h.top ?? 0, period, NOW).ok).toBe(true));
  else expect(book.take(cid, puzzle, lock, lay.hidden[0]!.room, lay.hidden[0]!, lay.hidden[0]!.top ?? 0, period, NOW).ok).toBe(true);
  const code = def.kind === 'code' ? book.view(cid, puzzle, period, NOW)!.locks[i]!.clues.map((c) => c.symbol!) : undefined;
  return book.open(cid, puzzle, lock, code, lay.post.room, lay.post, lay.post.top ?? 0, period, NOW);
}

describe('quest tiers (OP-254)', () => {
  it('keys park months in Eastern time and finds the next first of the month', () => {
    expect(parkMonth(NOW)).toBe('M2026-11');
    // 23:30 Eastern on 31 October is still October.
    expect(parkMonth(Date.UTC(2026, 10, 1, 3, 30))).toBe('M2026-10');
    expect(parkMonth(Date.UTC(2026, 10, 1, 4, 30))).toBe('M2026-11');
    expect(nextParkMonthAt(NOW)).toBe(Date.UTC(2026, 11, 1, 5, 0, 0));
  });

  it('pays more at every tier', () => {
    expect(WEEKLY_QUEST_FEATHERS).toBeGreaterThan(DAILY_QUEST_FEATHERS.hard);
    expect(MONTHLY_QUEST_FEATHERS).toBeGreaterThan(WEEKLY_QUEST_FEATHERS);
    expect(MONTHLY_REWARD_ODDS.epic).toBeGreaterThan(WEEKLY_REWARD_ODDS.epic);
    expect(MONTHLY_REWARD_ODDS.common + MONTHLY_REWARD_ODDS.uncommon).toBe(0);
    for (const q of QUESTS.filter((q) => q.cadence === 'monthly')) expect(rewardOdds(q)).toBe(MONTHLY_REWARD_ODDS);
  });

  it('keeps the tiers independent: no daily, weekly or monthly quest requires another quest', () => {
    for (const q of QUESTS) if (q.cadence !== 'story') expect(q.requires ?? [], q.id).toEqual([]);
  });

  it('offers a monthly puzzle and a tour from different givers, and a weekly puzzle beside the grand quests', () => {
    // One tour for each owl of the open town (a realm's own quest owl gives only its own quests, OP-276).
    expect(MONTHLY_POOL.length).toBe(TOWN_NPCS.length);
    expect(MONTHLY_POOL.every((q) => q.steps.length === 7 && q.difficulty === 'hard')).toBe(true);
    for (let m = 0; m < 12; m++) {
      const month = parkMonth(Date.UTC(2026, m, 15));
      const ids = monthlyQuestIds(month).map((id) => getQuest(id)!);
      expect(ids).toHaveLength(2);
      expect(ids[0]!.type).toBe('puzzle');
      expect(ids[0]!.giver).not.toBe(ids[1]!.giver);
    }
    const week = parkWeek(NOW);
    expect(weeklyPuzzleIds(week)).toEqual([WEEKLY_PUZZLE_POOL[0]!.id]);
    expect(weeklyQuestIds(week)).toHaveLength(2);
    for (const q of PUZZLE_QUESTS) expect(questPuzzle(q), q.id).not.toBeNull();
    expect(MONTHLY_PUZZLE_POOL.length).toBeGreaterThan(0);
  });

  it('gives every tier its own slots: a full daily list never blocks a weekly or monthly quest', () => {
    const store = new MemoryCollectionStore();
    const quests = new QuestBook(store, new CollectionBook(store), SPOTS);
    const offers = Object.values(quests.board('c1', NOW).offers).flat();
    for (const o of offers.filter((o) => o.cadence === 'daily')) expect(quests.accept('c1', o.id, NOW).ok, o.id).toBe(true);
    const board = quests.board('c1', NOW);
    expect(board.active.filter((a) => a.cadence === 'daily')).toHaveLength(ACTIVE_SLOTS.daily);
    for (const o of offers.filter((o) => o.cadence === 'weekly' || o.cadence === 'monthly')) expect(quests.accept('c1', o.id, NOW).ok, o.id).toBe(true);
    const later = quests.board('c1', NOW);
    expect(later.month).toBe('M2026-11');
    const monthly = later.active.filter((a) => a.cadence === 'monthly');
    expect(monthly).toHaveLength(2);
    expect(monthly[0]!.endsAt).toBe(nextParkMonthAt(NOW));
    // The month turns: monthly quests are forgotten, weekly ones of a live week are not touched by it.
    expect(quests.board('c1', nextParkMonthAt(NOW) + 1000).active.some((a) => a.cadence === 'monthly')).toBe(false);
  });

  it('readies a puzzle quest on the puzzle event and pays the monthly reward at hand-in', () => {
    const store = new MemoryCollectionStore();
    const book = new CollectionBook(store);
    const quests = new QuestBook(store, book, SPOTS);
    const q = getQuest('puzzle-lockbox')!;
    expect(quests.accept('c1', q.id, NOW).ok).toBe(true);
    expect(quests.event('c1', { kind: 'puzzle', puzzle: 'moon-gate' }, NOW)).toEqual([]);
    const [u] = quests.event('c1', { kind: 'puzzle', puzzle: 'lockbox' }, NOW);
    expect(u).toMatchObject({ quest: q.id, ready: true });
    const res = quests.handIn('c1', q.id, q.giver, NOW, () => 0.5);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.feathers).toBeGreaterThanOrEqual(MONTHLY_QUEST_FEATHERS);
  });
});

describe('puzzle runs (OP-255)', () => {
  it('has puzzles whose locks chain to real locks, with several open from the start, in rooms with enough spots', () => {
    for (const p of PUZZLES) {
      const ids = p.locks.map((l) => l.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(p.locks.filter((l) => l.requires.length === 0).length, p.id).toBeGreaterThanOrEqual(2);
      for (const l of p.locks) {
        for (const r of l.requires) expect(ids.indexOf(r), `${p.id} ${l.id} needs ${r} first`).toBeLessThan(ids.indexOf(l.id));
        expect(ROOMS[l.room], l.room).toBeDefined();
        expect(l.kind === 'key' ? l.length : l.length >= 3, l.id).toBeTruthy();
      }
      // Every piece gets its own spot, clear of NPC owls and interactables.
      const lay = layoutRun(p, 'x', SPOTS);
      const pieces = lay.flatMap((l) => [l.post, ...l.hidden]);
      expect(new Set(pieces.map((q) => `${q.room}:${q.x}:${q.y}`)).size).toBe(pieces.length);
      for (const q of pieces) {
        expect(SPOTS[q.room]!.some((s) => s.x === q.x && s.y === q.y)).toBe(true);
        for (const b of [...NPCS, ...INTERACTABLES].filter((b) => b.room === q.room)) expect(distance(q, b.pos)).toBeGreaterThanOrEqual(90);
      }
    }
  });

  it('randomizes codes and spots per run, so a code from one run fails in another', () => {
    const p = getPuzzle('lockbox')!;
    const a = layoutRun(p, 'seed-a', SPOTS);
    const b = layoutRun(p, 'seed-b', SPOTS);
    expect(a).not.toEqual(b);
    expect(layoutRun(p, 'seed-a', SPOTS)).toEqual(a);
    for (const l of a) for (const s of l.code) expect(PUZZLE_SYMBOLS).toContain(s);

    const { book, store } = rig();
    const one = book.start('ann', 'lockbox', MONTH, NOW);
    const two = book.start('bob', 'lockbox', MONTH, NOW);
    expect(one.ok && two.ok).toBe(true);
    if (!one.ok || !two.ok) return;
    // Ann reads her run's code; Bob tries it on his own run's latch.
    const annLay = layoutOf(book, store, one.view)[0]!;
    const bobLay = layoutOf(book, store, two.view)[0]!;
    const res = book.open('bob', 'lockbox', 'bark-latch', annLay.code, bobLay.post.room, bobLay.post, bobLay.post.top ?? 0, MONTH, NOW);
    if (annLay.code.join() !== bobLay.code.join()) expect(res).toMatchObject({ ok: false, reason: 'wrong' });
  });

  it('never sends a code to a page: a clue shows its symbol only once read', () => {
    const { book } = rig();
    const res = book.start('ann', 'lockbox', MONTH, NOW);
    if (!res.ok) throw new Error('no run');
    const latch = res.view.locks[0]!;
    expect(latch.clues).toHaveLength(3);
    expect(latch.clues.every((c) => c.symbol === null)).toBe(true);
    expect(JSON.stringify(res.view)).not.toContain('seed1');
    // A lock that waits on another shows nothing yet.
    expect(res.view.locks[2]!).toMatchObject({ available: false, clues: [] });
  });

  it('opens the whole puzzle with two owls working locks side by side, and credits both', () => {
    const { book, store } = rig();
    expect(book.start('ann', 'lockbox', MONTH, NOW).ok).toBe(true);
    expect(book.join('bob', 'ann', 'lockbox', MONTH, NOW)).toMatchObject({ ok: true, view: { run: { members: 2, host: false } } });
    // In parallel: Ann the latch, Bob the lantern lock.
    expect(solve(book, store, 'ann', 'lockbox', 'bark-latch')).toMatchObject({ ok: true, credited: ['ann', 'bob'] });
    expect(solve(book, store, 'bob', 'lockbox', 'lantern-lock')).toMatchObject({ ok: true, credited: ['ann', 'bob'] });
    expect(solve(book, store, 'bob', 'lockbox', 'star-dial').ok).toBe(true);
    const last = solve(book, store, 'ann', 'lockbox', 'lockbox');
    expect(last).toMatchObject({ ok: true, completed: ['ann', 'bob'] });
    expect(book.view('bob', 'lockbox', MONTH, NOW)).toMatchObject({ mine: 4, total: 4, complete: true });
  });

  it('keeps progress per player: locks opened before an owl joined do not count for it', () => {
    const { book, store } = rig();
    book.start('ann', 'lockbox', MONTH, NOW);
    solve(book, store, 'ann', 'lockbox', 'bark-latch');
    book.join('cat', 'ann', 'lockbox', MONTH, NOW);
    expect(book.view('cat', 'lockbox', MONTH, NOW)).toMatchObject({ mine: 0 });
    solve(book, store, 'cat', 'lockbox', 'lantern-lock');
    solve(book, store, 'cat', 'lockbox', 'star-dial');
    const last = solve(book, store, 'ann', 'lockbox', 'lockbox');
    expect(last).toMatchObject({ ok: true, completed: ['ann'] });
    expect(book.view('cat', 'lockbox', MONTH, NOW)).toMatchObject({ mine: 3, complete: false });
  });

  it('makes an owl ahead redo the locks with a group further behind, then finish with it', () => {
    const { book, store } = rig();
    book.start('ann', 'lockbox', MONTH, NOW);
    for (const l of ['bark-latch', 'lantern-lock', 'star-dial']) solve(book, store, 'ann', 'lockbox', l);
    book.start('dee', 'lockbox', MONTH, NOW);
    const joined = book.join('ann', 'dee', 'lockbox', MONTH, NOW);
    // Dee's run is where Dee is: nothing of Ann's moves into it.
    expect(joined).toMatchObject({ ok: true, view: { mine: 3 } });
    if (joined.ok) expect(joined.view.locks.filter((l) => l.open)).toHaveLength(0);
    // Ann leaves her old run: it had only her, so it is gone.
    expect(store.run('run1')).toBeNull();
    expect(solve(book, store, 'ann', 'lockbox', 'bark-latch')).toMatchObject({ ok: true, credited: ['dee'] });
    solve(book, store, 'dee', 'lockbox', 'lantern-lock');
    solve(book, store, 'ann', 'lockbox', 'star-dial');
    expect(solve(book, store, 'dee', 'lockbox', 'lockbox')).toMatchObject({ ok: true, completed: ['dee', 'ann'] });
  });

  it('lets an owl pick the puzzle back up later: a new run carries the locks it opened', () => {
    const { book, store } = rig();
    book.start('ann', 'lockbox', MONTH, NOW);
    solve(book, store, 'ann', 'lockbox', 'bark-latch');
    // Coming back to the same run finds it as it was.
    expect(book.start('ann', 'lockbox', MONTH, NOW + DAY)).toMatchObject({ ok: true, view: { run: { id: 'run1' } } });
    book.leave('ann', 'lockbox', MONTH, NOW + DAY);
    const again = book.start('ann', 'lockbox', MONTH, NOW + 2 * DAY);
    expect(again).toMatchObject({ ok: true, view: { run: { id: 'run2' }, mine: 1 } });
    if (again.ok) expect(again.view.locks.find((l) => l.id === 'bark-latch')!.open).toBe(true);
    // And a friend joins that run, ahead of where a fresh one would be.
    expect(book.join('eli', 'ann', 'lockbox', MONTH, NOW + 2 * DAY)).toMatchObject({ ok: true, view: { mine: 0 } });
  });

  it('checks reach, order and keys on the server side', () => {
    const { book, store } = rig();
    const res = book.start('ann', 'lockbox', MONTH, NOW);
    if (!res.ok) throw new Error('no run');
    const lay = layoutOf(book, store, res.view);
    const clue = lay[0]!.hidden[0]!;
    expect(book.look('ann', 'lockbox', 'bark-latch', 0, clue.room, { x: clue.x + 400, y: clue.y }, clue.top ?? 0, MONTH, NOW)).toMatchObject({ ok: false, reason: 'far' });
    expect(book.look('ann', 'lockbox', 'bark-latch', 0, 'hub', clue, clue.top ?? 0, MONTH, NOW)).toMatchObject({ ok: false, reason: 'far' });
    const dial = lay[2]!.hidden[0]!;
    expect(book.look('ann', 'lockbox', 'star-dial', 0, dial.room, dial, dial.top ?? 0, MONTH, NOW)).toMatchObject({ ok: false, reason: 'locked' });
    const post = lay[1]!.post;
    expect(book.open('ann', 'lockbox', 'lantern-lock', undefined, post.room, post, post.top ?? 0, MONTH, NOW)).toMatchObject({ ok: false, reason: 'no-key' });
    expect(book.look('zed', 'lockbox', 'bark-latch', 0, clue.room, clue, clue.top ?? 0, MONTH, NOW)).toMatchObject({ ok: false, reason: 'no-run' });
    expect(book.start('ann', 'nope', MONTH, NOW)).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('jams a code lock after five wrong tries for a few seconds', () => {
    const { book, store } = rig();
    const res = book.start('ann', 'lockbox', MONTH, NOW);
    if (!res.ok) throw new Error('no run');
    const lay = layoutOf(book, store, res.view)[0]!;
    const wrong = lay.code.map((s) => PUZZLE_SYMBOLS[(PUZZLE_SYMBOLS.indexOf(s) + 1) % PUZZLE_SYMBOLS.length]!);
    const at = (t: number) => book.open('ann', 'lockbox', 'bark-latch', wrong, lay.post.room, lay.post, lay.post.top ?? 0, MONTH, t);
    for (let k = 1; k < PUZZLE_JAM_TRIES; k++) expect(at(NOW + k)).toMatchObject({ ok: false, reason: 'wrong', left: PUZZLE_JAM_TRIES - k });
    expect(at(NOW + 10)).toMatchObject({ ok: false, reason: 'wrong', left: 0 });
    // Even the right code waits out the jam.
    const right = (t: number) => book.open('ann', 'lockbox', 'bark-latch', lay.code, lay.post.room, lay.post, lay.post.top ?? 0, MONTH, t);
    expect(right(NOW + 20)).toMatchObject({ ok: false, reason: 'jammed' });
    expect(right(NOW + 20 + PUZZLE_JAM_MS)).toMatchObject({ ok: true });
  });

  it('holds at most four owls in a run, and an empty run is forgotten', () => {
    const { book, store } = rig();
    book.start('o0', 'moon-gate', 'W2026-11-02', NOW);
    for (let i = 1; i < PUZZLE_RUN_MAX; i++) expect(book.join(`o${i}`, 'o0', 'moon-gate', 'W2026-11-02', NOW).ok).toBe(true);
    expect(book.join('o9', 'o0', 'moon-gate', 'W2026-11-02', NOW)).toMatchObject({ ok: false, reason: 'full' });
    expect(book.join('o0', 'o0', 'moon-gate', 'W2026-11-02', NOW)).toMatchObject({ ok: false, reason: 'self' });
    // The host leaves: the run stays with a new host.
    book.leave('o0', 'moon-gate', 'W2026-11-02', NOW);
    expect(store.run('run1')!.host).toBe('o1');
    for (let i = 1; i < PUZZLE_RUN_MAX; i++) book.leave(`o${i}`, 'moon-gate', 'W2026-11-02', NOW);
    expect(store.run('run1')).toBeNull();
  });

  it('forgets runs and progress from an earlier period', () => {
    const { book, store } = rig();
    book.start('ann', 'moon-gate', 'W2026-10-26', NOW);
    solve(book, store, 'ann', 'moon-gate', 'root-door', 'W2026-10-26');
    expect(book.start('ann', 'moon-gate', 'W2026-11-02', NOW)).toMatchObject({ ok: true, view: { mine: 0, run: { id: 'run2' } } });
    expect(store.run('run1')).toBeNull();
    expect(store.progress('ann', 'moon-gate', 'W2026-10-26')).toBeNull();
  });
});

describe('the memory store snapshot (local mode)', () => {
  it('rebuilds runs and rows from a snapshot and drops junk', () => {
    const store = new MemoryPuzzleStore();
    store.putRun({ id: 'r1', puzzle: 'lockbox', period: 'M2026-11', seed: 's', host: 'a', members: ['a'], opened: ['bark-latch'], found: ['bark-latch:0'], keys: [], misses: { 'star-dial': { n: 2, until: 0 } }, createdAt: 1 });
    store.putProgress({ cid: 'a', puzzle: 'lockbox', period: 'M2026-11', opened: ['bark-latch'], run: 'r1' });
    const copy = MemoryPuzzleStore.from(JSON.parse(JSON.stringify(store.snapshot())));
    expect(copy.run('r1')).toEqual(store.run('r1'));
    expect(copy.progress('a', 'lockbox', 'M2026-11')).toEqual(store.progress('a', 'lockbox', 'M2026-11'));
    const junk = MemoryPuzzleStore.from({ runs: [null, { id: 'x' }, 5], rows: ['no', { cid: 'a' }] });
    expect(junk.snapshot()).toEqual({ runs: [], rows: [] });
    expect(MemoryPuzzleStore.from(null).snapshot()).toEqual({ runs: [], rows: [] });
  });
});
