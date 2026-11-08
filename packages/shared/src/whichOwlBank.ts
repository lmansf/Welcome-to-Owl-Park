/**
 * Which owl are you (OP-076): every word, picture, point and colour the quiz uses, in one file so the
 * owner can retune it without touching the code. The rules for an edit: three answers to a card, a
 * picture a six-year-old can read, nothing anyone types, every answer worth 2 to one nature (and
 * sometimes 1 to a second), and the fairness test (whichOwl.test.ts) still passing: with random
 * answers, every nature has to win at least one run in ten. The bank can grow to twenty cards; the
 * game draws QUIZ_CARDS of them.
 *
 * Every string here is visitor-facing and the owner approves it.
 */
import type { SpeciesId } from './species';

export type Nature = 'gentle' | 'curious' | 'steady' | 'playful' | 'brave';

export interface NatureDef {
  id: Nature;
  /** The species the result draws: one the park already draws, so every result is a real owl. */
  species: SpeciesId;
  /** What the reveal calls the owl, big under it. */
  title: string;
  /** The Keeper's line at the reveal. */
  line: string;
  /** One true sentence about that owl, under its name. */
  fact: string;
}

/**
 * One nature per species the park draws. The great horned owl is the park's mascot and is no
 * result of its own: Brave draws the park's first owl (its art is the great horned owl's), called an
 * owl of the tree (OP-076, the owner's defaults of 2026-11-01).
 */
export const NATURES: readonly NatureDef[] = [
  { id: 'gentle', species: 'barn', title: 'Barn owl', line: 'You hear what others miss. You are a barn owl.', fact: 'Barn owls hunt by sound alone and can hear a mouse under snow.' },
  { id: 'curious', species: 'burrowing', title: 'Burrowing owl', line: 'You cannot leave a question alone. You are a burrowing owl.', fact: 'Burrowing owls live underground, often in burrows other animals dug.' },
  { id: 'steady', species: 'snowy', title: 'Snowy owl', line: 'Nothing hurries you, and nothing stops you. You are a snowy owl.', fact: 'Snowy owls have feathers on their feet, like warm slippers.' },
  { id: 'playful', species: 'screech', title: 'Screech owl', line: 'You are the surprise in every room. You are a screech owl.', fact: 'Screech owls mostly trill and whinny instead of screeching.' },
  { id: 'brave', species: 'great-horned', title: 'Owl of the tree', line: 'You go first so the others can follow. You are an owl of the tree.', fact: 'The owls of the tree were the first owls in the park, and they still keep watch from the top.' },
];

/** An answer: its picture (drawn as a large icon), the words under it, and the points it gives. */
export interface QuizAnswer {
  pic: string;
  label: string;
  /** 2 to its main nature, and 1 to a second if it has one. */
  points: Partial<Record<Nature, 1 | 2>>;
}

export interface QuizCard {
  /** Fixed for good, so an edit to the words never shifts anything else. */
  id: string;
  /** The Keeper's question, one short line. */
  ask: string;
  answers: readonly [QuizAnswer, QuizAnswer, QuizAnswer];
}

/** How many cards a run draws from the bank (the owner's default: eight). */
export const QUIZ_CARDS = 8;
/** Each nature is the main answer on at least this many of the drawn cards' answers. */
export const QUIZ_MIN_MAIN = 3;

export const WHICH_OWL_BANK: readonly QuizCard[] = [
  {
    id: 'q01',
    ask: 'A new owl lands on your branch. What do you do first?',
    answers: [
      { pic: '👋', label: 'Wave hello', points: { gentle: 2, brave: 1 } },
      { pic: '❓', label: 'Ask where it came from', points: { curious: 2 } },
      { pic: '😜', label: 'Make a funny face', points: { playful: 2 } },
    ],
  },
  {
    id: 'q02',
    ask: 'A storm is coming. Where are you?',
    answers: [
      { pic: '🛏️', label: 'Tucked in the hollow, warm', points: { steady: 2 } },
      { pic: '⛈️', label: 'On the highest branch, watching it come', points: { brave: 2, curious: 1 } },
      { pic: '🍃', label: 'Under a big leaf with a friend', points: { gentle: 2, playful: 1 } },
    ],
  },
  {
    id: 'q03',
    ask: 'You find a shiny thing in the leaves.',
    answers: [
      { pic: '🔍', label: 'Pick it up and look closely', points: { curious: 2 } },
      { pic: '🤲', label: 'Leave it for whoever lost it', points: { gentle: 2, steady: 1 } },
      { pic: '🙈', label: 'Hide it and see who finds it', points: { playful: 2 } },
    ],
  },
  {
    id: 'q04',
    ask: 'The moon is full and the park is quiet.',
    answers: [
      { pic: '👂', label: 'Sit and listen', points: { gentle: 2, steady: 1 } },
      { pic: '💨', label: 'Fly a lap around the tree', points: { brave: 2 } },
      { pic: '🎵', label: 'Hoot a song', points: { playful: 2 } },
    ],
  },
  {
    id: 'q05',
    ask: 'A friend is stuck on a high ledge.',
    answers: [
      { pic: '💪', label: 'Fly up and get them', points: { brave: 2 } },
      { pic: '📣', label: 'Call the others to help', points: { gentle: 2 } },
      { pic: '👣', label: 'Work out a path for them, step by step', points: { steady: 2, curious: 1 } },
    ],
  },
  {
    id: 'q06',
    ask: 'Which is the best snack?',
    answers: [
      { pic: '🍓', label: 'Berries, slowly', points: { steady: 2 } },
      { pic: '🌶️', label: 'Something you have never tried', points: { curious: 2, brave: 1 } },
      { pic: '🍽️', label: 'Whatever everyone else is having', points: { gentle: 2, playful: 1 } },
    ],
  },
  {
    id: 'q07',
    ask: 'A door in the tree you have never seen.',
    answers: [
      { pic: '🚪', label: 'Open it', points: { brave: 2, curious: 1 } },
      { pic: '✊', label: 'Knock first', points: { gentle: 2 } },
      { pic: '👀', label: 'Peek through the keyhole', points: { curious: 2, playful: 1 } },
    ],
  },
  {
    id: 'q08',
    ask: 'It is a long walk to the market.',
    answers: [
      { pic: '🐢', label: 'Fine, one step at a time', points: { steady: 2 } },
      { pic: '🏁', label: 'Race you there', points: { playful: 2, brave: 1 } },
      { pic: '🗺️', label: 'Take the long way and see what is on it', points: { curious: 2 } },
    ],
  },
  {
    id: 'q09',
    ask: 'Someone is sad on the bench.',
    answers: [
      { pic: '🤝', label: 'Sit next to them and say nothing', points: { gentle: 2 } },
      { pic: '😂', label: 'Tell a joke', points: { playful: 2 } },
      { pic: '🍂', label: 'Bring them a leaf', points: { steady: 2, gentle: 1 } },
    ],
  },
  {
    id: 'q10',
    ask: 'The arcade has a new game nobody has beaten.',
    answers: [
      { pic: '🎯', label: 'Try it until you win', points: { steady: 2, brave: 1 } },
      { pic: '🧐', label: 'Watch someone else first', points: { curious: 2 } },
      { pic: '🎮', label: 'Play it with a friend and laugh at losing', points: { playful: 2, gentle: 1 } },
    ],
  },
  {
    id: 'q11',
    ask: 'You are the first one awake.',
    answers: [
      { pic: '⏰', label: 'Wake everyone up', points: { playful: 2, brave: 1 } },
      { pic: '🌅', label: 'Let them sleep and watch the sunrise', points: { gentle: 2, steady: 1 } },
      { pic: '🧭', label: 'Explore while it is quiet', points: { curious: 2 } },
    ],
  },
  {
    id: 'q12',
    ask: 'What do you want your nest to be?',
    answers: [
      { pic: '🧸', label: 'Cosy and small', points: { gentle: 2 } },
      { pic: '🐚', label: 'Full of odd things you found', points: { curious: 2 } },
      { pic: '🏔️', label: 'Up high with a view', points: { brave: 2, steady: 1 } },
    ],
  },
];

/** The last card's colour sets: they colour the owl and never touch the nature. */
export type ColourSetId = 'natural' | 'dusk' | 'moss' | 'plum';
export interface ColourSet {
  id: ColourSetId;
  /** Read out to screen readers; the card itself shows a feather in each. */
  name: string;
  /** Null for the owl's own natural colours (its species' own). */
  colours: { body: string; belly: string; accent: string } | null;
}
export const COLOUR_SETS: readonly ColourSet[] = [
  { id: 'natural', name: 'Its own colours', colours: null },
  { id: 'dusk', name: 'Dusk', colours: { body: '#2F3E5C', belly: '#BFC9D6', accent: '#00E5FF' } },
  { id: 'moss', name: 'Moss', colours: { body: '#3E6B48', belly: '#F2E1C1', accent: '#81B29A' } },
  { id: 'plum', name: 'Plum', colours: { body: '#7A5C99', belly: '#E0D4F0', accent: '#FF2AA1' } },
];

/** Every other word the quiz shows. The Keeper is a voice only: never drawn, never named. */
export const WHICH_OWL_WORDS = {
  /** What a screen reader calls the quiz. */
  label: 'Which owl are you?',
  intro: ['Hello, little one. Before you join the tree, I want to know you.', 'I will ask a few things. There are no wrong answers.', 'Tap the picture that feels most like you.'],
  next: 'Next',
  skip: 'Skip',
  counter: (n: number, of: number) => `${n} of ${of}`,
  colours: 'Which do you like best?',
  /** Over the result's name. */
  youAre: 'You are',
  keep: 'Keep it',
  makeYours: 'Make it yours',
  again: 'Not me? Try again',
  /** The Menu's Settings tab, once the owl exists. */
  retake: 'Retake the quiz',
  retakeNote: 'A new kind and colours. What your owl wears stays on.',
} as const;
