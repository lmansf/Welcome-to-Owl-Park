import { describe, expect, it } from 'vitest';
import { DAY_MS, DEFAULT_LENGTH_MS, HOUR_MS, ID_ALPHABET, UNUSED_LIFETIME_MS, isTicketId, scan, statusOf, timeLeft, visualId, type Ticket } from '../src/tickets';

const T0 = Date.UTC(2026, 10, 1, 12, 0, 0);

function ticket(over: Partial<Ticket> = {}): Ticket {
  return { id: 'OWL-7K3Q-PX9M', kind: 'day', lengthMs: DEFAULT_LENGTH_MS.day, order: '1001', line: '2001', unit: 1, created: T0, held: false, firstScan: null, validUntil: null, validFrom: null, revoked: null, ...over };
}

describe('visual IDs', () => {
  it('are OWL- and eight characters with no 0, O, 1 or I', () => {
    const id = visualId(new Uint8Array([0, 1, 2, 3, 28, 29, 30, 31, 9]));
    expect(id).toBe('OWL-2345-WXYZ');
    expect(isTicketId(id)).toBe(true);
    expect(ID_ALPHABET).not.toMatch(/[01IO]/);
    expect(ID_ALPHABET).toHaveLength(32);
    for (let b = 0; b < 256; b++) expect(isTicketId(visualId(new Uint8Array(8).fill(b)))).toBe(true);
  });

  it('refuse lookalikes and other shapes', () => {
    for (const bad of ['OWL-7K3Q-PX9', 'OWL-7K3Q-PX0M', 'owl-7k3q-px9m', 'OWL7K3QPX9M', 'OWL-IK3Q-PX9M', 42, null]) expect(isTicketId(bad)).toBe(false);
    expect(() => visualId(new Uint8Array(7))).toThrow();
  });
});

describe('a day ticket', () => {
  it('is unused until its first scan, which starts its 24 hours', () => {
    const t = ticket();
    expect(statusOf(t, T0 + 30 * DAY_MS)).toBe('unused');
    const r = scan(t, T0 + 30 * DAY_MS);
    expect(r.ok && r.started).toBe(true);
    if (!r.ok) return;
    expect(r.ticket.firstScan).toBe(T0 + 30 * DAY_MS);
    expect(r.ticket.validUntil).toBe(T0 + 31 * DAY_MS);
    expect(statusOf(r.ticket, T0 + 30 * DAY_MS + 23 * HOUR_MS)).toBe('active');
    // A later scan inside its time lets it through again without restarting the clock.
    const again = scan(r.ticket, T0 + 30 * DAY_MS + 5 * HOUR_MS);
    expect(again.ok && !again.started && again.ticket.validUntil).toBe(T0 + 31 * DAY_MS);
    expect(statusOf(r.ticket, T0 + 31 * DAY_MS)).toBe('used');
    expect(scan(r.ticket, T0 + 31 * DAY_MS)).toEqual({ ok: false, reason: 'used' });
  });

  it('expires a year after purchase when never used', () => {
    const t = ticket();
    expect(statusOf(t, T0 + UNUSED_LIFETIME_MS - 1)).toBe('unused');
    expect(statusOf(t, T0 + UNUSED_LIFETIME_MS)).toBe('expired');
    expect(scan(t, T0 + UNUSED_LIFETIME_MS)).toEqual({ ok: false, reason: 'expired' });
    expect(timeLeft(t, T0 + 10 * DAY_MS)).toEqual({ status: 'unused', msLeft: UNUSED_LIFETIME_MS - 10 * DAY_MS });
  });

  it('waits for the fraud check when held, and stops for good when revoked', () => {
    expect(scan(ticket({ held: true }), T0)).toEqual({ ok: false, reason: 'held' });
    const r = scan(ticket(), T0);
    if (!r.ok) throw new Error('scan refused');
    expect(statusOf({ ...r.ticket, revoked: T0 + HOUR_MS }, T0 + 2 * HOUR_MS)).toBe('revoked');
    expect(scan({ ...r.ticket, revoked: T0 + HOUR_MS }, T0 + 2 * HOUR_MS)).toEqual({ ok: false, reason: 'revoked' });
  });
});

describe('other kinds', () => {
  it('an annual pass lasts 365 days from its first scan', () => {
    const r = scan(ticket({ kind: 'annual', lengthMs: DEFAULT_LENGTH_MS.annual }), T0 + DAY_MS);
    expect(r.ok && r.ticket.validUntil).toBe(T0 + 366 * DAY_MS);
  });

  it('a night ticket needs its hours from the store before it can start', () => {
    expect(scan(ticket({ kind: 'night', lengthMs: null }), T0)).toEqual({ ok: false, reason: 'no-length' });
    const r = scan(ticket({ kind: 'night', lengthMs: 9 * HOUR_MS }), T0);
    expect(r.ok && r.ticket.validUntil).toBe(T0 + 9 * HOUR_MS);
  });

  it('an event ticket waits for its window to be set', () => {
    expect(scan(ticket({ kind: 'event', lengthMs: null }), T0)).toEqual({ ok: false, reason: 'not-yet' });
  });

  it('an event ticket works inside its window only', () => {
    const night = ticket({ kind: 'event', lengthMs: null, validFrom: T0 + 10 * DAY_MS, validUntil: T0 + 10 * DAY_MS + 8 * HOUR_MS });
    expect(scan(night, T0 + 9 * DAY_MS)).toEqual({ ok: false, reason: 'not-yet' });
    const r = scan(night, T0 + 10 * DAY_MS + HOUR_MS);
    expect(r.ok && r.started && r.ticket.validUntil).toBe(T0 + 10 * DAY_MS + 8 * HOUR_MS);
    if (!r.ok) return;
    expect(statusOf(r.ticket, T0 + 11 * DAY_MS)).toBe('used');
    expect(statusOf(night, T0 + 11 * DAY_MS)).toBe('expired');
  });
});

describe('the edges of a ticket’s time, to the millisecond (OP-131)', () => {
  const W0 = T0 + 10 * DAY_MS;
  const event = (over: Partial<Ticket> = {}) => ticket({ kind: 'event', lengthMs: null, validFrom: W0, validUntil: W0 + 6 * HOUR_MS, ...over });

  it('lets a windowed ticket in from the first millisecond of its window, and counts it active there', () => {
    expect(scan(event(), W0 - 1)).toEqual({ ok: false, reason: 'not-yet' });
    const r = scan(event(), W0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(statusOf(r.ticket, W0)).toBe('active');
  });

  it('counts a windowed ticket unused before its window, even one scanned already (its window moved later)', () => {
    expect(statusOf(event({ firstScan: W0 - DAY_MS }), W0 - 1)).toBe('unused');
  });

  it('keeps a windowed ticket with a start but no end out', () => {
    expect(scan(event({ validUntil: null }), W0 + HOUR_MS)).toEqual({ ok: false, reason: 'not-yet' });
  });

  it('will not start an open-dated ticket with no length', () => {
    for (const lengthMs of [0, -1]) expect(scan(ticket({ kind: 'night', lengthMs }), T0)).toEqual({ ok: false, reason: 'no-length' });
  });

  it('has no time left once it is used, expired, held or revoked', () => {
    const r = scan(ticket(), T0);
    if (!r.ok) throw new Error('a new day ticket goes through');
    expect(timeLeft(r.ticket, T0 + DAY_MS + 1)).toEqual({ status: 'used', msLeft: 0 });
    expect(timeLeft(ticket({ held: true }), T0)).toEqual({ status: 'held', msLeft: 0 });
    expect(timeLeft(ticket({ revoked: T0 }), T0)).toEqual({ status: 'revoked', msLeft: 0 });
    expect(timeLeft(event(), W0 + 7 * HOUR_MS)).toEqual({ status: 'expired', msLeft: 0 });
  });
});
