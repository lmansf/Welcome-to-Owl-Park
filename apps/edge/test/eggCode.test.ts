import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CollectionBook,
  EGG_CODE_TRIES,
  EGG_VARIANT,
  LINE_DEFAULTS,
  LOCAL_EGG_CODE_PUBLIC_KEY,
  REALMS_DEFAULTS,
  RIBBON_DEFAULTS,
  hashForLog,
  redeemEgg,
  toBase64Url,
  verifyEggCode,
} from '@owl-park/shared';
import { makeEggCode } from '@owl-park/shared/testing/egg-code';
import { EggCodeBook } from '../src/eggCodeBook';
import type { Env } from '../src/env';
import { forgetGate } from '../src/gateSwitch';
import { forgetLimits } from '../src/limits';
import { captureLogs } from '../src/logs';
import type { OverflowState } from '../src/Overflow';
import { forgetCounts, forgetOverflow } from '../src/overflowState';
import { mintPass } from '../src/pass';
import { eggCodeKey, forgetEggCodeTries } from '../src/routes/collection';
import { SqlCollectionStore } from '../src/sqlStore';
import { logged } from './logged';
import { sqlStorage } from './sqlite';

// ---- Egg codes at the Worker (OP-260): checked against the portfolio site's public key, then redeemed once ----

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
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const state: OverflowState = {
  line: LINE_DEFAULTS,
  active: false,
  waiting: 0,
  front: 0,
  rate: 0,
  ribbon: RIBBON_DEFAULTS,
  notice: null,
  copies: {},
  count: null,
  countedAt: null,
  realms: REALMS_DEFAULTS,
};
const stub = (answer: (req: Request) => Response) => ({
  idFromName: (name: string) => name,
  get: () => ({
    fetch: async (input: Request | string, init?: RequestInit) => answer(typeof input === 'string' ? new Request(input, init) : input),
  }),
});

/** The portfolio site's key pair, as it would hold it: the park is given only the public half. */
let site: { jwk: JsonWebKey; pub: string };
/** The real rules over a real ledger, behind the stand-in collections object. */
let book: CollectionBook;
let ledger: EggCodeBook;
let reached: string[] = [];

const env = (more: Record<string, string> = {}) =>
  ({
    VOTES: stub((req) => (new URL(req.url).pathname === '/gate' ? Response.json({ gate: 'ticket' }) : Response.json({ ok: true }))),
    OVERFLOW: stub(() => Response.json(state)),
    ROOMS: stub(() => new Response('in')),
    COLLECTIONS: {
      getByName: () => ({
        redeemEgg: async (cid: string, id: string) => {
          reached.push(id);
          return redeemEgg(book, ledger, cid, id, Date.now());
        },
      }),
    },
    ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } }) },
    GATE: 'ticket',
    PASS_SIGNING_KEY: KEY,
    EGG_CODE_KEY: site.pub,
    ...more,
  }) as unknown as Env;

let n = 0;
/** A pass; `adm` false is a free guest, still outside the turnstiles. */
const passFor = (cid: string, adm = true) =>
  mintPass(KEY, { id: `v_egg${String(++n).padStart(7, '0')}`, exp: Math.floor(Date.now() / 1000) + 600, adm, cid });
const redeem = async (code: unknown, pass: string, ip = '198.51.100.7', e = env()) => {
  const r = await worker.fetch(
    new Request('https://park.example/api/redeem', {
      method: 'POST',
      headers: { Authorization: `Bearer ${pass}`, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify({ code }),
    }),
    e,
    CTX,
  );
  return { status: r.status, body: (await r.json()) as Record<string, unknown> };
};

let cap: ReturnType<typeof captureLogs>;
beforeEach(async () => {
  const k = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  site = {
    jwk: (await crypto.subtle.exportKey('jwk', k.privateKey)) as JsonWebKey,
    pub: toBase64Url(new Uint8Array((await crypto.subtle.exportKey('raw', k.publicKey)) as ArrayBuffer)),
  };
  const sql = sqlStorage();
  book = new CollectionBook(new SqlCollectionStore(sql));
  ledger = new EggCodeBook(sql);
  reached = [];
  forgetLimits();
  forgetEggCodeTries();
  forgetGate();
  forgetOverflow();
  forgetCounts();
  cap = captureLogs();
});
afterEach(() => {
  cap.restore();
  vi.useRealTimers();
});

describe('egg codes at the Worker (OP-260)', () => {
  it('gives the egg for a good code, once in the whole park; the same code on another owl is refused', async () => {
    const code = await makeEggCode(site.jwk);
    expect(await redeem(code, await passFor('c_eggana01'))).toEqual({ status: 200, body: { ok: true, variant: EGG_VARIANT } });
    expect(book.owned('c_eggana01', undefined, Date.now())).toContain(EGG_VARIANT);
    expect(await redeem(code, await passFor('c_eggben01'))).toEqual({ status: 200, body: { ok: false, reason: 'bad' } });
    expect(book.owned('c_eggben01', undefined, Date.now())).not.toContain(EGG_VARIANT);
  });

  it('keeps a second code unspent for an owl that already has the egg', async () => {
    const pass = await passFor('c_egghas01');
    await redeem(await makeEggCode(site.jwk), pass);
    const second = await makeEggCode(site.jwk);
    expect((await redeem(second, pass)).body).toEqual({ ok: false, reason: 'have' });
    expect(ledger.taken((await verifyEggCode(second, site.pub))!)).toBe(false);
  });

  it('refuses a forged code, a code made with the offline park’s test key, and junk, the same way, before the collections object', async () => {
    const forger = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign'])) as CryptoKeyPair;
    const forged = await makeEggCode((await crypto.subtle.exportKey('jwk', forger.privateKey)) as JsonWebKey);
    const pass = await passFor('c_eggfake1');
    for (const code of [forged, await makeEggCode(), 'EGG-hello', 42, null])
      expect(await redeem(code, pass)).toEqual({ status: 200, body: { ok: false, reason: 'bad' } });
    expect(reached).toEqual([]);
  });

  it('lets a free guest redeem and keep the egg, outside the turnstiles (the owner’s rule)', async () => {
    expect((await redeem(await makeEggCode(site.jwk), await passFor('c_eggguest', false))).body).toEqual({
      ok: true,
      variant: EGG_VARIANT,
    });
    expect(book.owned('c_eggguest', undefined, Date.now())).toContain(EGG_VARIANT);
  });

  it('takes no code at all with no key set, or with the offline park’s test key set by mistake', async () => {
    const pass = await passFor('c_eggnokey');
    expect(await redeem(await makeEggCode(site.jwk), pass, undefined, env({ EGG_CODE_KEY: '' }))).toEqual({
      status: 503,
      body: { ok: false, reason: 'closed' },
    });
    expect(await redeem(await makeEggCode(), pass, undefined, env({ EGG_CODE_KEY: LOCAL_EGG_CODE_PUBLIC_KEY }))).toEqual({
      status: 503,
      body: { ok: false, reason: 'closed' },
    });
    expect(eggCodeKey({ EGG_CODE_KEY: ` ${site.pub} ` })).toBe(site.pub);
    expect(reached).toEqual([]);
  });

  it('takes this many tries an hour per owl and per address, then 429 and one line; the hour out, it tries again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T20:00:00Z'));
    const pass = await passFor('c_eggtries');
    const statuses: number[] = [];
    for (let i = 0; i < EGG_CODE_TRIES.limit + 2; i++) statuses.push((await redeem(`EGG-guess${i}`, pass)).status);
    expect(statuses).toEqual([...Array(EGG_CODE_TRIES.limit).fill(200), 429, 429]);
    // Even a good code waits for the hour: the cap counts tries, not wrong ones.
    expect((await redeem(await makeEggCode(site.jwk), pass)).body).toEqual({ ok: false, reason: 'full' });
    logged(cap.lines, 'rate_limited', {
      component: 'worker.guard',
      level: 'warn',
      route: '/api/redeem',
      limit: 'egg-code',
      collector_hash: hashForLog('c_eggtries'),
    });
    expect(cap.lines.filter((l) => l.event === 'rate_limited' && l['route'] === '/api/redeem')).toHaveLength(1);
    // Fresh owls from one address meet the address's cap.
    forgetEggCodeTries();
    const flood: number[] = [];
    for (let i = 0; i < EGG_CODE_TRIES.limit + 1; i++)
      flood.push((await redeem('EGG-x', await passFor(`c_eggfl${String(i).padStart(3, '0')}`), '198.51.100.9')).status);
    expect(flood.at(-1)).toBe(429);
    // The hour out (a fresh pass for the same owl, since the first ran out with the hour).
    vi.setSystemTime(Date.now() + EGG_CODE_TRIES.windowMs);
    expect((await redeem(await makeEggCode(site.jwk), await passFor('c_eggtries'))).body).toEqual({ ok: true, variant: EGG_VARIANT });
  });

  it('never writes the code into the log', async () => {
    const code = await makeEggCode(site.jwk);
    await redeem(code, await passFor('c_egglog01'));
    expect(JSON.stringify(cap.lines)).not.toContain(code.slice(4, 30));
  });

  it('turns a code with no pass away', async () => {
    const r = await worker.fetch(new Request('https://park.example/api/redeem', { method: 'POST', body: '{}' }), env(), CTX);
    expect(r.status).toBe(401);
  });
});
