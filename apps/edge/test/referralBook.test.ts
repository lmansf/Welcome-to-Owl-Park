import { describe, expect, it } from 'vitest';
import { REFERRAL_INVITES_PER_IP_PER_DAY, REFERRAL_MEMBER_FEATHERS, REFERRAL_MONTHLY_CAP, REFERRAL_OFFER_MS } from '@owl-park/shared';
import { ReferralBook, type InviteOwl } from '../src/referralBook';
import { sqlStorage } from './sqlite';

const T0 = Date.UTC(2026, 10, 10, 12, 0, 0);
const DAY = 24 * 3600_000;

function book() {
  let n = 0;
  return new ReferralBook(sqlStorage(), () => `offer${++n}`);
}

const owl = (cid: string, extra: Partial<InviteOwl> = {}): InviteOwl => ({ cid, device: `d_${cid}`, emailHash: null, ...extra });
const A = owl('c_alice');

describe('bringing a friend (OP-056)', () => {
  it('offers a new friend a free Day Ticket, once, and shows it on both owls’ cards', () => {
    const b = book();
    expect(b.view('c_bea', 'BEAA', false, T0)).toEqual({ code: 'BEAA', invited: false, canEnterCode: true, offers: [], thanked: 0, thanksLeft: REFERRAL_MONTHLY_CAP });
    const r = b.invite(owl('c_bea'), A, false, 'ip1', T0);
    expect(r).toEqual({ ok: true, referrer: 'c_alice', offer: { id: 'offer1', kind: 'friend', expires: T0 + REFERRAL_OFFER_MS } });
    expect(b.view('c_bea', 'BEAA', false, T0)).toMatchObject({ invited: true, canEnterCode: false, offers: [{ id: 'offer1', kind: 'friend' }] });
    expect(b.invite(owl('c_bea'), owl('c_carl'), false, 'ip2', T0)).toEqual({ ok: false, reason: 'already-invited' });
    expect(b.pending('c_bea')).toBe('c_alice');
    // The offer runs out after its time.
    expect(b.offers('c_bea', T0 + REFERRAL_OFFER_MS)).toEqual([]);
  });

  it('refuses an unknown code, the owl’s own, one on the same screen or email, an owl that had a ticket, and too many from one address', () => {
    const b = book();
    expect(b.invite(owl('c_bea'), null, false, 'ip', T0)).toEqual({ ok: false, reason: 'unknown-code' });
    expect(b.invite(A, A, false, 'ip', T0)).toEqual({ ok: false, reason: 'self' });
    expect(b.invite(owl('c_bea', { device: 'd_c_alice' }), A, false, 'ip', T0)).toEqual({ ok: false, reason: 'same-device' });
    expect(b.invite(owl('c_bea', { emailHash: 'e1' }), owl('c_alice', { emailHash: 'e1' }), false, 'ip', T0)).toEqual({ ok: false, reason: 'same-email' });
    expect(b.invite(owl('c_bea'), A, true, 'ip', T0)).toEqual({ ok: false, reason: 'has-ticket' });
    expect(b.view('c_bea', 'BEAA', true, T0).canEnterCode).toBe(false);
    for (let i = 0; i < REFERRAL_INVITES_PER_IP_PER_DAY; i++) expect(b.invite(owl(`c_f${i}`), A, false, 'busy', T0).ok).toBe(true);
    expect(b.invite(owl('c_late'), A, false, 'busy', T0)).toEqual({ ok: false, reason: 'too-many' });
    // The next day the address may type codes again.
    expect(b.invite(owl('c_late'), A, false, 'busy', T0 + DAY + 1).ok).toBe(true);
  });

  it('spends an offer with the first paid order through a checkout opened for it, and never with another order', () => {
    const b = book();
    b.invite(owl('c_bea'), A, false, 'ip', T0);
    expect(b.checkout('c_nobody', 'h0', T0)).toBeNull();
    expect(b.checkout('c_bea', 'h1', T0)).toMatchObject({ id: 'offer1' });
    expect(b.checkout('c_bea', 'h2', T0)).toMatchObject({ id: 'offer1' });
    expect(b.spend('h_unknown', '1001', T0)).toBe(false);
    expect(b.spend('h1', '1001', T0)).toBe(true);
    // The store sends the same order again: still yes. Another order, through either checkout: no.
    expect(b.spend('h1', '1001', T0)).toBe(true);
    expect(b.spend('h2', '1002', T0)).toBe(false);
    expect(b.offers('c_bea', T0)).toEqual([]);
    expect(b.checkout('c_bea', 'h3', T0)).toBeNull();
  });

  it('never spends an offer that ran out', () => {
    const b = book();
    b.invite(owl('c_bea'), A, false, 'ip', T0);
    b.checkout('c_bea', 'h1', T0);
    expect(b.spend('h1', '1001', T0 + REFERRAL_OFFER_MS)).toBe(false);
  });

  it('thanks the owl that brought a friend once: a Day Ticket, or 500 feathers with an annual pass, up to three in 30 days', () => {
    const b = book();
    const feathers: Array<[string, number]> = [];
    const add = (cid: string, n: number) => void feathers.push([cid, n]);
    for (const f of ['c_f1', 'c_f2', 'c_f3', 'c_f4']) b.invite(owl(f), A, false, `ip_${f}`, T0);
    expect(b.credit('c_f1', false, false, add, T0)).toEqual({ referrer: 'c_alice', reward: 'ticket' });
    expect(b.credit('c_f1', false, false, add, T0)).toBeNull();
    expect(b.offers('c_alice', T0)).toEqual([expect.objectContaining({ kind: 'reward' })]);
    expect(b.credit('c_f2', true, false, add, T0)).toEqual({ referrer: 'c_alice', reward: 'feathers' });
    expect(feathers).toEqual([['c_alice', REFERRAL_MEMBER_FEATHERS]]);
    expect(b.credit('c_f3', true, false, add, T0)).toMatchObject({ reward: 'feathers' });
    expect(b.view('c_alice', 'ALIC', true, T0)).toMatchObject({ thanked: 3, thanksLeft: 0 });
    expect(b.credit('c_f4', true, false, add, T0)).toEqual({ referrer: 'c_alice', reward: 'capped' });
    expect(feathers).toHaveLength(2);
    expect(b.pending('c_f4')).toBeNull();
    // A friend brought after the 30 days is thanked again.
    b.invite(owl('c_f5'), A, false, 'ip5', T0 + 31 * DAY);
    expect(b.credit('c_f5', false, false, add, T0 + 31 * DAY)).toMatchObject({ reward: 'ticket' });
  });

  it('never thanks two owls of one email', () => {
    const b = book();
    b.invite(owl('c_bea'), A, false, 'ip', T0);
    expect(b.credit('c_bea', false, true, () => {}, T0)).toBeNull();
    expect(b.pending('c_bea')).toBeNull();
    expect(b.offers('c_alice', T0)).toEqual([]);
  });
});
