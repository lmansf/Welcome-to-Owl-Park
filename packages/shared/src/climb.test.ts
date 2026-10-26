import { describe, expect, it } from 'vitest';
import {
  BAND_COUNT,
  BAND_FEATHERS,
  CLIMB_FIELD_W,
  CLIMB_FLOORS,
  CLIMB_FLOOR_MARGIN,
  CLIMB_RUN_MAX_MS,
  CLIMB_SLACK_MS,
  CLIMB_STEP_MS,
  LAYOUTS,
  NIGHTS,
  NO_INPUT,
  OWL_W,
  ROUTES,
  RUN_SPEED,
  TIERS,
  bandLine,
  layoutOf,
  leastClimbMs,
  platforms,
  plausibleBand,
  startState,
  stepClimb,
  type ClimbInput,
  type ClimbState,
  type Ledge,
  type Night,
  type RouteMove,
} from './climb';

/** How long the driver lets one move take before giving up (steps). */
const MOVE_STEP_LIMIT = Math.round(8000 / CLIMB_STEP_MS);

/**
 * Drives the scripted route through the simulation, the way Appendix A describes: hold `toward`
 * until the owl's box edge is within 8 px of the current platform's end, press jump, press again at
 * the apex for a double, and keep holding from the second press for a glide. Returns the step at
 * which each band was first reached, and the platforms stood on.
 */
function drive(night: Night): { bandSteps: number[]; stood: Set<Ledge>; failed: string | null } {
  const layout = layoutOf(night);
  const all = platforms(layout);
  const route = ROUTES[layout.id]!;
  let s = startState(layout);
  let step = 0;
  const bandSteps: number[] = [];
  const stood = new Set<Ledge>([layout.start]);
  let standing: Ledge = layout.start;
  const tick = (input: ClimbInput): void => {
    s = stepClimb(s, input, layout, night, all);
    step++;
    while (bandSteps.length < s.band) bandSteps.push(step);
  };
  for (let i = 0; i < route.length; i++) {
    const move: RouteMove = route[i]!;
    const target = all[i + 1]!;
    const dir = { left: move.toward === 'L', right: move.toward === 'R' };
    const edge = move.toward === 'R' ? standing.x + standing.w - OWL_W / 2 - 8 : standing.x + OWL_W / 2 + 8;
    const atEdge = () => (move.toward === 'R' ? s.x >= edge : s.x <= edge) || (move.toward === 'R' ? s.x >= CLIMB_FIELD_W - OWL_W / 2 : s.x <= OWL_W / 2);
    let phase = 0; // 0 before the first press, 1 after it, 2 after the second
    let holding = false;
    const start = step;
    // Run to the edge, facing the move (a landing keeps the previous move's speed), unless already falling off it.
    const facing = () => (move.toward === 'R' ? s.vx >= RUN_SPEED - 20 : s.vx <= -(RUN_SPEED - 20)) || !s.grounded;
    while (!(atEdge() && facing()) && step - start < MOVE_STEP_LIMIT) tick({ ...dir, jumpPressed: false, jumpHeld: false });
    // Jump, and keep moving until we stand on the target.
    while (step - start < MOVE_STEP_LIMIT) {
      let jumpPressed = false;
      if (phase === 0) {
        jumpPressed = true;
        phase = 1;
        holding = true;
      } else if (phase === 1 && move.jump !== 'single' && !s.grounded && s.jumpsUsed === 1 && s.vy <= 0) {
        jumpPressed = true;
        phase = 2;
        holding = true;
      }
      tick({ ...dir, jumpPressed, jumpHeld: holding });
      // Hold through the rise for full height; after the apex release, unless this move glides.
      if (holding && !s.rising && !(phase === 2 && move.jump === 'double-glide')) holding = false;
      if (s.grounded && Math.abs(s.y - target.y) < 0.5 && s.x - OWL_W / 2 < target.x + target.w && s.x + OWL_W / 2 > target.x) {
        standing = target;
        stood.add(target);
        break;
      }
      if (s.grounded && s.y < standing.y - 0.5) return { bandSteps, stood, failed: `move ${i} (${move.toward} ${move.jump}) fell below the platform it started from` };
    }
    if (standing !== target) return { bandSteps, stood, failed: `move ${i} (${move.toward} ${move.jump}) never landed on the platform at y ${target.y}` };
  }
  return { bandSteps, stood, failed: null };
}

const floorsFrom = (bandSteps: number[]) => bandSteps.map((n) => Math.floor((n * CLIMB_STEP_MS * (1 - CLIMB_FLOOR_MARGIN)) / 100) * 100);

describe('the climb layout', () => {
  const layout = LAYOUTS['city-1']!;

  it('has six band lines spanning the field, lowest first, and the start ledge at the bottom', () => {
    expect(layout.bandLines).toHaveLength(BAND_COUNT);
    for (let i = 1; i < layout.bandLines.length; i++) expect(layout.bandLines[i]!).toBeGreaterThan(layout.bandLines[i - 1]!);
    expect(layout.start).toEqual({ x: 0, y: 0, w: CLIMB_FIELD_W });
    for (const p of platforms(layout)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(CLIMB_FIELD_W);
    }
    expect(bandLine(layout, 0)).toBe(0);
    expect(bandLine(layout, 6)).toBe(5400);
  });

  it('pays ten feathers in all, two per band at most', () => {
    expect(BAND_FEATHERS).toHaveLength(BAND_COUNT);
    expect(BAND_FEATHERS.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('names a layout for every night', () => {
    for (const n of Object.values(NIGHTS)) expect(LAYOUTS[n.layout]).toBeDefined();
    expect(TIERS.map((t) => NIGHTS[t]!.tier)).toEqual(TIERS);
  });

  it('lets a glide from any airborne point above a ledge land on a ledge', () => {
    // From 40 px steps above every platform, with no input but a held jump after two jumps spent,
    // the owl must come to rest on some platform at or below the band it is in (never fall out).
    const all = platforms(layout);
    const night = NIGHTS.hard!;
    for (const p of all.slice(0, -1)) {
      for (let dy = 40; dy <= 240; dy += 40) {
        let s: ClimbState = { ...startState(layout), x: p.x + p.w / 2, y: p.y + dy, grounded: false, coyoteMs: 0, jumpsUsed: 2 };
        for (let i = 0; i < 3000 && !s.grounded; i++) s = stepClimb(s, { ...NO_INPUT, jumpHeld: true }, layout, night, all);
        expect(s.grounded, `gliding down from ${dy} px above the platform at (${p.x}, ${p.y})`).toBe(true);
        expect(s.y).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('the scripted route and the floors', () => {
  for (const tier of TIERS) {
    it(`stands on every platform of city-1 under the ${tier} night and freezes its floors`, () => {
      const night = NIGHTS[tier]!;
      const r = drive(night);
      expect(r.failed).toBeNull();
      expect(r.stood.size).toBe(platforms(layoutOf(night)).length);
      expect(r.bandSteps).toHaveLength(BAND_COUNT);
      const derived = floorsFrom(r.bandSteps);
      expect(CLIMB_FLOORS['city-1']![tier], `CLIMB_FLOORS['city-1'].${tier} must be [${derived.join(', ')}] (route times ${r.bandSteps.map((n) => Math.round(n * CLIMB_STEP_MS)).join(', ')} ms)`).toEqual(derived);
    });
  }

  it('makes harder nights no slower to the clouds than easier ones', () => {
    const f = CLIMB_FLOORS['city-1']!;
    expect(f.hard[5]!).toBeLessThanOrEqual(f.easy[5]!);
  });

  it('judges a band by its floor with the slack, inside the run limit', () => {
    const night = NIGHTS.easy!;
    const floor = leastClimbMs(night, 1);
    expect(plausibleBand(night, 1, floor)).toBe(true);
    expect(plausibleBand(night, 1, floor - CLIMB_SLACK_MS)).toBe(true);
    expect(plausibleBand(night, 1, floor - CLIMB_SLACK_MS - 1)).toBe(false);
    expect(plausibleBand(night, 0, 1e9)).toBe(false);
    expect(plausibleBand(night, 7, 1e9)).toBe(false);
    expect(plausibleBand(night, 6, CLIMB_RUN_MAX_MS + 1)).toBe(false);
    expect(leastClimbMs({ ...night, layout: 'nowhere' }, 1)).toBe(Infinity);
  });
});
