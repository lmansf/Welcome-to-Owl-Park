import { describe, expect, it } from 'vitest';
import type { WalletEntry } from '../net';
import { pointInRect } from '@owl-park/shared';
import { getRoom } from '../rooms';
import {
  GATE_STATUS_WORDS,
  LINK_WORDS,
  LOW_TIME_MS,
  OPENING_WORDS,
  approachMove,
  approachStart,
  approachThrough,
  bestTicket,
  gateCard,
  gateRefusal,
  gateStatus,
  linkToast,
  lowTimeDue,
  lowTimeToast,
  ticketRun,
  timeLeft,
  walletLine,
} from './tickets';

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
    // The owner's words (the pass at half price since OP-062).
    expect(`${OPENING_WORDS.offer} ${OPENING_WORDS.claim}`).toBe('Your pass is half price tonight. Claim it');
    expect(OPENING_WORDS.booth).toBe('Opening night: every pass is half price');
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
    // OP-174: a ticket already running on another owl stays with it.
    expect(linkToast('claim', 'in-use')).toBe(LINK_WORDS.inUse);
    expect(linkToast('take', 'in-use')).toContain('already in use');
  });
});

describe('the ticket status at the turnstiles (OP-172)', () => {
  const taking = { gate: 'ticket', admitted: false } as const;

  it('says the best ticket in the wallet’s words while the gate takes tickets', () => {
    expect(gateStatus([ticket()], taking, T0)).toBe('Day ticket: Ready, its time starts when the turnstiles scan it');
    expect(gateStatus([ticket({ kind: 'annual', status: 'active', msLeft: 340 * D })], taking, T0)).toBe('Annual pass: Running');
    expect(gateStatus([ticket({ status: 'active', msLeft: 5 * H + 12 * 60_000 })], taking, T0)).toBe('Day ticket: Running, 5 h 12 m left');
    expect(gateStatus([ticket({ kind: 'night', status: 'active', msLeft: null })], taking, T0)).toBe('Night ticket: Running');
    expect(gateStatus([ticket({ status: 'held' })], taking, T0)).toBe('Day ticket: Waiting on a quick check from the store; it works as soon as that is done');
    expect(gateStatus([ticket({ kind: 'event', msLeft: null, validFrom: T0 + D, validUntil: T0 + D + 4 * H })], taking, T0, () => 'Nov 2, 7:00 PM')).toBe('Event ticket: For Nov 2, 7:00 PM');
    expect(gateStatus([ticket({ kind: 'opening-night', msLeft: null, validFrom: T0 - H, validUntil: T0 + 3 * H })], taking, T0)).toBe('Opening Night Ticket: Its night is on, walk through the turnstiles');
    // The same pick as the home line: running first, then the longest; spent tickets never.
    expect(gateStatus([ticket(), ticket({ status: 'active', msLeft: 2 * H }), ticket({ status: 'used' })], taking, T0)).toBe('Day ticket: Running, 2 h 0 m left');
  });

  it('points at the booth without a ticket, and says nothing with the gate open', () => {
    expect(gateStatus([], taking, T0)).toBe(GATE_STATUS_WORDS.none);
    expect(GATE_STATUS_WORDS.none).toBe('No ticket yet: the ticket booth is along the plaza');
    expect(gateStatus([ticket({ status: 'expired' }), ticket({ status: 'revoked' })], taking, T0)).toBe(GATE_STATUS_WORDS.none);
    expect(gateStatus([], { gate: 'open', admitted: true }, T0)).toBeNull();
    expect(gateStatus([ticket()], { gate: 'open', admitted: false }, T0)).toBeNull();
    // Let through already (no ticket on this device to show): the gate turns no one back, so nothing.
    expect(gateStatus([], { gate: 'ticket', admitted: true }, T0)).toBeNull();
    expect(gateStatus([ticket()], { gate: 'ticket', admitted: true }, T0)).toBe('Day ticket: Ready, its time starts when the turnstiles scan it');
  });

  it('picks the ticket that matters most', () => {
    expect(bestTicket([])).toBeNull();
    expect(bestTicket([ticket({ status: 'used' })])).toBeNull();
    const annual = ticket({ id: 'A', kind: 'annual', status: 'active', msLeft: 300 * D });
    expect(bestTicket([ticket({ status: 'active', msLeft: H }), annual, ticket()])).toBe(annual);
    const ready = ticket({ id: 'R' });
    expect(bestTicket([ticket({ status: 'held' }), ready])).toBe(ready);
  });

  it('shows on walking onto the plaza and fades on walking off it', () => {
    let a = approachStart(false);
    expect(a.shown).toBe(false);
    a = approachMove(a, true);
    expect(a).toEqual({ inside: true, armed: true, shown: true });
    // Moving about on the plaza changes nothing.
    expect(approachMove(a, true)).toBe(a);
    a = approachMove(a, false);
    expect(a.shown).toBe(false);
    expect(approachMove(a, true).shown).toBe(true);
  });

  it('is not shown to an owl that comes out of the park onto the plaza until it walks off and back', () => {
    let a = approachStart(true);
    expect(a).toEqual({ inside: true, armed: false, shown: false });
    a = approachMove(a, true);
    expect(a.shown).toBe(false);
    a = approachMove(a, false);
    expect(a.shown).toBe(false);
    a = approachMove(a, true);
    expect(a.shown).toBe(true);
  });

  it('gives way to the turnstiles: gone through (or turned back), it shows again only after a walk off and back', () => {
    let a = approachThrough(approachMove(approachStart(false), true));
    expect(a).toEqual({ inside: true, armed: false, shown: false });
    // Turned back onto the plaza: still nothing.
    a = approachMove(a, true);
    expect(a.shown).toBe(false);
    a = approachMove(approachMove(a, false), true);
    expect(a.shown).toBe(true);
  });

  it('has its plaza in the lobby’s room data: before the turnstiles, short of the booth, where an owl out of the park lands', () => {
    const lobby = getRoom('lobby');
    const zone = lobby.zones?.find((z) => z.id === 'gate-approach');
    expect(zone).toBeDefined();
    const gate = lobby.doors.find((d) => d.id === 'gate')!;
    const booth = lobby.doors.find((d) => d.id === 'booth')!;
    expect(zone!.rect.x).toBeLessThanOrEqual(gate.rect.x);
    expect(zone!.rect.x + zone!.rect.w).toBeGreaterThanOrEqual(gate.rect.x + gate.rect.w);
    expect(zone!.rect.x).toBeGreaterThan(booth.rect.x + booth.rect.w);
    // The owl that comes out of the park lands on it; one arriving from the street does not.
    expect(pointInRect(lobby.spawns['from-hub']!, zone!.rect)).toBe(true);
    expect(pointInRect(lobby.spawns['default']!, zone!.rect)).toBe(false);
    // In front of each turnstile, just below the gate.
    expect(pointInRect({ x: gate.rect.x + 20, y: gate.rect.y + gate.rect.h + 10 }, zone!.rect)).toBe(true);
    expect(pointInRect({ x: gate.rect.x + gate.rect.w - 20, y: gate.rect.y + gate.rect.h + 10 }, zone!.rect)).toBe(true);
  });
});

describe('the one toast in the park as a ticket runs low (OP-172)', () => {
  const scan = (kind: WalletEntry['kind'], validUntil: number | null) => ({ ok: true as const, id: 'OWL-7K3Q-PX9M', kind, started: true, validUntil });

  it('is for a Day or Night ticket only', () => {
    expect(ticketRun(scan('day', T0 + D))).toEqual({ kind: 'day', until: T0 + D, warned: false });
    expect(ticketRun(scan('night', T0 + 4 * H))).toMatchObject({ kind: 'night' });
    expect(ticketRun(scan('annual', T0 + 300 * D))).toBeNull();
    expect(ticketRun(scan('event', T0 + 4 * H))).toBeNull();
    expect(ticketRun(scan('opening-night', T0 + 4 * H))).toBeNull();
    expect(ticketRun(scan('day', null))).toBeNull();
  });

  it('comes at 15 minutes left, once a visit', () => {
    const run = ticketRun(scan('day', T0 + 2 * H))!;
    expect(lowTimeDue(run, T0)).toBe(2 * H - LOW_TIME_MS);
    expect(LOW_TIME_MS).toBe(15 * 60_000);
    // Past the mark already (a room entered with less left): now.
    expect(lowTimeDue(run, T0 + 2 * H - 10 * 60_000)).toBe(0);
    // Shown, or run out: never again.
    expect(lowTimeDue({ ...run, warned: true }, T0)).toBeNull();
    expect(lowTimeDue(run, T0 + 2 * H)).toBeNull();
    expect(lowTimeDue(null, T0)).toBeNull();
  });

  it('says how long is left, quietly', () => {
    expect(lowTimeToast('day', 15 * 60_000)).toBe('Your Day ticket has 15 minutes left.');
    expect(lowTimeToast('night', 12 * 60_000 + 20_000)).toBe('Your Night ticket has 12 minutes left.');
    expect(lowTimeToast('day', 50_000)).toBe('Your Day ticket has 1 minute left.');
  });
});
