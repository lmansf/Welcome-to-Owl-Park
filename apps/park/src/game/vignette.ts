/**
 * A soft shade in the corners of the view (the owner's ask, Nov 8: the map should not read as big
 * rectangles): the room seems to go on past the screen's edges instead of stopping in a box. Drawn by
 * the page over the game's canvas, under the HUD, so it costs the game no drawing at all (a veil drawn
 * by the game slowed the timed games in CI before, walkFloor.ts) and sits on the screen's corners at any
 * zoom. It is faint: at its darkest, in a corner's last pixel, the room still shows through, so it never
 * hides where an owl can walk or a hazard.
 */
export const VIGNETTE_ID = 'room-vignette';

/** The darkest the shade gets, top corners and bottom corners (the bottom ones sit over the floor). */
export const VIGNETTE_MAX = { top: 0.42, bottom: 0.3 } as const;

/** The shade as CSS backgrounds: one soft oval in each corner, fading to nothing well before the middle. */
export function vignetteCss(): string {
  const ink = (a: number) => `rgba(4, 8, 18, ${a})`;
  const corner = (at: string, a: number, size: string) => `radial-gradient(ellipse ${size} at ${at}, ${ink(a)} 0%, ${ink(a * 0.45)} 40%, ${ink(0)} 100%)`;
  return [
    corner('0% 0%', VIGNETTE_MAX.top, '42% 55%'),
    corner('100% 0%', VIGNETTE_MAX.top, '42% 55%'),
    corner('0% 100%', VIGNETTE_MAX.bottom, '34% 42%'),
    corner('100% 100%', VIGNETTE_MAX.bottom, '34% 42%'),
  ].join(', ');
}

/** Shows or takes away the shade over the game (`#game`); nothing where the page has no game. */
export function setVignette(on: boolean, doc: Document = document): void {
  const had = doc.getElementById(VIGNETTE_ID);
  if (!on) {
    had?.remove();
    return;
  }
  if (had) return;
  const game = doc.getElementById('game');
  if (!game) return;
  const el = doc.createElement('div');
  el.id = VIGNETTE_ID;
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = `position:absolute;inset:0;pointer-events:none;background:${vignetteCss()}`;
  game.appendChild(el);
}
