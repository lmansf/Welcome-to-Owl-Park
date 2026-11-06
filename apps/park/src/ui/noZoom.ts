/**
 * The page never stays zoomed on a phone (OP-104, the owner's report of Nov 6: "once the zoom in
 * happens it won't zoom back out"). The viewport tag and the page's touch-action keep most zooms
 * off, but Safari on an iPhone still lets a pinch zoom the page, whatever the viewport tag says, and
 * nothing in the park pinches back out. So Safari's own pinch (its gesture events) is turned down
 * at the page, and if the page has zoomed anyway, the viewport tag is written again as the gesture
 * ends, which sets Safari's zoom back to the page's own size.
 */

/** A zoom this far past 1 (the visual viewport's scale) is a zoom to undo; below it, rounding. */
export const ZOOM_SLACK = 0.01;

/** Whether the page is zoomed in (the visual viewport's scale), so it should be put back. */
export function zoomedIn(scale: number | undefined): boolean {
  return scale !== undefined && Number.isFinite(scale) && scale > 1 + ZOOM_SLACK;
}

interface ZoomDoc {
  addEventListener(type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  querySelector(sel: string): { getAttribute(n: string): string | null; setAttribute(n: string, v: string): void } | null;
}
interface ZoomWin {
  visualViewport?: { scale: number; addEventListener(type: string, fn: () => void): void } | null;
}

/**
 * Turn down Safari's pinch on the page, and put the page back to its own size whenever it is found
 * zoomed (as a gesture ends, or the visual viewport changes). Returns how many times it has put the
 * page back, for the tests.
 */
export function guardZoom(doc: ZoomDoc, win: ZoomWin): () => number {
  let resets = 0;
  const stop = (e: Event) => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange']) doc.addEventListener(type, stop, { passive: false });
  const unzoom = () => {
    if (!zoomedIn(win.visualViewport?.scale)) return;
    const tag = doc.querySelector('meta[name="viewport"]');
    const content = tag?.getAttribute('content');
    if (!tag || !content) return;
    // Writing the tag again (a changed copy, then its own) makes Safari apply its maximum-scale anew.
    tag.setAttribute('content', `${content}, minimum-scale=1`);
    tag.setAttribute('content', content);
    resets += 1;
  };
  doc.addEventListener('gestureend', unzoom);
  doc.addEventListener('touchend', unzoom, { passive: true });
  win.visualViewport?.addEventListener('resize', unzoom);
  return () => resets;
}
