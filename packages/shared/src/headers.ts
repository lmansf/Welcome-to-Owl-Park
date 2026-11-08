/**
 * What no answer of the park's may use (OP-246): the park needs none of these, so no script on it gets
 * them. The Worker sets it on its answers, and the static files' public/_headers says the same. It
 * sits in a file of its own, with no imports, so the Worker can load it under plain Node too.
 */
export const PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()';

/**
 * Where an art trial's files come from (`?art=<name>`, apps/park/src/game/artTrial.ts): generated art
 * the owner walks before anything is approved or committed. The page policy lets a browser fetch these
 * only on a page that names a trial, so no visitor's page can reach them.
 */
export const ART_TRIAL_HOSTS = ['https://d2ol7oe51mr4n9.cloudfront.net'] as const;

/** Whether a page's address names an art trial (`?art=` and a name of letters and digits). */
export function namesArtTrial(url: URL): boolean {
  return /^[a-z0-9]{1,24}$/.test(url.searchParams.get('art') ?? '');
}
