import { describe, expect, it } from 'vitest';
import { WALK_SPEED, facing, followsOn, positionAlongWalk, walkDurationMs } from './walk';

describe('walks', () => {
  const walk = { from: { x: 0, y: 0 }, to: { x: WALK_SPEED, y: 0 }, startedAt: 1000 };

  it('takes distance / speed', () => {
    expect(walkDurationMs(walk.from, walk.to)).toBe(1000);
  });
  it('interpolates by wall-clock time and clamps at both ends', () => {
    expect(positionAlongWalk(walk, 500)).toEqual({ pos: { x: 0, y: 0 }, done: false });
    expect(positionAlongWalk(walk, 1500).pos.x).toBeCloseTo(WALK_SPEED / 2);
    expect(positionAlongWalk(walk, 1500).done).toBe(false);
    expect(positionAlongWalk(walk, 2000)).toEqual({ pos: { x: WALK_SPEED, y: 0 }, done: true });
    expect(positionAlongWalk(walk, 9999).done).toBe(true);
  });
  it('a zero-length walk is immediately done', () => {
    expect(positionAlongWalk({ from: { x: 5, y: 5 }, to: { x: 5, y: 5 }, startedAt: 0 }, 0).done).toBe(true);
  });
  it('takes another owl’s walk on from where the one it is drawn walking ends as next, not at once (OP-148)', () => {
    const on = { from: { x: WALK_SPEED, y: 0 }, to: { x: WALK_SPEED, y: 200 }, startedAt: 2000 };
    expect(followsOn(walk, on, 1900)).toBe(true);
    // Already due, or from elsewhere (a tap while walking), or with nothing under way: at once.
    expect(followsOn(walk, on, 2000)).toBe(false);
    expect(followsOn(walk, { ...on, from: { x: 100, y: 0 } }, 1900)).toBe(false);
    expect(followsOn(null, on, 1900)).toBe(false);
  });
  it('faces the direction of travel', () => {
    expect(facing(walk)).toBe(1);
    expect(facing({ ...walk, to: { x: -10, y: 0 } })).toBe(-1);
    expect(facing({ ...walk, to: { x: 0, y: 50 } })).toBe(0);
  });
});
