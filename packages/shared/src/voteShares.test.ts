import { describe, expect, it } from 'vitest';
import { VOTABLE_REALMS } from './look';
import { isVoteShares, voteShares } from './voteShares';

const R = VOTABLE_REALMS;

describe('the Realm Vote’s shares (OP-288): percent only, never counts', () => {
  it('no votes yet: no shares, not three zeros', () => {
    expect(voteShares({ grove: 0, market: 0, glass: 0 }, R)).toEqual({});
    expect(voteShares({}, R)).toEqual({});
  });

  it('whole percents that always add up to 100, the largest remainders taking the spare points', () => {
    expect(voteShares({ grove: 1, market: 1, glass: 1 }, R)).toEqual({ grove: 34, market: 33, glass: 33 });
    expect(voteShares({ grove: 2, market: 1, glass: 0 }, R)).toEqual({ grove: 67, market: 33, glass: 0 });
    expect(voteShares({ grove: 1, market: 0, glass: 0 }, R)).toEqual({ grove: 100, market: 0, glass: 0 });
    for (let a = 0; a < 12; a++)
      for (let b = 0; b < 12; b++)
        for (let c = 0; c < 12; c++) {
          const s = voteShares({ grove: a, market: b, glass: c }, R);
          if (a + b + c === 0) continue;
          expect(Object.values(s).reduce((x, y) => x + y, 0)).toBe(100);
          expect(isVoteShares(s, R)).toBe(true);
        }
  });

  it('a realm that is not on the vote, or a count that is not a count, is left out', () => {
    expect(voteShares({ grove: 3, market: Number.NaN, glass: -2, ink: 9 }, R)).toEqual({ grove: 100, market: 0, glass: 0 });
  });

  it('the check takes only whole percents of known realms that add up to 100, or none', () => {
    expect(isVoteShares({}, R)).toBe(true);
    expect(isVoteShares({ grove: 50, market: 50 }, R)).toBe(true);
    expect(isVoteShares({ grove: 50, market: 49 }, R)).toBe(false);
    expect(isVoteShares({ grove: 50.5, market: 49.5 }, R)).toBe(false);
    expect(isVoteShares({ ink: 100 }, R)).toBe(false);
    expect(isVoteShares([100], R)).toBe(false);
    expect(isVoteShares(null, R)).toBe(false);
  });
});
