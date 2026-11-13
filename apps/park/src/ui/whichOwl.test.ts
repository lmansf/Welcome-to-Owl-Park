import { describe, expect, it } from 'vitest';
import { quizPicture, showsArtBoxes } from './whichOwl';

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

describe('the quiz\'s painted pictures (OP-404)', () => {
  it('are each answer\'s quiz-<key> file with its 2x copy, and none where the build ships no such file', () => {
    const shipped = new Map([['quiz-moon.png', 'a'], ['quiz-moon@2x.png', 'b'], ['quiz-sun.webp', 'c']]);
    const moon = quizPicture('moon', shipped)!;
    expect(moon.src).toMatch(/\/art\/quiz-moon\.png$/);
    expect(moon.srcset).toMatch(/quiz-moon\.png 1x, .*quiz-moon%402x\.png 2x$/);
    expect(quizPicture('sun', shipped)).toEqual({ src: expect.stringMatching(/quiz-sun\.webp$/), srcset: '' });
    expect(quizPicture('dawn', shipped)).toBeNull();
  });
});
