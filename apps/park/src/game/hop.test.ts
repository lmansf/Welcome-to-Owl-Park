import { describe, expect, it } from 'vitest';
import { hopFlap, hopLift } from './hop';

describe('the hop', () => {
  it('rises to its top halfway and is back on the floor at the end', () => {
    expect(hopLift(0)).toBe(0);
    expect(hopLift(0.25)).toBeCloseTo(0.75);
    expect(hopLift(0.5)).toBe(1);
    expect(hopLift(1)).toBe(0);
    // Before it starts and after it ends, the owl stands on the floor.
    expect(hopLift(-0.2)).toBe(0);
    expect(hopLift(3)).toBe(0);
  });

  it('flaps two frames in turn while in the air, and none on the floor', () => {
    expect([0, 0.3, 0.55, 0.8].map(hopFlap)).toEqual(['spread', 'tucked', 'spread', 'tucked']);
    expect(hopFlap(-0.1)).toBeNull();
    expect(hopFlap(1)).toBeNull();
  });
});
