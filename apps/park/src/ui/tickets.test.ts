import { describe, expect, it } from 'vitest';
import type { WalletEntry } from '../net';
import { OPENING_WORDS, gateCard, gateRefusal, linkToast, timeLeft, walletLine } from './tickets';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);
const H = 3_600_000;
const D = 24 * H;
const ticket = (over: Partial<WalletEntry> = {}): WalletEntry => ({ id: 'OWL-7K3Q-PX9M', kind: 'day', status: 'unused', msLeft: 300 * D, firstScan: null, validFrom: null, validUntil: null, voteToday: 'none', ...over });

describe('tickets in words', () => {
  it('says how much time is left, rounded down', () => {
    expect(timeLeft(364 * D + 5 * H)).toBe('364 days');
    expect(timeLeft(D + 3 * H)).toBe('27 h 0 m');
    expect(timeLeft(5 * H + 12 * 60_000 + 59_000)).toBe('5 h 12 m');
    expect(timeLeft(40 * 60_000)).toBe('40 m');
    expect(timeLeft(10_000)).toBe('1 m');
  });

  it('gives each ticket in the wallet a line, today’s vote while it runs, and a share button while unused', () => {
    expect(walletLine(ticket(), T0)).toEqual({ title: 'Day ticket', status: 'Ready: its time starts when the turnstiles scan it', vote: null, share: true, freePass: null });
    expect(walletLine(ticket({ status: 'active', msLeft: 5 * H, voteToday: 'ready' }), T0)).toEqual({ title: 'Day ticket', status: 'Running: 5 h 0 m left', vote: "Today's vote: ready at a realm's idol", share: false, freePass: null });
    expect(walletLine(ticket({ kind: 'annual', status: 'active', msLeft: 340 * D, voteToday: 'used' }), T0)).toMatchObject({ title: 'Annual pass', status: 'Running: 340 days left', vote: "Today's vote: cast" });
    expect(walletLine(ticket({ status: 'held' }), T0).status).toContain('quick check');
    expect(walletLine(ticket({ status: 'revoked' }), T0)).toMatchObject({ status: 'Refunded', share: false });
    expect(walletLine(ticket({ status: 'expired' }), T0).status).toBe('Expired unused');
    expect(walletLine(ticket({ kind: 'event', status: 'expired' }), T0).status).toBe('Its night has passed');
    expect(walletLine(ticket({ kind: 'event', validFrom: T0 + D, validUntil: T0 + D + 4 * H }), T0, () => 'Nov 2, 7:00 PM').status).toBe('For Nov 2, 7:00 PM');
    expect(walletLine(ticket({ kind: 'event', validFrom: T0 - H, validUntil: T0 + 3 * H }), T0).status).toBe('Its night is on: walk through the turnstiles');
  });

  it('shows an Opening Night Ticket by its name, its night, and its free pass (C42)', () => {
    const night = ticket({ kind: 'opening-night', msLeft: null, validFrom: T0 + D, validUntil: T0 + 2 * D });
    expect(walletLine(night, T0, () => 'Dec 4, 7:00 PM')).toEqual({ title: 'Opening Night Ticket', status: 'For Dec 4, 7:00 PM', vote: null, share: true, freePass: null });
    expect(walletLine({ ...night, status: 'active', msLeft: 3 * H, voteToday: 'ready', freePass: 'ready' }, T0)).toMatchObject({ status: 'Running: 3 h 0 m left', freePass: 'ready' });
    expect(walletLine({ ...night, status: 'used', freePass: 'claimed' }, T0)).toMatchObject({ status: 'Used', freePass: 'claimed' });
    expect(walletLine({ ...night, status: 'expired' }, T0).status).toBe('Its night has passed');
    expect(walletLine({ ...night, status: 'revoked', freePass: 'claimed' }, T0).freePass).toBeNull();
    expect(gateCard({ ok: true, id: 'OWL-7K3Q-PX9M', kind: 'opening-night', started: true, validUntil: T0 + 4 * H }, T0)).toEqual({ kind: 'Opening Night Ticket', id: 'OWL-7K3Q-PX9M', line: 'Your night starts now' });
    expect(gateRefusal('not-yet', 'opening-night')).toBe('Your Opening Night Ticket opens the turnstiles on opening night. See you then!');
    // The owner's words, as approved.
    expect(`${OPENING_WORDS.offer} ${OPENING_WORDS.claim}`).toBe('Your pass is free tonight. Claim it');
    expect(OPENING_WORDS.booth).toBe('Opening night: every pass is free');
    expect(OPENING_WORDS.claimed).toBe('Your annual pass is in your wallet');
  });

  it('flips up a card at the turnstiles: the visit starts, or welcome back with the time left', () => {
    expect(gateCard({ ok: true, id: 'OWL-7K3Q-PX9M', kind: 'day', started: true, validUntil: T0 + D }, T0)).toEqual({ kind: 'Day ticket', id: 'OWL-7K3Q-PX9M', line: 'Your visit starts now: 24 h 0 m' });
    expect(gateCard({ ok: true, id: 'OWL-7K3Q-PX9M', kind: 'annual', started: false, validUntil: T0 + 200 * D }, T0).line).toBe('Welcome back: 200 days left');
    expect(gateCard({ ok: true, id: 'OWL-7K3Q-PX9M', kind: 'event', started: true, validUntil: T0 + 4 * H }, T0).line).toBe('Your night starts now');
  });

  it('says why the turnstiles stay shut', () => {
    expect(gateRefusal('none')).toContain('ticket booth');
    expect(gateRefusal('held')).toContain('quick check');
    expect(gateRefusal('not-yet')).toContain('on its night');
    expect(gateRefusal('revoked')).toContain('refunded');
    expect(gateRefusal('offline')).toContain('could not reach');
  });

  it('says what a ticket link did', () => {
    expect(linkToast('claim', [ticket()])).toBe('Your ticket is in your wallet. Walk through the turnstiles to use it.');
    expect(linkToast('claim', [ticket(), ticket({ id: 'OWL-2222-3333' })])).toContain('Pass the extra ones on');
    expect(linkToast('take', [ticket()])).toContain('passed on to you');
    expect(linkToast('claim', null)).toContain('newest email');
    expect(linkToast('take', null)).toContain('already taken');
    expect(linkToast('claim', [ticket({ status: 'revoked' })])).toContain('refunded');
  });
});
