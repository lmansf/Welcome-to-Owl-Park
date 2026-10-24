/**
 * What the arcade's three games share (C40): the playing field, drawn as neon line-art over the
 * room, a clock that steps the same way on every device, and the seeded randomness that lays out
 * each run's course from the seed the room server gave it.
 */
import { rotationRandom } from '@owl-park/shared';

/** The field every game is played on, in field pixels; the screen fits it to the device. */
export const FIELD_W = 480;
export const FIELD_H = 640;

/** The games step in fixed slices of time, so a run plays the same on a slow phone and a fast computer. */
export const STEP_MS = 1000 / 120;
/** At most this much time is caught up at once (a tab that slept does not fast-forward the game). */
const MAX_CATCH_UP_MS = 250;

/** A run's own random numbers, from its seed. */
export function runRandom(seed: number): () => number {
  return rotationRandom(`arcade:${seed}`);
}

/** Steps a game's fixed-slice clock through `ms` of real time, calling `step` for each slice. */
export class StepClock {
  private carry = 0;

  advance(ms: number, step: () => boolean): void {
    this.carry = Math.min(this.carry + Math.max(0, ms), MAX_CATCH_UP_MS);
    while (this.carry >= STEP_MS) {
      this.carry -= STEP_MS;
      if (!step()) {
        this.carry = 0;
        return;
      }
    }
  }
}

/** "1 crossing", "7 crossings". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
