import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_STARTS_PER_IP_PER_HOUR, GOOGLE_STATE_MS, LINE_DEFAULTS, REALMS_DEFAULTS, RIBBON_DEFAULTS, hashForLog } from '@owl-park/shared';
import { AccountBook } from '../src/accountBook';
import type { Env } from '../src/env';
import { GOOGLE_CALLBACK_PATH, GOOGLE_COOKIE, googleClient, idTokenEmail, pkceChallenge } from '../src/google';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { forgetGate } from '../src/gateSwitch';
import { mintLink, mintPass, randomNonce } from '../src/pass';
import { logged } from './logged';
import { sqlStorage } from './sqlite';

// ---- Sign in with Google (OP-313): the Worker's routes, with Google stood in by a fetch stub ----

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));
const worker = (await import('../src/index')).default;

const KEY = 'test-signing-key-0123456789abcdef';
const ACCOUNT_SECRET = 'test-account-secret-of-thirty-two-plus';
const CLIENT_ID = 'owl-park-test.apps.googleusercontent.com';
const CLIENT_SECRET = 'test-google-client-secret';
const ORIGIN = 'https://park.example';
const EMAIL = 'kid.owl@example.com';
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const state: OverflowState = { line: LINE_DEFAULTS, active: false, waiting: 0, front: 0, rate: 0, ribbon: RIBBON_DEFAULTS, notice: null, copies: {}, count: null, countedAt: null, realms: REALMS_DEFAULTS };
const stub = (answer: (req: Request) => Response) => ({
  idFromName: (name: string) => name,
  get: () => ({ fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input) }),
});

/** Deterministic randomness for friend codes. */
function seq(): (n: number) => Uint8Array {
  let x = 7;
  return (n) =>
    Uint8Array.from({ length: n }, () => {
      x = (x * 1103515245 + 12345) >>> 0;
      return x >>> 16;
    });
}

let book: AccountBook;
let dev = 0;
const newDevice = () => `d_google${String(++dev).padStart(4, '0')}`;
const env = (more: Record<string, string | undefined> = {}) =>
  ({
    VOTES: stub((req) => (new URL(req.url).pathname === '/gate' ? Response.json({ gate: null }) : Response.json({ ok: true }))),
    OVERFLOW: stub(() => Response.json(state)),
    ROOMS: stub(() => new Response('ok')),
    // The collections object's account calls, the account store behind them in a test database.
    COLLECTIONS: {
      getByName: () => ({
        accountGoogleStart: async (nonce: string, kind: 'protect' | 'restore', cid: string | null, ip: string) => book.googleStart(nonce, kind, cid, ip, Date.now()),
        accountGoogleBack: async (nonce: string) => book.googleBack(nonce, Date.now()),
        accountGoogleLink: async (kind: 'protect' | 'restore', cid: string | null, h: string, s: string, nonce: string) => book.googleLink(kind, cid, h, s, nonce, Date.now()),
        accountConfirm: async (nonce: string, opener: string | null) => book.confirm(nonce, opener, Date.now()),
        accountOwls: async (nonce: string) => book.pictures(nonce, Date.now()),
        accountBind: async (nonce: string, code: string, here: { cid: string; dev: string | null } | null) => book.restore(nonce, code, here, newDevice, Date.now()),
      }),
    },
    ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) },
    GATE: 'open',
    PASS_SIGNING_KEY: KEY,
    ACCOUNTS: 'on',
    ACCOUNT_SECRET,
    GOOGLE_SIGNIN: 'on',
    GOOGLE_CLIENT_ID: CLIENT_ID,
    GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    ...more,
  }) as unknown as Env;

let n = 0;
const passFor = (cid: string) => mintPass(KEY, { id: `v_goog${String(++n).padStart(6, '0')}`, exp: Math.floor(Date.now() / 1000) + 600, adm: false, cid });
const call = (path: string, init: RequestInit & { pass?: string } = {}, e = env()) => {
  const headers = new Headers(init.headers);
  headers.set('CF-Connecting-IP', '198.51.100.9');
  if (init.pass) headers.set('Authorization', `Bearer ${init.pass}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  return worker.fetch(new Request(`${ORIGIN}${path}`, { ...init, headers }), e, CTX);
};
const post = (path: string, body: unknown, pass?: string, e = env()) => call(path, { method: 'POST', body: JSON.stringify(body), ...(pass ? { pass } : {}) }, e);

/** What Google's token endpoint is asked, and what it answers: an ID token with these claims. */
let asked: URLSearchParams[] = [];
let claims: (nonce: string) => Record<string, unknown>;
let challenges = new Map<string, string>();
const fakeJwt = (c: Record<string, unknown>) => `${btoa(JSON.stringify({ alg: 'RS256' }))}.${btoa(JSON.stringify(c)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.c2ln`;
const google = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = String(input instanceof Request ? input.url : input);
  if (url !== 'https://oauth2.googleapis.com/token') return new Response('not google', { status: 404 });
  const form = new URLSearchParams(String(init?.body ?? ''));
  asked.push(form);
  // As Google does: the code is the one it gave, for this client, and the verifier answers the challenge.
  const code = form.get('code') ?? '';
  const nonce = challenges.get(code);
  if (!nonce || form.get('client_secret') !== CLIENT_SECRET || form.get('client_id') !== CLIENT_ID) return Response.json({ error: 'invalid_grant' }, { status: 400 });
  if ((await pkceChallenge(form.get('code_verifier') ?? '')) !== challenges.get(`${code}:challenge`)) return Response.json({ error: 'invalid_grant' }, { status: 400 });
  return Response.json({ access_token: 'ya29.not-kept', id_token: fakeJwt(claims(nonce)), token_type: 'Bearer' });
};

const good = (email = EMAIL) => (nonce: string) => ({ iss: 'https://accounts.google.com', aud: CLIENT_ID, azp: CLIENT_ID, sub: '1234567890', email, email_verified: true, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), nonce, name: 'Not Kept', picture: 'https://example.com/not-kept.png' });

/** A sign-in started: Google's address it answers, and the verifier's cookie it set. */
async function start(kind: 'protect' | 'restore', pass?: string) {
  const r = await post('/api/account/google/start', { for: kind }, pass);
  expect(r.status).toBe(200);
  const to = new URL(((await r.json()) as { url: string }).url);
  const set = r.headers.get('Set-Cookie') ?? '';
  const cookie = /op_google=([^;]*)/.exec(set)?.[1] ?? '';
  return { to, set, cookie };
}

/** Google sends the browser back with a code for that sign-in (as Google would, having remembered its challenge and nonce). */
async function back(s: Awaited<ReturnType<typeof start>>, over: { cookie?: string; params?: Record<string, string> } = {}) {
  const code = `4/0A${randomNonce()}`;
  challenges.set(code, s.to.searchParams.get('nonce')!);
  challenges.set(`${code}:challenge`, s.to.searchParams.get('code_challenge')!);
  const q = new URLSearchParams(over.params ?? { code, state: s.to.searchParams.get('state')! });
  const r = await call(`${GOOGLE_CALLBACK_PATH}?${q}`, { headers: { Cookie: `other=1; ${GOOGLE_COOKIE}=${over.cookie ?? s.cookie}` } });
  expect(r.status).toBe(303);
  const loc = new URL(r.headers.get('Location')!);
  expect(loc.origin).toBe(ORIGIN);
  expect(r.headers.get('Set-Cookie')).toContain(`${GOOGLE_COOKIE}=;`);
  const frag = new URLSearchParams(loc.hash.slice(1));
  return { frag, code, r };
}

let cap: ReturnType<typeof captureLogs>;
beforeEach(() => {
  book = new AccountBook(sqlStorage(), seq());
  asked = [];
  challenges = new Map();
  claims = good();
  forgetLimits();
  forgetGate();
  forgetOverflow();
  forgetCounts();
  vi.stubGlobal('fetch', google);
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('sign in with Google (OP-313)', () => {
  it('is off, every route a 404, unless GOOGLE_SIGNIN is on with both secrets, accounts on and their key set', async () => {
    const offs = [{ GOOGLE_SIGNIN: undefined }, { GOOGLE_SIGNIN: 'off' }, { GOOGLE_CLIENT_ID: undefined }, { GOOGLE_CLIENT_SECRET: '' }, { ACCOUNTS: 'off' }, { ACCOUNT_SECRET: 'too-short' }];
    const pass = await passFor('c_googoff0001');
    for (const off of offs) {
      // Each one fresh: the API's own limit on account calls from one address is not what this test is about.
      forgetLimits();
      const e = env(off);
      expect(googleClient(e)).toBeNull();
      expect((await call('/api/account/google', {}, e)).status).toBe(404);
      expect((await post('/api/account/google/start', { for: 'protect' }, pass, e)).status).toBe(404);
      expect((await call(`${GOOGLE_CALLBACK_PATH}?code=x&state=y`, {}, e)).status).toBe(404);
    }
    expect(googleClient(env())).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token' });
    const ready = await call('/api/account/google', {});
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ ok: true, ready: true });
  });

  it('starts with Google’s address: this client, the park’s own redirect, openid email only, a PKCE S256 challenge and a signed state; the verifier stays in a cookie', async () => {
    const s = await start('protect', await passFor('c_googstart01'));
    expect(s.to.origin + s.to.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    const p = s.to.searchParams;
    expect(p.get('client_id')).toBe(CLIENT_ID);
    expect(p.get('redirect_uri')).toBe('https://park.example/api/account/google/callback');
    expect(p.get('response_type')).toBe('code');
    expect(p.get('scope')).toBe('openid email');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toBe(await pkceChallenge(s.cookie));
    expect(p.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.get('state')).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(p.get('nonce')).toMatch(/^[A-Za-z0-9_-]{22}$/);
    // The verifier is never in Google's address, only in a cookie the page's scripts cannot read.
    expect(s.to.toString()).not.toContain(s.cookie);
    expect(s.set).toMatch(/HttpOnly/);
    expect(s.set).toMatch(/SameSite=Lax/);
    expect(s.set).toMatch(/Secure/);
    expect(s.set).toMatch(/Path=\/api\/account\/google;/);
    expect(s.set).toMatch(new RegExp(`Max-Age=${GOOGLE_STATE_MS / 1000}`));
  });

  it('comes back to the page’s own query string, and to the bare page for anything that is not one', async () => {
    const pass = await passFor('c_googback001');
    const r = await post('/api/account/google/start', { for: 'protect', back: '?transport=edge&room=hub&look=%232F3E5C' }, pass);
    const s = { to: new URL(((await r.json()) as { url: string }).url), set: '', cookie: /op_google=([^;]*)/.exec(r.headers.get('Set-Cookie') ?? '')![1]! };
    const { r: res } = await back(s);
    expect(res.headers.get('Location')).toMatch(/^https:\/\/park\.example\/\?transport=edge&room=hub&look=%232F3E5C#protect=/);
    for (const bad of ['//evil.example/', 'https://evil.example/', '?a=1#protect=x', '?a=<b>']) {
      forgetLimits();
      const t = await post('/api/account/google/start', { for: 'restore', back: bad });
      const u = { to: new URL(((await t.json()) as { url: string }).url), set: '', cookie: /op_google=([^;]*)/.exec(t.headers.get('Set-Cookie') ?? '')![1]! };
      expect((await back(u)).r.headers.get('Location')).toMatch(/^https:\/\/park\.example\/#(restore|offer)=/);
    }
  });

  it('refuses to start protecting without a pass, or for something else, and starts so many from one address an hour', async () => {
    expect((await post('/api/account/google/start', { for: 'protect' })).status).toBe(401);
    expect((await post('/api/account/google/start', { for: 'everything' }, await passFor('c_googbad0001'))).status).toBe(400);
    // Straight to the store: the API's own limits on one owl come first through the Worker.
    for (let i = 0; i < GOOGLE_STARTS_PER_IP_PER_HOUR; i++) expect(book.googleStart(`nonce-start-${String(i).padStart(4, '0')}`, 'restore', null, 'ip-one', Date.now())).not.toBeNull();
    expect(book.googleStart('nonce-start-past', 'restore', null, 'ip-one', Date.now())).toBeNull();
    expect(book.googleStart('nonce-start-other', 'restore', null, 'ip-two', Date.now())).not.toBeNull();
  });

  it('protects the pass’s owl with a verified email, as an opened mail link does, and keeps nothing of the Google account', async () => {
    const pass = await passFor('c_googprot001');
    const s = await start('protect', pass);
    const { frag, code } = await back(s);
    const token = frag.get('protect');
    expect(token).toBeTruthy();
    // Google was asked once, with the code, this client, the same redirect and the verifier.
    expect(asked).toHaveLength(1);
    expect(asked[0]!.get('grant_type')).toBe('authorization_code');
    expect(asked[0]!.get('redirect_uri')).toBe('https://park.example/api/account/google/callback');
    expect(asked[0]!.get('code_verifier')).toBe(s.cookie);
    // The page opens it as it opens a mailed link.
    const r = await post('/api/account/confirm', { token }, pass);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, account: { protected: true }, mine: true });
    expect(book.account('c_googprot001', Date.now()).protected).toBe(true);
    logged(cap.lines, 'google_signed_in', { component: 'worker.accounts', for: 'protect', opens: 'protect', collector_hash: hashForLog('c_googprot001') });
    // Nothing sensitive is logged: not the email, the code, the state, the verifier, Google's tokens or its account's name and picture.
    const said = JSON.stringify(cap.lines);
    for (const secret of [EMAIL, 'kid.owl', code, s.to.searchParams.get('state')!, s.cookie, 'ya29', CLIENT_SECRET, '1234567890', 'Not Kept', 'not-kept.png', token!]) expect(said).not.toContain(secret);
    expect(cap.lines.filter((l) => l.event === 'log_field_refused')).toEqual([]);
  });

  it('brings an owl here: the email’s owls as pictures to tap, and the tap binds it on this screen', async () => {
    const pass = await passFor('c_googrest001');
    await post('/api/account/confirm', { token: (await back(await start('protect', pass))).frag.get('protect') }, pass);
    const code = book.account('c_googrest001', Date.now()).friendCode;
    // Another screen, with no owl of its own on a pass: bringing one here needs none.
    const { frag } = await back(await start('restore'));
    const token = frag.get('restore');
    expect(token).toBeTruthy();
    const owls = await post('/api/account/owls', { token });
    expect(await owls.json()).toEqual({ ok: true, owls: [{ code, look: null }] });
    const bound = await post('/api/account/bind', { token, code });
    expect(bound.status).toBe(200);
    expect((await bound.json()) as { collector: string }).toMatchObject({ ok: true, collector: expect.any(String) });
    expect(book.account('c_googrest001', Date.now()).device).toMatch(/^d_google/);
    logged(cap.lines, 'google_signed_in', { for: 'restore', opens: 'restore' });
    // The link it opened is spent, as a mailed one is.
    expect((await post('/api/account/bind', { token, code })).status).toBe(410);
  });

  it('offers to protect this screen’s owl when the email protects none, so one person never ends up with two owls', async () => {
    claims = good('new.owl@example.com');
    const { frag } = await back(await start('restore'));
    expect(frag.get('restore')).toBeNull();
    const token = frag.get('offer');
    expect(token).toBeTruthy();
    logged(cap.lines, 'google_signed_in', { for: 'restore', opens: 'offer' });
    const pass = await passFor('c_googoffer01');
    expect(await (await post('/api/account/confirm', { token }, pass)).json()).toMatchObject({ ok: true, mine: true, account: { protected: true } });
  });

  it('refuses a callback with a state that is forged, run out or used already, and asks Google nothing', async () => {
    const pass = await passFor('c_googstat001');
    const s = await start('protect', pass);
    const first = await back(s);
    expect(first.frag.get('protect')).toBeTruthy();
    // The same state again: refused, though the code would be good.
    const again = await back(s);
    expect(again.frag.get('google')).toBe('failed');
    logged(cap.lines, 'google_refused', { reason: 'used-state' });
    // One signed with another key, and one of a mailed link's kind.
    const forged = await mintLink('another-signing-key-entirely-000', 'google', randomNonce(), Math.floor(Date.now() / 1000) + 600);
    const mailed = await mintLink(KEY, 'restore', randomNonce(), Math.floor(Date.now() / 1000) + 600);
    for (const bad of [forged, mailed, 'not-a-state']) expect((await back(s, { params: { code: 'x', state: bad } })).frag.get('google')).toBe('failed');
    logged(cap.lines, 'google_refused', { reason: 'bad-state' });
    // A state past its ten minutes.
    const late = await start('protect', pass);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + GOOGLE_STATE_MS + 1000);
    expect((await back(late)).frag.get('google')).toBe('failed');
    vi.useRealTimers();
    expect(asked).toHaveLength(1);
  });

  it('refuses a sign-in without the verifier’s cookie, or one Google’s token endpoint refuses', async () => {
    const pass = await passFor('c_googcook001');
    const none = await back(await start('protect', pass), { cookie: '' });
    expect(none.frag.get('google')).toBe('failed-protect');
    logged(cap.lines, 'google_refused', { reason: 'no-cookie', for: 'protect' });
    // A verifier from another sign-in: Google's PKCE check fails it.
    const other = await start('protect', pass);
    const wrong = await back(await start('protect', pass), { cookie: other.cookie });
    expect(wrong.frag.get('google')).toBe('failed-protect');
    logged(cap.lines, 'google_refused', { reason: 'token-refused', for: 'protect' });
    logged(cap.lines, 'send_failed', { component: 'worker.accounts', status: 400 });
    expect(book.account('c_googcook001', Date.now()).protected).toBe(false);
  });

  it('takes only an email Google says is verified', async () => {
    claims = (nonce) => ({ ...good()(nonce), email_verified: false });
    expect((await back(await start('restore'))).frag.get('google')).toBe('failed-restore');
    claims = (nonce) => ({ ...good()(nonce), email_verified: 'true' });
    expect((await back(await start('restore'))).frag.get('google')).toBe('failed-restore');
    logged(cap.lines, 'google_refused', { reason: 'unverified', for: 'restore' });
    expect(cap.lines.filter((l) => l.event === 'google_signed_in')).toEqual([]);
  });

  it('refuses an ID token for another client, from another issuer, run out, or with another nonce', async () => {
    claims = (nonce) => ({ ...good()(nonce), aud: 'someone-else.apps.googleusercontent.com', azp: 'someone-else.apps.googleusercontent.com' });
    const pass = await passFor('c_googaud0001');
    expect((await back(await start('protect', pass))).frag.get('google')).toBe('failed-protect');
    logged(cap.lines, 'google_refused', { reason: 'wrong-audience', for: 'protect' });
    expect(book.account('c_googaud0001', Date.now()).protected).toBe(false);
    // The checks themselves, one by one.
    const now = Date.now();
    const base = good()('the-nonce');
    expect(idTokenEmail(fakeJwt(base), CLIENT_ID, 'the-nonce', now)).toEqual({ email: EMAIL });
    expect(idTokenEmail(fakeJwt({ ...base, iss: 'accounts.google.com' }), CLIENT_ID, 'the-nonce', now)).toEqual({ email: EMAIL });
    expect(idTokenEmail(fakeJwt({ ...base, iss: 'https://accounts.example.com' }), CLIENT_ID, 'the-nonce', now)).toEqual({ refused: 'wrong-issuer' });
    expect(idTokenEmail(fakeJwt({ ...base, aud: [CLIENT_ID, 'other'], azp: 'other' }), CLIENT_ID, 'the-nonce', now)).toEqual({ refused: 'wrong-audience' });
    expect(idTokenEmail(fakeJwt({ ...base, exp: Math.floor(now / 1000) - 1 }), CLIENT_ID, 'the-nonce', now)).toEqual({ refused: 'expired' });
    expect(idTokenEmail(fakeJwt(base), CLIENT_ID, 'another-nonce', now)).toEqual({ refused: 'wrong-nonce' });
    expect(idTokenEmail(fakeJwt({ ...base, email: 'not an email' }), CLIENT_ID, 'the-nonce', now)).toEqual({ refused: 'unverified' });
    expect(idTokenEmail('no.dots', CLIENT_ID, 'the-nonce', now)).toEqual({ refused: 'bad-token' });
    expect(idTokenEmail(undefined, CLIENT_ID, 'the-nonce', now)).toEqual({ refused: 'bad-token' });
  });

  it('sends the page back kindly when the player says no at Google, and spends the state', async () => {
    const s = await start('restore');
    const r = await back(s, { params: { error: 'access_denied', state: s.to.searchParams.get('state')! } });
    expect(r.frag.get('google')).toBe('stopped-restore');
    logged(cap.lines, 'google_refused', { reason: 'cancelled', for: 'restore' });
    expect((await back(s, { params: { error: 'server_error', state: s.to.searchParams.get('state')! } })).frag.get('google')).toBe('failed');
    const t = await start('restore');
    expect((await back(t, { params: { error: 'admin_policy_enforced', state: t.to.searchParams.get('state')! } })).frag.get('google')).toBe('failed-restore');
    logged(cap.lines, 'google_refused', { reason: 'google-error', for: 'restore' });
    expect(asked).toEqual([]);
  });
});
