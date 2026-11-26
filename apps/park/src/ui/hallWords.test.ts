import { describe, expect, it } from 'vitest';
import { COMMONS_WORDS, beamWords } from './hallWords';

describe("the moonbeam's line (OP-463)", () => {
  it('says what the light is for, with the control this device plays with', () => {
    expect(beamWords(false)).toBe(COMMONS_WORDS.beam.keys);
    expect(beamWords(false)).toContain('Space');
    expect(beamWords(true)).toBe(COMMONS_WORDS.beam.touch);
    expect(beamWords(true)).not.toContain('Space');
    for (const w of [beamWords(false), beamWords(true)]) {
      expect(w).toMatch(/moonbeam/);
      expect(w).toMatch(/ride it up/);
    }
  });
});
