import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureLogs } from '../src/logs';
import {
  ENTRY_TTL_S,
  GUEST_PASS_TTL_S,
  KEEPER_TTL_S,
  isCollectorId,
  mintCollector,
  mintEntry,
  mintKeeper,
  mintLink,
  mintPass,
  passRefusal,
  readCollector,
  signingSecret,
  verifyEntry,
  verifyKeeper,
  verifyLink,
  verifyPass,
  type PassPayload,
} from '../src/pass';

// ---- The park's signed tokens (OP-131's survivors in pass.ts): what each kind takes, to the character and
// the second, and that a token of one kind is never read as another, whatever fields it carries ----
//
// TODO-DOCS (OP-131): pass.ts's equivalent mutants, for docs/TESTING.md's list (no input tells them apart):
// b64url's /=+$/ as /=+/ (btoa puts '=' only at the end); unb64url with no padding added, and its loop to
// i <= length (atob reads unpadded base64; a typed array drops a write past its end); the HMAC key made
// extractable (it never leaves key()); verified's dot test as dot < 0 or none (a token with no body, or no
// dot, then fails its signature or its JSON); verified's object test, five ways (every reader then asks
// for its own fields, which no primitive or array has).

const SECRET = 'pass-tests-signing-key-0123456789';
const NOW_S = 1_800_000_000;
const PASS = { id: 'v_abcdef', exp: NOW_S + 60, adm: false };
/** A token with the park's signature over any payload: how a token of another kind or shape is had in a test. */
const signed = (payload: Record<string, unknown>) => mintPass(SECRET, payload as unknown as PassPayload);
/** What a token carries: its first part, base64url JSON. */
function bodyOf(token: string): Record<string, unknown> {
  const part = token.split('.')[0]!.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4))) as Record<string, unknown>;
}

afterEach(() => vi.restoreAllMocks());

describe('a collector id', () => {
  it('is c_ and 8 to 16 letters or digits, with nothing before or after', () => {
    for (const id of ['c_abcd1234', 'c_ABCDEFGH12345678']) expect(isCollectorId(id)).toBe(true);
    for (const id of ['c_abcd123', 'c_abcdefgh123456789', 'xc_abcd1234', 'c_abcd1234 ', 'c_abcd-1234', 12345678]) expect(isCollectorId(id)).toBe(false);
  });
});

describe('the signing key', () => {
  it('is the one set when it has 16 characters or more, otherwise the development key, said once', () => {
    const cap = captureLogs();
    try {
      expect(signingSecret({ PASS_SIGNING_KEY: '0123456789abcdef' })).toBe('0123456789abcdef');
      const dev = signingSecret({});
      expect(dev).not.toBe('0123456789abcde');
      expect(signingSecret({ PASS_SIGNING_KEY: '0123456789abcde' })).toBe(dev);
      expect(cap.lines.filter((l) => l.event === 'signing_key_missing')).toHaveLength(1);
    } finally {
      cap.restore();
    }
  });
});

describe('a token', () => {
  it('is base64url with no padding in either part', async () => {
    for (let n = 6; n <= 9; n++) expect(await signed({ ...PASS, id: `v_${'a'.repeat(n)}` })).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  });

  it('is read up to 512 characters long, and no longer', async () => {
    // A pass padded out with a field the park does not read, to the length wanted.
    async function ofLength(length: number): Promise<string> {
      for (let x = 0; x < 600; x++) {
        const token = await signed({ ...PASS, pad: 'p'.repeat(x) });
        if (token.length === length) return token;
        if (token.length > length) break;
      }
      throw new Error(`no pass of ${length} characters`);
    }
    expect(await verifyPass(SECRET, await ofLength(512), NOW_S)).not.toBeNull();
    // 513 is not a length a token can have (base64 never ends a part one character past a whole four).
    expect(await verifyPass(SECRET, await ofLength(514), NOW_S)).toBeNull();
  });
});

describe('a guest pass', () => {
  it('lasts twelve hours, and an entry three', () => {
    expect(GUEST_PASS_TTL_S).toBe(43_200);
    expect(ENTRY_TTL_S).toBe(10_800);
  });

  it('is good until the second it runs out, with what it carries', async () => {
    const token = await mintPass(SECRET, { ...PASS, exp: NOW_S, adm: true, iat: NOW_S - 5, cid: 'c_abcd1234', tz: 'Europe/Paris', dev: 'd_screen0001' });
    expect(await verifyPass(SECRET, token, NOW_S)).toStrictEqual({ id: 'v_abcdef', exp: NOW_S, adm: true, iat: NOW_S - 5, cid: 'c_abcd1234', tz: 'Europe/Paris', dev: 'd_screen0001' });
    expect(await verifyPass(SECRET, token, NOW_S + 1)).toBeNull();
  });

  it('drops what is not of its own shape: an admission that is not true, a time that is not a whole second', async () => {
    const token = await signed({ ...PASS, adm: 'yes', iat: 1.5, cid: 'nope', tz: 'Mars/Base', tid: 'x', dev: 'phone' });
    expect(await verifyPass(SECRET, token, NOW_S)).toStrictEqual({ id: 'v_abcdef', exp: NOW_S + 60, adm: false });
  });

  it('names its owl v_ and 6 to 16 letters or digits, with nothing before or after', async () => {
    for (const id of ['v_abcdef', 'v_ABCDEF0123456789']) expect(await verifyPass(SECRET, await signed({ ...PASS, id }), NOW_S)).not.toBeNull();
    for (const id of ['v_abcde', 'xv_abcdef', 'v_abcdef!', 'v_abcdef0123456789x']) expect(await verifyPass(SECRET, await signed({ ...PASS, id }), NOW_S)).toBeNull();
  });

  it('is never a token of another kind, even one that carries an owl and a time', async () => {
    for (const k of ['col', 'ent', 'acl']) expect(await verifyPass(SECRET, await signed({ ...PASS, k }), NOW_S)).toBeNull();
    expect(await verifyPass(SECRET, await mintCollector(SECRET, 'c_abcd1234', null, NOW_S), NOW_S)).toBeNull();
  });

  it('is refused as missing, as expired, or as not a pass at all', async () => {
    expect(await passRefusal(SECRET, null, NOW_S)).toBe('missing');
    expect(await passRefusal(SECRET, await mintPass(SECRET, { ...PASS, exp: NOW_S - 1 }), NOW_S)).toBe('expired');
    // While it lasts, to the second, its time is not what is wrong with it.
    expect(await passRefusal(SECRET, await signed({ ...PASS, id: 'bad', exp: NOW_S }), NOW_S)).toBe('invalid');
    expect(await passRefusal(SECRET, await signed({ ...PASS, id: 'bad' }), NOW_S)).toBe('invalid');
    // An entry past its time, or a time that is no number, is still not a pass.
    expect(await passRefusal(SECRET, await mintEntry(SECRET, 'c_abcd1234', NOW_S - 1), NOW_S)).toBe('invalid');
    expect(await passRefusal(SECRET, await signed({ ...PASS, exp: 'soon' }), NOW_S)).toBe('invalid');
    expect(await passRefusal('another-signing-key-0123456789', await mintPass(SECRET, { ...PASS, exp: NOW_S - 1 }), NOW_S)).toBe('invalid');
  });
});

describe('a collector token', () => {
  it('names its collector only with the time it was made', async () => {
    expect(await readCollector(SECRET, await signed({ k: 'col', cid: 'c_abcd1234', iat: NOW_S }))).toEqual({ cid: 'c_abcd1234', dev: null });
    expect(await readCollector(SECRET, await signed({ k: 'col', cid: 'c_abcd1234' }))).toBeNull();
    expect(await readCollector(SECRET, await signed({ k: 'col', cid: 'c_abcd1234', iat: 'today' }))).toBeNull();
  });
});

describe('an entry', () => {
  it('is good for its own owl until the second it runs out, and is never a token of another kind', async () => {
    const entry = await mintEntry(SECRET, 'c_abcd1234', NOW_S);
    expect(await verifyEntry(SECRET, entry, 'c_abcd1234', NOW_S)).toBe(true);
    expect(await verifyEntry(SECRET, entry, 'c_abcd1234', NOW_S + 1)).toBe(false);
    for (const k of [undefined, 'col', 'acl']) expect(await verifyEntry(SECRET, await signed({ k, who: 'c_abcd1234', exp: NOW_S + 60 }), 'c_abcd1234', NOW_S)).toBe(false);
  });
});

describe('a magic link', () => {
  it('has a nonce of 16 to 64 letters, digits, - and _, with nothing before or after', async () => {
    const link = (n: string) => mintLink(SECRET, 'protect', n, NOW_S + 60);
    for (const n of ['a'.repeat(16), `${'A-z_0'.repeat(12)}abcd`]) expect(await verifyLink(SECRET, await link(n), 'protect', NOW_S)).toBe(n);
    for (const n of ['a'.repeat(15), 'a'.repeat(65), `!${'a'.repeat(16)}`, `${'a'.repeat(16)}!`, `${'a'.repeat(8)} ${'a'.repeat(8)}`]) {
      expect(await verifyLink(SECRET, await link(n), 'protect', NOW_S)).toBeNull();
    }
  });

  it('works until the second it runs out, and is never a token of another kind', async () => {
    const n = 'n0nce-n0nce-n0nce';
    expect(await verifyLink(SECRET, await mintLink(SECRET, 'protect', n, NOW_S), 'protect', NOW_S)).toBe(n);
    for (const k of [undefined, 'ent', 'col']) expect(await verifyLink(SECRET, await signed({ k, kind: 'protect', n, exp: NOW_S + 60 }), 'protect', NOW_S)).toBeNull();
  });
});

describe('the clock a token is read by when none is given', () => {
  it('is now, in whole seconds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000 + 999);
    expect(await passRefusal(SECRET, await signed({ ...PASS, id: 'bad' }))).toBe('invalid');
    expect(await passRefusal(SECRET, await mintPass(SECRET, { ...PASS, exp: NOW_S - 1 }))).toBe('expired');
    expect(bodyOf(await mintCollector(SECRET, 'c_abcd1234'))['iat']).toBe(NOW_S);
    const entry = await mintEntry(SECRET, 'c_abcd1234');
    expect(bodyOf(entry)['exp']).toBe(NOW_S + ENTRY_TTL_S);
    expect(await verifyEntry(SECRET, entry, 'c_abcd1234')).toBe(true);
    const n = 'n0nce-n0nce-n0nce';
    expect(await verifyLink(SECRET, await mintLink(SECRET, 'restore', n, NOW_S), 'restore')).toBe(n);
    expect(await verifyLink(SECRET, await mintLink(SECRET, 'restore', n, NOW_S - 1), 'restore')).toBeNull();
  });
});

describe('a keeper token (OP-156)', () => {
  it('lasts twelve hours, good until the second it runs out, from the park\'s own key', async () => {
    expect(KEEPER_TTL_S).toBe(43_200);
    const token = await mintKeeper(SECRET, NOW_S);
    expect(bodyOf(token)).toStrictEqual({ k: 'kpr', exp: NOW_S });
    expect(await verifyKeeper(SECRET, token, NOW_S)).toBe(true);
    expect(await verifyKeeper(SECRET, token, NOW_S + 1)).toBe(false);
    expect(await verifyKeeper('another-signing-key-0123456789', token, NOW_S)).toBe(false);
    for (const t of [null, undefined, 42, '', 'not.a-token']) expect(await verifyKeeper(SECRET, t, NOW_S)).toBe(false);
  });

  it('is never a token of another kind, and no other kind is a keeper\'s', async () => {
    const token = await mintKeeper(SECRET, NOW_S + 60);
    expect(await verifyPass(SECRET, token, NOW_S)).toBeNull();
    expect(await verifyEntry(SECRET, token, 'c_abcd1234', NOW_S)).toBe(false);
    expect(await readCollector(SECRET, token)).toBeNull();
    for (const k of [undefined, 'ent', 'col', 'acl']) expect(await verifyKeeper(SECRET, await signed({ k, exp: NOW_S + 60 }), NOW_S)).toBe(false);
    expect(await verifyKeeper(SECRET, await signed({ k: 'kpr', exp: 'soon' }), NOW_S)).toBe(false);
    expect(await verifyKeeper(SECRET, await mintEntry(SECRET, 'c_abcd1234', NOW_S + 60), NOW_S)).toBe(false);
  });

  it('is made for twelve hours from now, and read against now, when no clock is given', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW_S * 1000 + 999);
    const token = await mintKeeper(SECRET);
    expect(bodyOf(token)['exp']).toBe(NOW_S + KEEPER_TTL_S);
    expect(await verifyKeeper(SECRET, token)).toBe(true);
    expect(await verifyKeeper(SECRET, await mintKeeper(SECRET, NOW_S - 1))).toBe(false);
  });
});
