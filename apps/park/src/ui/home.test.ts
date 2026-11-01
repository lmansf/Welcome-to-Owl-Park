import { describe, expect, it } from 'vitest';
import { COLLECTOR_KEY, LOCAL_COLLECTOR_KEY, holdsOwl } from '../identity';
import type { WalletEntry } from '../net';
import { HOME_WORDS, LINE_WORDS, walletSummary } from './home';

const T0 = Date.UTC(2026, 11, 1, 18, 0, 0);
const H = 3_600_000;
const D = 24 * H;
const ticket = (over: Partial<WalletEntry> = {}): WalletEntry => ({ id: 'OWL-7K3Q-PX9M', kind: 'day', status: 'unused', msLeft: 300 * D, firstScan: null, validFrom: null, validUntil: null, voteToday: 'none', ...over });
const storageWith = (keys: Record<string, string>) => ({ getItem: (k: string) => keys[k] ?? null });

describe('the home screen (OP-065)', () => {
  it('is logged in only on a device that holds an owl: a look it kept, or a collection', () => {
    expect(holdsOwl(storageWith({}))).toBe(false);
    expect(holdsOwl(null)).toBe(false);
    expect(holdsOwl(storageWith({ 'owl-park:look': '{"body":"#8B5A2B"}' }))).toBe(true);
    expect(holdsOwl(storageWith({ [COLLECTOR_KEY]: 'tok' }))).toBe(true);
    expect(holdsOwl(storageWith({ [LOCAL_COLLECTOR_KEY]: 'c_abc' }))).toBe(true);
    // A browser that keeps nothing (storage throws) is a first visit every time.
    expect(holdsOwl({ getItem: () => { throw new Error('denied'); } })).toBe(false);
    // Other things the park keeps on the device do not make an owl.
    expect(holdsOwl(storageWith({ 'owl-park:settings': '{}', 'owl-park:presents-seen': '[]' }))).toBe(false);
  });

  it('says under Play only what changes what the owl does (OP-172)', () => {
    // A running Day or Night ticket with under an hour left: its time.
    expect(walletSummary([ticket({ status: 'active', msLeft: 40 * 60_000 })], 'ticket', T0)).toBe('Day ticket: 40 m left');
    expect(walletSummary([ticket({ kind: 'night', status: 'active', msLeft: 59 * 60_000 })], 'open', T0)).toBe('Night ticket: 59 m left');
    // Waiting on the store's check, whatever the gate.
    expect(walletSummary([ticket({ status: 'held' })], 'open', T0)).toBe(`Day ticket: ${HOME_WORDS.held}`);
    expect(walletSummary([ticket({ status: 'held' })], 'ticket', T0)).toBe('Day ticket: waiting on a quick check from the store');
    // A dated event or Opening Night Ticket whose night is still to come.
    const night = ticket({ kind: 'opening-night', msLeft: null, validFrom: T0 + D, validUntil: T0 + 2 * D });
    expect(walletSummary([night], 'ticket', T0, () => 'Dec 2, 7:00 PM')).toBe('Opening Night Ticket: for Dec 2, 7:00 PM');
    expect(walletSummary([ticket({ kind: 'event', msLeft: null, validFrom: T0 + D, validUntil: T0 + D + 4 * H })], 'open', T0, () => 'Dec 2, 7:00 PM')).toBe('Event ticket: for Dec 2, 7:00 PM');
    // No ticket while the gate takes tickets: where to get one.
    expect(walletSummary([], 'ticket', T0)).toBe(HOME_WORDS.none);
    expect(walletSummary([ticket({ status: 'used' })], 'ticket', T0)).toBe(HOME_WORDS.none);
  });

  it('shows nothing for a ticket that is fine as it is (OP-172)', () => {
    // A ready ticket, its night on, a running annual pass, a running ticket with an hour or more left.
    expect(walletSummary([ticket()], 'ticket', T0)).toBeNull();
    const night = ticket({ kind: 'opening-night', msLeft: null, validFrom: T0 - H, validUntil: T0 + 3 * H });
    expect(walletSummary([night], 'ticket', T0)).toBeNull();
    expect(walletSummary([ticket({ kind: 'annual', status: 'active', msLeft: 340 * D })], 'ticket', T0)).toBeNull();
    expect(walletSummary([ticket({ kind: 'annual', status: 'active', msLeft: 30 * 60_000 })], 'ticket', T0)).toBeNull();
    expect(walletSummary([ticket({ status: 'active', msLeft: H })], 'ticket', T0)).toBeNull();
    expect(walletSummary([ticket({ status: 'active', msLeft: 5 * H })], 'ticket', T0)).toBeNull();
    expect(walletSummary([ticket({ status: 'active', msLeft: null })], 'ticket', T0)).toBeNull();
    // A running event ticket says nothing of its time here.
    expect(walletSummary([ticket({ kind: 'event', status: 'active', msLeft: 20 * 60_000 })], 'ticket', T0)).toBeNull();
    // No ticket with the gate open: nothing to say.
    expect(walletSummary([], 'open', T0)).toBeNull();
    expect(walletSummary([ticket({ status: 'expired' })], 'open', T0)).toBeNull();
  });

  it('is about the ticket that matters most: a running one first, then the longest', () => {
    const day = ticket({ status: 'active', msLeft: 30 * 60_000 });
    const annual = ticket({ kind: 'annual', status: 'active', msLeft: 300 * D });
    expect(walletSummary([ticket(), day, ticket({ status: 'held' })], 'ticket', T0)).toBe('Day ticket: 30 m left');
    // The annual pass runs longest, so the short Day ticket beside it does not matter.
    expect(walletSummary([day, annual], 'ticket', T0)).toBeNull();
    // A ready ticket outranks one waiting on the store.
    expect(walletSummary([ticket({ status: 'held' }), ticket()], 'ticket', T0)).toBeNull();
    // Spent, expired and refunded tickets say nothing.
    expect(walletSummary([ticket({ status: 'used' }), ticket({ status: 'expired' }), ticket({ status: 'revoked' }), ticket({ status: 'held' })], 'ticket', T0)).toBe(`Day ticket: ${HOME_WORDS.held}`);
  });
});

describe('the line on the home screen (OP-075)', () => {
  it('tells an owl its place and a rough wait in plain words', () => {
    expect(LINE_WORDS.place(7)).toBe('Your place in line: 7');
    expect(LINE_WORDS.wait(1)).toBe('About a minute');
    expect(LINE_WORDS.wait(12)).toBe('About 12 minutes');
    expect(LINE_WORDS.wait(61)).toBe('More than an hour');
  });
});
