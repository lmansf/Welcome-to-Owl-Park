/**
 * Hoot & Hop (C40): the owl hops across lanes of drones and noodle carts, from one kerb to the other
 * and back. Each crossing banks a tier (the traffic quickens), and a bump ends the run. The score is
 * the crossings. One input: hop forward.
 */
import { HOP_LANES, HOP_MS } from '@owl-park/shared';
import { FIELD_W, STEP_MS, StepClock, count, runRandom } from './field';

/** Rows from the near kerb (0) through the lanes to the far kerb (HOP_LANES + 1), bottom to top. */
export const HOP_ROWS = HOP_LANES + 2;
const ROW_H = 80;
/** The row's middle, in field pixels. */
export const rowY = (row: number) => 580 - row * ROW_H;
/** Where the owl crosses, and how wide it is to the traffic. */
export const HOP_X = FIELD_W / 2;
const OWL_HALF = 16;
/** Vehicles wrap round this far beyond the field's edges. */
const WRAP = 120;
const LOOP = FIELD_W + 2 * WRAP;
/** The traffic quickens by this much for each crossing, up to twice its speed. */
const TIER_QUICKEN = 0.1;
const TIER_MAX = 2;

export type VehicleKind = 'drone' | 'cart';

export interface Vehicle {
  kind: VehicleKind;
  /** Middle, field pixels. */
  x: number;
  w: number;
}

export interface Lane {
  /** 1 moves right, -1 left. */
  dir: 1 | -1;
  /** Field pixels per second at the first tier. */
  speed: number;
  vehicles: Vehicle[];
}

export class HopGame {
  readonly game = 'crossing' as const;
  readonly lanes: Lane[] = [];
  /** The row the owl stands in, or is hopping from. */
  row = 0;
  /** Which way the owl crosses now: up the field (1) or back down (-1). */
  heading: 1 | -1 = 1;
  /** A hop under way: where to, and how far along (0 to 1). */
  hop: { to: number; t: number } | null = null;
  score = 0;
  over = false;
  /** Field time since the run began, ms. */
  time = 0;
  private readonly clock = new StepClock();

  constructor(seed: number) {
    const rnd = runRandom(seed);
    let dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
    for (let i = 0; i < HOP_LANES; i++) {
      const kind: VehicleKind = rnd() < 0.5 ? 'drone' : 'cart';
      const w = kind === 'drone' ? 44 : 96;
      const speed = kind === 'drone' ? 110 + rnd() * 60 : 60 + rnd() * 50;
      const vehicles: Vehicle[] = [];
      // Vehicles round the loop with a gap after each wide enough for the owl to stand in.
      let x = rnd() * 120;
      while (x + w < LOOP - 140) {
        vehicles.push({ kind, x: x + w / 2 - WRAP, w });
        x += w + 140 + rnd() * 150;
      }
      this.lanes.push({ dir, speed, vehicles });
      dir = dir === 1 ? -1 : 1;
    }
  }

  /** A copy to look ahead with: the same traffic and owl, played on without touching this one. */
  clone(): HopGame {
    const copy = Object.create(HopGame.prototype) as HopGame;
    Object.assign(copy, structuredClone({ ...this, clock: undefined }));
    Object.assign(copy, { clock: new StepClock() });
    return copy;
  }

  /** How much quicker the traffic is now. */
  get tier(): number {
    return Math.min(TIER_MAX, 1 + this.score * TIER_QUICKEN);
  }

  /** The row the owl counts as standing in: its landing row from halfway through a hop. */
  get standing(): number {
    return this.hop && this.hop.t >= 0.5 ? this.hop.to : this.row;
  }

  /** Hop one row on, unless a hop is under way. */
  tap(): void {
    if (this.over || this.hop) return;
    const to = this.row + this.heading;
    if (to < 0 || to >= HOP_ROWS) return;
    this.hop = { to, t: 0 };
  }

  advance(ms: number): void {
    if (this.over) return;
    this.clock.advance(ms, () => this.step());
  }

  private step(): boolean {
    this.time += STEP_MS;
    const dt = STEP_MS / 1000;
    for (const lane of this.lanes) {
      for (const v of lane.vehicles) {
        v.x += lane.dir * lane.speed * this.tier * dt;
        if (lane.dir > 0 && v.x - v.w / 2 > FIELD_W + WRAP) v.x -= LOOP;
        if (lane.dir < 0 && v.x + v.w / 2 < -WRAP) v.x += LOOP;
      }
    }
    if (this.hop) {
      this.hop.t += STEP_MS / HOP_MS;
      if (this.hop.t >= 1) {
        this.row = this.hop.to;
        this.hop = null;
        // A kerb on the far side: a crossing banked, and the owl turns to cross back.
        if ((this.heading === 1 && this.row === HOP_ROWS - 1) || (this.heading === -1 && this.row === 0)) {
          this.score += 1;
          this.heading = this.heading === 1 ? -1 : 1;
        }
      }
    }
    if (this.bumped()) this.over = true;
    return !this.over;
  }

  /** A vehicle in the owl's lane is where the owl is. */
  bumped(): boolean {
    const row = this.standing;
    if (row < 1 || row > HOP_LANES) return false;
    return this.lanes[row - 1]!.vehicles.some((v) => Math.abs(v.x - HOP_X) < v.w / 2 + OWL_HALF);
  }

  /** The run-over line. */
  overLine(): string {
    return `Bumped! ${count(this.score, 'crossing', 'crossings')}.`;
  }

  /** Whether a lane is clear where the owl crosses for the next `ms` (tests drive the game with it). */
  clearFor(lane: number, ms: number): boolean {
    const l = this.lanes[lane - 1];
    if (!l) return true;
    const reach = l.speed * this.tier * (ms / 1000);
    return !l.vehicles.some((v) => {
      // Where the vehicle will be over the coming `ms`: from now to `reach` along its way.
      const from = v.x;
      const to = v.x + l.dir * reach;
      const lo = Math.min(from, to) - v.w / 2 - OWL_HALF - 4;
      const hi = Math.max(from, to) + v.w / 2 + OWL_HALF + 4;
      return HOP_X > lo && HOP_X < hi;
    });
  }
}
