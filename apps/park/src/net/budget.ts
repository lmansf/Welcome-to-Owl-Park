import { EMOTE_EVERY_MS, MOVE_BURST, MOVE_REFILL_PER_S } from '@owl-park/shared';

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

/**
 * How far apart the page sends emotes (OP-210): a little more than the room's EMOTE_EVERY_MS, so a
 * frame that arrives early on a jittery network is still one the room plays.
 */
export const EMOTE_SEND_EVERY_MS = EMOTE_EVERY_MS + 100;

/**
 * One emote at a time, EMOTE_SEND_EVERY_MS apart (OP-210). One that comes sooner is dropped, not
 * queued: the room drops such an emote quietly too, so nobody else would ever see it, and a queued one
 * would play after the keys were let go. Dropping it here keeps a mash of the number keys from
 * filling the room's flood limit (40 frames in 5 s closes the socket with 4003). Time comes in as an
 * argument, so it is pure.
 */
export class EmoteGate {
  private sentAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly everyMs = EMOTE_SEND_EVERY_MS) {}

  /** True (and the spacing starts again) when an emote may go now; false when it is too soon. */
  take(now: number): boolean {
    if (now - this.sentAt < this.everyMs) return false;
    this.sentAt = now;
    return true;
  }
}
