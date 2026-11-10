/**
 * Sign in with Google (OP-313), the Worker's half: an optional button beside the email box, never
 * needed to play. Off unless GOOGLE_SIGNIN is "on" and the OAuth client's GOOGLE_CLIENT_ID and
 * GOOGLE_CLIENT_SECRET (secrets) are set, with accounts on and their key set (accounts.ts).
 *
 * The flow is OAuth 2.0's authorization code flow with PKCE (S256), scope `openid email` and nothing
 * more. The state is a link token signed like a pass (pass.ts, kind `google`) whose nonce the account
 * store lets come back once, within GOOGLE_STATE_MS; the same nonce is the ID token's `nonce`. The PKCE
 * verifier never leaves this browser and the Worker: it rides in a cookie for this path alone, so a
 * code read off the way back is no use to anyone else. The ID token comes straight from Google's
 * token endpoint over TLS, so its signature is not checked again, but its issuer, audience, expiry and
 * nonce are, and only `email_verified: true` is taken.
 *
 * A verified email is then used exactly as an opened mail link: the Worker asks the account store for
 * the link that email would have been mailed (accountBook.googleLink) and sends the page to it, in
 * the address's fragment as the mail would, so the page protects its owl, shows that email's owls as
 * pictures to tap, or offers to protect this screen's owl when the email protects none. Nothing of the
 * Google account is kept or logged: not its id, name or picture, and never the email, code or tokens.
 *
 * The routes (under /api/account/google):
 *   GET  /api/account/google             {ready: true} while Google sign-in is ready; 404 otherwise
 *   POST /api/account/google/start {for, back?}  Google's address to go to, and the verifier's cookie
 *                                        (`back`: the page's query string, to come back to)
 *   GET  /api/account/google/callback    where Google sends the browser back: on to the page
 */
import { GOOGLE_STATE_MS, hashForLog, normalEmail, type Logger } from '@owl-park/shared';
import type { GoogleFor, GoogleLink } from './accountBook';
import { accountsOn, keyed, seal, type AccountEnv, type EmailKeys } from './accounts';
import { mintLink, randomNonce, readLink } from './pass';

export interface GoogleEnv extends AccountEnv {
  GOOGLE_SIGNIN?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** Browser tests only: a stand-in for Google's two addresses on this machine (http://localhost:<port>). Never set in production. */
  GOOGLE_TEST_ORIGIN?: string;
}

/** Google's sign-in page and its token endpoint, and the issuers its ID tokens name. */
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_ISSUERS: readonly string[] = ['accounts.google.com', 'https://accounts.google.com'];
/** What the park asks Google for: who it is (an ID token) and the email. No name, no picture. */
export const GOOGLE_SCOPE = 'openid email';
/** The redirect URI, on the park's own origin: the OAuth client in Google Cloud lists it exactly. */
export const GOOGLE_CALLBACK_PATH = '/api/account/google/callback';
/** The cookie the PKCE verifier rides in, for the callback's path alone. */
export const GOOGLE_COOKIE = 'op_google';
const COOKIE_PATH = '/api/account/google';

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
}

/** The OAuth client while Google sign-in is ready (switch on, both secrets, accounts on); null otherwise, and every Google route is a 404. */
export function googleClient(env: GoogleEnv): GoogleClient | null {
  if (env.GOOGLE_SIGNIN !== 'on' || !accountsOn(env)) return null;
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !env.ACCOUNT_SECRET || env.ACCOUNT_SECRET.length < 32) return null;
  const test = env.GOOGLE_TEST_ORIGIN;
  return { clientId, clientSecret, authUrl: test ? `${test}/o/oauth2/v2/auth` : GOOGLE_AUTH_URL, tokenUrl: test ? `${test}/token` : GOOGLE_TOKEN_URL };
}

// ---------- PKCE and the ID token ----------

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): string | null {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  } catch {
    return null;
  }
}

/** A PKCE verifier: 32 random bytes, 43 characters. */
export function pkceVerifier(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

const VERIFIER_RE = /^[A-Za-z0-9_-]{43,128}$/;
/** The page's query string a sign-in comes back to (its room, its test settings): nothing but a query. */
const BACK_RE = /^(?:\?[A-Za-z0-9_.~%=&,+-]{0,400})?$/;

/** Its S256 challenge: the verifier's SHA-256, base64url. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(verifier))));
}

/** Why an ID token was not taken, for the log. */
export type TokenRefusal = 'bad-token' | 'wrong-issuer' | 'wrong-audience' | 'expired' | 'wrong-nonce' | 'unverified';

/**
 * The verified email an ID token from Google's token endpoint names, as the park keys it, or why not:
 * its issuer is Google's, its audience this client, it has not run out, its nonce is the state's, and
 * Google says the email is verified (`email_verified` exactly true).
 */
export function idTokenEmail(idToken: unknown, clientId: string, nonce: string, nowMs: number): { email: string } | { refused: TokenRefusal } {
  if (typeof idToken !== 'string' || idToken.length > 8192) return { refused: 'bad-token' };
  const parts = idToken.split('.');
  if (parts.length !== 3) return { refused: 'bad-token' };
  const raw = unb64url(parts[1]!);
  let claims: Record<string, unknown>;
  try {
    const parsed = raw === null ? null : (JSON.parse(new TextDecoder().decode(Uint8Array.from(raw, (c) => c.charCodeAt(0)))) as unknown);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { refused: 'bad-token' };
    claims = parsed as Record<string, unknown>;
  } catch {
    return { refused: 'bad-token' };
  }
  if (typeof claims['iss'] !== 'string' || !GOOGLE_ISSUERS.includes(claims['iss'])) return { refused: 'wrong-issuer' };
  const aud = claims['aud'];
  if (!(aud === clientId || (Array.isArray(aud) && aud.includes(clientId) && claims['azp'] === clientId))) return { refused: 'wrong-audience' };
  if (typeof claims['exp'] !== 'number' || claims['exp'] * 1000 <= nowMs) return { refused: 'expired' };
  if (claims['nonce'] !== nonce) return { refused: 'wrong-nonce' };
  if (claims['email_verified'] !== true) return { refused: 'unverified' };
  const email = normalEmail(claims['email']);
  return email ? { email } : { refused: 'unverified' };
}

// ---------- the routes ----------

/** The collections object's calls a Google sign-in makes (accountBook.ts has the rules). */
export interface GoogleRpc {
  accountGoogleStart(nonce: string, kind: GoogleFor, cid: string | null, ipHash: string): Promise<number | null>;
  accountGoogleBack(nonce: string): Promise<{ kind: GoogleFor; cid: string | null } | null>;
  accountGoogleLink(kind: GoogleFor, cid: string | null, emailHash: string, emailSeal: string, nonce: string): Promise<GoogleLink>;
}

export interface GoogleDeps {
  rpc: GoogleRpc;
  client: GoogleClient;
  /** Signs the state and the link the page is sent to. */
  secret: string;
  keys: Promise<EmailKeys>;
  /** The park's own address, as the request came in: the redirect URI is on it, and so is the page. */
  origin: string;
  /** The page's owl (its pass's collector), to protect; null without a pass. */
  cid: string | null;
  /** The client's address, for the limit on sign-ins started from one place. */
  ip: string;
  /** The request's cookies, as its Cookie header has them. */
  cookies: string | null;
  fetch: typeof fetch;
  log: Logger;
  now: number;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

/** The verifier's cookie: this path alone, out of reach of the page's scripts, sent on the way back from Google. */
function cookie(origin: string, value: string, maxAgeS: number): string {
  const secure = origin.startsWith('https:') ? '; Secure' : '';
  return `${GOOGLE_COOKIE}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAgeS}; HttpOnly; SameSite=Lax${secure}`;
}

/** The cookie's value: the verifier, and the page's query string to come back to. */
function cookieValue(verifier: string, back: string): string {
  return back ? `${verifier}.${b64url(enc.encode(back))}` : verifier;
}

/** The verifier and the query string from the request's cookie (the query only when it is one). */
function readCookie(header: string | null): { verifier: string | null; back: string } {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k !== GOOGLE_COOKIE) continue;
    const [verifier, back] = v.join('=').split('.');
    const query = back ? unb64url(back) : '';
    return { verifier: verifier && VERIFIER_RE.test(verifier) ? verifier : null, back: query && BACK_RE.test(query) ? query : '' };
  }
  return { verifier: null, back: '' };
}

/** The page (with its query string), its fragment saying what to open (a link's token, or how the sign-in ended); the verifier's cookie cleared. */
function toPage(origin: string, back: string, fragment: string): Response {
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: `${origin}/${back}#${fragment}`, 'Set-Cookie': cookie(origin, '', 0), 'Referrer-Policy': 'no-referrer' } });
}

/** POST /api/account/google/start {for}: Google's address for this sign-in, and the verifier's cookie. */
export async function googleStart(body: Record<string, unknown>, d: GoogleDeps): Promise<Response> {
  const kind = body['for'];
  if (kind !== 'protect' && kind !== 'restore') return Response.json({ error: 'bad-request' }, { status: 400, headers: NO_STORE });
  if (kind === 'protect' && !d.cid) return Response.json({ error: 'bad-pass' }, { status: 401, headers: NO_STORE });
  const keys = await d.keys;
  const nonce = randomNonce();
  const exp = await d.rpc.accountGoogleStart(nonce, kind, kind === 'protect' ? d.cid : null, await keyed(keys, 'i', d.ip));
  if (exp === null) return Response.json({ error: 'try-later' }, { status: 429, headers: NO_STORE });
  const verifier = pkceVerifier();
  const to = new URL(d.client.authUrl);
  to.search = new URLSearchParams({
    client_id: d.client.clientId,
    redirect_uri: `${d.origin}${GOOGLE_CALLBACK_PATH}`,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    state: await mintLink(d.secret, 'google', nonce, Math.floor(exp / 1000)),
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  const back = typeof body['back'] === 'string' && BACK_RE.test(body['back']) ? body['back'] : '';
  return Response.json({ ok: true, url: to.toString() }, { headers: { ...NO_STORE, 'Set-Cookie': cookie(d.origin, cookieValue(verifier, back), Math.floor(GOOGLE_STATE_MS / 1000)) } });
}

/*
 * TODO-DOCS (OP-313): docs/LOGGING.md: google_signed_in (worker.accounts, info): `for` (protect or
 * restore), `opens` (protect, restore or offer), `collector_hash` when it protects the page's owl;
 * google_refused (worker.accounts, info): `reason` (cancelled, google-error, bad-state, used-state,
 * no-code, no-cookie, token-refused, bad-token, wrong-issuer, wrong-audience, expired, wrong-nonce,
 * unverified) and `for` when the state said; send_failed (worker.accounts) gains Google's token endpoint
 * refusing or out of reach, with `status`. Neither ever carries the email, the code or a token.
 */

/** Why a sign-in back from Google went no further, for the log (never the email, the code or a token). */
export type GoogleRefusal = 'cancelled' | 'google-error' | 'bad-state' | 'used-state' | 'no-code' | 'no-cookie' | 'token-refused' | TokenRefusal;

/**
 * GET /api/account/google/callback?code&state (or ?error&state): the browser back from Google, sent on
 * to the page. A good sign-in opens the link its email would have been mailed; anything else ends in
 * `#google=stopped` (the player said no at Google) or `#google=failed`, with what it was for when the
 * state said, and the page says so kindly and points back to the email link.
 */
export async function googleCallback(params: URLSearchParams, d: GoogleDeps): Promise<Response> {
  const { verifier, back: query } = readCookie(d.cookies);
  const refuse = (reason: GoogleRefusal, kind: GoogleFor | null): Response => {
    d.log.info('worker.accounts', 'google_refused', 'A Google sign-in came back and went no further: the page points back to the email link.', { reason, ...(kind ? { for: kind } : {}) });
    return toPage(d.origin, query, `google=${reason === 'cancelled' ? 'stopped' : 'failed'}${kind ? `-${kind}` : ''}`);
  };
  const state = await readLink(d.secret, params.get('state'), 'google', Math.floor(d.now / 1000));
  if (!state) return refuse('bad-state', null);
  // The state is spent whatever Google said, so it never comes back twice.
  const back = await d.rpc.accountGoogleBack(state.nonce);
  if (!back) return refuse('used-state', null);
  const error = params.get('error');
  if (error !== null) return refuse(error === 'access_denied' ? 'cancelled' : 'google-error', back.kind);
  const code = params.get('code');
  if (!code || code.length > 2048) return refuse('no-code', back.kind);
  if (!verifier) return refuse('no-cookie', back.kind);
  let idToken: unknown;
  try {
    const r = await d.fetch(d.client.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: d.client.clientId,
        client_secret: d.client.clientSecret,
        redirect_uri: `${d.origin}${GOOGLE_CALLBACK_PATH}`,
        code_verifier: verifier,
      }).toString(),
    });
    if (!r.ok) {
      d.log.warn('worker.accounts', 'send_failed', 'Google’s token endpoint refused a sign-in’s code.', { status: r.status });
      return refuse('token-refused', back.kind);
    }
    idToken = ((await r.json()) as { id_token?: unknown }).id_token;
  } catch (e) {
    d.log.warn('worker.accounts', 'send_failed', 'Google’s token endpoint could not be reached or did not answer in JSON.', { error: e });
    return refuse('token-refused', back.kind);
  }
  const who = idTokenEmail(idToken, d.client.clientId, state.nonce, d.now);
  if ('refused' in who) return refuse(who.refused, back.kind);
  const keys = await d.keys;
  const nonce = randomNonce();
  const link = await d.rpc.accountGoogleLink(back.kind, back.cid, await keyed(keys, 'e', who.email), await seal(keys, who.email), nonce);
  const token = await mintLink(d.secret, link.kind === 'restore' ? 'restore' : 'protect', nonce, Math.floor(link.exp / 1000));
  d.log.info('worker.accounts', 'google_signed_in', 'A Google sign-in came back with a verified email: the page opens the link it would have been mailed. Nothing of the Google account is kept.', {
    for: back.kind,
    opens: link.kind,
    ...(back.cid ? { collector_hash: hashForLog(back.cid) } : {}),
  });
  return toPage(d.origin, query, `${link.kind}=${token}`);
}
