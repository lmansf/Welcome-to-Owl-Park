import { describe, expect, it } from 'vitest';
import {
  COLOUR_SETS,
  NATURES,
  WHICH_OWL_BANK,
  QUIZ_CARDS,
  QUIZ_MIDDLE,
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

/** Every visitor-facing string the quiz holds. */
function quizWords(): string[] {
  const out: string[] = [];
  for (const n of NATURES) out.push(n.title, n.line, n.about, n.fact, n.enjoy);
  for (const c of WHICH_OWL_BANK) {
    out.push(c.ask);
    for (const a of c.answers) out.push(a.label);
  }
  for (const c of COLOUR_SETS) out.push(c.name);
  for (const v of Object.values(WHICH_OWL_WORDS)) {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) out.push(...v);
  }
  return out;
}

describe('which owl are you: the bank (OP-076, OP-330, OP-331)', () => {
  it('has 2 to 4 answers to a card, each worth 2 to one nature and 1 to at most two others', () => {
    expect(WHICH_OWL_BANK.length).toBeLessThanOrEqual(30);
    expect(new Set(WHICH_OWL_BANK.map((c) => c.id)).size).toBe(WHICH_OWL_BANK.length);
    const natures = new Set(NATURES.map((n) => n.id));
    for (const card of WHICH_OWL_BANK) {
      expect(card.answers.length).toBeGreaterThanOrEqual(2);
      expect(card.answers.length).toBeLessThanOrEqual(4);
      expect(card.ask.length).toBeLessThanOrEqual(60);
      for (const a of card.answers) {
        const pts = Object.entries(a.points);
        expect(pts.filter(([, p]) => p === 2)).toHaveLength(1);
        expect(pts.length).toBeLessThanOrEqual(3);
        for (const [n, p] of pts) {
          expect(natures.has(n as Nature)).toBe(true);
          expect([1, 2]).toContain(p);
        }
        expect(a.label.length).toBeGreaterThan(0);
        expect(a.label.length).toBeLessThanOrEqual(40);
      }
    }
  });

  it('opens and closes on a quick either/or, with enough middle cards to draw from', () => {
    const slot = (s: string) => WHICH_OWL_BANK.filter((c) => c.slot === s);
    expect(slot('open').length).toBeGreaterThanOrEqual(2);
    expect(slot('close').length).toBeGreaterThanOrEqual(2);
    for (const c of [...slot('open'), ...slot('close')]) expect(c.answers).toHaveLength(2);
    expect(slot('middle').length).toBeGreaterThanOrEqual(QUIZ_MIDDLE * 3);
    expect(slot('open').length + slot('middle').length + slot('close').length).toBe(WHICH_OWL_BANK.length);
  });

  it('gives every answer its own picture slot: an art key, never an emoji (OP-326)', () => {
    const keys = WHICH_OWL_BANK.flatMap((c) => c.answers.map((a) => a.pic));
    for (const k of keys) expect(k).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('shows no emoji anywhere in the quiz (OP-326)', () => {
    for (const w of quizWords()) expect(w, w).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('opens with a plain welcome: no pet names and no lines about knowing the player (OP-327)', () => {
    // One welcome screen before the first question (OP-367), and a first run ends on Play as this owl.
    expect(WHICH_OWL_WORDS.intro).toHaveLength(1);
    expect(WHICH_OWL_WORDS.intro[0]).toMatch(/^Welcome to Owl Park!/);
    expect(WHICH_OWL_WORDS.play).toBe('Play as this owl');
    for (const w of quizWords()) {
      expect(w.toLowerCase(), w).not.toMatch(/little one|grown.?ups?|i want to know you|i know you/);
      // US spelling in every visible word.
      expect(w.toLowerCase(), w).not.toMatch(/colour|favourite|cosy|neighbour/);
    }
  });

  it('keeps to owl life: no people places or things in the questions or answers (OP-331)', () => {
    for (const c of WHICH_OWL_BANK) {
      for (const w of [c.ask, ...c.answers.map((a) => a.label)]) expect(w.toLowerCase(), w).not.toMatch(/\b(market|bench|arcade|door|keyhole|snack|joke|wave|race you)\b/);
    }
  });

  it('has one nature per species the park draws, each with its line, about, fact and something to try', () => {
    expect(NATURES.map((n) => n.species).sort()).toEqual(SPECIES.map((s) => s.id).sort());
    for (const n of NATURES) {
      expect(isSpecies(n.species)).toBe(true);
      for (const w of [n.line, n.about, n.fact, n.enjoy]) expect(w.length).toBeGreaterThan(10);
    }
    // The mascot's name is never a result's name: Brave is an owl of the tree.
    for (const n of NATURES) expect(`${n.title} ${n.line}`.toLowerCase()).not.toContain('great horned');
    expect(NATURES.find((n) => n.id === 'brave')!.title).toBe('Owl of the tree');
    // A fact is about the owl, never the park's own story (OP-328).
    for (const n of NATURES) expect(n.fact.toLowerCase()).not.toMatch(/park|tree keeper|keep watch from the top/);
  });

  it('colors the owl with well-formed colors, or the species own', () => {
    expect(COLOUR_SETS).toHaveLength(4);
    for (const c of COLOUR_SETS) if (c.colours) for (const v of Object.values(c.colours)) expect(isHexColour(v)).toBe(true);
  });

  it('asks nobody to type: the words hold no blank to fill', () => {
    expect(WHICH_OWL_WORDS.counter(3, 8)).toBe('3 of 8');
  });
});

describe('which owl are you: the draw', () => {
  it('asks an opener, six middle cards and a closer that give every nature its main answers', () => {
    for (let i = 0; i < 300; i++) {
      const cards = drawCards(`owl-${i}`);
      expect(cards).toHaveLength(QUIZ_CARDS);
      expect(new Set(cards.map((c) => c.id)).size).toBe(QUIZ_CARDS);
      expect(cards.map((c) => c.slot)).toEqual(['open', ...Array<string>(QUIZ_MIDDLE).fill('middle'), 'close']);
      expect(coversEveryNature(cards)).toBe(true);
    }
  });

  it('draws the same cards for the same seed, and another set for a retake', () => {
    const order = (seed: string) => drawCards(seed).map((c) => `${c.id}:${c.answers.map((a) => a.pic).join('/')}`);
    expect(order('owl-a:1')).toEqual(order('owl-a:1'));
    const sets = new Set(Array.from({ length: 10 }, (_, i) => drawCards(`owl-a:${i}`).map((c) => c.id).join()));
    expect(sets.size).toBeGreaterThan(5);
  });

  it('puts the answers in a new order each run, and never changes the bank', () => {
    const before = WHICH_OWL_BANK.map((c) => c.answers.map((a) => a.pic).join()).join('|');
    const firstPlace = new Map<string, Set<string>>();
    for (let i = 0; i < 200; i++) {
      for (const c of drawCards(`order-${i}`)) {
        const s = firstPlace.get(c.id) ?? new Set<string>();
        s.add(c.answers[0]!.pic);
        firstPlace.set(c.id, s);
        expect(c.answers.map((a) => a.pic).sort()).toEqual(WHICH_OWL_BANK.find((b) => b.id === c.id)!.answers.map((a) => a.pic).sort());
      }
    }
    for (const [, seen] of firstPlace) expect(seen.size).toBeGreaterThan(1);
    expect(WHICH_OWL_BANK.map((c) => c.answers.map((a) => a.pic).join()).join('|')).toBe(before);
  });

  it('falls back to the first cards when a bank cannot cover every nature', () => {
    const narrow = WHICH_OWL_BANK.filter((c) => c.answers.every((a) => mainNature(a) !== 'brave'));
    const want = [narrow.find((c) => c.slot === 'open'), ...narrow.filter((c) => c.slot === 'middle').slice(0, QUIZ_MIDDLE), narrow.find((c) => c.slot === 'close')].filter(Boolean).map((c) => c!.id);
    expect(drawCards('x', narrow).map((c) => c.id)).toEqual(want);
    expect(QUIZ_MIN_MAIN).toBe(3);
  });
});

describe('which owl are you: scoring', () => {
  const card = (id: string) => WHICH_OWL_BANK.find((c) => c.id === id)!;
  const answer = (id: string, pic: string) => card(id).answers.find((x) => x.pic === pic)!;

  it('gives the most points the win', () => {
    // Dusk (gentle 2, brave 1), then follow the sounds (gentle 2, steady 1).
    expect(natureOf([answer('o01', 'dusk'), answer('m08', 'dark-sound')])).toBe('gentle');
  });

  it('breaks a tie for the nature that scored first in the run', () => {
    // Trill a little song (playful 2), then keep it simple (steady 2): playful came first.
    expect(natureOf([answer('m02', 'night-trill'), answer('m10', 'home-view')])).toBe('playful');
    expect(natureOf([answer('m10', 'home-view'), answer('m02', 'night-trill')])).toBe('steady');
    // On one answer, the main nature counts as scoring before the second.
    expect(natureOf([{ pic: '', label: '', points: { brave: 1, curious: 2 } }, { pic: '', label: '', points: { brave: 1 } }])).toBe('curious');
  });

  it('never leaves a nature out: 10,000 random runs, each nature wins at least one in ten', () => {
    const rand = seededRandom('fairness');
    const wins = new Map<Nature, number>();
    const RUNS = 10_000;
    for (let i = 0; i < RUNS; i++) {
      const answers = drawCards(`run-${i}`).map((c) => c.answers[Math.floor(rand() * c.answers.length)]!);
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
