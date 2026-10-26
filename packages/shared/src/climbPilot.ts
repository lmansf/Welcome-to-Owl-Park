/**
 * The scripted climber (designs/the-stained-glass-climb.md, Appendix A): the policy that plays one
 * move of a route through stepClimb, the way the floor test and the browser tests climb. Toward a
 * side it runs to the ledge's end and jumps; for `U` it stands under the target and jumps straight
 * up, leaning back under the target in the air when a gust carries it; it presses again at the apex
 * for a double jump and keeps holding from the second press to glide. Before a move it can dry-run
 * the move from the owl's state to find the first launch that lands: that is how it waits for a
 * lantern to swing past or a gust to drop, as a player watching them would.
 */
import {
  CLIMB_FIELD_W,
  CLIMB_STEP_MS,
  NO_INPUT,
  OWL_W,
  RUN_SPEED,
  platforms,
  stepClimb,
  type ClimbInput,
  type ClimbState,
  type Layout,
  type Ledge,
  type Night,
  type RouteMove,
} from './climb';

/** How long one move may take before the pilot gives it up (steps). */
export const MOVE_STEP_LIMIT = Math.round(8000 / CLIMB_STEP_MS);
/** The longest the pilot waits for a launch (steps): the slowest lantern's full swing. */
export const WAIT_STEP_LIMIT = Math.round(2600 / CLIMB_STEP_MS);
/** The dry run tries a launch every this many steps. */
const WAIT_STEP_GRAIN = 3;

/** The pilot's memory across the steps of one move. */
export interface Pilot {
  from: Ledge;
  move: RouteMove;
  /** Steps still to stand before the launch. */
  wait: number;
  /** Presses made: none, the first, the second. */
  phase: 0 | 1 | 2;
  holding: boolean;
  steps: number;
}

export function pilotFor(from: Ledge, move: RouteMove, wait = 0): Pilot {
  return { from, move, wait, phase: 0, holding: false, steps: 0 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const on = (s: ClimbState, p: Ledge) => s.grounded && Math.abs(s.y - p.y) < 0.5 && s.x - OWL_W / 2 < p.x + p.w && s.x + OWL_W / 2 > p.x;

/** Where the pilot stands on `from` to jump straight up at `target`: under its middle, as far as the ledge allows. */
export function standUnder(from: Ledge, target: Ledge): number {
  return clamp(target.x + target.w / 2, from.x + OWL_W / 2, from.x + from.w - OWL_W / 2);
}

/** The policy's next input at state `s`; the pilot remembers where it is in the move. */
export function pilotInput(s: ClimbState, p: Pilot): ClimbInput {
  p.steps++;
  if (p.wait > 0) {
    p.wait--;
    return NO_INPUT;
  }
  const { move, from } = p;
  const target = move.to;
  const lateral = move.toward !== 'U';
  const dir = lateral ? { left: move.toward === 'L', right: move.toward === 'R' } : lean(s, target);
  if (p.phase === 0) {
    if (!s.grounded) {
      // Off the ledge's end before the press (a landing at its very end leaves no run-up): the coyote jump, now.
      if (s.coyoteMs > 0) {
        p.phase = 1;
        p.holding = true;
        return { ...dir, jumpPressed: true, jumpHeld: true };
      }
      return { ...dir, jumpPressed: false, jumpHeld: false };
    }
    if (!lateral) {
      // Under the target, as near its middle as the ledge allows, and still; then the press.
      const stand = standUnder(from, target);
      const go = Math.abs(s.x - stand) > 4;
      if (go || Math.abs(s.vx) > 40) return { left: go && stand < s.x, right: go && stand > s.x, jumpPressed: false, jumpHeld: false };
    } else {
      // Run to the ledge's end facing the move (a landing keeps the last move's speed), then the press.
      const edge = move.toward === 'R' ? from.x + from.w - OWL_W / 2 - 8 : from.x + OWL_W / 2 + 8;
      const atEdge = (move.toward === 'R' ? s.x >= edge : s.x <= edge) || (move.toward === 'R' ? s.x >= CLIMB_FIELD_W - OWL_W / 2 : s.x <= OWL_W / 2);
      const facing = move.toward === 'R' ? s.vx >= RUN_SPEED - 20 : s.vx <= -(RUN_SPEED - 20);
      if (!(atEdge && facing)) return { ...dir, jumpPressed: false, jumpHeld: false };
    }
    p.phase = 1;
    p.holding = true;
    return { ...dir, jumpPressed: true, jumpHeld: true };
  }
  // In the air. The hold lasts through the rise for full height; after the apex it ends, unless this move glides.
  let jumpPressed = false;
  if (p.phase === 1 && move.jump !== 'single' && !s.grounded && s.jumpsUsed === 1 && s.vy <= 0) {
    jumpPressed = true;
    p.phase = 2;
    p.holding = true;
  }
  const jumpHeld = p.holding;
  if (p.holding && !jumpPressed && !s.rising && !(p.phase === 2 && move.jump === 'double-glide')) p.holding = false;
  return { ...dir, jumpPressed, jumpHeld };
}

/** Back under the target's middle, against a gust's carry. */
function lean(s: ClimbState, target: Ledge): { left: boolean; right: boolean } {
  if (s.grounded) return { left: false, right: false };
  const cx = target.x + target.w / 2;
  return { left: s.x > cx + 3, right: s.x < cx - 3 };
}

export type MoveOutcome = 'landed' | 'fell' | 'knocked' | 'lost';

/**
 * Play one move from state `s` to its end: the owl stands on the target (`landed`), or stood below
 * where it started (`fell`), or a lantern knocked it (`knocked`), or the move ran out of time (`lost`).
 */
export function playMove(
  s: ClimbState,
  pilot: Pilot,
  layout: Layout,
  night: Night,
  all: readonly Ledge[] = platforms(layout),
  onStep?: (s: ClimbState) => void,
): { state: ClimbState; steps: number; outcome: MoveOutcome } {
  const { from, move } = pilot;
  let steps = 0;
  while (steps < MOVE_STEP_LIMIT + pilot.wait) {
    s = stepClimb(s, pilotInput(s, pilot), layout, night, all);
    steps++;
    onStep?.(s);
    if (s.stunMs > 0) return { state: s, steps, outcome: 'knocked' };
    if (on(s, move.to)) return { state: s, steps, outcome: 'landed' };
    if (s.grounded && s.y < from.y - 0.5) return { state: s, steps, outcome: 'fell' };
    if (s.grounded && pilot.phase > 0 && s.y < move.to.y - 0.5 && !on(s, from)) return { state: s, steps, outcome: 'fell' };
  }
  return { state: s, steps, outcome: 'lost' };
}

/**
 * How many steps to stand before launching `move` from `s` so that it lands: the first wait, in
 * WAIT_STEP_GRAIN steps up to WAIT_STEP_LIMIT, whose dry run lands on the target. Null when none
 * does within the limit (the pilot then goes at once and takes its chances).
 */
export function waitToLaunch(s: ClimbState, from: Ledge, move: RouteMove, layout: Layout, night: Night, all: readonly Ledge[] = platforms(layout)): number | null {
  for (let wait = 0; wait <= WAIT_STEP_LIMIT; wait += WAIT_STEP_GRAIN) {
    const r = playMove(s, pilotFor(from, move, wait), layout, night, all);
    if (r.outcome === 'landed') return wait;
  }
  return null;
}
