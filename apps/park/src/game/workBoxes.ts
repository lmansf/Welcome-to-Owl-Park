/**
 * The work boxes: the yellow outlines, each with its name and size ("Feather tag 160×110"), that the
 * games laid on the floor for where a piece of art would stand (the feather station, the bowling lane,
 * the Old Stump and its seats, the sealed hollow's doorway). They show only on a painter's or a keeper's
 * tab (`?paint=1` or `?keeper=1`), as the answers' picture slots do (showsArtBoxes). Every other visitor
 * saw them as a park not finished (the Nov 25 QA walk), and sees the park's own art in their place
 * (standIn.ts), or nothing where the game draws the thing itself.
 */
export function workBoxesShown(search: string = globalThis.location?.search ?? ''): boolean {
  // The same rule as ui/whichOwl.ts's showsArtBoxes, kept here so the game's layers need nothing of the page's.
  const q = new URLSearchParams(search);
  return q.get('paint') === '1' || q.get('keeper') === '1';
}
