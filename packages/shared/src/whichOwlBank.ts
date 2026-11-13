/**
 * Which owl are you (OP-076; rebuilt in OP-326 to OP-331): every word, picture slot, point and colour
 * the quiz uses, in one file so the owner can retune it without touching the code.
 *
 * The shape of a run (OP-330): a quick either/or to open, six cards from the middle of the bank, a
 * quick either/or to close, then the colour card and the reveal. The answers come in a new order
 * each run, so no place on the screen is the "right" one.
 *
 * The writing bar (OP-329), for every string here:
 * - Owl life, not people life (OP-331): nests, burrows, perches, hooting, waiting, listening. No
 *   markets, benches, doors or snacks owls never eat.
 * - Every owl choice rests on a real habit in docs/OWL-FACTS.md, and every fact line is a checked
 *   fact with a named source there, never park story (OP-328).
 * - Words a ten-year-old reads easily, US spelling, friendly and plain. No pet names, nothing about
 *   knowing or watching the player, every player spoken to the same way. Prey may be named, never hurt.
 * - Answers are short, and every answer is one a player would be glad to pick (none mean or silly).
 * - No emojis anywhere (OP-326): an answer's picture is an art key, drawn as a sized box until an
 *   artist paints it (docs/QUIZ-ART.md lists every key).
 *
 * The rules for an edit: 2 to 4 answers to a card (the openers and closers have 2), nothing anyone
 * types, every answer worth 2 to one owl and 1 to at most two others, and the fairness test
 * (whichOwl.test.ts) still passing: with random answers, every owl has to win at least one run in ten.
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
  /** The line over the owl at the reveal. */
  line: string;
  /** Two short sentences: what the player's choices share with this owl's real ways. */
  about: string;
  /** One true sentence about that owl, from docs/OWL-FACTS.md. */
  fact: string;
  /** Something to try in the park as this owl. */
  enjoy: string;
}

/**
 * One nature per species the park draws. The great horned owl is the park's mascot, so its result is
 * called an owl of the tree (OP-076, the owner's defaults of 2026-11-01; the name kept in OP-328). Its
 * facts are the great horned owl's, and its about line says so.
 */
export const NATURES: readonly NatureDef[] = [
  {
    id: 'gentle',
    species: 'barn',
    title: 'Barn owl',
    line: 'You notice the small sounds others miss. You are a barn owl.',
    about: 'You like to listen before you act, and you move so softly that friends hardly hear you coming. Barn owls fly almost without a sound, and their heart-shaped faces send sound toward their ears.',
    fact: 'Barn owls can catch a mouse in total darkness using their ears alone. One ear sits a little higher than the other.',
    enjoy: 'In the park, glide from perch to perch and see how softly you can land.',
  },
  {
    id: 'curious',
    species: 'burrowing',
    title: 'Burrowing owl',
    line: 'You always want a closer look. You are a burrowing owl.',
    about: 'You like to go and see for yourself, day or night. Burrowing owls do too: they hunt at all hours, and they bob up and down when something new catches their eye.',
    fact: 'Burrowing owls live in burrows in the ground. In Florida they usually dig their own.',
    enjoy: 'In the park, check every leaf pile and every corner you have not tried yet.',
  },
  {
    id: 'steady',
    species: 'snowy',
    title: 'Snowy owl',
    line: 'You stay calm and wait for the right moment. You are a snowy owl.',
    about: 'You are patient, and you keep going when others give up. Snowy owls can sit in one spot for hours, and in the long Arctic summer they hunt in bright daylight.',
    fact: 'Snowy owls have feathers on their feet, like warm slippers.',
    enjoy: 'In the park, take your time on the trickiest courses. Patience wins them.',
  },
  {
    id: 'playful',
    species: 'screech',
    title: 'Screech owl',
    line: 'You love a good surprise. You are a screech owl.',
    about: 'You are small but full of fun, and you are great at hiding in plain sight. Screech owls are no bigger than a pint glass, and their camouflage lets them vanish into a tree.',
    fact: 'Screech owls mostly trill and whinny instead of screeching.',
    enjoy: 'In the park, find a good hiding spot and surprise your friends.',
  },
  {
    id: 'brave',
    species: 'great-horned',
    title: 'Owl of the tree',
    line: 'You go first so the others can follow. You are an owl of the tree.',
    about: 'You are bold, and you can feel at home almost anywhere. Owls of the tree are great horned owls: they live everywhere from deserts to cities, and they hoot to guard their home.',
    fact: 'Great horned owls often move into old nests that hawks or crows built.',
    enjoy: 'In the park, ride the updrafts up to the highest perch you can find.',
  },
];

/** An answer: its picture (an art key, drawn as a sized box until it is painted), its words, and its points. */
export interface QuizAnswer {
  /** The art key for the answer's picture; docs/QUIZ-ART.md lists them all. */
  pic: string;
  label: string;
  /** 2 to its main owl, and 1 to at most two others. */
  points: Partial<Record<Nature, 1 | 2>>;
}

/** Where a card goes in a run: the quick either/or that opens it, the middle, or the either/or that closes it. */
export type QuizSlot = 'open' | 'middle' | 'close';

export interface QuizCard {
  /** Fixed for good, so an edit to the words never shifts anything else. */
  id: string;
  slot: QuizSlot;
  /** The question, one short line. */
  ask: string;
  answers: readonly QuizAnswer[];
}

/** How many cards a run asks (the owner's default: eight): one opener, the middle ones, one closer. */
export const QUIZ_CARDS = 8;
/** How many middle cards a run draws. */
export const QUIZ_MIDDLE = QUIZ_CARDS - 2;
/** Each owl is the main answer on at least this many of the drawn cards' answers. */
export const QUIZ_MIN_MAIN = 3;
/** The size, in pixels, an answer's painted picture is made at (it is shown smaller on a phone). */
export const QUIZ_ART_SIZE = 96;

const a = (pic: string, label: string, points: QuizAnswer['points']): QuizAnswer => ({ pic, label, points });

export const WHICH_OWL_BANK: readonly QuizCard[] = [
  // ---- openers: a quick either/or ----
  { id: 'o01', slot: 'open', ask: 'Dusk or dawn?', answers: [a('dusk', 'Dusk', { gentle: 2, brave: 1 }), a('dawn', 'Dawn', { curious: 2, steady: 1 })] },
  { id: 'o02', slot: 'open', ask: 'The moon or the sun?', answers: [a('moon', 'The moon', { playful: 2, gentle: 1 }), a('sun', 'The sun', { steady: 2, curious: 1 })] },
  { id: 'o03', slot: 'open', ask: 'Treetops or the ground?', answers: [a('treetops', 'Treetops', { brave: 2, playful: 1 }), a('ground', 'The ground', { curious: 2, steady: 1 })] },

  // ---- the middle ----
  {
    id: 'm01',
    slot: 'middle',
    ask: 'Where would you make your nest?',
    answers: [
      a('nest-old', 'In an old hawk nest, high up', { brave: 2 }),
      a('nest-burrow', 'In a burrow in the ground', { curious: 2 }),
      a('nest-hollow', 'In a hollow in an old tree', { playful: 2, gentle: 1 }),
      a('nest-rise', 'On the ground, on a little rise', { steady: 2 }),
    ],
  },
  {
    id: 'm02',
    slot: 'middle',
    ask: 'Night falls. What do you do first?',
    answers: [
      a('night-listen', 'Listen for the smallest sounds', { gentle: 2, steady: 1 }),
      a('night-hoot', 'Hoot so everyone knows it is your tree', { brave: 2 }),
      a('night-trill', 'Trill a little song', { playful: 2 }),
    ],
  },
  {
    id: 'm03',
    slot: 'middle',
    ask: 'Something moves in the grass.',
    answers: [
      a('grass-wait', 'Wait very still and watch', { steady: 2, gentle: 1 }),
      a('grass-run', 'Run over for a closer look', { curious: 2, brave: 1 }),
      a('grass-swoop', 'Swoop down from your perch', { brave: 2 }),
    ],
  },
  {
    id: 'm04',
    slot: 'middle',
    ask: 'A stranger comes close to your home.',
    answers: [
      a('stranger-clap', 'Clap your beak and hiss', { brave: 2 }),
      a('stranger-bob', 'Bob up and down for a good look', { curious: 2, playful: 1 }),
      a('stranger-hide', 'Tuck into a nook and stay hidden', { playful: 2, steady: 1 }),
    ],
  },
  {
    id: 'm05',
    slot: 'middle',
    ask: 'What sounds best for dinner tonight?',
    answers: [
      a('dinner-beetles', 'Crunchy beetles', { curious: 2, playful: 1 }),
      a('dinner-mouse', 'A mouse in the field', { gentle: 2, brave: 1 }),
      a('dinner-lemming', 'A lemming out on the snow', { steady: 2 }),
    ],
  },
  {
    id: 'm06',
    slot: 'middle',
    ask: 'Winter is coming. What is your plan?',
    answers: [
      a('winter-south', 'Fly south to somewhere new', { steady: 2, curious: 1 }),
      a('winter-guard', 'Stay and guard your tree', { brave: 2, steady: 1 }),
      a('winter-box', 'Find a cozy nest box', { playful: 2, gentle: 1 }),
    ],
  },
  {
    id: 'm07',
    slot: 'middle',
    ask: 'How do you like to fly?',
    answers: [
      a('fly-soft', 'So softly that no one hears', { gentle: 2 }),
      a('fly-high', 'Straight up to the highest branch', { brave: 2 }),
      a('fly-sneak', 'Perch to perch, out of sight', { playful: 2 }),
      a('fly-low', 'Low over the ground, then a hop', { curious: 2 }),
    ],
  },
  {
    id: 'm08',
    slot: 'middle',
    ask: 'It is too dark to see a thing.',
    answers: [
      a('dark-sound', 'Follow the sounds', { gentle: 2, steady: 1 }),
      a('dark-moon', 'Wait for the moon to rise', { steady: 2 }),
      a('dark-turn', 'Turn your head almost all the way round', { curious: 2, playful: 1 }),
    ],
  },
  {
    id: 'm09',
    slot: 'middle',
    ask: 'Your friends are looking for you. Where are you?',
    answers: [
      a('hide-branch', 'Hiding in plain sight on a branch', { playful: 2, gentle: 1 }),
      a('hide-burrow', 'Down in your burrow', { curious: 2 }),
      a('hide-hill', 'Sitting still on a snowy hill', { steady: 2 }),
      a('hide-top', 'At the very top of the tree', { brave: 2 }),
    ],
  },
  {
    id: 'm10',
    slot: 'middle',
    ask: 'How would you fix up your home?',
    answers: [
      a('home-grass', 'Line it with grass and feathers', { curious: 2, gentle: 1 }),
      a('home-view', 'Keep it simple, with a great view', { steady: 2 }),
      a('home-asis', 'Move right in, just as it is', { brave: 2, playful: 1 }),
    ],
  },
  {
    id: 'm11',
    slot: 'middle',
    ask: 'A thunderstorm rolls in.',
    answers: [
      a('storm-hollow', 'Tuck into a hollow and listen', { gentle: 2, steady: 1 }),
      a('storm-burrow', 'Pop down into your burrow', { curious: 2 }),
      a('storm-branch', 'Hold on tight and ride it out', { brave: 2, steady: 1 }),
    ],
  },
  {
    id: 'm12',
    slot: 'middle',
    ask: 'The sun is up and very bright.',
    answers: [
      a('bright-hunt', 'Keep going, daytime suits you', { steady: 2, curious: 1 }),
      a('bright-doze', 'Doze in a nook in the tree', { playful: 2, gentle: 1 }),
      a('bright-rest', 'Rest somewhere hidden and quiet', { gentle: 2 }),
    ],
  },
  {
    id: 'm13',
    slot: 'middle',
    ask: 'Which sound is most like you?',
    answers: [
      a('sound-hoot', 'A low hoo-hoo-hoo', { brave: 2 }),
      a('sound-whinny', 'A shaky whinny, like a tiny horse', { playful: 2 }),
      a('sound-screech', 'A long, raspy screech', { gentle: 2, curious: 1 }),
    ],
  },
  {
    id: 'm14',
    slot: 'middle',
    ask: 'Your new neighbors are very noisy.',
    answers: [
      a('noisy-hoot', 'Hoot back so they know you are here', { brave: 2, playful: 1 }),
      a('noisy-leave', 'Fly off quietly to a calmer spot', { gentle: 2, steady: 1 }),
      a('noisy-pop', 'Pop out and surprise them', { playful: 2 }),
    ],
  },
  {
    id: 'm15',
    slot: 'middle',
    ask: 'Something shiny is lying in the field.',
    answers: [
      a('shiny-walk', 'Walk right up and check it out', { curious: 2 }),
      a('shiny-watch', 'Watch it from far away first', { steady: 2, gentle: 1 }),
      a('shiny-grab', 'Grab it and fly to your perch', { brave: 2, playful: 1 }),
    ],
  },
  {
    id: 'm16',
    slot: 'middle',
    ask: 'A long trip is ahead of you.',
    answers: [
      a('trip-steady', 'Keep a steady pace, however far', { steady: 2 }),
      a('trip-friends', 'Go together with your friends', { gentle: 2, playful: 1 }),
      a('trip-explore', 'Stop to explore every field', { curious: 2 }),
      a('trip-lead', 'Lead the way', { brave: 2, steady: 1 }),
    ],
  },
  {
    id: 'm17',
    slot: 'middle',
    ask: 'A young owl is learning to fly.',
    answers: [
      a('young-show', 'Jump first and show them how', { brave: 2 }),
      a('young-cheer', 'Cheer them on from a branch', { playful: 2, gentle: 1 }),
      a('young-watch', 'Stay close and keep watch', { gentle: 2, steady: 1 }),
    ],
  },
  {
    id: 'm18',
    slot: 'middle',
    ask: 'Where is your favorite place to perch?',
    answers: [
      a('perch-top', 'The top of the tallest tree', { brave: 2 }),
      a('perch-mound', 'The little mound by your burrow', { curious: 2, steady: 1 }),
      a('perch-trunk', 'Close to the trunk, where you blend in', { playful: 2 }),
      a('perch-beam', 'A beam high up in an old barn', { gentle: 2 }),
    ],
  },
  {
    id: 'm19',
    slot: 'middle',
    ask: 'A quiet afternoon. What are you doing?',
    answers: [
      a('quiet-watch', 'Watching the whole field', { steady: 2 }),
      a('quiet-nap', 'Napping against the tree trunk', { playful: 2, gentle: 1 }),
      a('quiet-look', 'Standing by your burrow, looking around', { curious: 2 }),
    ],
  },
  {
    id: 'm20',
    slot: 'middle',
    ask: 'What are you best at?',
    answers: [
      a('best-listen', 'Listening', { gentle: 2 }),
      a('best-notice', 'Noticing things', { curious: 2, playful: 1 }),
      a('best-calm', 'Staying calm', { steady: 2 }),
      a('best-first', 'Going first', { brave: 2 }),
    ],
  },
  {
    id: 'm21',
    slot: 'middle',
    ask: 'Your first night in a new forest.',
    answers: [
      a('forest-high', 'Find a high branch and look out', { brave: 2, steady: 1 }),
      a('forest-sounds', 'Learn every sound it makes', { gentle: 2 }),
      a('forest-floor', 'Explore the forest floor', { curious: 2 }),
      a('forest-hide', 'Hide and see who comes by', { playful: 2 }),
    ],
  },
  {
    id: 'm22',
    slot: 'middle',
    ask: 'Snow covers everything.',
    answers: [
      a('snow-home', 'Great, snow feels like home', { steady: 2 }),
      a('snow-hollow', 'Snuggle into a warm hollow', { playful: 2, gentle: 1 }),
      a('snow-keep', 'Keep hunting, snow cannot stop you', { brave: 2 }),
    ],
  },

  // ---- closers: a quick either/or ----
  { id: 'c01', slot: 'close', ask: 'Hoot or trill?', answers: [a('hoot', 'Hoot', { brave: 2, steady: 1 }), a('trill', 'Trill', { playful: 2, gentle: 1 })] },
  { id: 'c02', slot: 'close', ask: 'Fast or quiet?', answers: [a('fast', 'Fast', { brave: 2, curious: 1 }), a('quiet', 'Quiet', { gentle: 2, steady: 1 })] },
  { id: 'c03', slot: 'close', ask: 'Snow or sand?', answers: [a('snow', 'Snow', { steady: 2, gentle: 1 }), a('sand', 'Sand', { curious: 2, playful: 1 })] },
];

/** The last card's color sets: they color the owl and never touch the result. */
export type ColourSetId = 'natural' | 'dusk' | 'moss' | 'plum';
export interface ColourSet {
  id: ColourSetId;
  /** Read out to screen readers; the card itself shows a feather in each. */
  name: string;
  /** Null for the owl's own natural colors (its species' own). */
  colours: { body: string; belly: string; accent: string } | null;
}
export const COLOUR_SETS: readonly ColourSet[] = [
  { id: 'natural', name: 'Its own colors', colours: null },
  { id: 'dusk', name: 'Dusk', colours: { body: '#2F3E5C', belly: '#BFC9D6', accent: '#00E5FF' } },
  { id: 'moss', name: 'Moss', colours: { body: '#3E6B48', belly: '#F2E1C1', accent: '#81B29A' } },
  { id: 'plum', name: 'Plum', colours: { body: '#7A5C99', belly: '#E0D4F0', accent: '#FF2AA1' } },
];

/** Every other word the quiz shows (OP-327: a plain, friendly welcome, no pet names). */
export const WHICH_OWL_WORDS = {
  /** What a screen reader calls the quiz. */
  label: 'Which owl are you?',
  /** One screen of welcome (OP-367: the audit counted three Next screens before the first question). */
  intro: ['Welcome to Owl Park! Every owl here is a little different. Answer a few quick questions to find out which owl you are. There are no wrong answers.'],
  next: 'Start',
  skip: 'Skip',
  counter: (n: number, of: number) => `${n} of ${of}`,
  colours: 'Which colors do you like best?',
  /** The short pause before the reveal (OP-330). */
  thinking: 'Let us see which owl you are...',
  /** Over the result's name. */
  youAre: 'You are',
  keep: 'Keep it',
  /**
   * A first run's one primary button at the reveal and in the builder after it (OP-367): straight into
   * the park as this owl, with no separate Play step on the home screen. A retake keeps Keep it.
   */
  play: 'Play as this owl',
  makeYours: 'Make it yours',
  again: 'Not me? Try again',
  /** The Menu's Settings tab, once the owl exists. */
  retake: 'Retake the quiz',
  retakeNote: 'A new kind of owl and new colors. What your owl wears stays on.',
} as const;
