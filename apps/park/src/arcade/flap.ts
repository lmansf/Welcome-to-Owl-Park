/**
 * Moon Flap (C40): a night flight through the gaps between neon branches. Each tap is a flap; the
 * owl falls between flaps. The branches come at a steady pace (FLAP_SPEED, FLAP_SPACING), so the
 * room server can tell how long a score takes. The score is the gaps passed; touching a branch or
 * the ground ends the run. One input: flap (the first one starts the flight).
 */
import { FLAP_FIRST, FLAP_SPACING, FLAP_SPEED } from '@owl-park/shared';
import { FIELD_H, STEP_MS, StepClock, runRandom } from './field';

/** Where the owl flies, how big it is to the branches, and the ground below. */
export const FLAP_X = 140;
export const FLAP_R = 15;
export const GROUND_Y = FIELD_H - 40;
export const BRANCH_W = 60;
const GRAVITY = 1400;
const KICK = -430;
/** The gap between a branch's two halves, narrowing a little as the score climbs. */
const GAP_START = 180;
const GAP_END = 150;
const GAP_NARROWS_OVER = 30;

export interface Branch {
  /** Middle, field pixels. */
  x: number;
  /** The gap: its middle and its height. */
  gapY: number;
  gap: number;
  /** Counted once its middle has passed the owl. */
  passed: boolean;
}

export class FlapGame {
  readonly game = 'flight' as const;
  /** Waiting for the first flap, then flying. */
  flying = false;
  y = FIELD_H / 2;
  vy = 0;
  /** Flaps so far: the owl's wings beat at each (OP-135). */
  flaps = 0;
  score = 0;
  over = false;
  /** How the run ended: on a branch or on the ground. */
  end: 'branch' | 'ground' | null = null;
  branches: Branch[] = [];
  /** Field time since the first flap, ms. */
  time = 0;
  private next = 0;
  private lastGapY = FIELD_H / 2;
  private readonly rnd: () => number;
  private readonly clock = new StepClock();

  constructor(seed: number) {
    this.rnd = runRandom(seed);
    for (let i = 0; i < 4; i++) this.addBranch();
  }

  private addBranch(): void {
    const i = this.next++;
    const gap = GAP_START - (GAP_START - GAP_END) * Math.min(1, i / GAP_NARROWS_OVER);
    // Gaps wander, but never so far from the last that a flap or a fall cannot reach.
    const lo = Math.max(150, this.lastGapY - 150);
    const hi = Math.min(GROUND_Y - 110, this.lastGapY + 150);
    const gapY = lo + this.rnd() * (hi - lo);
    this.lastGapY = gapY;
    this.branches.push({ x: FLAP_X + FLAP_FIRST + i * FLAP_SPACING, gapY, gap, passed: false });
  }

  /** A copy to look ahead with: the same flight, played on without touching this one. */
  clone(): FlapGame {
    const copy = Object.create(FlapGame.prototype) as FlapGame;
    const { rnd: _rnd, clock: _clock, ...state } = this;
    Object.assign(copy, structuredClone(state), { rnd: runRandom(0), clock: new StepClock() });
    return copy;
  }

  tap(): void {
    if (this.over) return;
    this.flying = true;
    this.vy = KICK;
    this.flaps += 1;
  }

  advance(ms: number): void {
    if (this.over || !this.flying) return;
    this.clock.advance(ms, () => this.step());
  }

  private step(): boolean {
    this.time += STEP_MS;
    const dt = STEP_MS / 1000;
    this.vy += GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y - FLAP_R < 0) {
      this.y = FLAP_R;
      this.vy = 0;
    }
    // The branches' places follow from the time flown, so every device agrees on them.
    const flown = (this.time / 1000) * FLAP_SPEED;
    this.branches.forEach((b, k) => {
      const i = this.next - this.branches.length + k;
      b.x = FLAP_X + FLAP_FIRST + i * FLAP_SPACING - flown;
      if (!b.passed && b.x <= FLAP_X) {
        b.passed = true;
        this.score += 1;
      }
    });
    while (this.branches.length && this.branches[0]!.x < -BRANCH_W) this.branches.shift();
    while (this.branches.length < 4) this.addBranch();
    if (this.y + FLAP_R >= GROUND_Y) {
      this.y = GROUND_Y - FLAP_R;
      this.over = true;
      this.end = 'ground';
    } else if (this.branches.some((b) => this.hits(b))) {
      this.over = true;
      this.end = 'branch';
    }
    return !this.over;
  }

  /** The owl's circle against a branch's two halves. */
  private hits(b: Branch): boolean {
    const dx = Math.max(Math.abs(FLAP_X - b.x) - BRANCH_W / 2, 0);
    if (dx >= FLAP_R) return false;
    const top = b.gapY - b.gap / 2;
    const bottom = b.gapY + b.gap / 2;
    const reach = Math.sqrt(FLAP_R * FLAP_R - dx * dx);
    return this.y - reach < top || this.y + reach > bottom;
  }

  /** The nearest branch the owl is not yet clear of. */
  ahead(): Branch | undefined {
    return this.branches.find((b) => b.x + BRANCH_W / 2 + FLAP_R > FLAP_X);
  }

  /** The run-over line. */
  overLine(): string {
    return this.end === 'ground' ? `Touched down at ${this.score}.` : `Clipped a branch at ${this.score}.`;
  }
}
