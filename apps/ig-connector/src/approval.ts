/**
 * Approval ids: a stateless signed token naming exactly one reel (video, caption, cover) and when the
 * approval runs out. payload.signature, both base64url: the payload is the canonical JSON of
 * {caption, cover_url, exp, video_url} (keys sorted, cover_url null when absent, exp in unix seconds)
 * and the signature is HMAC-SHA256 over those JSON bytes with APPROVAL_KEY.
 */
export const APPROVAL_TTL_S = 24 * 60 * 60;
const TOKEN_MAX = 16_384;

export interface ReelPlan {
  video_url: string;
  caption: string;
  cover_url: string | null;
}

export type ApprovalCheck = { ok: true; plan: ReelPlan; exp: number } | { ok: false; reason: string };

export function canonicalJson(plan: ReelPlan, exp: number): string {
  return JSON.stringify({ caption: plan.caption, cover_url: plan.cover_url, exp, video_url: plan.video_url });
}

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hmacKey(secret: string, usage: 'sign' | 'verify'): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signApproval(plan: ReelPlan, secret: string, nowS: number): Promise<{ approval_id: string; exp: number }> {
  const exp = nowS + APPROVAL_TTL_S;
  const payload = new TextEncoder().encode(canonicalJson(plan, exp));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), payload));
  return { approval_id: `${toB64url(payload)}.${toB64url(sig)}`, exp };
}

const AGAIN = 'Call prepare_reel again and ask Logan again.';

export async function verifyApproval(token: unknown, secret: string, nowS: number): Promise<ApprovalCheck> {
  if (typeof token !== 'string' || !token) return { ok: false, reason: `approval_id is missing. ${AGAIN}` };
  if (token.length > TOKEN_MAX || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return { ok: false, reason: `approval_id is malformed. ${AGAIN}` };
  const [p, s] = token.split('.') as [string, string];
  let payload: Uint8Array<ArrayBuffer>;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    payload = fromB64url(p);
    sig = fromB64url(s);
  } catch {
    return { ok: false, reason: `approval_id is malformed. ${AGAIN}` };
  }
  if (sig.length !== 32) return { ok: false, reason: `approval_id is malformed. ${AGAIN}` };
  // crypto.subtle.verify compares in constant time.
  if (!(await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), sig, payload))) {
    return { ok: false, reason: `approval_id is not validly signed (altered, or from another key). ${AGAIN}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(payload));
  } catch {
    return { ok: false, reason: `approval_id is malformed. ${AGAIN}` };
  }
  const o = parsed as Record<string, unknown>;
  const ok =
    typeof o === 'object' && o !== null &&
    typeof o.video_url === 'string' && typeof o.caption === 'string' &&
    (o.cover_url === null || typeof o.cover_url === 'string') &&
    typeof o.exp === 'number' && Number.isInteger(o.exp);
  if (!ok) return { ok: false, reason: `approval_id is malformed. ${AGAIN}` };
  const plan: ReelPlan = { video_url: o.video_url as string, caption: o.caption as string, cover_url: o.cover_url as string | null };
  const exp = o.exp as number;
  if (canonicalJson(plan, exp) !== new TextDecoder().decode(payload)) return { ok: false, reason: `approval_id is malformed. ${AGAIN}` };
  if (exp <= nowS) return { ok: false, reason: `approval_id expired at ${new Date(exp * 1000).toISOString()}. ${AGAIN}` };
  return { ok: true, plan, exp };
}
