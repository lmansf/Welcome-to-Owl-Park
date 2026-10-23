import { describe, expect, it } from 'vitest';
import { KNOCK_LEVELS, KNOCK_SHOTS, KNOCK_SHOT_MS, plausibleRun } from '@owl-park/shared';
import { CRATE, GROUND_Y, KnockGame, STACKS, standingCrates } from './knock';

const FRAME = 1000 / 60;

/** Plays a shot at this aim to its end: until the owl is ready again, the stack is down, or the run is over. */
function shoot(g: KnockGame, angle: number, power: number): void {
  g.angle = angle;
  g.power = power;
  g.release();
  for (let t = 0; t < 10_000 && (g.phase === 'flying' || g.phase === 'settling'); t += FRAME) g.advance(FRAME);
}

/** The aim that knocks down the most crates from where the game stands (the first such, low and gentle first). */
function bestShot(g: KnockGame): { angle: number; power: number; left: number } {
  let best = { angle: 0, power: 0, left: Infinity };
  for (let angle = -10; angle <= 70; angle += 2) {
    for (let power = 0.3; power <= 1.0001; power += 0.04) {
      const copy = g.clone();
      shoot(copy, angle, power);
      const left = copy.standing.length;
      if (left < best.left) best = { angle, power, left };
      if (left === 0) return best;
    }
  }
  return best;
}

describe('Nest Knockdown', () => {
  it('stands every crate on a stand or on crates, inside the field', () => {
    for (const plan of STACKS) {
      for (const c of standingCrates(plan)) {
        expect(c.x).toBeGreaterThan(200);
        expect(c.x + CRATE).toBeLessThan(480);
        expect(c.y).toBeGreaterThan(0);
        expect(c.y + CRATE).toBeLessThan(GROUND_Y);
      }
    }
    expect(STACKS).toHaveLength(KNOCK_LEVELS);
  });

  it('can knock every stack down within its three shots', () => {
    for (let level = 0; level < KNOCK_LEVELS; level++) {
      const g = KnockGame.at(level);
      let shots = 0;
      while (g.level === level && g.phase !== 'cleared' && shots < KNOCK_SHOTS) {
        const s = bestShot(g);
        shoot(g, s.angle, s.power);
        shots += 1;
      }
      expect(g.phase, `stack ${level + 1}`).toBe('cleared');
    }
  }, 120_000);

  it('scores a stack 3, 2 or 1 by its shots, moves on to the next, and takes at least the shots’ time', () => {
    const g = new KnockGame();
    const first = bestShot(g);
    shoot(g, first.angle, first.power);
    expect(g.phase).toBe('cleared');
    expect(g.score).toBe(3);
    expect(g.banner).toBe('Cleared in 1 shot!');
    for (let t = 0; t < 2000 && g.level === 0; t += FRAME) g.advance(FRAME);
    expect(g.level).toBe(1);
    expect(g.phase).toBe('aim');
    expect(g.time).toBeGreaterThanOrEqual(KNOCK_SHOT_MS);
    expect(plausibleRun({ game: 'sling', score: g.score, shots: g.shots }, g.time)).toBe(true);
  });

  it('ends the run when a stack is still standing after three shots', () => {
    const g = new KnockGame();
    for (let i = 0; i < KNOCK_SHOTS; i++) shoot(g, -20, 0.3);
    expect(g.over).toBe(true);
    expect(g.shots).toBe(3);
    expect(g.score).toBe(0);
    expect(g.overLine()).toBe('Out of shots at stack 1. 0 points.');
  });

  it('aims by the pull: back and down sends the owl up and on, never past the longest pull', () => {
    const g = new KnockGame();
    g.aimByPull(-100, 100);
    expect(g.angle).toBeCloseTo(45);
    expect(g.power).toBeCloseTo(1);
    g.aimByPull(-60, 0);
    expect(g.angle).toBeCloseTo(0);
    expect(g.power).toBeCloseTo(0.5);
    g.nudge(5, 0.1);
    expect(g.angle).toBeCloseTo(5);
    expect(g.power).toBeCloseTo(0.6);
    expect(g.path().length).toBeGreaterThan(3);
  });

  it('plays the same shot the same way every time', () => {
    const a = KnockGame.at(4);
    const b = KnockGame.at(4);
    shoot(a, 12, 0.8);
    shoot(b, 12, 0.8);
    expect(a.standing.map((c) => [c.x, c.y])).toEqual(b.standing.map((c) => [c.x, c.y]));
  });
});
