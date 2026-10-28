/**
 * An owl's flight as a page draws it (OP-084). The owl is told air states (flight.ts in the shared
 * package), each holding from a time on this page's clock, and carries each on with the flight's own
 * step, so every page draws the same arc from the same states. A state whose time is still to come
 * waits its turn: the room server's are drawn a moment behind, as walks are. The state under way is
 * carried on in whole steps as frames go by, so a frame adds a step or two, never the whole flight.
 */
import { AIRBORNE, FLIGHT_STEP_MS, GLIDING, GROUNDED, JUMP_CUT_SPEED, ON_GROUND, fall, type Air } from '@owl-park/shared';

/** How long the wings beat for a jump or a flap, and how many beats that is. */
export const FLAP_MS = 420;
export const FLAP_BEATS = 2;
/**
 * The wing's turn about its root at the shoulder (radians; the painted wing is spread and a little
 * raised at 0, and + lowers the tip): up and down in a beat, spread in a glide, raised a little in a fall.
 */
export const WING_TURN = { up: -0.55, down: 0.8, glide: 0.2, fall: -0.1 } as const;
/** From this height up (room px) the shadow is as small and faint as it gets. */
export const SHADOW_FULL_Z = 220;

export class AirTrack {
  /** The states told, oldest first: the first is the one under way, once its time has come. */
  private told: Array<{ air: Air; at: number }> = [];
  /** The state under way, carried on in whole steps, and to when. */
  private carried: { air: Air; at: number } | null = null;
  /** When the wings last beat for a jump or a flap (this page's ms). */
  flapAt = Number.NEGATIVE_INFINITY;
  /**
   * Its take-offs as this page carries them on, step by step, as RoomScene's `flown` is for the own
   * owl: how many, the last one's top (room px), whether it glided and how long it was up (ms, once
   * down). Exact however few frames the page draws, where the drawn height can miss a top between two.
   */
  readonly flown = { n: 0, peak: 0, glided: false, ms: 0 };
  /** When the flight under way took off (this page's ms); null on the ground. */
  private flownFrom: number | null = null;

  /** A new state from `at` on. One told for a time not before it never happened: this one overtook it. */
  tell(air: Air, at: number): void {
    const head = this.told[0];
    this.told = this.told.filter((t) => t.at < at);
    this.told.push({ air, at });
    if (this.told[0] !== head) this.carried = null;
  }

  /** The owl's air at `now`: on the ground until a state's time comes, and once it has come down. */
  at(now: number): Air {
    while (this.told.length > 1 && this.told[1]!.at <= now) {
      this.told.shift();
      this.carried = null;
    }
    const head = this.told[0];
    if (!head || head.at > now) return ON_GROUND;
    if (!this.carried) {
      this.carried = head;
      this.record(head);
      // Rising faster than a cut leaves it: a jump or a flap, and the wings beat.
      if (head.air.s === AIRBORNE && head.air.vz > JUMP_CUT_SPEED + 1) this.flapAt = head.at;
    }
    let c = this.carried;
    while (c.air.s !== GROUNDED && now - c.at >= FLIGHT_STEP_MS) {
      c = { air: fall(c.air, FLIGHT_STEP_MS), at: c.at + FLIGHT_STEP_MS };
      this.record(c);
    }
    this.carried = c;
    if (c.air.s === GROUNDED) {
      // Down, with nothing more told: done with this flight.
      if (this.told.length === 1) {
        this.told = [];
        this.carried = null;
      }
      return c.air;
    }
    return now > c.at ? fall(c.air, now - c.at) : c.air;
  }

  /** A state carried to (a step, or one just told) into `flown`. */
  private record(c: { air: Air; at: number }): void {
    if (c.air.s === GROUNDED) {
      if (this.flownFrom !== null) this.flown.ms = c.at - this.flownFrom;
      this.flownFrom = null;
      return;
    }
    if (this.flownFrom === null) {
      this.flownFrom = c.at;
      Object.assign(this.flown, { n: this.flown.n + 1, peak: 0, glided: false, ms: 0 });
    }
    this.flown.peak = Math.max(this.flown.peak, c.air.z);
    if (c.air.s === GLIDING) this.flown.glided = true;
  }
}

/**
 * How the wings are turned (WING_TURN) and whether they are beating: a jump or a flap beats them,
 * from up through down and back FLAP_BEATS times over FLAP_MS, the power in the down stroke; then
 * they hold spread in a glide or raised a little in a fall. Null on the ground: folded away.
 */
export function wingTurn(air: Air, sinceFlapMs: number): { turn: number; beating: boolean } | null {
  if (air.s === GROUNDED) return null;
  if (sinceFlapMs >= 0 && sinceFlapMs < FLAP_MS) {
    const swing = 0.5 - 0.5 * Math.cos((2 * Math.PI * FLAP_BEATS * sinceFlapMs) / FLAP_MS);
    return { turn: WING_TURN.up + (WING_TURN.down - WING_TURN.up) * swing, beating: true };
  }
  return { turn: air.s === GLIDING ? WING_TURN.glide : WING_TURN.fall, beating: false };
}

/** How much of its size and darkness the shadow on the floor gives up at a height: 0 on the floor, 1 from SHADOW_FULL_Z up. */
export function shadowFade(z: number): number {
  return Math.min(1, Math.max(0, z) / SHADOW_FULL_Z);
}
