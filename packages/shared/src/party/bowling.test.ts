import { describe, expect, it } from 'vitest';
import {
  BOWL_AIM_MAX,
  BOWL_BALL_R,
  BOWL_PINS,
  BOWL_ROLLS,
  BOWL_SPOT,
  BOWL_SWING_MS,
  BOWL_WORDS,
  atBowlSpot,
  bowlAdd,
  bowlAim,
  bowlOver,
  bowlRoll,
  bowlScore,
  newBowl,
} from './bowling';
import { BOWLING_LANE } from './tag';

const aims = Array.from({ length: 81 }, (_, i) => (BOWL_AIM_MAX * (i - 40)) / 40);

describe('pinecone bowling (OP-403, D5)', () => {
  it('straight down the lane is a strike', () => {
    expect(bowlRoll(0).down.sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('every aim knocks some pins down, so a first try never comes away with nothing (the kid bar)', () => {
    for (const a of aims) expect(bowlRoll(a).down.length, `aim ${a}`).toBeGreaterThanOrEqual(3);
  });

  it('aim matters: some aims leave pins standing, and more than one aim is a strike', () => {
    const counts = aims.map((a) => bowlRoll(a).down.length);
    expect(counts.some((n) => n < BOWL_PINS.length)).toBe(true);
    expect(counts.filter((n) => n === BOWL_PINS.length).length).toBeGreaterThan(1);
  });

  it('the pinecone stays on the lane, bumpers and all, and runs its whole length', () => {
    for (const a of aims) {
      const { path } = bowlRoll(a);
      for (const p of path) {
        expect(p.y).toBeGreaterThanOrEqual(BOWLING_LANE.y + BOWL_BALL_R - 1e-9);
        expect(p.y).toBeLessThanOrEqual(BOWLING_LANE.y + BOWLING_LANE.h - BOWL_BALL_R + 1e-9);
        expect(p.x).toBeGreaterThanOrEqual(BOWLING_LANE.x);
      }
      expect(path.at(-1)!.x).toBeGreaterThanOrEqual(BOWLING_LANE.x + BOWLING_LANE.w - BOWL_BALL_R);
    }
  });

  it('no pin falls twice, an aim past the swing is the swing’s edge, and a bad aim is straight', () => {
    for (const a of aims) expect(new Set(bowlRoll(a).down).size).toBe(bowlRoll(a).down.length);
    expect(bowlRoll(1)).toEqual(bowlRoll(BOWL_AIM_MAX));
    expect(bowlRoll(Number.NaN)).toEqual(bowlRoll(0));
  });

  it('the aim swings slowly to each side and back', () => {
    expect(bowlAim(0)).toBe(0);
    expect(bowlAim(BOWL_SWING_MS / 4)).toBeCloseTo(BOWL_AIM_MAX);
    expect(bowlAim((3 * BOWL_SWING_MS) / 4)).toBeCloseTo(-BOWL_AIM_MAX);
    expect(Math.abs(bowlAim(BOWL_SWING_MS))).toBeLessThan(1e-9);
  });

  it('the pins stand on the lane, in from its end', () => {
    for (const p of BOWL_PINS) {
      expect(p.x).toBeGreaterThan(BOWLING_LANE.x + BOWLING_LANE.w / 2);
      expect(p.x).toBeLessThan(BOWLING_LANE.x + BOWLING_LANE.w);
      expect(p.y).toBeGreaterThan(BOWLING_LANE.y);
      expect(p.y).toBeLessThan(BOWLING_LANE.y + BOWLING_LANE.h);
    }
  });

  it('Bowl shows standing at the head of the lane, not halfway down it', () => {
    expect(atBowlSpot(BOWL_SPOT)).toBe(true);
    expect(atBowlSpot({ x: BOWL_SPOT.x + 40, y: BOWL_SPOT.y + 20 })).toBe(true);
    expect(atBowlSpot({ x: BOWLING_LANE.x + BOWLING_LANE.w / 2, y: BOWL_SPOT.y })).toBe(false);
  });

  it('a game is three rolls; its score is the pins that fell; the next roll after it starts a new game', () => {
    let g = newBowl();
    expect(bowlOver(g)).toBe(false);
    g = bowlAdd(g, 6);
    g = bowlAdd(g, 3);
    expect(bowlOver(g)).toBe(false);
    g = bowlAdd(g, 5);
    expect(bowlOver(g)).toBe(true);
    expect(g.rolls).toHaveLength(BOWL_ROLLS);
    expect(bowlScore(g)).toBe(14);
    g = bowlAdd(g, 4);
    expect(g.rolls).toEqual([4]);
    expect(bowlAdd(newBowl(), 99).rolls).toEqual([6]);
    expect(bowlAdd(newBowl(), -2).rolls).toEqual([0]);
  });

  it('its words are short and plain', () => {
    expect(BOWL_WORDS.rolled(6)).toMatch(/strike/i);
    expect(BOWL_WORDS.rolled(4)).toBe('4 down!');
    expect(BOWL_WORDS.done(14)).toMatch(/^14 of 18 pins/);
    for (const w of [BOWL_WORDS.bowl, BOWL_WORDS.roll, BOWL_WORDS.aiming]) expect(w.length).toBeLessThanOrEqual(40);
  });
});
