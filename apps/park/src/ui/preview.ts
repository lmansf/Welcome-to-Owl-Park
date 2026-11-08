/**
 * The early preview (Logan, 2026-11-01): tickets sell before the park fully opens, and the card the
 * turnstiles show before they sell a Day Ticket says so (the booth said it until OP-180). The
 * warning shows only while the gate takes tickets (the opening switch, OP-067) and before the full
 * opening, so it goes away on its own on December 1 with no deploy.
 */

/** The full opening: midnight at the start of December 1 in the park's time zone (Eastern, EST). */
export const FULL_OPENING_MS = Date.parse('2026-12-01T00:00:00-05:00');

/** Every word of the warning (for the owner's approval). */
export const PREVIEW_WORDS = {
  gate:
    "Early preview: Owl Park isn't fully open yet. You can come in now and look around, but some areas are still closed and things may change while we finish building. The full opening is December 1.",
} as const;

/** Whether the turnstiles' sale shows the early preview's warning: tickets are on sale and the full opening has not come. */
export function earlyPreview(gate: 'open' | 'ticket', now: number = Date.now()): boolean {
  return gate === 'ticket' && now < FULL_OPENING_MS;
}
