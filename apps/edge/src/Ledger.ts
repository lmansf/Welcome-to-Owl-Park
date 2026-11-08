/**
 * The Realm Vote ledger, written without platform APIs so it is unit-tested in Node.
 * Rules (canon): one vote per ticket-holder per park day, cast at a realm's idol; the
 * month's winner is the realm with the most votes; ties go to the realm with the fewest
 * all-time wins (then the first in the park's fixed realm order, an engineering default).
 * The voter is the wallet (C42): one vote per wallet per park day, however many tickets or
 * passes it holds. Each vote also keeps the ticket that let the owl in, and that ticket votes
 * once a day too, so moving it to another wallet does not vote twice.
 */
export interface VoteStore {
  get(day: string, visitor: string): { realm: string } | null;
  /** The day's vote cast with this ticket, whichever wallet cast it. */
  getByTicket(day: string, ticket: string): { realm: string } | null;
  put(day: string, visitor: string, realm: string, at: number, ticket: string | null): void;
  countByRealm(month: string): Record<string, number>;
  /** Every vote cast with this ticket, all days. */
  countOf(ticket: string): number;
  /** All-time wins per realm. */
  wins(): Record<string, number>;
  winOf(month: string): string | null;
  recordWin(month: string, realm: string, at: number): void;
}

export type VoteResult = { ok: true; realm: string; day: string } | { ok: false; reason: 'realm' | 'already'; votedFor?: string };

export interface Tally {
  month: string;
  counts: Record<string, number>;
  wins: Record<string, number>;
  winner: string | null;
}

export class Ledger {
  constructor(
    private readonly store: VoteStore,
    /** Realms that have an idol to vote at, in the park's fixed order. */
    readonly realms: string[],
  ) {}

  /** A vote by a wallet (`walletVoter`), with the ticket that let the owl in. */
  vote(visitor: string, realm: string, day: string, now: number, ticket: string | null = null): VoteResult {
    if (!this.realms.includes(realm)) return { ok: false, reason: 'realm' };
    const existing = this.store.get(day, visitor) ?? (ticket ? this.store.getByTicket(day, ticket) : null);
    if (existing) return { ok: false, reason: 'already', votedFor: existing.realm };
    this.store.put(day, visitor, realm, now, ticket);
    return { ok: true, realm, day };
  }

  /** Today's vote of a wallet, or of the ticket that let the owl in. */
  status(visitor: string, day: string, ticket: string | null = null): { day: string; votedFor: string | null } {
    return { day, votedFor: (this.store.get(day, visitor) ?? (ticket ? this.store.getByTicket(day, ticket) : null))?.realm ?? null };
  }

  /** How many votes were cast with this ticket, all days. */
  castBy(ticket: string): number {
    return this.store.countOf(ticket);
  }

  tally(month: string): Tally {
    const counts: Record<string, number> = {};
    for (const r of this.realms) counts[r] = 0;
    for (const [r, n] of Object.entries(this.store.countByRealm(month))) if (r in counts) counts[r] = n;
    return { month, counts, wins: this.store.wins(), winner: this.store.winOf(month) };
  }

  /** Decide a month (idempotent). Returns the tally with the winner filled in; null winner when nobody voted. */
  close(month: string, now: number): Tally {
    const t = this.tally(month);
    if (t.winner) return t;
    const max = Math.max(0, ...Object.values(t.counts));
    if (max === 0) return t;
    const tied = this.realms.filter((r) => t.counts[r] === max);
    tied.sort((a, b) => (t.wins[a] ?? 0) - (t.wins[b] ?? 0) || this.realms.indexOf(a) - this.realms.indexOf(b));
    const winner = tied[0]!;
    this.store.recordWin(month, winner, now);
    return { ...t, winner, wins: this.store.wins() };
  }
}

/** The voter for a wallet: the device (its collector id) that holds the tickets. */
export function walletVoter(device: string): string {
  return `wallet:${device}`;
}

/** The park's calendar day for a moment in time, in the park's time zone. */
export function parkDay(at: Date, timeZone: string): string {
  // en-CA gives YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function parkMonth(at: Date, timeZone: string): string {
  return parkDay(at, timeZone).slice(0, 7);
}

/** The month before the given one, as YYYY-MM. */
export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** In-memory store for tests and local experiments. */
export class MemoryVoteStore implements VoteStore {
  private votes = new Map<string, { realm: string; at: number; ticket: string | null }>();
  private winsByMonth = new Map<string, string>();
  get(day: string, visitor: string) {
    const v = this.votes.get(`${day}|${visitor}`);
    return v ? { realm: v.realm } : null;
  }
  getByTicket(day: string, ticket: string) {
    for (const [k, v] of this.votes) if (k.startsWith(`${day}|`) && (v.ticket === ticket || k.slice(k.indexOf('|') + 1) === ticket)) return { realm: v.realm };
    return null;
  }
  put(day: string, visitor: string, realm: string, at: number, ticket: string | null) {
    if (!this.votes.has(`${day}|${visitor}`)) this.votes.set(`${day}|${visitor}`, { realm, at, ticket });
  }
  countByRealm(month: string) {
    const out: Record<string, number> = {};
    for (const [k, v] of this.votes) if (k.startsWith(month)) out[v.realm] = (out[v.realm] ?? 0) + 1;
    return out;
  }
  countOf(ticket: string) {
    let n = 0;
    // Votes from before wallets counted (C35) were kept under the ticket itself.
    for (const [k, v] of this.votes) if (v.ticket === ticket || k.slice(k.indexOf('|') + 1) === ticket) n++;
    return n;
  }
  wins() {
    const out: Record<string, number> = {};
    for (const r of this.winsByMonth.values()) out[r] = (out[r] ?? 0) + 1;
    return out;
  }
  winOf(month: string) {
    return this.winsByMonth.get(month) ?? null;
  }
  recordWin(month: string, realm: string) {
    this.winsByMonth.set(month, realm);
  }
}
