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

/** Whether this isolate has said so already: the development key is warned of once, not on every request. */
let devKeyWarned = false;

export function signingSecret(env: { PASS_SIGNING_KEY?: string }): string {
  if (env.PASS_SIGNING_KEY && env.PASS_SIGNING_KEY.length >= 16) return env.PASS_SIGNING_KEY;
  if (!devKeyWarned) {
    devKeyWarned = true;
    moduleLog.warn('worker.pass', 'signing_key_missing', 'PASS_SIGNING_KEY is not set, so passes are signed with the development key. Set it with: wrangler secret put PASS_SIGNING_KEY');
  }
  return DEV_KEY;
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

/** The signed payload of a token, or null when the token is malformed or the signature is wrong. */
async function verified(secret: string, token: string | null): Promise<Record<string, unknown> | null> {
  if (!token || token.length > 512) return null;
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

export async function verifyPass(secret: string, token: string | null, nowS = Math.floor(Date.now() / 1000)): Promise<PassPayload | null> {
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
  kind: 'protect' | 'restore';
  n: string;
  /** Expiry, Unix seconds. */
  exp: number;
}

const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** A fresh nonce for a link: 128 random bits. */
export function randomNonce(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function mintLink(secret: string, kind: LinkPayload['kind'], nonce: string, exp: number): Promise<string> {
  return sign(secret, { k: 'acl', kind, n: nonce, exp } satisfies LinkPayload);
}

/** A link token's kind and nonce while it is good; null when it is forged, malformed, of another kind or run out. */
export async function verifyLink(secret: string, token: unknown, kind: LinkPayload['kind'], nowS = Math.floor(Date.now() / 1000)): Promise<string | null> {
  if (typeof token !== 'string') return null;
  const p = await verified(secret, token);
  if (!p || p['k'] !== 'acl' || p['kind'] !== kind || typeof p['n'] !== 'string' || !NONCE_RE.test(p['n']) || typeof p['exp'] !== 'number' || p['exp'] < nowS) return null;
  return p['n'];
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
export async function verifyKeeper(secret: string, token: unknown, nowS = Math.floor(Date.now() / 1000)): Promise<boolean> {
  if (typeof token !== 'string') return false;
  const p = await verified(secret, token);
  return !!p && p['k'] === 'kpr' && typeof p['exp'] === 'number' && p['exp'] >= nowS;
}
