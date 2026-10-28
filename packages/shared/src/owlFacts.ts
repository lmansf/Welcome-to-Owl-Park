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
