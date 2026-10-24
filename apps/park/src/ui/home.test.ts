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

  it('says under Play the ticket that matters most', () => {
    // A running ticket, with its time left; an annual pass by its name.
    expect(walletSummary([ticket({ status: 'active', msLeft: 5 * H + 12 * 60_000 })], 'ticket', T0)).toBe('Day ticket: 5 h 12 m left');
    expect(walletSummary([ticket({ kind: 'annual', status: 'active', msLeft: 340 * D })], 'ticket', T0)).toBe('Annual pass');
    // Ready, held, and a night of its own still to come.
    expect(walletSummary([ticket()], 'ticket', T0)).toBe(`Day ticket: ${HOME_WORDS.ready}`);
    expect(walletSummary([ticket({ status: 'held' })], 'open', T0)).toBe(`Day ticket: ${HOME_WORDS.held}`);
    const night = ticket({ kind: 'opening-night', msLeft: null, validFrom: T0 + D, validUntil: T0 + 2 * D });
    expect(walletSummary([night], 'ticket', T0, () => 'Dec 2, 7:00 PM')).toBe('Opening Night Ticket: for Dec 2, 7:00 PM');
    expect(walletSummary([{ ...night, validFrom: T0 - H }], 'ticket', T0)).toBe(`Opening Night Ticket: ${HOME_WORDS.ready}`);
  });

  it('puts a running ticket first, then the longest', () => {
    const day = ticket({ status: 'active', msLeft: 2 * H });
    const annual = ticket({ kind: 'annual', status: 'active', msLeft: 300 * D });
    expect(walletSummary([ticket(), day, ticket({ status: 'held' })], 'ticket', T0)).toBe('Day ticket: 2 h 0 m left');
    expect(walletSummary([day, annual], 'ticket', T0)).toBe('Annual pass');
    // Spent, expired and refunded tickets say nothing.
    expect(walletSummary([ticket({ status: 'used' }), ticket({ status: 'expired' }), ticket({ status: 'revoked' }), ticket()], 'ticket', T0)).toBe(`Day ticket: ${HOME_WORDS.ready}`);
  });

  it('points at the booth without a ticket only while the gate takes tickets', () => {
    expect(walletSummary([], 'ticket', T0)).toBe(HOME_WORDS.none);
    expect(walletSummary([ticket({ status: 'used' })], 'ticket', T0)).toBe(HOME_WORDS.none);
    expect(walletSummary([], 'open', T0)).toBeNull();
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
