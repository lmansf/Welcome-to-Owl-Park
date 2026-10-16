/**
 * Park passes: a small signed token the client presents when opening a room socket.
 * v1 mints guest passes for everyone (GATE=open). v2 mints them only for admitted
 * ticket holders. HMAC-SHA256 over a JSON payload; verification is a constant-time compare.
 */
export interface PassPayload {
  /** Visitor id, stable for the pass lifetime. */
  id: string;
  /** Expiry, Unix seconds. */
  exp: number;
  /** Admitted through a ticket (v2). Guests are false. */
  adm: boolean;
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

export function randomVisitorId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let s = 'v_';
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

export async function mintPass(secret: string, payload: PassPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyPass(secret: string, token: string | null, nowS = Math.floor(Date.now() / 1000)): Promise<PassPayload | null> {
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
    const p = JSON.parse(new TextDecoder().decode(raw)) as Partial<PassPayload>;
    if (typeof p.id !== 'string' || !/^v_[A-Za-z0-9]{6,16}$/.test(p.id) || typeof p.exp !== 'number' || p.exp < nowS) return null;
    return { id: p.id, exp: p.exp, adm: p.adm === true };
  } catch {
    return null;
  }
}
