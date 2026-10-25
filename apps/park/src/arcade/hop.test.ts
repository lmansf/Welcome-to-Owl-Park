import { describe, expect, it } from 'vitest';
import { HOP_MS, leastRunMs, plausibleRun } from '@owl-park/shared';
import { HOP_ROWS, HopGame } from './hop';

const FRAME = 1000 / 60;

/** Plays on for `ms`, a frame at a time, as a page does. */
const play = (g: HopGame, ms: number) => {
  for (let t = 0; t < ms; t += FRAME) g.advance(FRAME);
};

/** Hops on at every chance, as fast as the hops allow, until the crossing is banked or the owl is bumped. */
function dash(g: HopGame): void {
  const banked = g.score + 1;
  while (!g.over && g.score < banked) {
    g.tap();
    g.advance(FRAME);
  }
}

/** The shortest wait at the kerb after which a dash across gets through, even a frame early or late. */
function planDash(g: HopGame, limitMs = 20_000): number | null {
  const safe = (wait: number) => {
    const copy = g.clone();
    for (let t = 0; t < wait; t += FRAME) copy.advance(FRAME);
    dash(copy);
    return !copy.over;
  };
  for (let wait = 0; wait <= limitMs; wait += FRAME) if (safe(wait) && safe(wait + FRAME) && safe(Math.max(0, wait - FRAME))) return wait;
  return null;
}

/** Plays a careful owl: from each kerb it waits for a clear dash across, then hops all the way. */
function careful(g: HopGame, crossings: number): void {
  while (!g.over && g.score < crossings) {
    const wait = planDash(g);
    if (wait === null) return;
    for (let t = 0; t < wait; t += FRAME) g.advance(FRAME);
    dash(g);
  }
}

describe('Hoot & Hop', () => {
  it('lays out the same traffic for the same seed', () => {
    expect(JSON.stringify(new HopGame(7).lanes)).toBe(JSON.stringify(new HopGame(7).lanes));
    expect(JSON.stringify(new HopGame(7).lanes)).not.toBe(JSON.stringify(new HopGame(8).lanes));
  });

  it('leaves room between vehicles for the owl in every lane', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const lane of new HopGame(seed).lanes) {
        const v = [...lane.vehicles].sort((a, b) => a.x - b.x);
        expect(v.length).toBeGreaterThan(0);
        for (let i = 1; i < v.length; i++) expect(v[i]!.x - v[i]!.w / 2 - (v[i - 1]!.x + v[i - 1]!.w / 2)).toBeGreaterThanOrEqual(140);
      }
    }
  });

  it('hops one row a tap, never two at once, and banks a crossing at the far kerb', () => {
    const g = new HopGame(3);
    // Freeze the traffic out of the way to watch the owl alone.
    for (const l of g.lanes) l.vehicles = [];
    g.tap();
    g.tap();
    play(g, HOP_MS + 20);
    expect(g.row).toBe(1);
    for (let i = 0; i < HOP_ROWS - 2; i++) {
      g.tap();
      play(g, HOP_MS + 20);
    }
    expect(g.row).toBe(HOP_ROWS - 1);
    expect(g.score).toBe(1);
    expect(g.heading).toBe(-1);
    // A crossing cannot come quicker than the room server allows.
    expect(g.time + 1000).toBeGreaterThanOrEqual(leastRunMs({ game: 'crossing', score: 1 }));
  });

  it('ends the run when a vehicle meets the owl, with the line that says so', () => {
    const g = new HopGame(11);
    for (let i = 0; i < 400 && !g.over; i++) {
      g.tap();
      g.advance(1000 / 30);
    }
    expect(g.over).toBe(true);
    expect(g.overLine()).toBe(`Bumped! ${g.score} ${g.score === 1 ? 'crossing' : 'crossings'}.`);
  });

  it('can be crossed again and again by a careful owl, quicker each time, within the room server’s check', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = new HopGame(seed);
      careful(g, 6);
      expect(g.score, `seed ${seed}`).toBe(6);
      expect(g.tier).toBeGreaterThan(1);
      expect(plausibleRun({ game: 'crossing', score: g.score }, g.time)).toBe(true);
    }
  });
});
