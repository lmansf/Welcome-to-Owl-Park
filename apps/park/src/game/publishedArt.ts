import files, { sizes } from 'virtual:art-files';

/**
 * The art this build ships (file names in public/art) and a hash of each one's content, so a piece
 * is asked for by a name it has, with its hash: a changed picture is a new address, which lets the
 * browser and Cloudflare keep the art for a year (public/_headers; OP-129).
 */
export const PUBLISHED_ART: ReadonlyMap<string, string> = new Map(Object.entries(files));

/** Each shipped art file's size in bytes: what the load screen counts its progress against (OP-129). */
export const ART_BYTES: ReadonlyMap<string, number> = new Map(Object.entries(sizes));

/**
 * An art file's name as it is asked for: percent-encoded (the asset server redirects `@2x` to
 * `%402x`, a round trip for nothing) and with its content's hash when the build ships it.
 */
export function versioned(name: string): string {
  const v = PUBLISHED_ART.get(name);
  return v ? `${encodeURIComponent(name)}?v=${v}` : encodeURIComponent(name);
}
