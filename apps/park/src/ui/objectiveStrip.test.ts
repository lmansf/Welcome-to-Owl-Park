import { describe, expect, it } from 'vitest';
import { clockWords } from './objectiveStrip';

describe("the objective strip's clock (OP-344)", () => {
  it('shows how long the run has been going, and the gold time for as long as the run can still beat it', () => {
    expect(clockWords(0, 105_000)).toBe('0:00 · Gold under 1:45');
    expect(clockWords(42_300, 105_000)).toBe('0:42 · Gold under 1:45');
    expect(clockWords(104_999, 105_000)).toBe('1:44 · Gold under 1:45');
    // The gold time has gone: the clock alone, with no word of a prize that can no longer be won.
    expect(clockWords(105_000, 105_000)).toBe('1:45');
    expect(clockWords(754_000, 105_000)).toBe('12:34');
  });
});
