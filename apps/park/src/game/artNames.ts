/**
 * The art's file names and the addresses they are asked for at. No imports, so the build
 * (vite.config.ts, which has the page ask for the boot's art alongside the script) and the client
 * share them, and they can be unit-tested without Phaser.
 */

/** The great horned owl's five layers, in drawing order: body, belly, accent, face, blink. */
export const OWL_LAYERS = ['owl-body', 'owl-belly', 'owl-accent', 'owl-face', 'owl-blink'] as const;

/**
 * The art the boot loads before the home screen (art.ts's GLOBAL_ART): the great horned owl's
 * layers and the wing every owl flies with. The page asks for it alongside the script (OP-129).
 */
export const BOOT_ART = [...OWL_LAYERS, 'owl-wing-body', 'owl-wing-accent'] as const;

/**
 * The raster files the loader tries for a key once there is no SVG, in order. WebP comes before
 * PNG (painted rooms and the nests' furniture ship as WebP, the rest as PNG), and on a dense
 * screen the 2x copies come before the 1x ones. Given the files the build ships (`published`: each
 * name in the art folder and its content's hash), only those are tried, so a key costs one request, not a miss or
 * two first, and each is asked for with its hash (OP-129). Names are sent percent-encoded: the asset
 * server answers `owl-body@2x.png` with a redirect to `owl-body%402x.png`, a round trip for nothing.
 */
export const RASTER_EXTS = ['webp', 'png'] as const;

/** Above this scale a `@2x` copy is worth fetching. */
export const DENSE_SCALE = 1.25;

/** The file names a key is looked for under at `scale`, best first; with `published`, only those the build ships. */
export function rasterNames(key: string, scale: number, published?: ReadonlyMap<string, string>): string[] {
  const one = RASTER_EXTS.map((ext) => `${key}.${ext}`);
  const names = scale <= DENSE_SCALE ? one : [...RASTER_EXTS.map((ext) => `${key}@2x.${ext}`), ...one];
  return published ? names.filter((n) => published.has(n)) : names;
}

export function rasterCandidates(baseUrl: string, key: string, scale: number, published?: ReadonlyMap<string, string>): string[] {
  return rasterNames(key, scale, published).map((n) => `${baseUrl}${encodeURIComponent(n)}${published ? `?v=${published.get(n)}` : ''}`);
}

/** The scale an owl's art loads at on a screen of this device pixel ratio (art.ts's artScale for owls): the ratio, from 1 to 2, in quarters. */
export function owlArtScale(devicePixelRatio: number): number {
  return Math.max(1, Math.round(Math.min(2, Math.max(1, devicePixelRatio)) * 4) / 4);
}

/** The device pixel ratio from which an owl's art is the 2x copy: owlArtScale rounds to quarters, so an eighth past DENSE_SCALE. */
export const DENSE_FROM_RATIO = DENSE_SCALE + 0.125;

/**
 * The page's own start on the boot's art (OP-129), as a script for index.html: before the game's
 * script has come, it asks, at low priority, for the file the art loader will ask for first for
 * each BOOT_ART key at the scale this screen will want, and keeps the answers in
 * `window.__owlParkArt` by address for the loader to take. A key the build ships as SVG is left
 * out (the loader draws that itself). `artBase` is where the art is served (`/art/`).
 *
 * TODO-DOCS (OP-129): docs/ARCHITECTURE.md: the page asks for the boot's art itself, as it opens
 * (this script, which vite.config.ts writes into index.html's head), and art.ts's loader takes those
 * downloads.
 */
export function earlyArtScript(artBase: string, published: ReadonlyMap<string, string>): string {
  const at = (scale: number) =>
    BOOT_ART.filter((key) => !published.has(`${key}.svg`)).flatMap((key) => rasterCandidates(artBase, key, scale, published).slice(0, 1));
  return [
    '(function () {',
    `  var urls = (window.devicePixelRatio || 1) >= ${DENSE_FROM_RATIO} ? ${JSON.stringify(at(2))} : ${JSON.stringify(at(1))};`,
    '  var early = (window.__owlParkArt = {});',
    "  if (typeof fetch !== 'function') return;",
    '  for (var i = 0; i < urls.length; i++) early[urls[i]] = fetch(urls[i], { priority: "low" }).catch(function () { return null; });',
    '})();',
  ].join('\n');
}
