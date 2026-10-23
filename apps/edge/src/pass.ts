/**
 * Park passes: a small signed token the client presents when opening a room socket.
 * Every visitor gets a guest pass. With GATE=ticket a guest pass opens only the lobby
 * (`gate.ts`); a pass admitted through a ticket opens the rest. HMAC-SHA256 over a JSON
 * payload; verification is a constant-time compare.
 *
 * Collector tokens use the same signature over a different payload shape (`k: "col"`), so a
 * pass is never a collector token and a collector token is never a pass.
 */
import { isTimeZone } from '@owl-park/shared';
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
}

/** A collector's long-lived identity, kept by the browser (per device until email linking exists). */
export interface CollectorPayload {
  k: 'col';
  cid: string;
  /** Issued at, Unix seconds. */
  iat: number;
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

export function signingSecret(env: { PASS_SIGNING_KEY?: string }): string {
  if (env.PASS_SIGNING_KEY && env.PASS_SIGNING_KEY.length >= 16) return env.PASS_SIGNING_KEY;
  console.warn('[owl-park] PASS_SIGNING_KEY is not set; using the development key. Set it with: wrangler secret put PASS_SIGNING_KEY');
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
  return out;
}

export async function mintCollector(secret: string, cid: string, iat = Math.floor(Date.now() / 1000)): Promise<string> {
  return sign(secret, { k: 'col', cid, iat } satisfies CollectorPayload);
}

/** The collector id in a collector token; null for anything else (including a park pass). */
export async function verifyCollector(secret: string, token: string | null): Promise<string | null> {
  const p = await verified(secret, token);
  if (!p || p['k'] !== 'col' || !isCollectorId(p['cid']) || typeof p['iat'] !== 'number') return null;
  return p['cid'];
}
