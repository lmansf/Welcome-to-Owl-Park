/**
 * Bring a friend (OP-056, OP-311, OP-312), the Worker's half; the store is referralBook.ts, in the
 * collections object. Here: the switch (REFERRALS), the hashes a checkout token and an address are
 * kept by, and the thank-you after a friend's first time through the gate.
 *
 * REFERRALS: "off" (no route answers), "preview" (every route answers; the page shows the card only
 * with ?friends=1, for a play-with-your-friends night before opening) or "on" (the card for everyone).
 * The free Day Ticket is a store discount code (REFERRAL_CODE, a secret) that takes the whole Day
 * Ticket off; without it an owl can bring friends and be thanked, but no free ticket can be checked out.
 */
import { hashForLog, type Logger } from '@owl-park/shared';
import type { Desk } from './storeHooks';

export type ReferralMode = 'off' | 'preview' | 'on';

export function referralMode(env: { REFERRALS?: string }): ReferralMode {
  return env.REFERRALS === 'on' ? 'on' : env.REFERRALS === 'preview' ? 'preview' : 'off';
}

export const referralsOn = (env: { REFERRALS?: string }) => referralMode(env) !== 'off';

/** The store's discount code for a free Day Ticket, when the switch is not off and the code is set. */
export function referralCode(env: { REFERRALS?: string; REFERRAL_CODE?: string }): string | null {
  const code = env.REFERRAL_CODE?.trim();
  return referralsOn(env) && code ? code : null;
}

const enc = new TextEncoder();

async function sha256Hex(text: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A checkout token as the collections object keeps it: its hash, never the token. */
export const checkoutHash = (token: string) => sha256Hex(`owl-park checkout:${token}`);

/** An address as the invite limit counts it: hashed with the park's signing secret, never kept as is. */
export const addressHash = (secret: string, ip: string) => sha256Hex(`owl-park referral ip:${secret}:${ip}`);

/** What the Worker asks of the collections object for bringing friends (Collections.ts). */
export interface ReferralRpc {
  referralPending(friend: string): Promise<string | null>;
  referralCredit(friend: string, member: boolean): Promise<{ referrer: string; reward: 'ticket' | 'feathers' | 'capped' } | null>;
}

/**
 * A friend's ticket started at the gate (its first scan): the owl that brought them is thanked, with
 * feathers when the ticket book says it holds an annual pass and a free Day Ticket otherwise. Runs after
 * the gate has answered; never fails the scan.
 */
export async function thankReferrer(rpc: ReferralRpc, desk: Desk, log: Logger, friend: string): Promise<void> {
  try {
    const referrer = await rpc.referralPending(friend);
    if (!referrer) return;
    const r = await desk('/tickets/referral-owl', { device: referrer });
    if (r.status !== 200) throw new Error(`ticket desk answered ${r.status}`);
    const done = await rpc.referralCredit(friend, r.body['member'] === true);
    if (!done) return;
    log.info('worker.tickets', 'referral_thanked', done.reward === 'capped' ? 'A friend came through the gate; the owl that brought them had been thanked for three friends this month already.' : 'A friend came through the gate for the first time: the owl that brought them was thanked.', {
      collector_hash: hashForLog(done.referrer),
      reason: done.reward,
    });
  } catch (e) {
    log.error('worker.tickets', 'write_failed', 'A friend came through the gate, but the owl that brought them was not thanked: it is thanked at the friend’s next first scan, if any.', { collector_hash: hashForLog(friend), error: e });
  }
}
