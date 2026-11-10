/**
 * Park passes: a small signed token the client presents when opening a room socket.
 * Every visitor gets a guest pass. With GATE=ticket a guest pass opens only the lobby
 * (`gate.ts`); a pass admitted through a ticket opens the rest. HMAC-SHA256 over a JSON
 * payload; verification is a constant-time compare.
 *
 * Collector tokens use the same signature over a different payload shape (`k: "col"`), so a
 * pass is never a collector token and a collector token is never a pass.
 */
import { isDeviceId, isTimeZone } from '@owl-park/shared';
import { isLocalHost } from './guard';
import { moduleLog } from './logs';
import { isTicketId } from './tickets';

export interface PassPayload {
  /** Visitor id, stable for the pass lifetime: one owl per page load. */
  id: string;
  /** Expiry, Unix seconds. */
  exp: number;
  /** Issued at, Unix seconds: a pass from before the gate closed keeps its owl in the park (OP-067). */
  iat?: number;
  /** Admitted through a ticket. Guests are false. */
  adm: boolean;
  /** The ticket the gate scanned to admit this pass: it votes as that ticket. */
  tid?: string;
  /** The collector this page belongs to (several tabs of one browser share it). */
  cid?: string;
  /** The browser's IANA time zone when the pass was minted: the collector's home zone on first sight. */
  tz?: string;
  /** The device its collector token names (OP-139, with ACCOUNTS on): a room tells a moved owl's other screens. */
  dev?: string;
}

/** A collector's long-lived identity, kept by the browser: its owl, and (OP-139) this screen's session for it. */
export interface CollectorPayload {
  k: 'col';
  cid: string;
  /** Issued at, Unix seconds. */
  iat: number;
  /** The device the token is for: the owl's account names the one device it is on. Absent from tokens made before accounts. */
  dev?: string;
}

const CID_RE = /^c_[A-Za-z0-9]{8,16}$/;

export function isCollectorId(v: unknown): v is string {
  return typeof v === 'string' && CID_RE.test(v);
}

export const GUEST_PASS_TTL_S = 12 * 60 * 60;
const DEV_KEY = 'owl-park-dev-only-signing-key';

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Whether this isolate has said so already: each of the two lines below once, not on every request. */
let devKeyWarned = false;
let keyRefusedNoted = false;

/** Whether the deployment's own signing key is set: 16 characters or more (OP-209). Never the key itself. */
export function signingKeySet(env: { PASS_SIGNING_KEY?: string }): boolean {
  return !!env.PASS_SIGNING_KEY && env.PASS_SIGNING_KEY.length >= 16;
}

/**
 * The key passes, collector tokens, entries, links and keepers' tokens are signed and checked with,
 * or null where nothing may be (OP-209). The deployment's own key when it is set; without it, the
 * development key (written in this public file) only for a request to a host on this machine (local
 * development and the browser tests: `at` is the request's URL, or for a room socket whether its
 * upgrade came to one). Anywhere else nothing is signed or checked: a missing key fails closed, said
 * once per isolate as an error, never quietly signed with a key anyone can read.
 */
export function signingSecret(env: { PASS_SIGNING_KEY?: string }, at: URL | boolean): string | null {
  if (signingKeySet(env)) return env.PASS_SIGNING_KEY as string;
  if (typeof at === 'boolean' ? at : isLocalHost(at.hostname)) {
    if (!devKeyWarned) {
      devKeyWarned = true;
      moduleLog.warn('worker.pass', 'signing_key_missing', 'PASS_SIGNING_KEY is not set, so passes are signed with the development key (this machine only). Set it with: wrangler secret put PASS_SIGNING_KEY');
    }
    return DEV_KEY;
  }
  if (!keyRefusedNoted) {
    keyRefusedNoted = true;
    moduleLog.error('worker.pass', 'signing_key_refused', 'PASS_SIGNING_KEY is not set (or shorter than 16 characters) off this machine: no pass, entry, link or keeper’s token is signed or taken until it is. Set it with: wrangler secret put PASS_SIGNING_KEY');
  }
  return null;
}

/** Thrown by `requireSecret` where a request needs the signing key and none may sign: the Worker answers 503 (OP-209). */
export class SigningKeyMissing extends Error {
  constructor() {
    super('no signing key: PASS_SIGNING_KEY is not set');
    this.name = 'SigningKeyMissing';
  }
}

/** The signing key for a request that cannot go on without one (`signingSecret`); throws SigningKeyMissing where there is none. */
export function requireSecret(env: { PASS_SIGNING_KEY?: string }, at: URL | boolean): string {
  const secret = signingSecret(env, at);
  if (secret === null) throw new SigningKeyMissing();
  return secret;
}

/** Tests only: this isolate has said nothing yet about the signing key. */
export function forgetSigningKeyNotes(): void {
  devKeyWarned = false;
  keyRefusedNoted = false;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomId(prefix: string, n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let s = prefix;
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return s;
}

export function randomVisitorId(): string {
  return randomId('v_', 10);
}

export function randomCollectorId(): string {
  return randomId('c_', 12);
}

export function randomDeviceId(): string {
  return randomId('d_', 10);
}

async function sign(secret: string, payload: object): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

/** The signed payload of a token, or null when the token is malformed, the signature is wrong, or there is no key to check it with (OP-209). */
async function verified(secret: string | null, token: string | null): Promise<Record<string, unknown> | null> {
  if (secret === null || !token || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = unb64url(token.slice(dot + 1));
  if (!sig) return null;
  const ok = await crypto.subtle.verify('HMAC', await key(secret), sig, enc.encode(body));
  if (!ok) return null;
  const raw = unb64url(body);
  if (!raw) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function mintPass(secret: string, payload: PassPayload): Promise<string> {
  return sign(secret, payload);
}

export async function verifyPass(secret: string | null, token: string | null, nowS = Math.floor(Date.now() / 1000)): Promise<PassPayload | null> {
  const p = await verified(secret, token);
  if (!p || p['k'] !== undefined) return null; // a collector token is not a pass
  const { id, exp } = p;
  if (typeof id !== 'string' || !/^v_[A-Za-z0-9]{6,16}$/.test(id) || typeof exp !== 'number' || exp < nowS) return null;
  const out: PassPayload = { id, exp, adm: p['adm'] === true };
  if (isCollectorId(p['cid'])) out.cid = p['cid'];
  if (isTimeZone(p['tz'])) out.tz = p['tz'];
  if (isTicketId(p['tid'])) out.tid = p['tid'];
  if (Number.isSafeInteger(p['iat'])) out.iat = p['iat'] as number;
  if (isDeviceId(p['dev'])) out.dev = p['dev'];
  return out;
}

/** Why a token is not a pass (OP-134's pass_rejected): none given, past its time, or not one of the park's passes at all. */
export async function passRefusal(secret: string, token: string | null, nowS = Math.floor(Date.now() / 1000)): Promise<'missing' | 'expired' | 'invalid'> {
  if (!token) return 'missing';
  const p = await verified(secret, token);
  return p && p['k'] === undefined && typeof p['exp'] === 'number' && p['exp'] < nowS ? 'expired' : 'invalid';
}

export async function mintCollector(secret: string, cid: string, dev: string | null = null, iat = Math.floor(Date.now() / 1000)): Promise<string> {
  return sign(secret, { k: 'col', cid, iat, ...(dev ? { dev } : {}) } satisfies CollectorPayload);
}

/** The collector in a collector token, and the device it is for (null: a token from before accounts); null for anything else. */
export async function readCollector(secret: string, token: string | null): Promise<{ cid: string; dev: string | null } | null> {
  const p = await verified(secret, token);
  if (!p || p['k'] !== 'col' || !isCollectorId(p['cid']) || typeof p['iat'] !== 'number') return null;
  return { cid: p['cid'], dev: isDeviceId(p['dev']) ? p['dev'] : null };
}

/** The collector id in a collector token; null for anything else (including a park pass). */
export async function verifyCollector(secret: string, token: string | null): Promise<string | null> {
  return (await readCollector(secret, token))?.cid ?? null;
}

/**
 * An entry (OP-075): proof that a visitor was in the park lately, or came through the line. While
 * the park has a line, a room socket opens only with one; every room gives a fresh one in its
 * welcome, so owls already inside go on from room to room. It names the collector (several tabs of
 * one browser share it), or the pass's visitor where there is none.
 */
export interface EntryPayload {
  k: 'ent';
  who: string;
  /** Expiry, Unix seconds. */
  exp: number;
}

/** How long an entry lets its owl back in: a long visit, with every room it walks into renewing it. */
export const ENTRY_TTL_S = 3 * 60 * 60;

/**
 * A visitor's address as the line keeps it (OP-244): keyed with the signing secret, so the line can
 * count numbers per address without ever holding the address, and nobody can work it back.
 */
export async function addressKey(secret: string, ip: string): Promise<string> {
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(`line-address:${ip}`));
  return b64url(sig).slice(0, 22);
}

export async function mintEntry(secret: string, who: string, exp = Math.floor(Date.now() / 1000) + ENTRY_TTL_S): Promise<string> {
  return sign(secret, { k: 'ent', who, exp } satisfies EntryPayload);
}

/** Whether this entry is good for `who` now (a pass or a collector token never is). */
export async function verifyEntry(secret: string, token: unknown, who: string, nowS = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const p = await verified(secret, token);
  return !!p && p['k'] === 'ent' && p['who'] === who && typeof p['exp'] === 'number' && p['exp'] >= nowS;
}

/**
 * A magic link's token (OP-139): which link it is (its nonce, which the account store keeps and lets
 * be used once) and until when it works. Signed like a pass, so a made-up link is refused unread.
 */
export interface LinkPayload {
  k: 'acl';
  /** A mailed link's kind, or `google`: the state a Google sign-in (OP-313) carries out to Google and back. */
  kind: 'protect' | 'restore' | 'google';
  n: string;
  /** Expiry, Unix seconds. */
  exp: number;
  /**
   * The email a ticket's protect link carries (OP-186), sealed with the Worker's account key: the link
   * mailed to a buyer holds their address itself, so the park keeps nothing about it until it is opened.
   */
  s?: string;
}

const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
/** A sealed email as a link carries it: base64url, an address's length and the seal's nonce and tag. */
const SEALED_RE = /^[A-Za-z0-9_-]{24,400}$/;

/** A fresh nonce for a link: 128 random bits. */
export function randomNonce(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

/** A link's token; `sealed` is the email a ticket's protect link carries in it (OP-186). */
export async function mintLink(secret: string, kind: LinkPayload['kind'], nonce: string, exp: number, sealed?: string): Promise<string> {
  return sign(secret, { k: 'acl', kind, n: nonce, exp, ...(sealed ? { s: sealed } : {}) } satisfies LinkPayload);
}

/**
 * A link token's nonce, and the sealed email it carries if it is a ticket's (OP-186), while it is good;
 * null when it is forged, malformed, of another kind or run out.
 */
export async function readLink(secret: string, token: unknown, kind: LinkPayload['kind'], nowS = Math.floor(Date.now() / 1000)): Promise<{ nonce: string; sealed: string | null } | null> {
  if (typeof token !== 'string') return null;
  const p = await verified(secret, token);
  if (!p || p['k'] !== 'acl' || p['kind'] !== kind || typeof p['n'] !== 'string' || !NONCE_RE.test(p['n']) || typeof p['exp'] !== 'number' || p['exp'] < nowS) return null;
  const s = p['s'];
  if (s !== undefined && (typeof s !== 'string' || !SEALED_RE.test(s))) return null;
  return { nonce: p['n'], sealed: s ?? null };
}

/** A link token's nonce while it is good; null when it is forged, malformed, of another kind or run out. */
export async function verifyLink(secret: string, token: unknown, kind: LinkPayload['kind'], nowS = Math.floor(Date.now() / 1000)): Promise<string | null> {
  return (await readLink(secret, token, kind, nowS))?.nonce ?? null;
}

/**
 * A keeper's token (OP-156): a keeper who gave the admin key walks the tree (map 2) while it is dark.
 * Signed like a pass and saying only until when, it lets its owl into a gated room the realms switch
 * keeps closed; the page keeps it for one tab and never the key itself.
 */
export interface KeeperPayload {
  k: 'kpr';
  /** Expiry, Unix seconds. */
  exp: number;
}

/** How long a keeper's token lets its tab into the dark rooms: an evening's work. */
export const KEEPER_TTL_S = 12 * 60 * 60;

export async function mintKeeper(secret: string, exp = Math.floor(Date.now() / 1000) + KEEPER_TTL_S): Promise<string> {
  return sign(secret, { k: 'kpr', exp } satisfies KeeperPayload);
}

/** Whether this is a keeper's token, good now (a pass, an entry or any other token never is). */
export async function verifyKeeper(secret: string | null, token: unknown, nowS = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const p = await verified(secret, token);
  return !!p && p['k'] === 'kpr' && typeof p['exp'] === 'number' && p['exp'] >= nowS;
}
