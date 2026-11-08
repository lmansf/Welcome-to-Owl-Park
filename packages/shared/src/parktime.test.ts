import { describe, expect, it } from 'vitest';
import { MOON_EPOCH_DAY, daysBetween, moonTier, nightFor, parkMoon } from './parktime';

describe('the park moon', () => {
  it('is new on the epoch, full fourteen days later, and new again after twenty-eight', () => {
    expect(parkMoon(MOON_EPOCH_DAY)).toBe(0);
    expect(parkMoon('2026-12-01')).toBe(4);
    expect(parkMoon('2026-12-15')).toBe(0);
    expect(parkMoon('2026-11-16')).toBe(7);
    expect(daysBetween('2026-11-17', '2026-12-01')).toBe(14);
    expect(daysBetween('2026-12-01', '2026-11-17')).toBe(-14);
  });

  it('rises to the full moon and falls back', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(moonTier)).toEqual(['easy', 'easy', 'medium', 'medium', 'hard', 'medium', 'medium', 'easy']);
  });

  it('takes a known special night, else the moon', () => {
    const known = (k: string) => k === 'blood-moon';
    expect(nightFor('2026-12-01', 'blood-moon', known)).toBe('blood-moon');
    expect(nightFor('2026-12-01', 'unknown', known)).toBe('hard');
    expect(nightFor('2026-12-01', null, known)).toBe('hard');
    expect(nightFor(MOON_EPOCH_DAY, undefined, known)).toBe('easy');
  });
});
