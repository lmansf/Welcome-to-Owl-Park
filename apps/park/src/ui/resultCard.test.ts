import { describe, expect, it } from 'vitest';
import type { CoursePaid } from '@owl-park/shared';
import { clearLine } from './courseWords';
import { CLIMB_NEXT, DEVICE_BESTS_KEY, EMPTY_BOARD, arcadeNextLine, arcadeSubline, nextArcadeGame, recordDeviceBest, type BestStore } from './resultCard';
import { SPECTATOR_WORDS } from './spectator';

/** A page's storage, in memory. */
function memory(): BestStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('the best kept on this device (OP-379)', () => {
  it('keeps the highest score a game has had here, and says when a run beats it', () => {
    const store = memory();
    expect(recordDeviceBest(store, 'arcade:flight', 4)).toEqual({ best: 4, isNew: true, first: true });
    expect(recordDeviceBest(store, 'arcade:flight', 2)).toEqual({ best: 4, isNew: false, first: false });
    expect(recordDeviceBest(store, 'arcade:flight', 9)).toEqual({ best: 9, isNew: true, first: false });
    expect(recordDeviceBest(store, 'arcade:crossing', 3)).toEqual({ best: 3, isNew: true, first: true });
    expect(JSON.parse(store.data.get(DEVICE_BESTS_KEY)!)).toEqual({ 'arcade:flight': 9, 'arcade:crossing': 3 });
  });

  it('keeps the lowest time for a course', () => {
    const store = memory();
    recordDeviceBest(store, 'course:brush-1', 42_000, true);
    expect(recordDeviceBest(store, 'course:brush-1', 50_000, true)).toEqual({ best: 42_000, isNew: false, first: false });
    expect(recordDeviceBest(store, 'course:brush-1', 39_000, true)).toEqual({ best: 39_000, isNew: true, first: false });
  });

  it('a zero is no best, and a page with no storage, or storage that is not ours, shows none', () => {
    const store = memory();
    expect(recordDeviceBest(store, 'arcade:sling', 0)).toEqual({ best: null, isNew: false, first: true });
    expect(recordDeviceBest(null, 'arcade:sling', 5)).toEqual({ best: null, isNew: false, first: false });
    store.data.set(DEVICE_BESTS_KEY, 'not json');
    expect(recordDeviceBest(store, 'arcade:sling', 5)).toEqual({ best: 5, isNew: true, first: true });
    const refusing: BestStore = {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
    };
    expect(recordDeviceBest(refusing, 'arcade:sling', 5)).toEqual({ best: 5, isNew: true, first: true });
  });
});

describe('what a result card names next (OP-379)', () => {
  it('the arcade names the game at the next cabinet along the hall, round to the first', () => {
    expect(nextArcadeGame('crossing')).toBe('flight');
    expect(nextArcadeGame('flight')).toBe('sling');
    expect(nextArcadeGame('sling')).toBe('crossing');
    expect(arcadeNextLine('crossing')).toBe('Next: try Moon Flap at the next cabinet.');
    expect(arcadeNextLine('sling')).toBe('Next: try Hoot & Hop at the next cabinet.');
  });

  it('the climb names the arcade', () => {
    expect(CLIMB_NEXT).toBe('Next: try a game in the arcade.');
  });
});

describe('an empty daily board (OP-379)', () => {
  it('reads as an invitation to be first, not a blank', () => {
    expect(arcadeSubline(null, null)).toBe(`${EMPTY_BOARD.title}. ${EMPTY_BOARD.call}`);
    expect(arcadeSubline(null, 7)).toBe('No scores yet today. Be the first! · Your best 7');
    expect(arcadeSubline(12, 7)).toBe("Today's best 12 · Your best 7");
  });
});

describe("a course's clear line leads with the time and this device's best (OP-379)", () => {
  const paid = (p: Partial<CoursePaid>): CoursePaid => ({ ms: 45_000, feathers: 3, total: 10, practice: false, first: false, best: false, ...p }) as CoursePaid;
  it("a spectator's: the time and the best first, the Day Ticket line last", () => {
    expect(clearLine(paid({ practice: true }), SPECTATOR_WORDS.keep, { best: 39_000, isNew: false, first: false })).toBe(`Course clear in 0:45. Your best: 0:39. ${SPECTATOR_WORDS.keep}`);
    expect(clearLine(paid({ practice: true }), SPECTATOR_WORDS.keep, { best: 45_000, isNew: true, first: false })).toBe(`Course clear in 0:45 (a new best). ${SPECTATOR_WORDS.keep}`);
    expect(clearLine(paid({ practice: true }), SPECTATOR_WORDS.keep, { best: 45_000, isNew: true, first: true })).toBe(`Course clear in 0:45. ${SPECTATOR_WORDS.keep}`);
  });
  it("a ticket holder's: the park's new best, else this device's, before the feathers", () => {
    expect(clearLine(paid({ best: true }), SPECTATOR_WORDS.keep, { best: 39_000, isNew: false, first: false })).toBe('Course clear in 0:45 (a new best). +3 feathers.');
    expect(clearLine(paid({}), SPECTATOR_WORDS.keep, { best: 39_000, isNew: false, first: false })).toBe('Course clear in 0:45. Your best: 0:39. +3 feathers.');
    expect(clearLine(paid({}), SPECTATOR_WORDS.keep)).toBe('Course clear in 0:45. +3 feathers.');
  });
});
