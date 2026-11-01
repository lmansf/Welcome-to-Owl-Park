/**
 * Accounts without passwords (OP-139), the Worker's half; the account store is accountBook.ts, in
 * the collections object. Here is what only the Worker holds: the key an email is hashed and sealed
 * with (ACCOUNT_SECRET), the mail a magic link goes out in, and the /api/account routes. All of it is
 * off unless ACCOUNTS is "on".
 *
 * An email is never kept as typed, and neither it nor a link is ever logged: the store keeps a keyed
 * hash of it, to find its owls, and a sealed copy (AES-GCM), to write to it again. A link's token is
 * signed like a pass (PASS_SIGNING_KEY) and names a nonce the store lets be used once.
 *
 * A ticket's order email (OP-186) is read from the store as the ticket lands on an owl and kept by
 * nobody: the buyer is mailed one protect link that carries the address, sealed, in its own token, and
 * only opening it protects the owl (offerOrderProtect).
 *
 * TODO-DOCS (OP-186): docs/SECURITY.md's "No passwords" item: a ticket's order email is read from the
 * store as its tickets land on an owl and mailed one protect link (good for ORDER_LINK_MS, 7 days, and
 * used once) that carries it sealed; the park keeps nothing about the address unless the link is
 * opened, and the mail service keeps its delivery log as for every mail. docs/DEPLOY.md's store step 2
 * ("the park reads no names, emails or addresses"): the park reads an order's email for that mail
 * and nothing else, so the app's protected customer data access covers the email only, and is asked
 * for once this is live.
 *
 * The routes (POST, JSON):
 *   /api/account/protect  {email}        the pass's owl: mail a link that protects it with this email
 *   /api/account/confirm  {token}        open a protect link: the owl it names, or the pass's own owl
 *                                        for a link from the no-owls mail, is protected from now on
 *   /api/account/restore  {email}        mail a link to bring an owl of this email to this screen (the
 *                                        answer is the same whether the email protects any owl or not)
 *   /api/account/owls     {token}        a restore link's owls, as pictures, without using the link
 *   /api/account/bind     {token, code}  use it: the owl with this friend code is on this screen now,
 *                                        and every other screen it was on finds it moved
 */
import { MAGIC_LINK_MS, ORDER_LINK_MS, hashForLog, isFriendCode, normalEmail, type Logger, type OwlPicture } from '@owl-park/shared';
import type { CarriedEmail, LinkKind, Protected, Restored } from './accountBook';
import { mintCollector, mintLink, randomNonce, readCollector, readLink, verifyLink, type PassPayload } from './pass';
import { adminQuery, type StoreConfig } from './storeApi';

export interface AccountEnv {
  ACCOUNTS?: string;
  ACCOUNT_SECRET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_TEST_ORIGIN?: string;
}

export function accountsOn(env: AccountEnv): boolean {
  return env.ACCOUNTS === 'on';
}

// ---------- the email's hash and seal ----------

const enc = new TextEncoder();

export interface EmailKeys {
  hash: CryptoKey;
  seal: CryptoKey;
}

let keysFor: { secret: string; keys: Promise<EmailKeys> } | null = null;

/** The keys made from ACCOUNT_SECRET (32 characters or more); null without one, and nothing about an email can be kept. */
export function emailKeys(env: AccountEnv): Promise<EmailKeys> | null {
  const secret = env.ACCOUNT_SECRET;
  if (!secret || secret.length < 32) return null;
  if (keysFor?.secret !== secret) keysFor = { secret, keys: deriveKeys(secret) };
  return keysFor.keys;
}

async function deriveKeys(secret: string): Promise<EmailKeys> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  const hkdf = (info: string) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('owl-park accounts'), info: enc.encode(info) });
  const [hash, seal] = await Promise.all([
    crypto.subtle.deriveKey(hkdf('email hash'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']),
    crypto.subtle.deriveKey(hkdf('email seal'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
  ]);
  return { hash, seal };
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** An email (`e`), a client address (`i`) or a store order (`o`) as the store keys it: never reversible without the key. */
export async function keyed(keys: EmailKeys, what: 'e' | 'i' | 'o', value: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', keys.hash, enc.encode(`${what}:${value}`))));
}

const SEAL_AAD = enc.encode('owl-park email');

/** An email sealed for keeping: a fresh nonce and the ciphertext, readable only with the key. */
export async function seal(keys: EmailKeys, email: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: SEAL_AAD }, keys.seal, enc.encode(email)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

/** A sealed email opened again; null when it was not sealed with this key. */
export async function unseal(keys: EmailKeys, sealed: string): Promise<string | null> {
  const raw = unb64url(sealed);
  if (!raw || raw.length < 13) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: SEAL_AAD }, keys.seal, raw.slice(12));
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

// ---------- a ticket's order email ----------

/** An order's email, which the store holds for every order (the buyer's). */
export const ORDER_EMAIL_QUERY = `query OwlParkOrderEmail($id: ID!) {
  order(id: $id) {
    email
  }
}`;

/**
 * The email of a store order, as the park keys it: the buyer's, which protects the owl that claims the
 * order's tickets. Null for none, and when the store will not say (an app not allowed to read
 * customers' emails, or the store out of reach): the owl then simply stays as it was.
 */
export async function orderEmail(cfg: StoreConfig, order: string, fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await adminQuery<{ order: { email?: string | null } | null }>(cfg, ORDER_EMAIL_QUERY, { id: `gid://shopify/Order/${order}` }, fetchFn);
    return normalEmail(r.order?.email);
  } catch {
    return null;
  }
}

// ---------- the mail ----------

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends one mail; whether the sender took it. */
export type MailSender = (mail: Mail) => Promise<boolean>;

/**
 * The park's mail sender: Resend's email API with RESEND_API_KEY, from MAIL_FROM. In the browser tests
 * MAIL_TEST_ORIGIN is a stand-in on the same machine that takes the same request. Null without a
 * sender, and no link is sent.
 */
export function mailSender(env: AccountEnv, fetchFn: typeof fetch = fetch): MailSender | null {
  const from = env.MAIL_FROM;
  if (!from) return null;
  const test = env.MAIL_TEST_ORIGIN;
  if (!test && !env.RESEND_API_KEY) return null;
  const url = test ? `${test}/emails` : 'https://api.resend.com/emails';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!test) headers['Authorization'] = `Bearer ${env.RESEND_API_KEY}`;
  return async (m) => {
    try {
      const r = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }) });
      return r.ok;
    } catch {
      return false;
    }
  };
}

const MINUTES = MAGIC_LINK_MS / 60_000;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** A mail of a few short lines and one link, as plain text and as a page with a button. */
function letter(to: string, subject: string, before: string[], button: string, link: string, after: string[]): Mail {
  const text = [...before, '', link, '', ...after].join('\n');
  const para = (lines: string[]) => lines.map((l) => `<p style="margin:0 0 14px">${escapeHtml(l)}</p>`).join('');
  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#2b2118;max-width:480px">` +
    para(before) +
    `<p style="margin:20px 0"><a href="${escapeHtml(link)}" style="background:#5b3a8c;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(button)}</a></p>` +
    para(after) +
    `</div>`;
  return { to, subject, text, html };
}

/** The mail a protect link goes out in (words for Logan to approve before ACCOUNTS goes on). */
export function protectMail(to: string, link: string): Mail {
  return letter(
    to,
    'Protect your owl in Owl Park',
    ['Someone asked to protect an owl in Owl Park with this email, so it can come back on another screen.', `To protect it, open this link within ${MINUTES} minutes:`],
    'Protect my owl',
    link,
    ['If this wasn’t you, ignore this email and nothing changes.'],
  );
}

/** The mail a restore link goes out in. */
export function restoreMail(to: string, link: string): Mail {
  return letter(
    to,
    'Bring your owl to this screen',
    [`To bring an owl to a new screen, open this link on that screen within ${MINUTES} minutes, then tap the owl’s picture.`],
    'Find my owl',
    link,
    ['The owl leaves the screen it was on. If this wasn’t you, ignore this email and nothing changes.'],
  );
}

const ORDER_LINK_DAYS = ORDER_LINK_MS / 86_400_000;

/**
 * The mail a ticket's buyer gets as the ticket lands on an owl (OP-186): one link that protects that owl
 * (words for Logan to approve before it goes live).
 */
export function orderProtectMail(to: string, link: string): Mail {
  return letter(
    to,
    'Protect the owl that took your ticket',
    ['Thanks for your Owl Park ticket. It is on an owl now, and that owl lives only on the screen it is on.', `To protect it with this email, so it can come back on another screen, open this link within ${ORDER_LINK_DAYS} days:`],
    'Protect my owl',
    link,
    ['The game keeps nothing about this email unless you open the link. If you didn’t buy an Owl Park ticket, ignore this email and nothing changes.'],
  );
}

/** The mail for an email that protects no owl: a link that protects the owl on the screen that opens it. */
export function noOwlsMail(to: string, link: string): Mail {
  return letter(
    to,
    'No owl is protected by this email yet',
    ['Someone asked to bring back an owl in Owl Park with this email, but no owl is protected by it yet.', `To protect the owl on the screen you are using, open this link there within ${MINUTES} minutes. On a screen with no owl yet, make one first.`],
    'Protect the owl on this screen',
    link,
    ['If this wasn’t you, ignore this email and nothing changes.'],
  );
}

// ---------- the routes ----------

/** The collections object's account calls (OP-139), as the routes use them (accountBook.ts has the rules). */
export interface AccountRpc {
  accountProtectLink(cid: string, emailHash: string, emailSeal: string, ipHash: string, nonce: string): Promise<number | null>;
  accountRestoreLink(emailHash: string, emailSeal: string, ipHash: string, nonce: string): Promise<{ exp: number; kind: LinkKind } | null>;
  accountConfirm(nonce: string, opener: string | null, carried: CarriedEmail | null): Promise<Protected | 'gone' | 'no-owl'>;
  accountOwls(nonce: string): Promise<OwlPicture[] | null>;
  accountBind(nonce: string, code: string, here: { cid: string; dev: string | null } | null): Promise<Restored | 'gone' | 'no-owl'>;
}

export interface AccountDeps {
  rpc: AccountRpc;
  /** Signs links and collector tokens. */
  secret: string;
  keys: Promise<EmailKeys> | null;
  mail: MailSender | null;
  /** Where the links point: the park's own address, as the request came in. */
  origin: string;
  /** The request's pass, when it carries one. */
  pass: PassPayload | null;
  /** The page's collector token (X-Collector), when it sent one. */
  collector: string | null;
  /** The client's address, for the limit on links asked for from one place. */
  ip: string;
  /** Tells the rooms that this owl is on this device now: its other screens are sent the moved card. */
  moved: (cid: string, dev: string) => Promise<void>;
  now: number;
}

type Answer = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown> = {}): Answer => ({ status: 200, body: { ok: true, ...body } });
const no = (status: number, error: string): Answer => ({ status, body: { error } });

/** The link in a mail: the park, with the token in the fragment, which never reaches a server's logs. */
export function accountLink(origin: string, kind: LinkKind, token: string): string {
  return `${origin}/#${kind}=${token}`;
}

/** One /api/account route (the path after /api/account/), its body read; null for a path that is none of them. */
export async function accountRoute(path: string, body: Record<string, unknown>, d: AccountDeps): Promise<Answer | null> {
  switch (path) {
    case 'protect': {
      if (!d.pass?.cid) return no(401, 'bad-pass');
      const email = normalEmail(body['email']);
      if (!email) return no(400, 'bad-email');
      if (!d.keys || !d.mail) return no(503, 'not-ready');
      const keys = await d.keys;
      const nonce = randomNonce();
      const exp = await d.rpc.accountProtectLink(d.pass.cid, await keyed(keys, 'e', email), await seal(keys, email), await keyed(keys, 'i', d.ip), nonce);
      if (exp === null) return no(429, 'try-later');
      const link = accountLink(d.origin, 'protect', await mintLink(d.secret, 'protect', nonce, Math.floor(exp / 1000)));
      return (await d.mail(protectMail(email, link))) ? ok() : no(502, 'mail-failed');
    }
    case 'restore': {
      const email = normalEmail(body['email']);
      if (!email) return no(400, 'bad-email');
      if (!d.keys || !d.mail) return no(503, 'not-ready');
      const keys = await d.keys;
      const nonce = randomNonce();
      const sent = await d.rpc.accountRestoreLink(await keyed(keys, 'e', email), await seal(keys, email), await keyed(keys, 'i', d.ip), nonce);
      if (!sent) return no(429, 'try-later');
      const link = accountLink(d.origin, sent.kind, await mintLink(d.secret, sent.kind, nonce, Math.floor(sent.exp / 1000)));
      // The same answer whether the email protects owls or none: only its own inbox learns which.
      return (await d.mail(sent.kind === 'restore' ? restoreMail(email, link) : noOwlsMail(email, link))) ? ok() : no(502, 'mail-failed');
    }
    case 'confirm': {
      const link = await readLink(d.secret, body['token'], 'protect', Math.floor(d.now / 1000));
      if (!link) return no(410, 'gone');
      // A ticket's link (OP-186) carries its email sealed: opened, it is read back and kept as any protected owl's is.
      let carried: CarriedEmail | null = null;
      if (link.sealed) {
        if (!d.keys) return no(503, 'not-ready');
        const keys = await d.keys;
        const email = normalEmail(await unseal(keys, link.sealed));
        if (!email) return no(410, 'gone');
        carried = { emailHash: await keyed(keys, 'e', email), emailSeal: link.sealed };
      }
      const r = await d.rpc.accountConfirm(link.nonce, d.pass?.cid ?? null, carried);
      if (r === 'gone') return no(410, 'gone');
      if (r === 'no-owl') return no(401, 'bad-pass');
      return ok({ account: r.account, look: r.look, mine: r.cid === d.pass?.cid });
    }
    case 'owls': {
      const nonce = await verifyLink(d.secret, body['token'], 'restore', Math.floor(d.now / 1000));
      const owls = nonce ? await d.rpc.accountOwls(nonce) : null;
      return owls ? ok({ owls }) : no(410, 'gone');
    }
    case 'bind': {
      const nonce = await verifyLink(d.secret, body['token'], 'restore', Math.floor(d.now / 1000));
      if (!nonce) return no(410, 'gone');
      if (!isFriendCode(body['code'])) return no(400, 'bad-request');
      const here = await readCollector(d.secret, d.collector);
      const r = await d.rpc.accountBind(nonce, body['code'], here);
      if (r === 'gone') return no(410, 'gone');
      if (r === 'no-owl') return no(404, 'no-owl');
      if (r.moved) await d.moved(r.cid, r.dev);
      return ok({ collector: await mintCollector(d.secret, r.cid, r.dev) });
    }
    default:
      return null;
  }
}

// ---------- a ticket's order email (OP-186) ----------

/** What offering a ticket's buyer a protect link came to, for the log (never the address). */
export type OrderOffer = 'mailed' | 'mail-failed' | 'already' | 'no-email' | 'off';

export interface OrderOfferDeps {
  /** The collections object's call: a ticket's protect link noted for the owl, or null (accountBook.orderLink). */
  rpc: { accountOrderLink(cid: string, orderHash: string, nonce: string): Promise<number | null> };
  /** Signs the link. */
  secret: string;
  keys: Promise<EmailKeys> | null;
  mail: MailSender | null;
  /** Where the link points: the park's own address. */
  origin: string;
  log: Logger;
}

/**
 * A ticket's order email (`email`, as the store gave it), as the ticket lands on an owl (a claim, or the
 * booth's checkout): its buyer is mailed one link that protects that owl when opened, unless an email
 * protects it already or this order offered it one before. The park keeps nothing about the address:
 * the link carries it sealed, and the account store notes the owl and the order's keyed hash only.
 */
export async function offerOrderProtect(d: OrderOfferDeps, cid: string, order: string, email: string | null): Promise<OrderOffer> {
  if (!d.keys || !d.mail) return 'off';
  const about = { collector_hash: hashForLog(cid), order_hash: hashForLog(order) };
  // TODO-DOCS (OP-186): docs/LOGGING.md: order_protect_mailed (worker.accounts, info) and order_protect_unsent (worker.accounts, warn, reason no-email or mail-failed), each with collector_hash and order_hash.
  const to = normalEmail(email);
  if (!to) {
    // An app not yet allowed customers' emails reads as this on every ticket: the line says so.
    d.log.warn('worker.accounts', 'order_protect_unsent', 'The store gave no email for a ticket’s order (an app not allowed customers’ emails, the store out of reach, or none given): its buyer was not offered a link to protect their owl.', { ...about, reason: 'no-email' });
    return 'no-email';
  }
  const keys = await d.keys;
  const nonce = randomNonce();
  const exp = await d.rpc.accountOrderLink(cid, await keyed(keys, 'o', order), nonce);
  if (exp === null) return 'already';
  const link = accountLink(d.origin, 'protect', await mintLink(d.secret, 'protect', nonce, Math.floor(exp / 1000), await seal(keys, to)));
  if (await d.mail(orderProtectMail(to, link))) {
    d.log.info('worker.accounts', 'order_protect_mailed', 'A ticket’s buyer was mailed a link to protect the owl that took it; nothing about the address is kept.', about);
    return 'mailed';
  }
  d.log.warn('worker.accounts', 'order_protect_unsent', 'The mail offering a ticket’s buyer a link to protect their owl did not go: the owl stays as it was, and the Menu can still protect it.', { ...about, reason: 'mail-failed' });
  return 'mail-failed';
}
