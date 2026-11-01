/**
 * Which owl are you (OP-076): the quiz's rules, pure so the tests run them exactly as the page does.
 * The words, pictures and points live in whichOwlBank.ts. A run draws QUIZ_CARDS cards from the
 * bank (seeded, so a run can be replayed in a test, and a retake with a new seed draws a new set),
 * adds up each answer's points, and the nature with the most wins. A tie goes to the nature that
 * scored first in the run. The colour card never touches the nature, and the answers themselves are
 * kept nowhere: only the result (species and colours) becomes the owl's look.
 */
import { COLOUR_SETS, NATURES, WHICH_OWL_BANK, QUIZ_CARDS, QUIZ_MIN_MAIN, type ColourSetId, type Nature, type NatureDef, type QuizAnswer, type QuizCard } from './whichOwlBank';
import { getSpecies } from './species';
import type { OwlLook } from './protocol';

export * from './whichOwlBank';

/** A small seeded random number generator (mulberry32 over an FNV-1a hash of the seed). */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  let a = h;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The nature an answer gives 2 points to. */
export function mainNature(a: QuizAnswer): Nature {
  return (Object.keys(a.points) as Nature[]).find((n) => a.points[n] === 2)!;
}

/** Whether a set of cards lets every nature be a main answer at least QUIZ_MIN_MAIN times. */
export function coversEveryNature(cards: readonly QuizCard[]): boolean {
  const count = new Map<Nature, number>();
  for (const c of cards) for (const a of c.answers) count.set(mainNature(a), (count.get(mainNature(a)) ?? 0) + 1);
  return NATURES.every((n) => (count.get(n.id) ?? 0) >= QUIZ_MIN_MAIN);
}

/**
 * The cards for one run: QUIZ_CARDS of the bank, in a seeded order, drawn again until every nature
 * has its QUIZ_MIN_MAIN main answers. A bank that cannot cover them in 500 draws gets its first cards.
 */
export function drawCards(seed: string, bank: readonly QuizCard[] = WHICH_OWL_BANK, n = QUIZ_CARDS): QuizCard[] {
  const rand = seededRandom(seed);
  const take = Math.min(n, bank.length);
  for (let tries = 0; tries < 500; tries++) {
    const pool = [...bank];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    const cards = pool.slice(0, take);
    if (coversEveryNature(cards)) return cards;
  }
  return bank.slice(0, take);
}

/** The nature a run's answers point to: the most points, and on a tie the nature that scored first. */
export function natureOf(answers: readonly QuizAnswer[]): Nature {
  const score = new Map<Nature, number>();
  const first = new Map<Nature, number>();
  let order = 0;
  for (const a of answers) {
    // The main nature counts as scoring before the second one on the same answer.
    const gives = (Object.entries(a.points) as [Nature, number][]).sort((x, y) => y[1] - x[1]);
    for (const [n, p] of gives) {
      score.set(n, (score.get(n) ?? 0) + p);
      if (!first.has(n)) first.set(n, order++);
    }
  }
  let best: Nature = NATURES[0]!.id;
  let bestScore = -1;
  let bestFirst = Infinity;
  for (const { id } of NATURES) {
    const s = score.get(id) ?? 0;
    const f = first.get(id) ?? Infinity;
    if (s > bestScore || (s === bestScore && f < bestFirst)) [best, bestScore, bestFirst] = [id, s, f];
  }
  return best;
}

export function natureDef(id: Nature): NatureDef {
  return NATURES.find((n) => n.id === id) ?? NATURES[0]!;
}

/**
 * The look a result gives: the nature's species in the chosen colour set (its natural colours for
 * `natural`). Whatever the owl already wears and anything else on the look stays as it is.
 */
export function quizLook(base: OwlLook, nature: Nature, colours: ColourSetId): OwlLook {
  const species = natureDef(nature).species;
  const set = COLOUR_SETS.find((c) => c.id === colours)?.colours ?? getSpecies(species).natural;
  return { ...base, ...set, species };
}
