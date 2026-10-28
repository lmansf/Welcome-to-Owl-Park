import { describe, expect, it } from 'vitest';
import { FLAP_FIRST, FLAP_SPACING, FLAP_SPEED, leastRunMs, plausibleRun } from '@owl-park/shared';
import { FLAP_X, FlapGame, GROUND_Y } from './flap';

/** Lets `ms` go by a frame at a time, as a page does. */
function play(g: FlapGame, ms: number): void {
  for (let t = 0; t < ms; t += 1000 / 60) g.advance(1000 / 60);
}

/** Flies a steady owl: a flap whenever it sinks below the next gap's middle. */
function steady(g: FlapGame, gaps: number, limitMs = 300_000): void {
  g.tap();
  while (!g.over && g.score < gaps && g.time < limitMs) {
    const b = g.ahead();
    const target = (b?.gapY ?? 320) + 18;
    if (g.y > target && g.vy > 0) g.tap();
    g.advance(1000 / 60);
  }
}

describe('Moon Flap', () => {
  it('waits for the first flap, then falls between flaps', () => {
    const g = new FlapGame(1);
    play(g, 2000);
    expect(g.time).toBe(0);
    const y0 = g.y;
    g.tap();
    play(g, 100);
    expect(g.y).toBeLessThan(y0);
    play(g, 3000);
    expect(g.over).toBe(true);
    expect(g.end).toBe('ground');
    expect(g.overLine()).toBe('Touched down at 0.');
  });

  it('brings the branches at the steady pace the room server counts on', () => {
    const g = new FlapGame(5);
    steady(g, 3);
    expect(g.score).toBe(3);
    expect(g.time).toBeGreaterThanOrEqual(((FLAP_FIRST + 2 * FLAP_SPACING) / FLAP_SPEED) * 1000 - 20);
    expect(plausibleRun({ game: 'flight', score: g.score }, g.time)).toBe(true);
    expect(leastRunMs({ game: 'flight', score: 3 })).toBeLessThanOrEqual(g.time + 20);
  });

  it('can be flown through forty gaps by a steady owl', () => {
    for (const seed of [1, 2, 3]) {
      const g = new FlapGame(seed);
      steady(g, 40);
      expect(g.score, `seed ${seed}`).toBe(40);
      expect(g.over).toBe(false);
    }
  });

  it('ends the run on a branch with the line that says so', () => {
    const g = new FlapGame(9);
    g.tap();
    // Flap far too often: up into a branch's upper half.
    for (let i = 0; i < 600 && !g.over; i++) {
      if (i % 6 === 0) g.tap();
      g.advance(1000 / 60);
    }
    expect(g.over).toBe(true);
    expect(g.end).toBe('branch');
    expect(g.overLine()).toBe(`Clipped a branch at ${g.score}.`);
    expect(g.y).toBeLessThan(GROUND_Y);
    expect(FLAP_X).toBeGreaterThan(0);
  });

  it('flies 500 gaps with nothing in the game growing and no step getting slower (OP-137)', () => {
    const g = new FlapGame(26);
    const FRAME = 1000 / 60;
    /** Whether the flight lasts the next second, flapping now or not, with steady flaps after. */
    const lasts = (flapNow: boolean) => {
      const c = g.clone();
      if (flapNow) c.tap();
      for (let i = 0; i < 60 && !c.over; i++) {
        c.advance(FRAME);
        if (c.y > (c.ahead()?.gapY ?? 320) + 18 && c.vy > 0) c.tap();
      }
      return !c.over;
    };
    const steady = () => g.y > (g.ahead()?.gapY ?? 320) + 18 && g.vy > 0;
    /** Wall time for each hundred gaps, and the most branches the game held at once. */
    const per100: number[] = [];
    let most = 0;
    let since = performance.now();
    g.tap();
    while (!g.over && g.score < 500) {
      // A flap when the steady rule asks for one and it is safe, or when only a flap saves the flight.
      if (steady() ? lasts(true) : !lasts(false) && lasts(true)) g.tap();
      const before = g.score;
      g.advance(FRAME);
      most = Math.max(most, g.branches.length);
      if (g.score !== before && g.score % 100 === 0) {
        per100.push(performance.now() - since);
        since = performance.now();
      }
    }
    expect(g.over, `down at ${g.score}`).toBe(false);
    expect(g.score).toBe(500);
    // Four branches ahead, and one going by: never more.
    expect(most).toBeLessThanOrEqual(5);
    expect(JSON.stringify(g.clone()).length).toBeLessThan(2_000);
    // The last hundred gaps play no slower than the first (with room for a busy test machine).
    expect(per100[4]!).toBeLessThan(per100[0]! * 3 + 50);
  }, 60_000);

  it('lays out the same flight for the same seed', () => {
    const a = new FlapGame(42);
    const b = new FlapGame(42);
    steady(a, 10);
    steady(b, 10);
    expect(a.branches.map((x) => x.gapY)).toEqual(b.branches.map((x) => x.gapY));
  });
});
