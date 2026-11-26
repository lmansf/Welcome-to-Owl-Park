/** Where feather tag's Start or Join button stands (OP-466, tagLayer.ts). */

/** The gap kept between an activity card in the top-right corner and the button under it (CSS px). */
export const TAG_BUTTON_GAP = 8;

/**
 * Where the button's top stands (CSS px in the HUD), given the activity cards' box in the same corner
 * (`.cards`: its top and height, as laid out in the HUD), or null for its own place in the CSS when no
 * card shows there.
 */
export function tagButtonTop(cards: { top: number; height: number } | null): number | null {
  if (!cards || cards.height <= 0) return null;
  return Math.round(cards.top + cards.height + TAG_BUTTON_GAP);
}
