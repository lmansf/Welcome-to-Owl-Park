/**
 * The scripted climber (designs/the-stained-glass-climb.md, Appendix A): the policy that plays one
 * move of a route through stepClimb, the way the floor test and the browser tests climb. It runs to
 * a ledge's end and jumps, stands under a target and jumps straight up, dashes at the apex, kicks up
 * a wall, or puts its talons down over a hazard and rides the bounce. Before a move it can dry-run
 * the move from the owl's state to find the first launch that lands: that is how it waits for a
 * lantern to swing past or a moth to turn, as a player watching them would.
 */
import {
  CLIMB_FIELD_W,
  CLIMB_STEP_MS,
  GRAVITY,
  MOTH_R,
  NO_INPUT,
  OWL_H,
  OWL_W,
  RUN_SPEED,
  hazardAt,
  lanternBob,
  mothAt,
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
export const MOVE_STEP_LIMIT = Math.round(9000 / CLIMB_STEP_MS);
/** The longest the pilot waits for a launch (steps): the slowest hazard's full cycle. */
export const WAIT_STEP_LIMIT = Math.round(3000 / CLIMB_STEP_MS);
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
  /** `dash`: the dash is spent. `pogo`: a bounce has happened. */
  dashed: boolean;
  pogoed: boolean;
  /** `wall`: the side the owl is heading for (+1 the right wall). */
  wallSide: 1 | -1;
  steps: number;
  /** The step of the first press, for a move with a short hold. */
  pressedAt: number;
}

export function pilotFor(from: Ledge, move: RouteMove, wait = 0): Pilot {
  return { from, move, wait, phase: 0, holding: false, dashed: false, pogoed: false, wallSide: move.toward === 'R' ? 1 : -1, steps: 0, pressedAt: 0 };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const on = (s: ClimbState, p: Ledge) => s.grounded && Math.abs(s.y - p.y) < 0.5 && s.x - OWL_W / 2 < p.x + p.w && s.x + OWL_W / 2 > p.x;
const dirOf = (toward: 'L' | 'R') => ({ left: toward === 'L', right: toward === 'R' });
const steer = (s: ClimbState, cx: number, slack = 3) => ({ left: s.x > cx + slack, right: s.x < cx - slack });

/** Where the pilot stands on `from` to jump straight up at `target`: under its middle, as far as the ledge allows. */
export function standUnder(from: Ledge, target: Ledge): number {
  return clamp(target.x + target.w / 2, from.x + OWL_W / 2, from.x + from.w - OWL_W / 2);
}

/** The policy's next input at state `s`; the pilot remembers where it is in the move. */
export function pilotInput(s: ClimbState, p: Pilot, layout: Layout, night: Night): ClimbInput {
  p.steps++;
  if (p.wait > 0) {
    p.wait--;
    return NO_INPUT;
  }
  const { move, from } = p;
  const target = move.to;
  const cx = target.x + target.w / 2;
  const vertical = move.kind === 'U' || (move.kind === 'pogo' && move.vertical);
  // Straight up a chain of lanterns: rise where the owl is (the chain zigzags, so the next one is beside the rise),
  // and once the double is spent, fall onto the nearest lantern below; past the last one, onto the target.
  const chain = move.kind === 'pogo' && move.vertical ? layout.lanterns.filter((l) => l.y > from.y && l.y < target.y + 80 && Math.abs(l.x - cx) < 160).sort((a, b) => a.y - b.y) : [];
  const nextBob = () => {
    const below = chain.filter((l) => lanternBob(l, s.t, night.pace).y <= s.y + 12).sort((a, b) => b.y - a.y);
    return below[0] ? lanternBob(below[0], s.t, night.pace).x : cx;
  };
  const chainDir = () => (s.vy > 0 || s.jumpsUsed < 2 ? { left: false, right: false } : steer(s, nextBob()));
  const dir = chain.length ? (s.grounded ? { left: false, right: false } : chainDir()) : vertical ? (s.grounded ? { left: false, right: false } : steer(s, cx)) : dirOf(move.toward);
  const none = { ...NO_INPUT };
  // Before the launch: get into place, then the press.
  if (p.phase === 0) {
    if (!s.grounded) {
      // A hop in a crossing: hold through the rise for its full height.
      if (move.kind === 'cross') {
        p.holding = p.holding && s.rising;
        return { ...none, ...dir, jumpHeld: p.holding };
      }
      // Off the ledge's end before the press (a landing at its very end leaves no run-up): the coyote jump, now.
      if (s.coyoteMs > 0) {
        p.phase = 1;
        p.holding = true;
        return { ...none, ...dir, jumpPressed: true, jumpHeld: true };
      }
      return { ...none, ...dir };
    }
    if (move.kind === 'cross') {
      // Along the ledge to its far end; a moth ahead at this height is hopped.
      const end = move.toward === 'R' ? target.x + target.w - OWL_W / 2 - 6 : target.x + OWL_W / 2 + 6;
      const ahead = move.toward === 'R' ? 1 : -1;
      const near = layout.moths.some((m) => {
        const at = mothAt(m, s.t, night.pace);
        const dx = (at.x - s.x) * ahead;
        const coming = at.dir !== ahead;
        return Math.abs(at.y - s.y) < OWL_H + MOTH_R && dx > -10 && dx < (coming ? 96 : 56);
      });
      if (near) {
        p.holding = true;
        return { ...none, ...dir, jumpPressed: true, jumpHeld: true };
      }
      return { ...none, ...dir };
    }
    if (vertical) {
      const stand = chain.length ? clamp(chain[0]!.x - 58, from.x + OWL_W / 2, from.x + from.w - OWL_W / 2) : standUnder(from, target);
      const go = Math.abs(s.x - stand) > 4;
      if (go || Math.abs(s.vx) > 40) return { ...none, left: go && stand < s.x, right: go && stand > s.x };
    } else {
      // Run to the ledge's end facing the move (a landing keeps the last move's speed), then the press.
      const edge = move.toward === 'R' ? from.x + from.w - OWL_W / 2 - 8 : from.x + OWL_W / 2 + 8;
      const atEdge = (move.toward === 'R' ? s.x >= edge : s.x <= edge) || (move.toward === 'R' ? s.x >= CLIMB_FIELD_W - OWL_W / 2 : s.x <= OWL_W / 2);
      const facing = move.toward === 'R' ? s.vx >= RUN_SPEED - 20 : s.vx <= -(RUN_SPEED - 20);
      if (!(atEdge && facing)) return { ...none, ...dir };
    }
    p.phase = 1;
    p.holding = true;
    p.pressedAt = p.steps;
    return { ...none, ...dir, jumpPressed: true, jumpHeld: true };
  }
  // In the air, by the kind of move.
  let jumpPressed = false;
  let dashPressed = false;
  let down = false;
  let heading = dir;
  switch (move.kind) {
    case 'cross':
      // The hop over the moth: full height, then the run goes on; the move's phase never leaves 0.
      p.phase = 0;
      break;
    case 'run':
    case 'U':
      if (p.phase === 1 && move.jump === 'double' && !s.grounded && s.jumpsUsed === 1 && s.vy <= 0) {
        jumpPressed = true;
        p.phase = 2;
        p.holding = true;
      }
      break;
    case 'dash': {
      // The dash at the apex of the first jump (or after the double, where it says), then the double after it.
      const apex = !s.grounded && s.vy <= 0 && s.dashMs === 0;
      if (!p.dashed && apex && (!move.dashAfter || p.phase === 2) && !s.dashUsed) {
        dashPressed = true;
        p.dashed = true;
      } else if (p.phase === 1 && move.jump === 'double' && !s.grounded && s.jumpsUsed === 1 && s.vy <= 0 && s.dashMs === 0 && (p.dashed || move.dashAfter)) {
        jumpPressed = true;
        p.phase = 2;
        p.holding = true;
      }
      break;
    }
    case 'wall': {
      // Into the wall on this side; once clinging (or sliding on it), kick; then head for the other wall or back to this one.
      heading = { left: p.wallSide < 0, right: p.wallSide > 0 };
      if (s.wall !== 0 && s.vy <= 80) {
        jumpPressed = true;
        p.holding = true;
        if (move.walls === 'both') p.wallSide = p.wallSide > 0 ? -1 : 1;
        else heading = { left: p.wallSide > 0, right: p.wallSide < 0 };
      } else if (s.wallLockMs > 0) {
        heading = { left: false, right: false };
      }
      // Once this rise will top the target, steer for its middle instead of the next wall.
      const apex = s.y + Math.max(0, s.vy) ** 2 / (2 * GRAVITY);
      if (apex >= target.y + 4 && !s.grounded && s.wall === 0 && s.wallLockMs === 0) heading = steer(s, cx);
      break;
    }
    case 'pogo': {
      // Talons down over a hazard while falling; after the bounce, the double where it says.
      // A hazard about to pass under the owl (the box a little lower, a few steps on): talons down.
      const hz = !s.grounded && s.vy <= 0 && s.dashMs === 0 ? hazardAt(layout, night, s.x, s.y - 28, s.t + 3 * CLIMB_STEP_MS) : null;
      if (hz || (!s.grounded && s.vy <= 0 && s.jumpsUsed === 2 && !p.pogoed)) down = true;
      if (s.event === 'pogo') {
        p.pogoed = true;
        p.phase = 1;
      }
      // The double at the apex of each jump (and after each bounce), where the move has one.
      if (!hz && p.phase < 2 && move.jump === 'double' && !s.grounded && s.jumpsUsed === 1 && s.vy <= 0) {
        jumpPressed = true;
        p.phase = 2;
        p.holding = true;
      }
      break;
    }
  }
  const jumpHeld = p.holding;
  if (p.holding && !jumpPressed && (!s.rising || (move.hold !== undefined && p.phase === 1 && (p.steps - p.pressedAt) * CLIMB_STEP_MS >= move.hold))) p.holding = false;
  return { ...heading, down, jumpPressed, jumpHeld, dashPressed };
}

export type MoveOutcome = 'landed' | 'fell' | 'hurt' | 'lost';

/**
 * Play one move from state `s` to its end: the owl stands on the target (`landed`), or stood below
 * where it started (`fell`), or a hazard cost it a pane (`hurt`), or the move ran out of time (`lost`).
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
    s = stepClimb(s, pilotInput(s, pilot, layout, night), layout, night, all);
    steps++;
    onStep?.(s);
    if (s.event === 'hit' || s.event === 'thorns' || s.event === 'shade') return { state: s, steps, outcome: 'hurt' };
    if (move.kind === 'cross') {
      const end = move.toward === 'R' ? move.to.x + move.to.w - OWL_W / 2 - 6 : move.to.x + OWL_W / 2 + 6;
      if (on(s, move.to) && Math.abs(s.x - end) < 10) return { state: s, steps, outcome: 'landed' };
    } else if (on(s, move.to)) return { state: s, steps, outcome: 'landed' };
    if (s.grounded && s.y < from.y - 0.5) return { state: s, steps, outcome: 'fell' };
    if (s.grounded && pilot.phase > 0 && s.y < move.to.y - 0.5 && !on(s, from) && s.stoodMs > 2 * CLIMB_STEP_MS) return { state: s, steps, outcome: 'fell' };
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
    if (r.outcome === 'landed' && settles(r.state, layout, night, all)) return wait;
  }
  return null;
}

/** A landing is only good if the owl can stand there a moment without a hazard reaching it (frail glass allows the moment). */
export function settles(s: ClimbState, layout: Layout, night: Night, all: readonly Ledge[], steps = 30): boolean {
  for (let i = 0; i < steps; i++) {
    s = stepClimb(s, NO_INPUT, layout, night, all);
    if (s.event === 'hit' || s.event === 'thorns' || s.event === 'shade') return false;
  }
  return true;
}
