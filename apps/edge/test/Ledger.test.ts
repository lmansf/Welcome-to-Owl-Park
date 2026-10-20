import { describe, expect, it } from 'vitest';
import { Ledger, MemoryVoteStore, parkDay, parkMonth, previousMonth } from '../src/Ledger';

const realms = ['grove', 'market'];

describe('Ledger', () => {
  it('takes one vote per visitor per day and reports what they voted for', () => {
    const l = new Ledger(new MemoryVoteStore(), realms);
    expect(l.vote('u1', 'grove', '2026-11-03', 1)).toEqual({ ok: true, realm: 'grove', day: '2026-11-03' });
    expect(l.vote('u1', 'market', '2026-11-03', 2)).toEqual({ ok: false, reason: 'already', votedFor: 'grove' });
    expect(l.status('u1', '2026-11-03')).toEqual({ day: '2026-11-03', votedFor: 'grove' });
    expect(l.status('u1', '2026-11-04')).toEqual({ day: '2026-11-04', votedFor: null });
    expect(l.vote('u1', 'market', '2026-11-04', 3).ok).toBe(true);
  });

  it('counts every vote a voter has cast, all days', () => {
    const l = new Ledger(new MemoryVoteStore(), realms);
    l.vote('OWL-AAAA-AAAA', 'grove', '2026-11-03', 1);
    l.vote('OWL-AAAA-AAAA', 'market', '2026-11-04', 2);
    l.vote('OWL-BBBB-BBBB', 'grove', '2026-11-04', 3);
    expect(l.castBy('OWL-AAAA-AAAA')).toBe(2);
    expect(l.castBy('OWL-BBBB-BBBB')).toBe(1);
    expect(l.castBy('OWL-CCCC-CCCC')).toBe(0);
  });

  it('rejects realms without an idol', () => {
    const l = new Ledger(new MemoryVoteStore(), realms);
    expect(l.vote('u1', 'ink', '2026-11-03', 1)).toEqual({ ok: false, reason: 'realm' });
    expect(l.vote('u1', 'constructor', '2026-11-03', 1)).toEqual({ ok: false, reason: 'realm' });
  });

  it('tallies a month and decides the winner once', () => {
    const l = new Ledger(new MemoryVoteStore(), realms);
    l.vote('a', 'grove', '2026-11-01', 1);
    l.vote('b', 'grove', '2026-11-02', 1);
    l.vote('c', 'market', '2026-11-02', 1);
    l.vote('d', 'market', '2026-12-01', 1); // next month, not counted
    expect(l.tally('2026-11').counts).toEqual({ grove: 2, market: 1 });
    const closed = l.close('2026-11', 9);
    expect(closed.winner).toBe('grove');
    expect(closed.wins).toEqual({ grove: 1 });
    // Closing again changes nothing.
    expect(l.close('2026-11', 10).winner).toBe('grove');
    expect(l.tally('2026-11').wins).toEqual({ grove: 1 });
  });

  it('breaks ties by fewest all-time wins, then the park order', () => {
    const l = new Ledger(new MemoryVoteStore(), realms);
    l.vote('a', 'grove', '2026-10-05', 1);
    expect(l.close('2026-10', 1).winner).toBe('grove');
    l.vote('a', 'grove', '2026-11-05', 1);
    l.vote('b', 'market', '2026-11-05', 1);
    expect(l.close('2026-11', 2).winner).toBe('market'); // tied 1-1; market has fewer wins
    l.vote('a', 'grove', '2026-12-05', 1);
    l.vote('b', 'market', '2026-12-05', 1);
    expect(l.close('2026-12', 3).winner).toBe('grove'); // tied 1-1 and 1 win each: park order
  });

  it('leaves a month with no votes undecided', () => {
    const l = new Ledger(new MemoryVoteStore(), realms);
    expect(l.close('2026-11', 1).winner).toBeNull();
  });

  it('computes park days in the park time zone', () => {
    const late = new Date('2026-11-04T03:30:00Z'); // 23:30 the previous evening in New York
    expect(parkDay(late, 'America/New_York')).toBe('2026-11-03');
    expect(parkDay(late, 'UTC')).toBe('2026-11-04');
    expect(parkMonth(late, 'America/New_York')).toBe('2026-11');
    expect(previousMonth('2026-01')).toBe('2025-12');
    expect(previousMonth('2026-11')).toBe('2026-10');
  });
});
