/**
 * An owl's flight as a page draws it (OP-084). The owl is told air states (flight.ts in the shared
 * package), each holding from a time on this page's clock, and carries each on with the flight's own
 * step, so every page draws the same arc from the same states. A state whose time is still to come
 * waits its turn: the room server's are drawn a moment behind, as walks are. The state under way is
 * carried on in whole steps as frames go by, so a frame adds a step or two, never the whole flight.
 */
import { AIRBORNE, FLIGHT_STEP_MS, GLIDING, GROUNDED, JUMP_CUT_SPEED, ON_GROUND, fall, type Air } from '@owl-park/shared';

/** How long the wings beat for a jump or a flap. */
export const FLAP_MS = 360;
/** From this height up (room px) the shadow is as small and faint as it gets. */
export const SHADOW_FULL_Z = 220;

export class AirTrack {
  /** The states told, oldest first: the first is the one under way, once its time has come. */
  private told: Array<{ air: Air; at: number }> = [];
  /** The state under way, carried on in whole steps, and to when. */
  private carried: { air: Air; at: number } | null = null;
  /** When the wings last beat for a jump or a flap (this page's ms). */
  flapAt = Number.NEGATIVE_INFINITY;

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
      // Rising faster than a cut leaves it: a jump or a flap, and the wings beat.
      if (head.air.s === AIRBORNE && head.air.vz > JUMP_CUT_SPEED + 1) this.flapAt = head.at;
    }
    let c = this.carried;
    while (c.air.s !== GROUNDED && now - c.at >= FLIGHT_STEP_MS) c = { air: fall(c.air, FLIGHT_STEP_MS), at: c.at + FLIGHT_STEP_MS };
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
}

/**
 * The wings in flight: a jump or a flap beats them (spread and tucked in turn, four times over
 * FLAP_MS), a glide holds them spread, a fall keeps them tucked; on the ground, none.
 */
export function wingsFor(air: Air, sinceFlapMs: number): 'spread' | 'tucked' | null {
  if (air.s === GROUNDED) return null;
  if (sinceFlapMs >= 0 && sinceFlapMs < FLAP_MS) return Math.floor((sinceFlapMs / FLAP_MS) * 4) % 2 === 0 ? 'spread' : 'tucked';
  return air.s === GLIDING ? 'spread' : 'tucked';
}

/** How much of its size and darkness the shadow on the floor gives up at a height: 0 on the floor, 1 from SHADOW_FULL_Z up. */
export function shadowFade(z: number): number {
  return Math.min(1, Math.max(0, z) / SHADOW_FULL_Z);
}
