/**
 * Rate limits on the Worker's API and its room sockets (OP-142): calls are counted a minute at a
 * time per address, per owl, and for the few calls that move tickets or send mail, more tightly per
 * owl. A call past a limit is answered 429 with Retry-After (the seconds left in its minute).
 *
 * The counts are kept in the Worker's own memory. Cloudflare's rate limiting binding would share them
 * across a location's machines, but nothing this could check says it is free on the Workers Free plan,
 * and the ticket rules out a paid feature; counts kept in a Durable Object would spend the free plan's
 * daily requests on every call. So each copy of the Worker keeps its own: a page or a script calling
 * too fast keeps meeting the same copy and is stopped, and a flood spread over Cloudflare's machines is
 * Cloudflare's own DDoS protection's to stop.
 *
 * The limits are set well past a busy night: a page polls the line at most every 5 s and the busy
 * ribbon every minute, so an owl makes a few dozen calls a minute at most, and a household, a school
 * or a phone network shares one address. Only the store's webhooks go uncounted (signed, and retried by
 * the store). RATE_LIMITS "off" is for a load test's throwaway copy only (tools/load/throwaway-config.mjs).
 *
 * TODO-DOCS (OP-142): docs/ARCHITECTURE.md: the limits, why in memory, and the route table (the
 * ticket's Notes); docs/PLAYBOOK.md: a rate_limited line, and RATE_LIMITS.
 */

export interface Limit {
  readonly limit: number;
  readonly windowMs: number;
}

export const API_LIMITS = {
  /** Every call from one address, a socket's opening included. */
  address: { limit: 600, windowMs: 60_000 },
  /** Calls that need no pass (a page asking for its pass, the ribbon's words, the keepers' calls), by address: a classroom opening the park together shares one. */
  public: { limit: 300, windowMs: 60_000 },
  /** Calls that need a pass and came with none the Worker takes, by address: a page with its pass never makes many. */
  refused: { limit: 60, windowMs: 60_000 },
  /** Calls with a pass, by its owl's collection (or the pass, before it has one). */
  visitor: { limit: 120, windowMs: 60_000 },
  /** A claim, a share, a scan at the gate, the pass link, the gate's checkout link and the account links, by owl (or address). */
  ticket: { limit: 10, windowMs: 60_000 },
} as const satisfies Record<string, Limit>;

export type LimitName = keyof typeof API_LIMITS;

/**
 * The calls that need no pass: the page's first (its pass, the ribbon's words), the health and the
 * counts, the browser's reports, the keepers' (their key or a keeper's token instead: the ledge
 * painter's save, /api/admin/masks/<room>, among them), a tree room's ledge draft read back
 * (/api/masks/<room>, OP-156), the account links (a pass if there is one).
 */
export function isPublicCall(pathname: string): boolean {
  return (
    ['/api/pass', '/api/notice', '/api/counts', '/api/health', '/api/csp-report', '/api/vote/tally'].includes(pathname) ||
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/api/masks/') ||
    pathname.startsWith('/api/account/')
  );
}

/** The calls the `ticket` limit counts. */
export function isTicketCall(pathname: string): boolean {
  return ['/api/tickets/claim', '/api/tickets/take', '/api/tickets/share', '/api/tickets/scan', '/api/tickets/pass', '/api/tickets/checkout'].includes(pathname) || pathname.startsWith('/api/account/');
}

/** One call over a limit: wait this many seconds; `first` when it is the first over in its window (the one the log tells). */
export interface Over {
  wait: number;
  first: boolean;
}

/** Counts per key in fixed windows; at most `maxKeys` keys, the stale ones swept (all of them, when none is stale) when full. */
export class Counter {
  private readonly windows = new Map<string, { start: number; n: number }>();

  constructor(
    readonly rule: Limit,
    private readonly maxKeys = 20_000,
  ) {}

  /** Counts a call; null while it is within the limit. */
  take(key: string, now: number): Over | null {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.rule.windowMs) {
      if (!w && this.windows.size >= this.maxKeys) this.sweep(now);
      w = { start: now, n: 0 };
      this.windows.set(key, w);
    }
    w.n += 1;
    if (w.n <= this.rule.limit) return null;
    return { wait: Math.max(1, Math.ceil((w.start + this.rule.windowMs - now) / 1000)), first: w.n === this.rule.limit + 1 };
  }

  get size(): number {
    return this.windows.size;
  }

  private sweep(now: number): void {
    for (const [key, w] of this.windows) if (now - w.start >= this.rule.windowMs) this.windows.delete(key);
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}

const counters = (): Record<LimitName, Counter> => ({
  address: new Counter(API_LIMITS.address),
  public: new Counter(API_LIMITS.public),
  refused: new Counter(API_LIMITS.refused),
  visitor: new Counter(API_LIMITS.visitor),
  ticket: new Counter(API_LIMITS.ticket),
});
let counts = counters();

/** A call: its address, its owl when it carries a pass the Worker took, and its path. */
export interface Caller {
  ip: string;
  visitor: string | null;
  path: string;
}

/** The first limit a call goes over, and for how long; null while it is within every one. */
export function overLimit(caller: Caller, now: number): (Over & { limit: LimitName }) | null {
  const checks: Array<[LimitName, string]> = [['address', caller.ip], caller.visitor ? ['visitor', caller.visitor] : [isPublicCall(caller.path) ? 'public' : 'refused', caller.ip]];
  if (isTicketCall(caller.path)) checks.push(['ticket', caller.visitor ?? `ip:${caller.ip}`]);
  for (const [limit, key] of checks) {
    const over = counts[limit].take(key, now);
    if (over) return { limit, ...over };
  }
  return null;
}

/** Whether the limits are on (RATE_LIMITS "off" only for a load test's throwaway copy). */
export const limitsOn = (env: { RATE_LIMITS?: string }): boolean => env.RATE_LIMITS !== 'off';

/** For tests: every count forgotten. */
export function forgetLimits(): void {
  counts = counters();
}
