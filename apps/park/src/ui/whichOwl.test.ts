import { describe, expect, it } from 'vitest';
import { showsArtBoxes } from './whichOwl';

describe('the quiz\'s picture boxes (OP-365)', () => {
  it('show on a painter\'s or a keeper\'s tab, where they tell the artist what to paint', () => {
    expect(showsArtBoxes('?paint=1')).toBe(true);
    expect(showsArtBoxes('?keeper=1')).toBe(true);
    expect(showsArtBoxes('?transport=local&paint=1&room=hub')).toBe(true);
  });

  it('stay out of every other visitor\'s quiz, whatever else the address asks for', () => {
    expect(showsArtBoxes('')).toBe(false);
    expect(showsArtBoxes('?transport=local')).toBe(false);
    expect(showsArtBoxes('?paint=0')).toBe(false);
    expect(showsArtBoxes('?paint=yes&keeper=true')).toBe(false);
    expect(showsArtBoxes('?boxes=1&sizes=1')).toBe(false);
  });
});
