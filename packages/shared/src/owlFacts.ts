/**
 * Owl facts for the load screen (OP-129): one short line each, shown one at a time while the park
 * loads, after its first two seconds. Plain owl trivia, true of real owls; nothing a visitor has to
 * read to carry on.
 */
export const OWL_FACTS: readonly string[] = [
  'Owls can turn their heads about three quarters of the way around.',
  'A group of owls is called a parliament.',
  'Soft, fringed feathers let owls fly almost without a sound.',
  'Barn owls can catch a mouse in the dark just by listening.',
  "Owls can't move their eyes, so they turn their whole head to look.",
  'One snowy owl can eat over a thousand lemmings in a year.',
  'Burrowing owls live underground, often in burrows other animals dug.',
  'Some owls have one ear higher than the other, to tell where a sound comes from.',
  'A great horned owl’s “horns” are just tufts of feathers.',
  'Screech owls mostly trill and whinny instead of screeching.',
  'Owls swallow small prey whole, then cough up the bones and fur as a pellet.',
  'There are more than 200 kinds of owl.',
  'An owl’s eyes are so big they fill much of its head.',
  'Baby owls are called owlets.',
  'Snowy owls and burrowing owls hunt in the daytime too.',
  'Owls have three eyelids: one to blink, one to sleep, one to keep the eye clean.',
  'A barn owl’s heart-shaped face gathers sound like a dish.',
  'Owls live on every continent except Antarctica.',
  'Female owls are usually bigger than males.',
  'Snowy owls have feathers on their feet, like warm slippers.',
];

/** The fact shown `n` changes after the first, starting from `start` (any whole number), round the list. */
export function owlFact(start: number, n: number): string {
  const len = OWL_FACTS.length;
  return OWL_FACTS[(((Math.trunc(start) + n) % len) + len) % len]!;
}

/**
 * The party game's Owl Fact space (OP-314): a wrong twist of each fact above, line for line, so a fact
 * can be asked as true or false. Each twist is plainly untrue of real owls, and as short as its fact.
 */
export const OWL_FACT_TWISTS: readonly string[] = [
  'Owls can turn their heads all the way around, twice.',
  'A group of owls is called a herd.',
  'Owls flap so loudly you can hear them from far away.',
  'Barn owls can only find mice in bright sunlight.',
  'Owls roll their eyes around to look behind them.',
  'A snowy owl eats only one lemming a year.',
  'Burrowing owls live high up at the tops of tall trees.',
  'Every owl has its two ears at exactly the same height.',
  'A great horned owl’s “horns” are made of bone.',
  'Screech owls can only screech, and never trill.',
  'Owls chew their food for a long time, like cows.',
  'There are only two kinds of owl.',
  'An owl’s eyes are tiny, like a mouse’s.',
  'Baby owls are called puppies.',
  'Every owl sleeps all day and never hunts in daylight.',
  'Owls have no eyelids at all.',
  'A barn owl has a square face to keep the rain off.',
  'Owls live only in Antarctica.',
  'Male owls are always much bigger than females.',
  'Snowy owls have bare feet with no feathers.',
];

/** A true-or-false question: the words, and whether they are true. */
export interface OwlFactQuestion {
  text: string;
  truth: boolean;
}

/**
 * The `k`th Owl Fact question of a game whose questions start at `start`: the facts come round in
 * order, and whether each is asked true or as its twist is decided by the same numbers, so the room
 * server and a test always ask the same thing.
 */
export function owlFactQuestion(start: number, k: number): OwlFactQuestion {
  const len = OWL_FACTS.length;
  const i = (((Math.trunc(start) + Math.trunc(k)) % len) + len) % len;
  // About half and half: the fact's place and the question's turn, mixed.
  const truth = ((Math.imul(i + 1, 2654435761) ^ Math.imul(Math.trunc(k) + 7, 40503)) >>> 7) % 2 === 0;
  return { text: truth ? OWL_FACTS[i]! : OWL_FACT_TWISTS[i]!, truth };
}
