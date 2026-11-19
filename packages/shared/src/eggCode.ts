/**
 * Egg codes (OP-260): solving the portfolio site's SQL console earns a code that puts the painted egg
 * (OP-261) in an owl's collection. The owner's picks (Nov 19, "Go with your picks"):
 *  - signed codes: the portfolio site signs each code with a private key (Ed25519) and the park holds
 *    only the public key, so the park can check a code but never make one;
 *  - one code per solve, and codes never expire;
 *  - typed (or pasted) into the Menu's Redeem a code panel, never carried in a link;
 *  - free guests can redeem too, and keep and show the egg (his rule of Nov 18: "Guests can earn and
 *    display the items").
 *
 * A code is `EGG-` and then, in base64url with no padding, 13 bytes signed and the 64-byte signature:
 * byte 0 is the version (1), bytes 1 to 12 the code's own random id. That is 107 characters, too long to
 * type by hand, so the portfolio site gives a Copy button and the panel takes a paste. The park keeps
 * each id it has taken, so a code works once in the whole park.
 */
import { EGG_VARIANT } from './easter';
import type { CollectionBook } from './book';

export const EGG_CODE_PREFIX = 'EGG-';
export const EGG_CODE_VERSION = 1;
/** Bytes of the code's random id. */
export const EGG_CODE_ID_BYTES = 12;
const SIGNED_BYTES = 1 + EGG_CODE_ID_BYTES;
const SIGNATURE_BYTES = 64;
/** How long a code is, prefix included (107). */
export const EGG_CODE_LENGTH = EGG_CODE_PREFIX.length + Math.ceil(((SIGNED_BYTES + SIGNATURE_BYTES) * 4) / 3);

/** Tries an hour, per owl and per address, as the ticket sets (like the feedback cap). */
export const EGG_CODE_TRIES = { limit: 10, windowMs: 60 * 60_000 } as const;

/**
 * The public key the offline park (the local transport, development and the browser tests) checks codes
 * with. Its private half is in the browser tests on purpose, so they can make codes; the room server
 * never takes this key, so a code made with it is worth nothing in the live park.
 */
export const LOCAL_EGG_CODE_PUBLIC_KEY = '_ili8TFx3evauC6V4pG3LCCXi3wCHKHqte9N59mFP9I';

/** A code read apart: its id (hex, for the park's ledger), and the bytes the signature covers. */
export interface EggCodeParts {
  id: string;
  signed: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * What a player typed or pasted, read as a code: spaces and line breaks dropped (a paste may carry
 * them), the prefix in any case. Null when it is not a code's shape at all.
 */
export function parseEggCode(text: unknown): EggCodeParts | null {
  if (typeof text !== 'string' || text.length > 400) return null;
  const s = text.replace(/\s+/g, '');
  if (s.slice(0, EGG_CODE_PREFIX.length).toUpperCase() !== EGG_CODE_PREFIX) return null;
  const bytes = fromBase64Url(s.slice(EGG_CODE_PREFIX.length));
  if (!bytes || bytes.length !== SIGNED_BYTES + SIGNATURE_BYTES || bytes[0] !== EGG_CODE_VERSION) return null;
  const signed = bytes.slice(0, SIGNED_BYTES);
  return { id: hex(signed.slice(1)), signed, signature: bytes.slice(SIGNED_BYTES) };
}

/** The bytes a new code signs: the version, then a fresh random id. */
export function eggCodeBody(random: (n: number) => Uint8Array): Uint8Array<ArrayBuffer> {
  const body = new Uint8Array(SIGNED_BYTES);
  body[0] = EGG_CODE_VERSION;
  body.set(random(EGG_CODE_ID_BYTES).slice(0, EGG_CODE_ID_BYTES), 1);
  return body;
}

/** A code as the portfolio site writes it, from the signed bytes and their signature. */
export function formatEggCode(signed: Uint8Array, signature: Uint8Array): string {
  const all = new Uint8Array(signed.length + signature.length);
  all.set(signed, 0);
  all.set(signature, signed.length);
  return EGG_CODE_PREFIX + toBase64Url(all);
}

/**
 * Whether a code is one the portfolio site signed: checked against its public key (raw Ed25519, in
 * base64url). The code's id when it is, null for anything else (a typo, a made-up code, a bad key).
 */
export async function verifyEggCode(text: unknown, publicKey: string, subtle: SubtleCrypto = crypto.subtle): Promise<string | null> {
  const parts = parseEggCode(text);
  const raw = fromBase64Url(publicKey.trim());
  if (!parts || !raw || raw.length !== 32) return null;
  try {
    const key = await subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
    return (await subtle.verify({ name: 'Ed25519' }, key, parts.signature, parts.signed)) ? parts.id : null;
  } catch {
    return null;
  }
}

/** The ids of the codes the park has taken: each works once in the whole park. */
export interface EggCodeLedger {
  taken(id: string): boolean;
  take(id: string, cid: string, at: number): void;
}

/**
 * What came of a redeem: the egg went in (`redeemed`); the owl holds the egg already (`have`: the code is
 * not spent, so it can go to a friend); or one plain refusal for a code that is wrong or used (`bad`),
 * with no hint which. The page adds `full` (too many tries), `closed` (codes not taken yet) and `offline`.
 */
export type EggRedeemResult = { ok: true; variant: string } | { ok: false; reason: 'have' | 'bad' };
export type EggRedeemReply = EggRedeemResult | { ok: false; reason: 'full' | 'closed' | 'offline' };

/** Redeem a checked code's id for `cid`. A free guest redeems like anyone (the owner's rule, Nov 18). */
export function redeemEgg(book: CollectionBook, ledger: EggCodeLedger, cid: string, id: string | null, now: number): EggRedeemResult {
  if (!id) return { ok: false, reason: 'bad' };
  if (book.owned(cid, undefined, now).includes(EGG_VARIANT)) return { ok: false, reason: 'have' };
  if (ledger.taken(id)) return { ok: false, reason: 'bad' };
  const granted = book.grant(cid, EGG_VARIANT, 'granted', now);
  if (!granted.ok) return { ok: false, reason: 'bad' };
  ledger.take(id, cid, now);
  return { ok: true, variant: EGG_VARIANT };
}

/** What the Redeem a code panel says (visitor-facing). */
export const EGG_CODE_WORDS = {
  title: 'Redeem a code',
  note: 'Got a code? Paste it here.',
  label: 'Code',
  button: 'Redeem',
  redeemed: 'An egg! It is waiting in your collection.',
  have: 'You already have the egg.',
  bad: 'That code doesn’t work.',
  full: 'Too many tries. Try again in an hour.',
  closed: 'Codes can’t be redeemed just yet.',
  offline: 'The park couldn’t be reached. Try again in a moment.',
} as const;

/** The panel's line for a reply. */
export function eggRedeemLine(reply: EggRedeemReply): string {
  return reply.ok ? EGG_CODE_WORDS.redeemed : EGG_CODE_WORDS[reply.reason];
}
