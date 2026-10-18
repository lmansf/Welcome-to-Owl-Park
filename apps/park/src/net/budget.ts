import { MOVE_BURST, MOVE_REFILL_PER_S } from '@owl-park/shared';

/**
 * A token bucket for moves, stricter than the room server's (MOVE_BURST, MOVE_REFILL_PER_S) so
 * network jitter never makes the server see a burst it would refuse and count against the
 * visitor. Time comes in as an argument, so it is pure.
 */
export class MoveBudget {
  private tokens: number;
  private at: number;

  constructor(
    now: number,
    private readonly burst = MOVE_BURST - 2,
    private readonly perSecond = MOVE_REFILL_PER_S * 0.75,
  ) {
    this.tokens = burst;
    this.at = now;
  }

  private refill(now: number): void {
    this.tokens = Math.min(this.burst, this.tokens + (Math.max(0, now - this.at) / 1000) * this.perSecond);
    this.at = now;
  }

  /** Spend a token if there is one. */
  take(now: number): boolean {
    this.refill(now);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  /** Milliseconds until a token is there (0 when one is). */
  wait(now: number): number {
    this.refill(now);
    return this.tokens >= 1 ? 0 : Math.ceil(((1 - this.tokens) / this.perSecond) * 1000);
  }
}
