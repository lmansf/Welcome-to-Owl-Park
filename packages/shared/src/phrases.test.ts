import { describe, expect, it } from 'vitest';
import { BUBBLE_MS, PHRASES, PHRASE_GROUPS, PHRASE_NUMBER_MAX, SAY_EVERY_MS, getPhrase, isPhrase, phrasesIn } from './phrases';

describe('the prewritten phrases', () => {
  it('are the 24 approved ones, six groups of four, in the wheel’s order', () => {
    expect(PHRASES).toHaveLength(24);
    expect(PHRASE_GROUPS.map((g) => g.name)).toEqual(['Hello', 'Thanks and cheers', 'Together', 'Things to do', 'Feelings', 'Help and goodbye']);
    for (const g of PHRASE_GROUPS) expect(phrasesIn(g.id), g.id).toHaveLength(4);
    expect(PHRASE_GROUPS.flatMap((g) => phrasesIn(g.id))).toEqual(PHRASES);
    expect(phrasesIn('hello').map((p) => p.text)).toEqual(['Hi!', 'Hoot hoot!', 'Nice to meet you!', 'Good night!']);
    expect(phrasesIn('help').map((p) => p.text)).toEqual(['Where to?', "I'm lost!", 'Help me?', 'Bye for now!']);
  });

  it('keep a number each, never used twice, within what a frame may carry', () => {
    const numbers = PHRASES.map((p) => p.n);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const n of numbers) expect(Number.isInteger(n) && n >= 1 && n <= PHRASE_NUMBER_MAX).toBe(true);
    // The first set is numbered 1 to 24 in order: a number keeps its phrase for good.
    expect(numbers).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('are found by number, and nothing else is a phrase', () => {
    expect(getPhrase(16)?.text).toBe('Arcade?');
    for (const n of [0, 25, -1, 1.5, '1', null, undefined]) expect(isPhrase(n), String(n)).toBe(false);
    expect(isPhrase(1)).toBe(true);
  });

  it('carry nothing about names, places or meeting anywhere else', () => {
    for (const p of PHRASES) expect(p.text).not.toMatch(/\b(name|age|old|where do you live|address|meet me|my nest|outside|school|phone|email)\b/i);
  });

  it('say one every three seconds per owl, each bubble for four', () => {
    expect(SAY_EVERY_MS).toBe(3000);
    expect(BUBBLE_MS).toBe(4000);
  });
});
