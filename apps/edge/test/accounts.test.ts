import { describe, expect, it } from 'vitest';
import { LINKS_PER_EMAIL_PER_HOUR, MAGIC_LINK_MS, ORDER_LINK_MS, createLogger, hashForLog, isFriendCode, type LogLine } from '@owl-park/shared';
import { AccountBook } from '../src/accountBook';
import { accountRoute, accountsOn, emailKeys, keyed, mailSender, offerOrderProtect, orderEmail, seal, unseal, type AccountDeps, type AccountRpc, type Mail, type OrderOfferDeps } from '../src/accounts';
import { mintCollector, mintLink, readCollector, readLink, verifyCollector, verifyLink, type PassPayload } from '../src/pass';
import { logged } from './logged';
import { sqlStorage } from './sqlite';

const SECRET = 'test-signing-key-for-the-account-tests';
const ACCOUNT_SECRET = 'test-account-secret-of-thirty-two-plus';
const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const ORIGIN = 'https://park.test';

/** Deterministic randomness for friend codes. */
function seq(): (n: number) => Uint8Array {
  let x = 5;
  return (n) => Uint8Array.from({ length: n }, () => (x = (x * 1103515245 + 12345) >>> 0) >>> 16);
}

/** A page's pass for this owl. */
const passOf = (cid: string): PassPayload => ({ id: `v_${cid.slice(2, 12)}`, exp: T0 / 1000 + 3600, adm: false, cid });

/**
 * The park as the routes see it: the account store in a test database behind the collections
 * object's calls, the mail kept instead of sent, and the rooms' moved notices noted.
 */
function park() {
  const sql = sqlStorage();
  const book = new AccountBook(sql, seq());
  let n = 0;
  const newDevice = () => `d_screen${String(++n).padStart(4, '0')}`;
  let now = T0;
  const rpc: AccountRpc = {
    accountProtectLink: async (cid, h, s, ip, nonce) => book.protectLink(cid, h, s, ip, nonce, now),
    accountRestoreLink: async (h, s, ip, nonce) => book.restoreLink(h, s, ip, nonce, now),
    accountConfirm: async (nonce, opener, carried) => book.confirm(nonce, opener, now, carried),
    accountOwls: async (nonce) => book.pictures(nonce, now),
    accountBind: async (nonce, code, here) => book.restore(nonce, code, here, newDevice, now),
  };
  const mails: Mail[] = [];
  const moved: Array<[string, string]> = [];
  const deps = (over: Partial<AccountDeps> = {}): AccountDeps => ({
    rpc,
    secret: SECRET,
    keys: emailKeys({ ACCOUNT_SECRET }),
    mail: async (m) => {
      mails.push(m);
      return true;
    },
    origin: ORIGIN,
    pass: null,
    collector: null,
    ip: '192.0.2.7',
    moved: async (cid, dev) => void moved.push([cid, dev]),
    now,
    ...over,
  });
  const call = (path: string, body: Record<string, unknown>, over: Partial<AccountDeps> = {}) => accountRoute(path, body, deps(over));
  /** The link in the last mail: its kind and token. */
  const lastLink = () => {
    const m = /#(protect|restore)=([A-Za-z0-9_.-]+)/.exec(mails.at(-1)?.text ?? '');
    return m ? { kind: m[1], token: m[2]! } : null;
  };
  /** A ticket's protect offer (OP-186) through this park: its mail kept with the others, its log lines here. */
  const lines: LogLine[] = [];
  const log = createLogger({ sink: (_level, line) => void lines.push(JSON.parse(line) as LogLine) });
  const offer = (cid: string, order: string, email: string | null, over: Partial<OrderOfferDeps> = {}) =>
    offerOrderProtect(
      {
        rpc: { accountOrderLink: async (c, h, o, n) => book.orderLink(c, h, o, n, now) },
        secret: SECRET,
        keys: emailKeys({ ACCOUNT_SECRET }),
        mail: async (m) => {
          mails.push(m);
          return true;
        },
        origin: ORIGIN,
        log,
        ...over,
      },
      cid,
      order,
      email,
    );
  return { sql, book, rpc, mails, moved, call, lastLink, newDevice, offer, lines, at: (t: number) => void (now = t) };
}

describe('accounts without passwords, the Worker’s half (OP-139)', () => {
  it('is off unless ACCOUNTS is on, and keeps no email without a long enough secret', () => {
    expect(accountsOn({})).toBe(false);
    expect(accountsOn({ ACCOUNTS: 'off' })).toBe(false);
    expect(accountsOn({ ACCOUNTS: 'on' })).toBe(true);
    expect(emailKeys({})).toBeNull();
    expect(emailKeys({ ACCOUNT_SECRET: 'too-short' })).toBeNull();
  });

  it('keys an email the same way every time, never as itself, and seals it so only the key opens it', async () => {
    const keys = (await emailKeys({ ACCOUNT_SECRET }))!;
    const other = (await emailKeys({ ACCOUNT_SECRET: `${ACCOUNT_SECRET}-another` }))!;
    const a = await keyed(keys, 'e', 'grown.up@example.com');
    expect(a).toBe(await keyed(keys, 'e', 'grown.up@example.com'));
    expect(a).not.toBe(await keyed(keys, 'i', 'grown.up@example.com'));
    expect(a).not.toBe(await keyed(other, 'e', 'grown.up@example.com'));
    expect(a).not.toContain('example');
    const sealed = await seal(keys, 'grown.up@example.com');
    expect(sealed).not.toContain('example');
    expect(await seal(keys, 'grown.up@example.com')).not.toBe(sealed);
    expect(await unseal(keys, sealed)).toBe('grown.up@example.com');
    expect(await unseal(other, sealed)).toBeNull();
    expect(await unseal(keys, 'not-sealed')).toBeNull();
  });

  it('names the device in the collector token, and signs links that work for their kind until they run out', async () => {
    const legacy = await mintCollector(SECRET, 'c_aaaaaaaaaaaa');
    expect(await readCollector(SECRET, legacy)).toEqual({ cid: 'c_aaaaaaaaaaaa', dev: null });
    const token = await mintCollector(SECRET, 'c_aaaaaaaaaaaa', 'd_screen0001');
    expect(await readCollector(SECRET, token)).toEqual({ cid: 'c_aaaaaaaaaaaa', dev: 'd_screen0001' });
    expect(await verifyCollector(SECRET, token)).toBe('c_aaaaaaaaaaaa');
    expect(await readCollector('another-signing-key-entirely', token)).toBeNull();
    const link = await mintLink(SECRET, 'restore', 'n0nce-n0nce-n0nce', 2000);
    expect(await verifyLink(SECRET, link, 'restore', 1999)).toBe('n0nce-n0nce-n0nce');
    expect(await verifyLink(SECRET, link, 'restore', 2001)).toBeNull();
    expect(await verifyLink(SECRET, link, 'protect', 1999)).toBeNull();
    expect(await verifyLink(SECRET, token, 'restore', 1999)).toBeNull();
    expect(await verifyLink(SECRET, `${link}x`, 'restore', 1999)).toBeNull();
  });

  it('protects an owl by an email confirmed through its link, once, and keeps only the hash and the sealed copy', async () => {
    const p = park();
    const pass = passOf('c_aaaaaaaaaaaa');
    expect(await p.call('protect', { email: 'grown.up@example.com' })).toEqual({ status: 401, body: { error: 'bad-pass' } });
    expect(await p.call('protect', { email: 'not an email' }, { pass })).toEqual({ status: 400, body: { error: 'bad-email' } });
    expect(await p.call('protect', { email: '  Grown.Up@Example.com ' }, { pass })).toEqual({ status: 200, body: { ok: true } });
    expect(p.mails).toHaveLength(1);
    const mail = p.mails[0]!;
    expect(mail.to).toBe('grown.up@example.com');
    expect(mail.subject).toBe('Protect your owl in Owl Park');
    expect(mail.text).toContain(`${ORIGIN}/#protect=`);
    expect(mail.html).toContain(`href="${ORIGIN}/#protect=`);
    expect(p.book.account('c_aaaaaaaaaaaa', T0).protected).toBe(false);
    // Opened anywhere, by anyone with the mail: the owl it names is protected.
    const { token } = p.lastLink()!;
    const done = await p.call('confirm', { token });
    expect(done?.status).toBe(200);
    expect(done?.body).toMatchObject({ ok: true, account: { protected: true }, look: null, mine: false });
    expect(isFriendCode((done?.body['account'] as { friendCode: string }).friendCode)).toBe(true);
    expect(p.book.account('c_aaaaaaaaaaaa', T0).protected).toBe(true);
    expect(await p.call('confirm', { token })).toEqual({ status: 410, body: { error: 'gone' } });
    // Nowhere in the store as typed.
    const rows = JSON.stringify([...p.sql.exec('SELECT * FROM owl_accounts').toArray(), ...p.sql.exec('SELECT * FROM account_links').toArray()]);
    expect(rows).not.toMatch(/example/i);
  });

  it('refuses a fourth link to one email in an hour, and sends nothing without a sender or a secret', async () => {
    const p = park();
    const pass = passOf('c_aaaaaaaaaaaa');
    for (let i = 0; i < LINKS_PER_EMAIL_PER_HOUR; i++) expect((await p.call('protect', { email: 'busy@example.com' }, { pass }))?.status).toBe(200);
    expect(await p.call('protect', { email: 'busy@example.com' }, { pass })).toEqual({ status: 429, body: { error: 'try-later' } });
    expect(await p.call('restore', { email: 'busy@example.com' })).toEqual({ status: 429, body: { error: 'try-later' } });
    expect(await p.call('protect', { email: 'calm@example.com' }, { pass, mail: null })).toEqual({ status: 503, body: { error: 'not-ready' } });
    expect(await p.call('restore', { email: 'calm@example.com' }, { keys: null })).toEqual({ status: 503, body: { error: 'not-ready' } });
    expect(await p.call('protect', { email: 'calm@example.com' }, { pass, mail: async () => false })).toEqual({ status: 502, body: { error: 'mail-failed' } });
    expect(p.mails).toHaveLength(LINKS_PER_EMAIL_PER_HOUR);
    expect(await p.call('nothing', {})).toBeNull();
  });

  it('brings an owl to a new screen: its pictures, a tap, a token for that screen, and the old screen moved', async () => {
    const p = park();
    p.book.setLook('c_older0000000', { body: '#7A5230', belly: '#E8D5B0', accent: '#C9A227', species: 'barn' }, T0);
    p.book.account('c_younger00000', T0 + 1000);
    for (const cid of ['c_older0000000', 'c_younger00000']) {
      await p.call('protect', { email: 'family@example.com' }, { pass: passOf(cid) });
      await p.call('confirm', { token: p.lastLink()!.token });
    }
    // Both owls of the family's email, as pictures, the oldest first.
    expect(await p.call('restore', { email: 'family@example.com' }, { ip: '198.51.100.1' })).toEqual({ status: 200, body: { ok: true } });
    expect(p.mails.at(-1)!.subject).toBe('Bring your owl to this screen');
    const { kind, token } = p.lastLink()!;
    expect(kind).toBe('restore');
    const owls = (await p.call('owls', { token }))!.body['owls'] as Array<{ code: string; look: unknown }>;
    expect(owls).toHaveLength(2);
    expect(owls[0]!.look).toEqual({ body: '#7A5230', belly: '#E8D5B0', accent: '#C9A227', species: 'barn' });
    expect(owls[1]!.look).toBeNull();
    const older = p.book.account('c_older0000000', T0).friendCode;
    expect(owls[0]!.code).toBe(older);
    // A code that is not one of them changes nothing and leaves the link good.
    const elsewhere = owls[0]!.code === 'ZZZZ' ? 'YYYY' : 'ZZZZ';
    expect(await p.call('bind', { token, code: elsewhere })).toEqual({ status: 404, body: { error: 'no-owl' } });
    expect(await p.call('bind', { token, code: 'no' })).toEqual({ status: 400, body: { error: 'bad-request' } });
    // The tap: this screen holds the older owl now.
    const bound = await p.call('bind', { token, code: older });
    expect(bound?.status).toBe(200);
    const mine = await readCollector(SECRET, bound!.body['collector'] as string);
    expect(mine?.cid).toBe('c_older0000000');
    expect(p.moved).toEqual([['c_older0000000', mine!.dev]]);
    expect(p.book.holds('c_older0000000', mine!.dev)).toBe(true);
    expect(p.book.holds('c_older0000000', null)).toBe(false);
    // Once only.
    expect(await p.call('bind', { token, code: older })).toEqual({ status: 410, body: { error: 'gone' } });
    expect(await p.call('owls', { token })).toEqual({ status: 410, body: { error: 'gone' } });
  });

  it('leaves the owl where it is when the screen asking already holds it', async () => {
    const p = park();
    const here = p.book.standing('c_aaaaaaaaaaaa', null, p.newDevice, T0);
    expect(here).not.toBe('moved');
    const dev = (here as { dev: string }).dev;
    await p.call('protect', { email: 'one@example.com' }, { pass: passOf('c_aaaaaaaaaaaa') });
    await p.call('confirm', { token: p.lastLink()!.token });
    await p.call('restore', { email: 'one@example.com' });
    const code = p.book.account('c_aaaaaaaaaaaa', T0).friendCode;
    const collector = await mintCollector(SECRET, 'c_aaaaaaaaaaaa', dev);
    const r = await p.call('bind', { token: p.lastLink()!.token, code }, { collector });
    expect(await readCollector(SECRET, r!.body['collector'] as string)).toEqual({ cid: 'c_aaaaaaaaaaaa', dev });
    expect(p.moved).toEqual([]);
  });

  it('answers the same for an email with no owl, whose mail protects the owl on the screen that opens it', async () => {
    const p = park();
    expect(await p.call('restore', { email: 'nobody@example.com' })).toEqual({ status: 200, body: { ok: true } });
    expect(p.mails.at(-1)!.subject).toBe('No owl is protected by this email yet');
    const { kind, token } = p.lastLink()!;
    expect(kind).toBe('protect');
    // Opened on a screen with no owl yet: nothing happens, and the link stays good.
    expect(await p.call('confirm', { token })).toEqual({ status: 401, body: { error: 'bad-pass' } });
    const r = await p.call('confirm', { token }, { pass: passOf('c_fresh0000000') });
    expect(r?.body).toMatchObject({ ok: true, account: { protected: true }, mine: true });
    const hash = await keyed((await emailKeys({ ACCOUNT_SECRET }))!, 'e', 'nobody@example.com');
    expect(p.book.owlsOf(hash).map((a) => a.cid)).toEqual(['c_fresh0000000']);
  });

  it('refuses a link after its fifteen minutes, and one that was never sent', async () => {
    const p = park();
    await p.call('protect', { email: 'late@example.com' }, { pass: passOf('c_aaaaaaaaaaaa') });
    const { token } = p.lastLink()!;
    p.at(T0 + MAGIC_LINK_MS + 1000);
    expect(await p.call('confirm', { token }, { now: T0 + MAGIC_LINK_MS + 1000 })).toEqual({ status: 410, body: { error: 'gone' } });
    const forged = await mintLink('not-the-park-signing-key-at-all', 'protect', 'n0nce-n0nce-n0nce', T0 / 1000 + 600);
    expect(await p.call('confirm', { token: forged })).toEqual({ status: 410, body: { error: 'gone' } });
    const unsent = await mintLink(SECRET, 'restore', 'n0nce-n0nce-n0nce', T0 / 1000 + 600);
    expect(await p.call('owls', { token: unsent })).toEqual({ status: 410, body: { error: 'gone' } });
    expect(await p.call('confirm', { token: 42 })).toEqual({ status: 410, body: { error: 'gone' } });
  });

  it('sends through Resend with its key, or the stand-in in the browser tests, and not at all without a sender', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const mail = { to: 'grown.up@example.com', subject: 'Hello', text: 'Hi', html: '<p>Hi</p>' };
    expect(mailSender({}, fetchFn)).toBeNull();
    expect(mailSender({ RESEND_API_KEY: 're_test' }, fetchFn)).toBeNull();
    expect(mailSender({ MAIL_FROM: 'owls@park.test' }, fetchFn)).toBeNull();
    expect(await mailSender({ RESEND_API_KEY: 're_test', MAIL_FROM: 'owls@park.test' }, fetchFn)!(mail)).toBe(true);
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect((calls[0]!.init.headers as Record<string, string>)['Authorization']).toBe('Bearer re_test');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ from: 'owls@park.test', to: ['grown.up@example.com'], subject: 'Hello', text: 'Hi', html: '<p>Hi</p>' });
    expect(await mailSender({ MAIL_TEST_ORIGIN: 'http://localhost:8790', MAIL_FROM: 'owls@park.test' }, fetchFn)!(mail)).toBe(true);
    expect(calls[1]!.url).toBe('http://localhost:8790/emails');
    expect((calls[1]!.init.headers as Record<string, string>)['Authorization']).toBeUndefined();
    const failing = (async () => new Response('no', { status: 422 })) as unknown as typeof fetch;
    expect(await mailSender({ RESEND_API_KEY: 're_test', MAIL_FROM: 'owls@park.test' }, failing)!(mail)).toBe(false);
  });

  it('reads a ticket order’s email from the store, as the park keys it, and nothing when the store will not say', async () => {
    const asked: string[] = [];
    const store = (answer: unknown, status = 200) =>
      (async (_url: string, init: RequestInit) => {
        asked.push(JSON.parse(init.body as string).variables.id);
        return new Response(JSON.stringify(answer), { status });
      }) as unknown as typeof fetch;
    const cfg = { shop: 'owl-test.myshopify.com', token: 'test-token' };
    expect(await orderEmail(cfg, '1001', store({ data: { order: { email: ' Buyer@Example.com ' } } }))).toBe('buyer@example.com');
    expect(asked).toEqual(['gid://shopify/Order/1001']);
    expect(await orderEmail(cfg, '1002', store({ data: { order: { email: null } } }))).toBeNull();
    expect(await orderEmail(cfg, '1003', store({ data: { order: null } }))).toBeNull();
    // An app the store does not let read customers' emails: the owl stays as it was.
    expect(await orderEmail(cfg, '1004', store({ errors: [{ message: 'Access denied for email field.' }] }))).toBeNull();
    expect(await orderEmail(cfg, '1005', store({}, 503))).toBeNull();
  });

  it('offers a ticket’s buyer one link that protects the owl that took it, and keeps nothing about the email until it is opened (OP-186)', async () => {
    const p = park();
    const keys = (await emailKeys({ ACCOUNT_SECRET }))!;
    const hash = await keyed(keys, 'e', 'buyer@example.com');
    /** Every row the account store holds, as text: the address and its hash appear nowhere in it. */
    const stored = () => JSON.stringify(['owl_accounts', 'account_links', 'account_sends', 'account_order_offers'].map((t) => p.sql.exec(`SELECT * FROM ${t}`).toArray()));
    expect(await p.offer('c_buyer0000000', '1001', ' Buyer@Example.com ')).toBe('mailed');
    expect(p.mails).toHaveLength(1);
    const mail = p.mails[0]!;
    expect(mail.to).toBe('buyer@example.com');
    expect(mail.subject).toBe('Protect the owl that took your ticket');
    expect(mail.text).toContain(`within ${ORDER_LINK_MS / 86_400_000} days`);
    expect(mail.text.match(/#protect=/g)).toHaveLength(1);
    expect(stored()).not.toContain(hash);
    expect(stored()).not.toContain('buyer@example.com');
    expect(p.book.owlsOf(hash)).toEqual([]);
    logged(p.lines, 'order_protect_mailed', { collector_hash: hashForLog('c_buyer0000000'), order_hash: hashForLog('1001') });
    expect(JSON.stringify(p.lines)).not.toContain('buyer@example.com');
    // The same claim made again mails nothing more.
    expect(await p.offer('c_buyer0000000', '1001', 'buyer@example.com')).toBe('already');
    expect(p.mails).toHaveLength(1);
    // Opened on any screen, days later: the owl that took the ticket is protected by the order's email, as the Menu's Protect does.
    const link = p.lastLink()!;
    expect(link.kind).toBe('protect');
    p.at(T0 + ORDER_LINK_MS - 60_000);
    const opened = await p.call('confirm', { token: link.token }, { now: T0 + ORDER_LINK_MS - 60_000 });
    expect(opened?.status).toBe(200);
    expect(opened?.body).toMatchObject({ ok: true, account: { protected: true }, mine: false });
    expect(p.book.owlsOf(hash).map((a) => a.cid)).toEqual(['c_buyer0000000']);
    // Good once; and an owl the email protects already is offered nothing on its next order.
    expect((await p.call('confirm', { token: link.token }, { now: T0 + ORDER_LINK_MS - 30_000 }))?.status).toBe(410);
    expect(await p.offer('c_buyer0000000', '1003', 'buyer@example.com')).toBe('already');
    // A sibling's owl takes the next order on the same email: it gets its own link, and both are the family's once it is opened.
    p.at(T0 + ORDER_LINK_MS);
    expect(await p.offer('c_sibling00000', '1002', 'buyer@example.com')).toBe('mailed');
    expect((await p.call('confirm', { token: p.lastLink()!.token }, { now: T0 + ORDER_LINK_MS }))?.status).toBe(200);
    expect(p.book.owlsOf(hash).map((a) => a.cid)).toEqual(['c_buyer0000000', 'c_sibling00000']);
  });

  it('lets a ticket’s link lapse after its days unused, and offers nothing without an email, keys or a sender (OP-186)', async () => {
    const p = park();
    expect(await p.offer('c_late00000000', '2001', 'late@example.com')).toBe('mailed');
    const { token } = p.lastLink()!;
    p.at(T0 + ORDER_LINK_MS + 1);
    expect((await p.call('confirm', { token }, { now: T0 + ORDER_LINK_MS + 1 }))?.status).toBe(410);
    expect(await p.offer('c_none00000000', '2002', null)).toBe('no-email');
    expect(await p.offer('c_none00000000', '2002', 'not an email')).toBe('no-email');
    // The store gave no email (an app not yet allowed customers' emails reads so on every ticket): the log says so.
    logged(p.lines, 'order_protect_unsent', { collector_hash: hashForLog('c_none00000000'), order_hash: hashForLog('2002'), reason: 'no-email', level: 'warn' });
    expect(await p.offer('c_none00000000', '2002', 'someone@example.com', { keys: null })).toBe('off');
    expect(await p.offer('c_none00000000', '2002', 'someone@example.com', { mail: null })).toBe('off');
    // The sender refuses the mail: the owl stays as it was, the Menu can still protect it, and the log says so (never the address).
    expect(await p.offer('c_none00000000', '2003', 'someone@example.com', { mail: async () => false })).toBe('mail-failed');
    logged(p.lines, 'order_protect_unsent', { collector_hash: hashForLog('c_none00000000'), order_hash: hashForLog('2003'), reason: 'mail-failed', level: 'warn' });
    expect(JSON.stringify(p.lines)).not.toContain('someone@example.com');
    expect(JSON.stringify(p.lines)).not.toContain('not an email');
  });

  it('reads a ticket’s link back with the email it carries, and refuses one whose carried email was changed or not sealed by the park (OP-186)', async () => {
    const p = park();
    const keys = (await emailKeys({ ACCOUNT_SECRET }))!;
    const sealed = await seal(keys, 'buyer@example.com');
    const exp = T0 / 1000 + 600;
    const token = await mintLink(SECRET, 'protect', 'nonce-of-sixteen-plus', exp, sealed);
    expect(await readLink(SECRET, token, 'protect', T0 / 1000)).toEqual({ nonce: 'nonce-of-sixteen-plus', sealed });
    expect(await verifyLink(SECRET, token, 'protect', T0 / 1000)).toBe('nonce-of-sixteen-plus');
    expect(await readLink(SECRET, await mintLink(SECRET, 'protect', 'nonce-of-sixteen-plus', exp), 'protect', T0 / 1000)).toEqual({ nonce: 'nonce-of-sixteen-plus', sealed: null });
    // A carried email that is not a seal at all is refused with the link.
    expect(await readLink(SECRET, await mintLink(SECRET, 'protect', 'nonce-of-sixteen-plus', exp, 'not a seal!'), 'protect', T0 / 1000)).toBeNull();
    // Sealed with another key, or for a link the store never noted: nothing is protected.
    const other = (await emailKeys({ ACCOUNT_SECRET: `${ACCOUNT_SECRET}-another` }))!;
    expect(await p.offer('c_buyer0000000', '3001', 'buyer@example.com')).toBe('mailed');
    const noted = (await readLink(SECRET, p.lastLink()!.token, 'protect', T0 / 1000))!;
    const forged = await mintLink(SECRET, 'protect', noted.nonce, exp, await seal(other, 'buyer@example.com'));
    expect((await p.call('confirm', { token: forged }))?.status).toBe(410);
    expect((await p.call('confirm', { token: await mintLink(SECRET, 'protect', 'never-noted-nonce-xyz', exp, sealed) }))?.status).toBe(410);
    expect(p.book.owlsOf(await keyed(keys, 'e', 'buyer@example.com'))).toEqual([]);
  });
});
