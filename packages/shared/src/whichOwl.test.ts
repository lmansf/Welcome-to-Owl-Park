import { describe, expect, it } from 'vitest';
import {
  COLOUR_SETS,
  NATURES,
  WHICH_OWL_BANK,
  QUIZ_CARDS,
  QUIZ_MIN_MAIN,
  WHICH_OWL_WORDS,
  coversEveryNature,
  drawCards,
  mainNature,
  natureOf,
  quizLook,
  seededRandom,
  type Nature,
} from './whichOwl';
import { SPECIES, isSpecies } from './species';
import { isHexColour } from './look';

describe('which owl are you: the bank (OP-076)', () => {
  it('has three answers to a card, each worth 2 to one nature and at most 1 to one other', () => {
    expect(WHICH_OWL_BANK.length).toBeGreaterThanOrEqual(QUIZ_CARDS);
    expect(WHICH_OWL_BANK.length).toBeLessThanOrEqual(20);
    expect(new Set(WHICH_OWL_BANK.map((c) => c.id)).size).toBe(WHICH_OWL_BANK.length);
    const natures = new Set(NATURES.map((n) => n.id));
    for (const card of WHICH_OWL_BANK) {
      expect(card.answers).toHaveLength(3);
      expect(card.ask.length).toBeLessThanOrEqual(60);
      for (const a of card.answers) {
        const pts = Object.entries(a.points);
        expect(pts.filter(([, p]) => p === 2)).toHaveLength(1);
        expect(pts.length).toBeLessThanOrEqual(2);
        for (const [n, p] of pts) {
          expect(natures.has(n as Nature)).toBe(true);
          expect([1, 2]).toContain(p);
        }
        expect(a.pic.length).toBeGreaterThan(0);
        expect(a.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('has one nature per species the park draws, and names no species the park does not have', () => {
    expect(NATURES.map((n) => n.species).sort()).toEqual(SPECIES.map((s) => s.id).sort());
    for (const n of NATURES) expect(isSpecies(n.species)).toBe(true);
    // The mascot's name is never a result's: Brave is an owl of the tree.
    for (const n of NATURES) expect(`${n.title} ${n.line}`.toLowerCase()).not.toContain('great horned');
  });

  it('colours the owl with well-formed colours, or the species own', () => {
    expect(COLOUR_SETS).toHaveLength(4);
    for (const c of COLOUR_SETS) if (c.colours) for (const v of Object.values(c.colours)) expect(isHexColour(v)).toBe(true);
  });

  it('asks nobody to type: the words hold no blank to fill', () => {
    expect(WHICH_OWL_WORDS.intro).toHaveLength(3);
    expect(WHICH_OWL_WORDS.counter(3, 8)).toBe('3 of 8');
  });
});

describe('which owl are you: the draw', () => {
  it('draws eight different cards that give every nature its main answers', () => {
    for (let i = 0; i < 300; i++) {
      const cards = drawCards(`owl-${i}`);
      expect(cards).toHaveLength(QUIZ_CARDS);
      expect(new Set(cards.map((c) => c.id)).size).toBe(QUIZ_CARDS);
      expect(coversEveryNature(cards)).toBe(true);
    }
  });

  it('draws the same cards for the same seed, and another set for a retake', () => {
    expect(drawCards('owl-a:1').map((c) => c.id)).toEqual(drawCards('owl-a:1').map((c) => c.id));
    const sets = new Set(Array.from({ length: 10 }, (_, i) => drawCards(`owl-a:${i}`).map((c) => c.id).join()));
    expect(sets.size).toBeGreaterThan(5);
  });

  it('falls back to the first cards when a bank cannot cover every nature', () => {
    const narrow = WHICH_OWL_BANK.filter((c) => c.answers.every((a) => mainNature(a) !== 'brave'));
    expect(drawCards('x', narrow).map((c) => c.id)).toEqual(narrow.slice(0, QUIZ_CARDS).map((c) => c.id));
    expect(QUIZ_MIN_MAIN).toBe(3);
  });
});

describe('which owl are you: scoring', () => {
  const [q1, q2] = [WHICH_OWL_BANK[0]!, WHICH_OWL_BANK[1]!];

  it('gives the most points the win', () => {
    // Wave hello (gentle 2, brave 1), then under a leaf with a friend (gentle 2, playful 1).
    expect(natureOf([q1.answers[0], q2.answers[2]])).toBe('gentle');
  });

  it('breaks a tie for the nature that scored first in the run', () => {
    // Make a funny face (playful 2), then tucked in the hollow (steady 2): playful came first.
    expect(natureOf([q1.answers[2], q2.answers[0]])).toBe('playful');
    expect(natureOf([q2.answers[0], q1.answers[2]])).toBe('steady');
    // On one answer, the main nature counts as scoring before the second.
    expect(natureOf([{ pic: '', label: '', points: { brave: 1, curious: 2 } }, { pic: '', label: '', points: { brave: 1 } }])).toBe('curious');
  });

  it('never leaves a nature out: 10,000 random runs, each nature wins at least one in ten', () => {
    const rand = seededRandom('fairness');
    const wins = new Map<Nature, number>();
    const RUNS = 10_000;
    for (let i = 0; i < RUNS; i++) {
      const answers = drawCards(`run-${i}`).map((c) => c.answers[Math.floor(rand() * 3)]!);
      const n = natureOf(answers);
      wins.set(n, (wins.get(n) ?? 0) + 1);
    }
    const share = Object.fromEntries(NATURES.map((n) => [n.id, (wins.get(n.id) ?? 0) / RUNS]));
    // The shares, for the owner's tuning (printed in the test output).
    console.info('which owl: share of random runs per nature', share);
    for (const n of NATURES) expect(share[n.id]).toBeGreaterThanOrEqual(0.1);
  });
});

describe('which owl are you: the result', () => {
  const base = { body: '#111111', belly: '#222222', accent: '#333333', wear: { head: 'acorn-cap~0' } };

  it('gives the species in the chosen colours and keeps what the owl wears', () => {
    expect(quizLook(base, 'steady', 'moss')).toEqual({ body: '#3E6B48', belly: '#F2E1C1', accent: '#81B29A', species: 'snowy', wear: { head: 'acorn-cap~0' } });
  });

  it('gives the species its own colours for the natural set', () => {
    const look = quizLook(base, 'gentle', 'natural');
    expect(look.species).toBe('barn');
    expect(look.body).toBe(SPECIES.find((s) => s.id === 'barn')!.natural.body);
  });
});
