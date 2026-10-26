import { describe, expect, it } from 'vitest';
import {
  BAND_COUNT,
  BAND_FEATHERS,
  CLIMB_BRISK,
  CLIMB_BRISK_FACTOR,
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
  briskMs,
  layoutOf,
  leastClimbMs,
  platforms,
  plausibleBand,
  roadPlatforms,
  startState,
  stepClimb,
  type ClimbInput,
  type ClimbState,
  type Layout,
  type Ledge,
  type Night,
  type Road,
  type RouteMove,
} from './climb';

/** How long the driver lets one move take before giving up (steps). */
const MOVE_STEP_LIMIT = Math.round(8000 / CLIMB_STEP_MS);

/**
 * Drives a road's scripted route through the simulation, the way Appendix A describes: toward a
 * side, hold it until the owl's box edge is within 8 px of the current platform's end and jump; for
 * `U`, stand under the target (as near its middle as the current ledge allows) and jump; press again
 * at the apex for a double, and keep holding from the second press for a glide. Returns the step at
 * which each band was first reached, and the platforms stood on.
 */
function drive(night: Night, road: Road): { bandSteps: number[]; stood: Set<Ledge>; failed: string | null } {
  const layout = layoutOf(night);
  const all = platforms(layout);
  const route = ROUTES[layout.id]![road];
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
    const target = move.to;
    const start = step;
    let dir = { left: false, right: false };
    if (move.toward === 'U') {
      // Under the target, as near its middle as the ledge allows, and still.
      const stand = Math.max(standing.x + OWL_W / 2, Math.min(standing.x + standing.w - OWL_W / 2, target.x + target.w / 2));
      while ((Math.abs(s.x - stand) > 4 || Math.abs(s.vx) > 40) && step - start < MOVE_STEP_LIMIT) {
        const go = Math.abs(s.x - stand) > 4;
        tick({ left: go && stand < s.x, right: go && stand > s.x, jumpPressed: false, jumpHeld: false });
      }
    } else {
      dir = { left: move.toward === 'L', right: move.toward === 'R' };
      const edge = move.toward === 'R' ? standing.x + standing.w - OWL_W / 2 - 8 : standing.x + OWL_W / 2 + 8;
      const atEdge = () => (move.toward === 'R' ? s.x >= edge : s.x <= edge) || (move.toward === 'R' ? s.x >= CLIMB_FIELD_W - OWL_W / 2 : s.x <= OWL_W / 2);
      // Run to the edge, facing the move (a landing keeps the previous move's speed), unless already falling off it.
      const facing = () => (move.toward === 'R' ? s.vx >= RUN_SPEED - 20 : s.vx <= -(RUN_SPEED - 20)) || !s.grounded;
      while (!(atEdge() && facing()) && step - start < MOVE_STEP_LIMIT) tick({ ...dir, jumpPressed: false, jumpHeld: false });
    }
    let phase = 0; // 0 before the first press, 1 after it, 2 after the second
    let holding = false;
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
      if (s.grounded && s.y < standing.y - 0.5) return { bandSteps, stood, failed: `${road} move ${i} (${move.toward} ${move.jump} to ${target.x},${target.y}) fell below the platform it started from` };
    }
    if (standing !== target) return { bandSteps, stood, failed: `${road} move ${i} (${move.toward} ${move.jump} to ${target.x},${target.y}) never landed (at ${s.x.toFixed(0)},${s.y.toFixed(0)} grounded ${s.grounded})` };
  }
  return { bandSteps, stood, failed: null };
}

const ms = (steps: number) => steps * CLIMB_STEP_MS;
const floorsFrom = (bandSteps: number[]) => bandSteps.map((n) => Math.floor((ms(n) * (1 - CLIMB_FLOOR_MARGIN)) / 100) * 100);
/** The brisk window per band: the high road's time through the band times the factor, up to 100 ms; 0 where the band has no high road. */
const briskFrom = (layout: Layout, bandSteps: number[]) =>
  bandSteps.map((n, i) => {
    const hasHigh = layout.ledges.some((l) => l.road === 'high' && l.y > (i === 0 ? 0 : layout.bandLines[i - 1]!) && l.y < layout.bandLines[i]!);
    const segment = ms(n) - (i === 0 ? 0 : ms(bandSteps[i - 1]!));
    return hasHigh ? Math.ceil((segment * CLIMB_BRISK_FACTOR) / 100) * 100 : 0;
  });

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

describe('the two roads, the floors and the brisk windows', () => {
  const layout = LAYOUTS['city-1']!;

  it('gives every band from the second up a high road, and keeps the stairs free of glides', () => {
    for (let b = 0; b < BAND_COUNT; b++) {
      const lo = b === 0 ? 0 : layout.bandLines[b - 1]!;
      const highs = layout.ledges.filter((l) => l.road === 'high' && l.y > lo && l.y < layout.bandLines[b]!);
      const stairs = layout.ledges.filter((l) => !l.road && l.y > lo && l.y < layout.bandLines[b]!);
      expect(stairs.length, `band ${b + 1} has stairs`).toBeGreaterThan(0);
      if (b > 0) expect(highs.length, `band ${b + 1} has a high road`).toBeGreaterThan(0);
      if (b > 0) expect(highs.length, `band ${b + 1}'s high road is the shorter`).toBeLessThanOrEqual(stairs.length);
      for (const h of highs) expect(h.w, 'high road ledges are the narrow ones').toBeLessThanOrEqual(100);
      // The roads never share a column: a jump straight up from the stairs never lands on the high road.
      for (const h of highs) for (const st of stairs) expect(h.x < st.x + st.w && h.x + h.w > st.x, `band ${b + 1}: ${JSON.stringify(h)} clear of ${JSON.stringify(st)}`).toBe(false);
    }
    // The stairs glide only in the top two bands (the move they teach there); the high road never does.
    for (const m of ROUTES['city-1']!.stairs) if (m.to.y <= layout.bandLines[3]!) expect(m.jump, `the stairs to ${m.to.y} need no glide`).not.toBe('double-glide');
    expect(ROUTES['city-1']!.stairs.some((m) => m.jump === 'double-glide')).toBe(true);
    for (const m of ROUTES['city-1']!.high) expect(m.jump, 'the high road never glides').not.toBe('double-glide');
    expect(roadPlatforms(layout, 'high').length).toBeLessThan(roadPlatforms(layout, 'stairs').length);
  });

  for (const tier of TIERS) {
    it(`stands on every platform of both roads under the ${tier} night, and freezes the floors and the brisk windows`, () => {
      const night = NIGHTS[tier]!;
      const stairs = drive(night, 'stairs');
      const high = drive(night, 'high');
      expect(stairs.failed).toBeNull();
      expect(high.failed).toBeNull();
      // The two drives make their own band-line objects: count platforms by place.
      const stood = new Set([...stairs.stood, ...high.stood].map((p) => `${p.x},${p.y},${p.w}`));
      expect(stood.size).toBe(platforms(layout).length);
      expect(stairs.bandSteps).toHaveLength(BAND_COUNT);
      expect(high.bandSteps).toHaveLength(BAND_COUNT);
      // The high road is the faster way up every band it exists in.
      for (let b = 1; b < BAND_COUNT; b++) expect(high.bandSteps[b]! - high.bandSteps[b - 1]!, `band ${b + 1}: the high road is faster`).toBeLessThan(stairs.bandSteps[b]! - stairs.bandSteps[b - 1]!);
      const fastest = stairs.bandSteps.map((n, i) => Math.min(n, high.bandSteps[i]!));
      const floors = floorsFrom(fastest);
      const brisk = briskFrom(layout, high.bandSteps);
      const times = (r: number[]) => r.map((n) => Math.round(ms(n))).join(', ');
      expect(CLIMB_FLOORS['city-1']![tier], `CLIMB_FLOORS['city-1'].${tier} must be [${floors.join(', ')}] (stairs ${times(stairs.bandSteps)} ms; high road ${times(high.bandSteps)} ms)`).toEqual(floors);
      expect(CLIMB_BRISK['city-1']![tier], `CLIMB_BRISK['city-1'].${tier} must be [${brisk.join(', ')}]`).toEqual(brisk);
      // A brisk window is wider than the high road's own time, and the stairs do not make it.
      for (let b = 1; b < BAND_COUNT; b++) {
        expect(brisk[b]!).toBeGreaterThan(ms(high.bandSteps[b]! - high.bandSteps[b - 1]!));
        expect(brisk[b]!, `band ${b + 1}: the stairs are not brisk`).toBeLessThan(ms(stairs.bandSteps[b]! - stairs.bandSteps[b - 1]!));
      }
      expect(brisk[0]).toBe(0);
      expect(CLIMB_BRISK_FACTOR).toBeGreaterThan(1);
    });
  }

  it('makes harder nights no slower to the clouds than easier ones', () => {
    const f = CLIMB_FLOORS['city-1']!;
    expect(f.hard[5]!).toBeLessThanOrEqual(f.easy[5]!);
  });

  it('judges a band by its floor with the slack, inside the run limit, and names the brisk window', () => {
    const night = NIGHTS.easy!;
    const floor = leastClimbMs(night, 1);
    expect(plausibleBand(night, 1, floor)).toBe(true);
    expect(plausibleBand(night, 1, floor - CLIMB_SLACK_MS)).toBe(true);
    expect(plausibleBand(night, 1, floor - CLIMB_SLACK_MS - 1)).toBe(false);
    expect(plausibleBand(night, 0, 1e9)).toBe(false);
    expect(plausibleBand(night, 7, 1e9)).toBe(false);
    expect(plausibleBand(night, 6, CLIMB_RUN_MAX_MS + 1)).toBe(false);
    expect(leastClimbMs({ ...night, layout: 'nowhere' }, 1)).toBe(Infinity);
    expect(briskMs(night, 1)).toBe(0);
    expect(briskMs(night, 2)).toBeGreaterThan(0);
    expect(briskMs({ ...night, layout: 'nowhere' }, 2)).toBe(0);
  });
});
