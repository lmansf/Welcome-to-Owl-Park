/**
 * The Realm Vote's shares (OP-288): each votable realm's part of a month's votes, in whole percent.
 * Logan's call (Nov 7): the counts stay private (VOTE_TALLY_PUBLIC is off); only the shares are shown,
 * on the info desk in the Great Hollow. They are rounded so they always add up to 100 (the largest
 * remainders take the spare points, ties to the realm listed first), and a month with no votes yet has
 * no shares at all, so the desk says so instead of showing three zeros.
 */
export type VoteShares = Record<string, number>;

/** The shares of `counts` among `realms`, in whole percent adding up to 100; empty when nobody has voted. */
export function voteShares(counts: Readonly<Record<string, number>>, realms: readonly string[]): VoteShares {
  const n = (r: string) => {
    const v = counts[r];
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  };
  const total = realms.reduce((s, r) => s + n(r), 0);
  if (total === 0) return {};
  const exact = realms.map((r, i) => ({ r, i, v: (n(r) * 100) / total }));
  const out: VoteShares = {};
  for (const e of exact) out[e.r] = Math.floor(e.v);
  let spare = 100 - exact.reduce((s, e) => s + Math.floor(e.v), 0);
  for (const e of [...exact].sort((a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || a.i - b.i)) {
    if (spare <= 0) break;
    out[e.r] = out[e.r]! + 1;
    spare -= 1;
  }
  return out;
}

/** A shares answer as the Worker and the room send it, checked: whole percents of known realms, adding to 100, or none. */
export function isVoteShares(v: unknown, realms: readonly string[]): v is VoteShares {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return true;
  if (!entries.every(([r, p]) => realms.includes(r) && typeof p === 'number' && Number.isInteger(p) && p >= 0 && p <= 100)) return false;
  return entries.reduce((s, [, p]) => s + (p as number), 0) === 100;
}
