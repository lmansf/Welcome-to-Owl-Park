/**
 * Accounts without passwords (OP-139). An owl is its collector id (`cid`): the Worker mints it the
 * first time a browser asks for a pass, and everything the owl owns (its collection and feathers, its
 * nest, its quests, its scores and runs, its tickets) is keyed by it already, so the cid is the
 * owl_id and nothing is re-keyed. On top of it:
 *
 * - a friend code: four letters, minted with the owl's account and never changed, shown in the Menu
 *   (for friends, OP-050, and parties, OP-115), for every owl, ticket or not;
 * - one screen at a time: the browser's collector token names its device, and the owl's account
 *   names the device it is on; a token for another device finds its owl moved;
 * - the email that protects an owl, never typed by a child: a ticket's order email is mailed a
 *   one-tap link at the claim (OP-186, good for ORDER_LINK_MS), or a grown-up types one in Settings
 *   and confirms it by a link. An owl without one lives only on its screen. One email may protect
 *   several owls (siblings);
 * - magic links: a grown-up types the protecting email on another screen, opens the link sent to it
 *   there and taps the owl's picture, and that screen holds the owl from then on.
 *
 * The park keeps an email only as a keyed hash (to find its owls) and a sealed copy (to write to);
 * neither is ever logged. No sign-up is ever needed to play.
 *
 * TODO-DOCS (OP-139): docs/ARCHITECTURE.md (identity): the cid as the owl's id, the device in the
 * collector token, the account record (friend code, the email's hash and sealed copy, the device the
 * owl is on), the magic links and their limits, the ACCOUNTS switch; docs/PLAYBOOK.md: what a
 * keeper does for a family that lost an unprotected owl (nothing can be done) or a protected one
 * (the restore link); docs/DEPLOY.md: ACCOUNT_SECRET and the mail sender.
 */
import type { PortraitLook } from './arcade';

/** A friend code's letters: no I or O, which read as one and nought. */
export const FRIEND_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const FRIEND_CODE_LENGTH = 4;
const FRIEND_RE = /^[A-HJ-NP-Z]{4}$/;

export function isFriendCode(v: unknown): v is string {
  return typeof v === 'string' && FRIEND_RE.test(v);
}

/**
 * A friend code from random bytes, every letter equally likely (a byte past the last whole run of the
 * alphabet is passed over); null when the bytes run out first.
 */
export function friendCodeFrom(bytes: Uint8Array): string | null {
  const whole = 256 - (256 % FRIEND_ALPHABET.length);
  let code = '';
  for (const b of bytes) {
    if (b >= whole) continue;
    code += FRIEND_ALPHABET[b % FRIEND_ALPHABET.length];
    if (code.length === FRIEND_CODE_LENGTH) return code;
  }
  return null;
}

/** A magic link works this long after it is sent, once. */
export const MAGIC_LINK_MS = 15 * 60_000;
/**
 * The one-tap protect link a ticket's buyer is mailed (OP-186) works this long, once: a buyer reads
 * the mail when they read it, not within the quarter hour of a link they asked for themselves.
 */
export const ORDER_LINK_MS = 7 * 24 * 3600_000;
/** Links sent to one email in an hour, and asked for from one address in an hour, at most. */
export const LINKS_PER_EMAIL_PER_HOUR = 3;
export const LINKS_PER_IP_PER_HOUR = 10;

const EMAIL_RE = /^[^\s@<>"(),;:\\[\]]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** An email as the park keys it (trimmed, lower case), or null for something that is not one. */
export function normalEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** Whether a device id is well formed: `d_` and ten letters or digits. */
export function isDeviceId(v: unknown): v is string {
  return typeof v === 'string' && /^d_[A-Za-z0-9]{10}$/.test(v);
}

/** What the page knows of its owl's account. */
export interface OwlAccount {
  friendCode: string;
  /** An email protects it: it can be restored on another screen. */
  protected: boolean;
}

/** An owl on an email, as a restoring screen shows it: a picture to tap, nothing typed by anyone. */
export interface OwlPicture {
  /** Its friend code: shown under the picture, and what the tap that picks it sends. */
  code: string;
  /** Its look as its screen last showed it (none yet: the page draws a plain owl). */
  look: PortraitLook | null;
}
