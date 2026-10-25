import { describe, expect, it } from 'vitest';
import { MAX_CATCH_UP_MS, STEP_MS, StepClock } from './field';

describe("the games' clock", () => {
  it('steps in fixed slices, and after a stall catches up 100 ms of play at most, the rest let go', () => {
    const clock = new StepClock();
    let steps = 0;
    const step = () => {
      steps++;
      return true;
    };
    clock.advance(1000 / 60, step);
    expect(steps).toBe(2);
    // A frame the page took 400 ms to draw: the game moves on by 100 ms, not 400.
    steps = 0;
    clock.advance(400, step);
    expect(MAX_CATCH_UP_MS).toBe(100);
    expect(steps * STEP_MS).toBeLessThanOrEqual(MAX_CATCH_UP_MS);
    expect(steps * STEP_MS).toBeGreaterThan(MAX_CATCH_UP_MS - 2 * STEP_MS);
    // And the time let go is not caught up later: the next frame is an ordinary one.
    steps = 0;
    clock.advance(1000 / 60, step);
    expect(steps).toBeLessThanOrEqual(3);
  });

  it('stops stepping the moment the run ends', () => {
    const clock = new StepClock();
    let steps = 0;
    clock.advance(80, () => ++steps < 3);
    expect(steps).toBe(3);
    // Nothing left over to run on with.
    steps = 0;
    clock.advance(0, () => ++steps > 0);
    expect(steps).toBe(0);
  });
});
