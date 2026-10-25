import { describe, expect, it } from 'vitest';
import { ARCADE_TASK, PLAY_FEATHERS_PER_DAY, dailyTasks, taskProgress } from './activities';
import { DAY_BEST_FEATHERS, GAMES, WALL_SIZE, runFeathers, type PortraitLook } from './arcade';
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

describe('the arcade’s book', () => {
  it('pays a run its band, and the day’s best its bonus the first time only', () => {
    const { arcade } = setup();
    const first = arcade.finish('c_a', { game: 'crossing', score: 5 }, look('#111111'), T0).paid;
    expect(first).toMatchObject({ game: 'crossing', score: 5, best: true, top: true });
    expect(first.added).toBe(runFeathers('crossing', 5) + DAY_BEST_FEATHERS);
    expect(first.wall).toEqual({ game: 'crossing', top: [{ score: 5, look: look('#111111') }] });
    expect(first.mine).toEqual({ crossing: 5 });
    // A worse run: its band only, and nothing changes on the wall.
    const worse = arcade.finish('c_a', { game: 'crossing', score: 1 }, look('#111111'), T0 + 10_000);
    expect(worse.paid).toMatchObject({ best: false, top: false, added: runFeathers('crossing', 1) });
    expect(worse.changed).toBe(false);
    // Beating its own day's best again: a new best, the top, but no second bonus.
    const again = arcade.finish('c_a', { game: 'crossing', score: 8 }, look('#111111'), T0 + 20_000).paid;
    expect(again).toMatchObject({ best: true, top: true, added: runFeathers('crossing', 8) });
    // Another owl beating it has its own first bonus.
    const other = arcade.finish('c_b', { game: 'crossing', score: 9 }, look('#222222'), T0 + 30_000);
    expect(other.paid).toMatchObject({ best: true, top: true, added: runFeathers('crossing', 9) + DAY_BEST_FEATHERS });
    expect(other.changed).toBe(true);
    expect(other.paid.wall.top.map((e) => e.score)).toEqual([9, 8]);
  });

  it('keeps no score of 0, and a run of 0 still counts as a round played', () => {
    const { arcade, book } = setup();
    const r = arcade.finish('c_a', { game: 'flight', score: 0 }, look('#111111'), T0);
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
    const r = arcade.finish('c_a', { game: 'flight', score: 40 }, look('#111111'), T0).paid;
    expect(r.added).toBe(PLAY_FEATHERS_PER_DAY - 20);
    expect(arcade.finish('c_a', { game: 'flight', score: 40 }, look('#111111'), T0).paid.added).toBe(0);
    expect(book.feathers('c_a', T0)).toBe(PLAY_FEATHERS_PER_DAY);
  });

  it('shows today’s best five per game, the earlier of equal scores first, each owl once', () => {
    const { arcade } = setup();
    const scores = [4, 9, 4, 7, 2, 11, 6];
    scores.forEach((s, i) => arcade.finish(`c_${i}`, { game: 'sling', score: s, shots: 10 }, look(`#00000${i}`), T0 + i * 1000));
    arcade.finish('c_1', { game: 'sling', score: 3, shots: 3 }, look('#000001'), T0 + 9000);
    const wall = arcade.wall('sling', T0 + 10_000);
    expect(wall.top.map((e) => e.score)).toEqual([11, 9, 7, 6, 4]);
    expect(wall.top).toHaveLength(WALL_SIZE);
    // The first 4 ended before the second.
    expect(wall.top[4]!.look.body).toBe('#000000');
    expect(arcade.walls(T0).map((w) => w.game)).toEqual(['crossing', 'flight', 'sling']);
  });

  it('starts every park day with an empty wall', () => {
    const { arcade } = setup();
    arcade.finish('c_a', { game: 'crossing', score: 6 }, look('#111111'), T0);
    const tomorrow = nextParkDayAt(T0) + 1000;
    expect(parkDay(tomorrow)).not.toBe(parkDay(T0));
    expect(arcade.wall('crossing', tomorrow).top).toEqual([]);
    expect(arcade.mine('c_a', tomorrow)).toEqual({});
    // A new day's best earns the bonus again.
    expect(arcade.finish('c_a', { game: 'crossing', score: 1 }, look('#111111'), tomorrow).paid.added).toBe(runFeathers('crossing', 1) + DAY_BEST_FEATHERS);
  });

  it('keeps only a portrait’s colours and kind, and rebuilds from a snapshot', () => {
    expect(sanitizePortrait({ body: '#112233', belly: '#445566', accent: '#778899', species: 'snowy', wear: { head: 'x' } })).toEqual({ body: '#112233', belly: '#445566', accent: '#778899', species: 'snowy' });
    expect(sanitizePortrait({ body: 'red', belly: '#445566', accent: '#778899' })).toBeNull();
    expect(sanitizePortrait({ body: '#112233', belly: '#445566', accent: '#778899', species: 'dodo' })).toEqual({ body: '#112233', belly: '#445566', accent: '#778899' });
    const { arcade, scores } = setup();
    arcade.finish('c_a', { game: 'flight', score: 12 }, look('#111111'), T0);
    const copy = MemoryScoreStore.from(JSON.parse(JSON.stringify(scores.snapshot())));
    expect(copy.top(parkDay(T0), 'flight', 5)).toEqual(scores.top(parkDay(T0), 'flight', 5));
    const junk = MemoryScoreStore.from({ scores: [{ day: parkDay(T0), game: 'golf', cid: 'c_a', score: 3, look: look('#111111') }, { day: 1 }, null] });
    expect(junk.snapshot().scores).toEqual([]);
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
