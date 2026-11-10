/**
 * Our own test visits (the scripted checks, playtest bots, QA walks and anyone testing by hand), so the
 * park's visitor counts hold only real players: a page driven by a browser automation tool (its
 * `navigator.webdriver`, which Playwright and the remote browsers set), or one whose address asks for
 * it with `?test=1`. The room connection says so on each socket (`&test=1`), the Worker tells the room
 * server, and the visit goes to the log marked `is_test` (game.fact_session), kept but left out of the
 * reports. It changes nothing in play.
 */

/** Whether this page is one of our test visits: an automated browser, or `?test=1` in its address. */
export function isTestVisit(search: string, webdriver: boolean | undefined): boolean {
  return webdriver === true || new URLSearchParams(search).get('test') === '1';
}

/** This page's answer, read once. */
export const testVisit: boolean =
  typeof location !== 'undefined' && isTestVisit(location.search, typeof navigator !== 'undefined' ? navigator.webdriver : undefined);
