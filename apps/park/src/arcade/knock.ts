/**
 * Nest Knockdown (C40): pull the owl back in the slingshot and let go at stacks of neon crates
 * standing on stands. A crate the owl strikes is knocked off, and so is everything that stood on it
 * alone; the owl flies on, slower, through what else it meets. Ten stacks, three shots each: a stack
 * knocked down in one shot scores 3, in two 2, in three 1, and a stack left standing ends the run.
 * The game steps in fixed slices with no randomness, so the same shot always does the same thing.
 * Input: pull back and let go (a pointer), or aim and power with the keys and launch.
 */
import { KNOCK_LEVELS, KNOCK_SHOTS, KNOCK_SHOT_MS, knockPoints } from '@owl-park/shared';
import { FIELD_H, FIELD_W, STEP_MS, StepClock, count } from './field';

export const CRATE = 36;
export const GROUND_Y = 560;
/** Where the owl sits in the slingshot, and how big it is to the crates. */
export const SLING = { x: 96, y: 450 } as const;
export const OWL_R = 14;
const GRAVITY = 900;
/** Launch speed per field pixel of pull, and the longest pull. */
const POWER = 7;
export const MAX_PULL = 120;
/** Each crate struck keeps this much of the owl's speed; below the slowest, the owl drops away. */
const KEEP = 0.62;
const SLOWEST = 140;
/** A shot ends this long after the launch at the latest. */
const SHOT_LIMIT_MS = 4500;
/** The pause after a stack falls before the next slides in. */
const NEXT_STACK_MS = 900;

/** A stand: its top's left and right ends and its height. */
export interface Stand {
  x1: number;
  x2: number;
  y: number;
}

/** A crate: its top-left corner while it stands; once knocked it flies off. */
export interface Crate {
  x: number;
  y: number;
  knocked: boolean;
  /** Flying off: its speed and spin, until it leaves the field. */
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  gone: boolean;
}

interface StackPlan {
  stands: Stand[];
  /** Crates by column and row on a stand: [stand, column from its left end, row from its top up]. */
  crates: Array<[stand: number, col: number, row: number]>;
}

const stand = (x1: number, width: number, y: number): Stand => ({ x1, x2: x1 + width * CRATE, y });

/** The ten stacks, each a little harder than the one before. Half columns sit between two below. */
export const STACKS: readonly StackPlan[] = [
  { stands: [stand(330, 2, 470)], crates: [[0, 0.5, 0], [0, 0.5, 1]] },
  { stands: [stand(320, 2, 470)], crates: [[0, 0.5, 0], [0, 0.5, 1], [0, 0.5, 2]] },
  { stands: [stand(300, 3, 470)], crates: [[0, 0, 0], [0, 0, 1], [0, 2, 0], [0, 2, 1]] },
  { stands: [stand(270, 2, 490), stand(380, 2, 420)], crates: [[0, 0.5, 0], [0, 0.5, 1], [1, 0.5, 0], [1, 0.5, 1]] },
  { stands: [stand(300, 4, 480)], crates: [[0, 0.5, 0], [0, 1.5, 0], [0, 2.5, 0], [0, 1, 1], [0, 2, 1], [0, 1.5, 2]] },
  { stands: [stand(350, 2, 400)], crates: [[0, 0.5, 0], [0, 0.5, 1], [0, 0.5, 2], [0, 0.5, 3]] },
  { stands: [stand(280, 2, 470), stand(390, 2, 470)], crates: [[0, 0.5, 0], [0, 0.5, 1], [0, 0.5, 2], [1, 0.5, 0], [1, 0.5, 1], [1, 0.5, 2]] },
  { stands: [stand(290, 2, 500), stand(380, 2, 340)], crates: [[0, 0.5, 0], [0, 0.5, 1], [0, 0.5, 2], [1, 0.5, 0], [1, 0.5, 1]] },
  { stands: [stand(290, 5, 480)], crates: [[0, 0.5, 0], [0, 1.5, 0], [0, 2.5, 0], [0, 3.5, 0], [0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 1.5, 2], [0, 2.5, 2]] },
  { stands: [stand(260, 2, 500), stand(340, 2, 410), stand(410, 2, 320)], crates: [[0, 0.5, 0], [0, 0.5, 1], [1, 0.5, 0], [1, 0.5, 1], [2, 0.5, 0], [2, 0.5, 1]] },
];

/** A stack's crates standing in their places. */
export function standingCrates(plan: StackPlan): Crate[] {
  return plan.crates.map(([s, col, row]) => {
    const st = plan.stands[s]!;
    return { x: st.x1 + col * CRATE, y: st.y - (row + 1) * CRATE, knocked: false, vx: 0, vy: 0, spin: 0, angle: 0, gone: false };
  });
}

export type KnockPhase = 'aim' | 'flying' | 'settling' | 'cleared' | 'over';

export class KnockGame {
  readonly game = 'sling' as const;
  /** The stack being played (0 to 9). */
  level = 0;
  stands: Stand[] = [];
  crates: Crate[] = [];
  /** Shots at this stack, and in the whole run. */
  shotsHere = 0;
  shots = 0;
  score = 0;
  phase: KnockPhase = 'aim';
  over = false;
  /** The owl: in the slingshot while aiming, then flying. */
  owl = { x: SLING.x, y: SLING.y, vx: 0, vy: 0, flying: false };
  /** Aiming: the pull's angle (degrees above level, toward the stacks) and its share of the longest pull. */
  angle = 25;
  power = 0.7;
  /** The last stack's line, while it shows ("Cleared in 2 shots!"). */
  banner = '';
  /** Field time since the run began, ms. */
  time = 0;
  private shotAt = 0;
  private clearedAt = 0;
  private readonly clock = new StepClock();

  constructor() {
    this.load(0);
  }

  /** A game that starts at a later stack (0 to 9): for practice and the tests. */
  static at(level: number): KnockGame {
    const g = new KnockGame();
    g.load(Math.max(0, Math.min(KNOCK_LEVELS - 1, level)));
    return g;
  }

  /** A copy to look ahead with, played on without touching this one. */
  clone(): KnockGame {
    const copy = Object.create(KnockGame.prototype) as KnockGame;
    Object.assign(copy, structuredClone({ ...this, clock: undefined }));
    Object.assign(copy, { clock: new StepClock() });
    return copy;
  }

  private load(level: number): void {
    this.level = level;
    const plan = STACKS[level]!;
    this.stands = plan.stands.map((s) => ({ ...s }));
    this.crates = standingCrates(plan);
    this.shotsHere = 0;
    this.phase = 'aim';
    this.resetOwl();
  }

  private resetOwl(): void {
    this.owl = { x: SLING.x, y: SLING.y, vx: 0, vy: 0, flying: false };
  }

  /** The launch for an angle and a power, as field pixels per second. */
  static launch(angle: number, power: number): { vx: number; vy: number } {
    const speed = Math.max(0, Math.min(1, power)) * MAX_PULL * POWER;
    const a = (angle * Math.PI) / 180;
    return { vx: Math.cos(a) * speed, vy: -Math.sin(a) * speed };
  }

  /** Aim by the pull itself: back and down from the slingshot sends the owl up and on. */
  aimByPull(dx: number, dy: number): void {
    if (this.phase !== 'aim') return;
    const len = Math.min(MAX_PULL, Math.hypot(dx, dy));
    if (len < 4) return;
    this.angle = Math.max(-30, Math.min(80, (Math.atan2(dy, -dx) * 180) / Math.PI));
    this.power = len / MAX_PULL;
  }

  /** Aim with the keys: a little higher or lower, a little more or less power. */
  nudge(dAngle: number, dPower: number): void {
    if (this.phase !== 'aim') return;
    this.angle = Math.max(-30, Math.min(80, this.angle + dAngle));
    this.power = Math.max(0.2, Math.min(1, this.power + dPower));
  }

  /** Let go: the owl flies, and a shot is counted. */
  release(): void {
    if (this.phase !== 'aim' || this.power < 0.15) return;
    const v = KnockGame.launch(this.angle, this.power);
    this.owl = { x: SLING.x, y: SLING.y, vx: v.vx, vy: v.vy, flying: true };
    this.shots += 1;
    this.shotsHere += 1;
    this.shotAt = this.time;
    this.phase = 'flying';
    this.banner = '';
  }

  /** Where a shot at this aim goes over its first half second, for the dotted line. */
  path(steps = 9): Array<{ x: number; y: number }> {
    const v = KnockGame.launch(this.angle, this.power);
    const out = [];
    for (let i = 1; i <= steps; i++) {
      const t = i * 0.06;
      out.push({ x: SLING.x + v.vx * t, y: SLING.y + v.vy * t + 0.5 * GRAVITY * t * t });
    }
    return out;
  }

  get standing(): Crate[] {
    return this.crates.filter((c) => !c.knocked);
  }

  advance(ms: number): void {
    if (this.over) return;
    this.clock.advance(ms, () => this.step());
  }

  private step(): boolean {
    this.time += STEP_MS;
    const dt = STEP_MS / 1000;
    if (this.owl.flying) this.flyOwl(dt);
    for (const c of this.crates) {
      if (!c.knocked || c.gone) continue;
      c.vy += GRAVITY * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.angle += c.spin * dt;
      if (c.y > FIELD_H + CRATE || c.x > FIELD_W + CRATE || c.x < -2 * CRATE || c.y + CRATE >= GROUND_Y + CRATE) c.gone = true;
    }
    const flying = this.crates.some((c) => c.knocked && !c.gone);
    if (this.phase === 'flying' && !this.owl.flying && !flying) this.phase = 'settling';
    if (this.phase === 'settling' && this.time - this.shotAt >= KNOCK_SHOT_MS) this.endShot();
    if (this.phase === 'cleared' && this.time - this.clearedAt >= NEXT_STACK_MS) {
      if (this.level + 1 >= KNOCK_LEVELS) this.finish();
      else this.load(this.level + 1);
    }
    return !this.over;
  }

  private flyOwl(dt: number): void {
    const o = this.owl;
    o.vy += GRAVITY * dt;
    o.x += o.vx * dt;
    o.y += o.vy * dt;
    for (const c of this.crates) {
      if (c.knocked || !touches(o.x, o.y, c)) continue;
      this.knock(c, o.vx, o.vy);
      o.vx *= KEEP;
      o.vy *= KEEP;
    }
    // A stand stops the owl dead; so do the ground, the field's edges and the end of the time allowed.
    const onStand = this.stands.some((s) => touchesRect(o.x, o.y, s.x1, s.y, s.x2, GROUND_Y));
    const tooSlow = Math.hypot(o.vx, o.vy) < SLOWEST && o.vy > 0 && this.time - this.shotAt > 200;
    if (onStand || tooSlow || o.y + OWL_R >= GROUND_Y || o.x > FIELD_W + OWL_R || o.x < -OWL_R || this.time - this.shotAt > SHOT_LIMIT_MS) o.flying = false;
  }

  /** A crate knocked off, and every crate that stood on it alone after it. */
  private knock(c: Crate, vx: number, vy: number): void {
    c.knocked = true;
    c.vx = vx * 0.8;
    c.vy = Math.min(vy * 0.8, -60);
    c.spin = (vx >= 0 ? 1 : -1) * 280;
    for (const above of this.crates) {
      if (above.knocked || above.y >= c.y || !this.unsupported(above)) continue;
      this.knock(above, vx * 0.7, vy * 0.7 - 40);
    }
  }

  /** Nothing standing under a crate's middle: no crate just below it, and no stand. */
  private unsupported(c: Crate): boolean {
    const mid = c.x + CRATE / 2;
    const bottom = c.y + CRATE;
    const onStand = this.stands.some((s) => Math.abs(s.y - bottom) < 1 && mid >= s.x1 && mid <= s.x2);
    const onCrate = this.crates.some((d) => !d.knocked && d !== c && Math.abs(d.y - bottom) < 1 && mid >= d.x && mid <= d.x + CRATE);
    return !onStand && !onCrate;
  }

  private endShot(): void {
    if (!this.standing.length) {
      this.score += knockPoints(this.shotsHere);
      this.banner = `Cleared in ${count(this.shotsHere, 'shot', 'shots')}!`;
      this.phase = 'cleared';
      this.clearedAt = this.time;
      return;
    }
    if (this.shotsHere >= KNOCK_SHOTS) return this.finish();
    this.phase = 'aim';
    this.resetOwl();
  }

  private finish(): void {
    this.over = true;
    this.phase = 'over';
  }

  /** The run-over line. */
  overLine(): string {
    const points = count(this.score, 'point', 'points');
    return this.standing.length ? `Out of shots at stack ${this.level + 1}. ${points}.` : `All ten stacks down! ${points}.`;
  }
}

/** The owl's circle against a rectangle from (x1, y1) to (x2, y2). */
function touchesRect(x: number, y: number, x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = Math.max(x1 - x, 0, x - x2);
  const dy = Math.max(y1 - y, 0, y - y2);
  return dx * dx + dy * dy < OWL_R * OWL_R;
}

/** The owl's circle against a standing crate. */
function touches(x: number, y: number, c: Crate): boolean {
  return touchesRect(x, y, c.x, c.y, c.x + CRATE, c.y + CRATE);
}
