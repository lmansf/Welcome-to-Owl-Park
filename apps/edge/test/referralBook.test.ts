import { describe, expect, it } from 'vitest';
import { REFERRAL_INVITES_PER_IP_PER_DAY, REFERRAL_MEMBER_FEATHERS, REFERRAL_OFFER_MS } from '@owl-park/shared';
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
    expect(b.view('c_bea', 'BEAA', false, T0)).toEqual({ code: 'BEAA', invited: false, canEnterCode: true, offers: [], thanked: 0 });
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
    expect(b.spend('h_unknown', '1001', 'e_bea', T0)).toBe(false);
    expect(b.spend('h1', '1001', 'e_bea', T0)).toBe(true);
    // The store sends the same order again: still yes. Another order, through either checkout: no.
    expect(b.spend('h1', '1001', 'e_bea', T0)).toBe(true);
    expect(b.spend('h2', '1002', 'e_other', T0)).toBe(false);
    expect(b.offers('c_bea', T0)).toEqual([]);
    expect(b.checkout('c_bea', 'h3', T0)).toBeNull();
  });

  it('never spends an offer that ran out', () => {
    const b = book();
    b.invite(owl('c_bea'), A, false, 'ip', T0);
    b.checkout('c_bea', 'h1', T0);
    expect(b.spend('h1', '1001', 'e_bea', T0 + REFERRAL_OFFER_MS)).toBe(false);
  });

  it('gives a friend’s free Day Ticket once per email, never without one, and a thank-you ticket however often', () => {
    const b = book();
    b.invite(owl('c_bea'), A, false, 'ip', T0);
    b.invite(owl('c_cam'), owl('c_dan'), false, 'ip', T0);
    b.invite(owl('c_eve'), A, false, 'ip', T0);
    b.checkout('c_bea', 'hb', T0);
    b.checkout('c_cam', 'hc', T0);
    b.checkout('c_eve', 'he', T0);
    // The store would not say the email: the friend's order waits, and the offer is still there.
    expect(b.spend('hb', '2001', null, T0)).toBe(false);
    expect(b.offers('c_bea', T0)).toHaveLength(1);
    expect(b.spend('hb', '2002', 'e_shared', T0)).toBe(true);
    // Another friend, brought by another owl, with the same email: no.
    expect(b.spend('hc', '2003', 'e_shared', T0)).toBe(false);
    expect(b.spend('hc', '2004', 'e_cam', T0)).toBe(true);
    // Thank-yous: Alice brought Bea and Eve; both tickets spend with Alice's one email.
    expect(b.spend('he', '2005', 'e_eve', T0)).toBe(true);
    b.credit('c_bea', false, false, () => {}, T0);
    b.credit('c_eve', false, false, () => {}, T0);
    expect(b.offers('c_alice', T0)).toHaveLength(2);
    b.checkout('c_alice', 'ha1', T0);
    expect(b.spend('ha1', '3001', 'e_alice', T0)).toBe(true);
    b.checkout('c_alice', 'ha2', T0);
    expect(b.spend('ha2', '3002', 'e_alice', T0)).toBe(true);
    expect(b.offers('c_alice', T0)).toEqual([]);
  });

  it('thanks the owl that brought a friend once: a Day Ticket, or 500 feathers with an annual pass, with no cap', () => {
    const b = book();
    const feathers: Array<[string, number]> = [];
    const add = (cid: string, n: number) => void feathers.push([cid, n]);
    const friends = ['c_f1', 'c_f2', 'c_f3', 'c_f4', 'c_f5', 'c_f6'];
    for (const f of friends) b.invite(owl(f), A, false, `ip_${f}`, T0);
    expect(b.credit('c_f1', false, false, add, T0)).toEqual({ referrer: 'c_alice', reward: 'ticket' });
    expect(b.credit('c_f1', false, false, add, T0)).toBeNull();
    expect(b.offers('c_alice', T0)).toEqual([expect.objectContaining({ kind: 'reward' })]);
    expect(b.credit('c_f2', true, false, add, T0)).toEqual({ referrer: 'c_alice', reward: 'feathers' });
    expect(feathers).toEqual([['c_alice', REFERRAL_MEMBER_FEATHERS]]);
    for (const f of friends.slice(2)) expect(b.credit(f, true, false, add, T0)).toMatchObject({ reward: 'feathers' });
    expect(feathers).toHaveLength(5);
    expect(b.view('c_alice', 'ALIC', true, T0)).toMatchObject({ thanked: 6 });
    expect(b.pending('c_f6')).toBeNull();
  });

  it('never thanks two owls of one email', () => {
    const b = book();
    b.invite(owl('c_bea'), A, false, 'ip', T0);
    expect(b.credit('c_bea', false, true, () => {}, T0)).toBeNull();
    expect(b.pending('c_bea')).toBeNull();
    expect(b.offers('c_alice', T0)).toEqual([]);
  });
});
