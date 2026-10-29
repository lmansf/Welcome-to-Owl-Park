import { describe, expect, it } from 'vitest';
import { ARCADE_TASK, PLAY_FEATHERS_PER_DAY, dailyTasks, taskProgress } from './activities';
import { DAY_BEST_FEATHERS, GAMES, RUN_MAX_MS, WALL_SIZE, leastRunMs, runFeathers, type PortraitLook, type RunResult } from './arcade';
import { ArcadeBook, MemoryScoreStore, sanitizePortrait } from './arcadebook';
import { CollectionBook, MemoryCollectionStore } from './book';
import { nextParkDayAt, parkDay } from './parktime';

const T0 = Date.UTC(2026, 9, 20, 18);
const look = (body: string): PortraitLook => ({ body, belly: '#F6F1E3', accent: '#C9A227' });

function setup() {
  const book = new CollectionBook(new MemoryCollectionStore());
  const scores = new MemoryScoreStore();
  return { book, scores, arcade: new ArcadeBook(scores, book) };
}

/** A whole run: started long enough before `endAt` for its result, then ended with it. */
function ran(arcade: ArcadeBook, cid: string, result: RunResult, endAt: number, body = '#111111', seed = 1) {
  arcade.start(cid, result.game, seed, endAt - leastRunMs(result) - 1000);
  const settled = arcade.finish(cid, result, seed, look(body), endAt);
  if (!settled.ok) throw new Error(`the run was refused: ${settled.reason}`);
  return settled;
}

describe('the arcade’s book', () => {
  it('pays a run its band, and the day’s best its bonus the first time only', () => {
    const { arcade } = setup();
    const first = ran(arcade, 'c_a', { game: 'crossing', score: 5 }, T0, '#111111').paid;
    expect(first).toMatchObject({ game: 'crossing', score: 5, best: true, top: true });
    expect(first.added).toBe(runFeathers('crossing', 5) + DAY_BEST_FEATHERS);
    expect(first.wall).toEqual({ game: 'crossing', top: [{ score: 5, look: look('#111111') }] });
    expect(first.mine).toEqual({ crossing: 5 });
    // A worse run: its band only, and nothing changes on the wall.
    const worse = ran(arcade, 'c_a', { game: 'crossing', score: 1 }, T0 + 10_000, '#111111');
    expect(worse.paid).toMatchObject({ best: false, top: false, added: runFeathers('crossing', 1) });
    expect(worse.changed).toBe(false);
    // Beating its own day's best again: a new best, the top, but no second bonus.
    const again = ran(arcade, 'c_a', { game: 'crossing', score: 8 }, T0 + 20_000, '#111111').paid;
    expect(again).toMatchObject({ best: true, top: true, added: runFeathers('crossing', 8) });
    // Another owl beating it has its own first bonus.
    const other = ran(arcade, 'c_b', { game: 'crossing', score: 9 }, T0 + 30_000, '#222222');
    expect(other.paid).toMatchObject({ best: true, top: true, added: runFeathers('crossing', 9) + DAY_BEST_FEATHERS });
    expect(other.changed).toBe(true);
    expect(other.paid.wall.top.map((e) => e.score)).toEqual([9, 8]);
  });

  it('keeps no score of 0, and a run of 0 still counts as a round played', () => {
    const { arcade, book } = setup();
    const r = ran(arcade, 'c_a', { game: 'flight', score: 0 }, T0, '#111111');
    expect(r.paid).toMatchObject({ added: 0, best: false, top: false, mine: {} });
    expect(r.paid.wall.top).toEqual([]);
    expect(r.changed).toBe(false);
    // The round counts toward a task to play one (it is in the rotation once a cabinet plays).
    expect(taskProgress([ARCADE_TASK], [0], { kind: 'arcade' }).finished).toEqual([0]);
    expect(book.feathers('c_a', T0)).toBe(0);
  });

  it('pays inside the activities’ shared daily cap', () => {
    const { arcade, book } = setup();
    book.earnPlay('c_a', 20, T0);
    const r = ran(arcade, 'c_a', { game: 'flight', score: 40 }, T0, '#111111').paid;
    expect(r.added).toBe(PLAY_FEATHERS_PER_DAY - 20);
    expect(ran(arcade, 'c_a', { game: 'flight', score: 40 }, T0, '#111111').paid.added).toBe(0);
    expect(book.feathers('c_a', T0)).toBe(PLAY_FEATHERS_PER_DAY);
  });

  it('shows today’s best five per game, the earlier of equal scores first, each owl once', () => {
    const { arcade } = setup();
    const scores = [4, 9, 4, 7, 2, 11, 6];
    scores.forEach((s, i) => ran(arcade, `c_${i}`, { game: 'sling', score: s, shots: 10 }, T0 + i * 1000, `#00000${i}`));
    ran(arcade, 'c_1', { game: 'sling', score: 3, shots: 3 }, T0 + 9000, '#000001');
    const wall = arcade.wall('sling', T0 + 10_000);
    expect(wall.top.map((e) => e.score)).toEqual([11, 9, 7, 6, 4]);
    expect(wall.top).toHaveLength(WALL_SIZE);
    // The first 4 ended before the second.
    expect(wall.top[4]!.look.body).toBe('#000000');
    expect(arcade.walls(T0).map((w) => w.game)).toEqual(['crossing', 'flight', 'sling']);
  });

  it('starts every park day with an empty wall', () => {
    const { arcade } = setup();
    ran(arcade, 'c_a', { game: 'crossing', score: 6 }, T0, '#111111');
    const tomorrow = nextParkDayAt(T0) + 1000;
    expect(parkDay(tomorrow)).not.toBe(parkDay(T0));
    expect(arcade.wall('crossing', tomorrow).top).toEqual([]);
    expect(arcade.mine('c_a', tomorrow)).toEqual({});
    // A new day's best earns the bonus again.
    expect(ran(arcade, 'c_a', { game: 'crossing', score: 1 }, tomorrow, '#111111').paid.added).toBe(runFeathers('crossing', 1) + DAY_BEST_FEATHERS);
  });

  it('keeps only a portrait’s colours and kind, and rebuilds from a snapshot', () => {
    expect(sanitizePortrait({ body: '#112233', belly: '#445566', accent: '#778899', species: 'snowy', wear: { head: 'x' } })).toEqual({ body: '#112233', belly: '#445566', accent: '#778899', species: 'snowy' });
    expect(sanitizePortrait({ body: 'red', belly: '#445566', accent: '#778899' })).toBeNull();
    expect(sanitizePortrait({ body: '#112233', belly: '#445566', accent: '#778899', species: 'dodo' })).toEqual({ body: '#112233', belly: '#445566', accent: '#778899' });
    const { arcade, scores } = setup();
    ran(arcade, 'c_a', { game: 'flight', score: 12 }, T0, '#111111');
    const copy = MemoryScoreStore.from(JSON.parse(JSON.stringify(scores.snapshot())));
    expect(copy.top(parkDay(T0), 'flight', 5)).toEqual(scores.top(parkDay(T0), 'flight', 5));
    const junk = MemoryScoreStore.from({ scores: [{ day: parkDay(T0), game: 'golf', cid: 'c_a', score: 3, look: look('#111111') }, { day: 1 }, null] });
    expect(junk.snapshot().scores).toEqual([]);
  });

  it('keeps a run’s best as it goes, paying nothing, and its end still pays a new best and the day’s best (OP-137)', () => {
    const { arcade, book } = setup();
    ran(arcade, 'c_b', { game: 'flight', score: 4 }, T0, '#222222');
    ran(arcade, 'c_a', { game: 'flight', score: 2 }, T0 + 60_000);
    const start = T0 + 120_000;
    arcade.start('c_a', 'flight', 7, start);
    const feathers = book.feathers('c_a', start);
    // Past its own best: kept, nothing paid, the wall unchanged while the other owl leads.
    const at3 = start + leastRunMs({ game: 'flight', score: 3 });
    expect(arcade.record('c_a', { game: 'flight', score: 3 }, 7, look('#111111'), at3)).toEqual({ ok: true, wall: { game: 'flight', top: [{ score: 4, look: look('#222222') }, { score: 3, look: look('#111111') }] }, mine: { flight: 3 }, changed: true });
    // Past the day's best: on top of the wall at once.
    const at6 = start + leastRunMs({ game: 'flight', score: 6 });
    const top = arcade.record('c_a', { game: 'flight', score: 6 }, 7, look('#111111'), at6);
    expect(top.ok && top.wall.top[0]).toEqual({ score: 6, look: look('#111111') });
    // A score no better than the best kept changes nothing.
    expect(arcade.record('c_a', { game: 'flight', score: 6 }, 7, look('#111111'), at6 + 500)).toMatchObject({ ok: true, mine: { flight: 6 }, changed: false });
    expect(book.feathers('c_a', at6)).toBe(feathers);
    // The end: a new best and the day's best against the standings as the run started, the bonus once.
    const end = arcade.finish('c_a', { game: 'flight', score: 7 }, 7, look('#111111'), start + leastRunMs({ game: 'flight', score: 7 }));
    expect(end.ok && end.paid).toMatchObject({ score: 7, best: true, top: true, added: runFeathers('flight', 7) + DAY_BEST_FEATHERS, mine: { flight: 7 } });
    // A run that ends where its record stood is still a new best, with the day's best bonus.
    const { arcade: other } = setup();
    other.start('c_c', 'crossing', 3, T0);
    other.record('c_c', { game: 'crossing', score: 2 }, 3, look('#333333'), T0 + 10_000);
    const same = other.finish('c_c', { game: 'crossing', score: 2 }, 3, look('#333333'), T0 + 11_000);
    expect(same.ok && same.paid).toMatchObject({ best: true, top: true, added: runFeathers('crossing', 2) + DAY_BEST_FEATHERS });
    // And the bonus is marked paid: beating the day's best again earns none.
    const next = ran(other, 'c_c', { game: 'crossing', score: 5 }, T0 + 60_000, '#333333');
    expect(next.paid).toMatchObject({ best: true, top: true, added: runFeathers('crossing', 5) });
  });

  it('leaves a run cut short with its best on the wall, unpaid; the next run starts over (OP-137)', () => {
    const { arcade, book } = setup();
    arcade.start('c_a', 'flight', 7, T0);
    arcade.record('c_a', { game: 'flight', score: 5 }, 7, look('#111111'), T0 + leastRunMs({ game: 'flight', score: 5 }));
    // The page died: no end. The best stands, on the wall and as the owl's own, and nothing was paid.
    expect(arcade.mine('c_a', T0 + 60_000)).toEqual({ flight: 5 });
    expect(arcade.wall('flight', T0 + 60_000).top).toEqual([{ score: 5, look: look('#111111') }]);
    expect(book.feathers('c_a', T0 + 60_000)).toBe(0);
    // A new run takes the old one's place: the old one's end is not its run any more.
    arcade.start('c_a', 'flight', 8, T0 + 60_000);
    expect(arcade.finish('c_a', { game: 'flight', score: 5 }, 7, look('#111111'), T0 + 120_000)).toEqual({ ok: false, reason: 'idle' });
    const end = arcade.finish('c_a', { game: 'flight', score: 2 }, 8, look('#111111'), T0 + 120_000);
    expect(end.ok && end.paid).toMatchObject({ best: false, top: false, mine: { flight: 5 } });
  });

  it('takes only the collector’s run under way, with a result that could be true for its time', () => {
    const { arcade } = setup();
    const result = { game: 'crossing' as const, score: 4 };
    arcade.start('c_a', 'crossing', 7, T0);
    expect(arcade.finish('c_a', result, 8, look('#111111'), T0 + 60_000)).toEqual({ ok: false, reason: 'idle' });
    expect(arcade.finish('c_a', { game: 'flight', score: 4 }, 7, look('#111111'), T0 + 60_000)).toEqual({ ok: false, reason: 'idle' });
    expect(arcade.finish('c_b', result, 7, look('#111111'), T0 + 60_000)).toEqual({ ok: false, reason: 'idle' });
    expect(arcade.record('c_a', { game: 'crossing', score: 40 }, 7, look('#111111'), T0 + 5_000)).toEqual({ ok: false, reason: 'unknown' });
    // A record too quick leaves the run going; an end too quick ends it all the same (one result per run).
    expect(arcade.finish('c_a', { game: 'crossing', score: 40 }, 7, look('#111111'), T0 + 5_000)).toEqual({ ok: false, reason: 'unknown' });
    expect(arcade.finish('c_a', result, 7, look('#111111'), T0 + 60_000)).toEqual({ ok: false, reason: 'idle' });
    // A run left open past its time is forgotten.
    arcade.start('c_a', 'crossing', 9, T0);
    expect(arcade.record('c_a', result, 9, look('#111111'), T0 + RUN_MAX_MS + 1)).toEqual({ ok: false, reason: 'idle' });
    expect(arcade.finish('c_a', result, 9, look('#111111'), T0 + leastRunMs(result))).toMatchObject({ ok: true });
  });

  it('takes a run that ends at its limit, and an equal score as no new best and no day’s best (OP-131)', () => {
    const { arcade } = setup();
    arcade.start('c_a', 'flight', 7, T0);
    expect(arcade.finish('c_a', { game: 'flight', score: 0 }, 7, look('#111111'), T0 + RUN_MAX_MS)).toMatchObject({ ok: true });
    ran(arcade, 'c_b', { game: 'crossing', score: 6 }, T0 + 1_000, '#222222');
    ran(arcade, 'c_a', { game: 'crossing', score: 4 }, T0 + 2_000);
    // Equal to its own best: no new best. Equal to the day's best, another owl's: a new best of its own, no bonus.
    expect(ran(arcade, 'c_a', { game: 'crossing', score: 4 }, T0 + 3_000).paid).toMatchObject({ best: false, top: false, added: runFeathers('crossing', 4) });
    expect(ran(arcade, 'c_a', { game: 'crossing', score: 6 }, T0 + 4_000).paid).toMatchObject({ best: true, top: false, added: runFeathers('crossing', 6) });
  });

  it('keeps the runs under way in its snapshot, so the local mode’s next call still has them', () => {
    const { scores, arcade } = setup();
    arcade.start('c_a', 'sling', 12, T0);
    const copy = MemoryScoreStore.from(JSON.parse(JSON.stringify(scores.snapshot())));
    expect(copy.openRun('c_a')).toEqual({ cid: 'c_a', game: 'sling', seed: 12, startedAt: T0, bestBefore: null });
    expect(MemoryScoreStore.from({ scores: [], runs: [{ cid: 'c_a', game: 'golf', seed: 1 }, { cid: '', game: 'sling', seed: 1 }, null] }).snapshot().runs).toEqual([]);
  });

  it('joins the day’s tasks at a game only once a cabinet plays', () => {
    expect(ARCADE_TASK).toEqual({ kind: 'arcade', count: 1, text: 'Play a round in the arcade' });
    expect(GAMES.crossing.name).toBe('Hoot & Hop');
    // Whatever the cabinets say, a day's tasks never repeat a kind.
    for (let d = 0; d < 30; d++) {
      const kinds = dailyTasks(parkDay(T0 + d * 86_400_000)).map((t) => t.kind);
      expect(new Set(kinds).size).toBe(3);
    }
  });
});
