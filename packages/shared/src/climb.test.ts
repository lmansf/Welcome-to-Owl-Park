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
  DASH_MS,
  DASH_SPEED,
  FRAIL_MS,
  HURT_MS,
  JUMP_IMPULSE,
  KNOCK_STUN_MS,
  LANTERN_R,
  MOTH_R,
  NIGHTS,
  NO_INPUT,
  OWL_H,
  OWL_W,
  POGO_IMPULSE,
  REST_MS,
  SHADE_MS,
  TIERS,
  WALL_KICK,
  bandLine,
  briskMs,
  circleTouches,
  lanternBob,
  layoutOf,
  leastClimbMs,
  mothAt,
  platforms,
  plausibleBand,
  rectTouches,
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
import { LAYOUTS, roadPlatforms, routeOf } from './climbCity';
import { pilotFor, playMove, waitToLaunch } from './climbPilot';

/**
 * Drives a road's scripted route through the simulation with the shared pilot (climbPilot.ts): for
 * each move it waits for the first launch whose dry run lands (a lantern past, a moth turned), then
 * plays the move. Returns the step at which each band was first reached, the platforms stood on, and
 * the panes left (a clean route loses none).
 */
function drive(night: Night, road: Road): { bandSteps: number[]; stood: Set<string>; failed: string | null; waited: number; panes: number } {
  const layout = layoutOf(night);
  const all = platforms(layout);
  const route = routeOf(layout, road);
  let s = startState(layout, night);
  let step = 0;
  let waited = 0;
  const bandSteps: number[] = [];
  const key = (p: Ledge) => `${p.x},${p.y},${p.w}`;
  const stood = new Set<string>([key(layout.start)]);
  let standing: Ledge = layout.start;
  for (let i = 0; i < route.length; i++) {
    const move: RouteMove = route[i]!;
    const wait = waitToLaunch(s, standing, move, layout, night, all);
    waited += wait ?? 0;
    const r = playMove(s, pilotFor(standing, move, wait ?? 0), layout, night, all, (next) => {
      step++;
      while (bandSteps.length < next.band) bandSteps.push(step);
    });
    s = r.state;
    const where = `${road} move ${i} (${move.kind} ${move.toward} ${move.jump} to ${move.to.x},${move.to.y})`;
    if (r.outcome !== 'landed') return { bandSteps, stood, failed: `${where} ${r.outcome} (at ${s.x.toFixed(0)},${s.y.toFixed(0)} grounded ${s.grounded}${wait === null ? ', no launch found' : ''})`, waited, panes: s.panes };
    standing = move.to;
    stood.add(key(standing));
  }
  return { bandSteps, stood, failed: null, waited, panes: s.panes };
}

const ms = (steps: number) => steps * CLIMB_STEP_MS;
const floorsFrom = (bandSteps: number[]) => bandSteps.map((n) => Math.floor((ms(n) * (1 - CLIMB_FLOOR_MARGIN)) / 100) * 100);
/** The brisk window per band: the high road's time through the band times the factor, up to 100 ms; 0 where the band has no high road. */
const briskFrom = (layout: Layout, bandSteps: number[]) =>
  bandSteps.map((n, i) => {
    const lo = i === 0 ? 0 : layout.bandLines[i - 1]!;
    const hasHigh = layout.routes.high.some((m) => m.to.y > lo && m.to.y <= layout.bandLines[i]!);
    const segment = ms(n) - (i === 0 ? 0 : ms(bandSteps[i - 1]!));
    return hasHigh ? Math.ceil((segment * CLIMB_BRISK_FACTOR) / 100) * 100 : 0;
  });

const night = NIGHTS.medium!;
const layout = LAYOUTS['city-2']!;
const all = platforms(layout);
const at = (x: number, y: number, more: Partial<ClimbState> = {}): ClimbState => ({ ...startState(layout, night), x, y, ...more });
const hold = (input: Partial<ClimbInput>, s: ClimbState, steps: number, n: Night = night): ClimbState => {
  for (let i = 0; i < steps; i++) s = stepClimb(s, { ...NO_INPUT, ...input }, layout, n, all);
  return s;
};

describe('the climb layout', () => {
  it('has six band lines spanning the field, lowest first, and the start ledge at the bottom', () => {
    expect(layout.bandLines).toHaveLength(BAND_COUNT);
    for (let i = 1; i < layout.bandLines.length; i++) expect(layout.bandLines[i]!).toBeGreaterThan(layout.bandLines[i - 1]!);
    expect(layout.start).toEqual({ x: 0, y: 0, w: CLIMB_FIELD_W });
    for (const p of platforms(layout)) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(CLIMB_FIELD_W);
    }
    for (const w of layout.walls) expect(w.y1).toBeGreaterThan(w.y0);
    expect(bandLine(layout, 0)).toBe(0);
    expect(bandLine(layout, 6)).toBe(7200);
  });

  it('pays ten feathers in all, two per band at most', () => {
    expect(BAND_FEATHERS).toHaveLength(BAND_COUNT);
    expect(BAND_FEATHERS.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it('names a layout for every night, and makes the harder nights meaner', () => {
    for (const n of Object.values(NIGHTS)) expect(LAYOUTS[n.layout]).toBeDefined();
    expect(TIERS.map((t) => NIGHTS[t]!.tier)).toEqual(TIERS);
    expect(NIGHTS.easy!.panes).toBeGreaterThan(NIGHTS.medium!.panes);
    expect(NIGHTS.medium!.panes).toBeGreaterThan(NIGHTS.hard!.panes);
    expect(NIGHTS.easy!.pace).toBeLessThan(NIGHTS.hard!.pace);
  });

  it('keeps bands 1 clean of hazards, and gives every band from 2 a high road', () => {
    const band = (y: number) => layout.bandLines.findIndex((line) => y < line) + 1;
    for (const l of layout.lanterns) expect(band(l.y), `lantern at ${l.y}`).toBeGreaterThanOrEqual(3);
    for (const m of layout.moths) expect(band(m.y), `moth at ${m.y}`).toBeGreaterThanOrEqual(2);
    for (const th of layout.thorns) expect(band(th.y), `thorns at ${th.y}`).toBeGreaterThanOrEqual(2);
    for (let b = 2; b <= BAND_COUNT; b++) expect(layout.routes.high.some((m) => band(m.to.y - 0.5) === b), `band ${b} has a high road`).toBe(true);
    expect(roadPlatforms(layout, 'high').length).toBeLessThan(roadPlatforms(layout, 'stairs').length);
  });

  it('hangs no lantern and flies no moth where an owl can stand, at any moment', () => {
    for (const l of layout.lanterns) {
      let touched: string | null = null;
      for (const p of platforms(layout)) {
        if (Math.abs(p.y - l.y) > l.len + LANTERN_R + OWL_H) continue;
        for (let x = p.x + OWL_W / 2; x <= p.x + p.w - OWL_W / 2 + 0.01 && !touched; x += 3) {
          for (let t = 0; t < l.periodMs && !touched; t += 10) {
            const b = lanternBob(l, t);
            if (circleTouches(b.x, b.y, LANTERN_R, x, p.y)) touched = `lantern at (${l.x}, ${l.y}) touches an owl standing at (${x}, ${p.y}) at t ${t}`;
          }
        }
      }
      expect(touched).toBeNull();
    }
    // A moth may patrol a corridor floor (the full-width ledges the owl crosses), never a ledge an owl rests on.
    for (const m of layout.moths) {
      let touched: string | null = null;
      for (const p of platforms(layout)) {
        if (Math.abs(p.y - m.y) > MOTH_R + OWL_H || (p.w === CLIMB_FIELD_W && !p.bench && !layout.bandLines.includes(p.y) && p.y !== layout.start.y)) continue;
        for (let x = p.x + OWL_W / 2; x <= p.x + p.w - OWL_W / 2 + 0.01 && !touched; x += 3) {
          for (const mx of [m.x0, m.x1, (m.x0 + m.x1) / 2]) if (circleTouches(mx, m.y, MOTH_R, x, p.y)) touched = `moth on ${m.y} touches an owl standing at (${x}, ${p.y})`;
        }
      }
      expect(touched).toBeNull();
    }
    // Thorns never lie on a standing surface either, except as the floor they replace.
    for (const th of layout.thorns) {
      for (const p of platforms(layout)) {
        if (p.w === CLIMB_FIELD_W && p.y === layout.start.y) continue;
        for (let x = p.x + OWL_W / 2; x <= p.x + p.w - OWL_W / 2 + 0.01; x += 3) expect(rectTouches(th.x, th.y, th.w, th.h, x, p.y), `thorns at (${th.x}, ${th.y}) touch an owl standing at (${x}, ${p.y})`).toBe(false);
      }
    }
  });
});

describe('the kit', () => {
  it('jumps short and heavy, cuts on release, and doubles once in the air', () => {
    let s = hold({ jumpPressed: true, jumpHeld: true }, at(240, 0), 1);
    expect(s.event).toBe('jump');
    let top = s.y;
    for (let i = 0; i < 200 && !s.grounded; i++) {
      s = stepClimb(s, { ...NO_INPUT, jumpHeld: true }, layout, night, all);
      top = Math.max(top, s.y);
    }
    expect(top).toBeGreaterThan(140);
    expect(top).toBeLessThan(160);
    // Released at once: a hop.
    s = hold({ jumpPressed: true, jumpHeld: true }, at(240, 0), 1);
    let hop = s.y;
    for (let i = 0; i < 200 && !s.grounded; i++) {
      s = stepClimb(s, NO_INPUT, layout, night, all);
      hop = Math.max(hop, s.y);
    }
    expect(hop).toBeLessThan(40);
    // The double at the apex, once.
    s = hold({ jumpPressed: true, jumpHeld: true }, at(240, 0), 1);
    while (s.vy > 0) s = stepClimb(s, { ...NO_INPUT, jumpHeld: true }, layout, night, all);
    s = stepClimb(s, { ...NO_INPUT, jumpPressed: true, jumpHeld: true }, layout, night, all);
    expect(s.event).toBe('double');
    expect(s.jumpsUsed).toBe(2);
    const again = stepClimb(s, { ...NO_INPUT, jumpPressed: true, jumpHeld: true }, layout, night, all);
    expect(again.event).toBeNull();
  });

  it('dashes sideways with no fall, once in the air until it lands, with a cooldown', () => {
    let s = hold({ jumpPressed: true, jumpHeld: true }, at(240, 0), 12);
    const before = s;
    s = stepClimb(s, { ...NO_INPUT, right: true, dashPressed: true }, layout, night, all);
    expect(s.event).toBe('dash');
    expect(s.vy).toBe(0);
    const during = hold({ right: true }, s, Math.round(DASH_MS / CLIMB_STEP_MS) - 1);
    expect(during.y).toBeCloseTo(before.y, 0);
    expect(during.x - before.x).toBeGreaterThan(DASH_SPEED * (DASH_MS / 1000) * 0.9);
    // A second press in the same flight does nothing; on the ground after the cooldown it dashes again.
    const twice = stepClimb(during, { ...NO_INPUT, right: true, dashPressed: true }, layout, night, all);
    expect(twice.event).not.toBe('dash');
    let g = hold({}, twice, 200);
    expect(g.grounded).toBe(true);
    g = stepClimb(g, { ...NO_INPUT, left: true, dashPressed: true }, layout, night, all);
    expect(g.event).toBe('dash');
    expect(g.facing).toBe(-1);
  });

  it('clings to a wall, slides, kicks off it, and keeps the double', () => {
    const w = layout.walls.find((w) => w.x === 360)!; // band 2's shaft, right wall
    // In the air against the wall, pressing into it.
    let s = at(w.x - OWL_W / 2 - 1, w.y0 + 100, { grounded: false, vy: 0, coyoteMs: 0, jumpsUsed: 2, dashUsed: true });
    s = stepClimb(s, { ...NO_INPUT, right: true }, layout, night, all);
    s = stepClimb(s, { ...NO_INPUT, right: true }, layout, night, all);
    expect(s.wall).toBe(1);
    expect(s.jumpsUsed).toBe(0);
    expect(s.dashUsed).toBe(false);
    const slid = hold({ right: true }, s, 30);
    expect(slid.vy).toBeGreaterThanOrEqual(-141);
    expect(slid.wall).toBe(1);
    const kicked = stepClimb(slid, { ...NO_INPUT, right: true, jumpPressed: true, jumpHeld: true }, layout, night, all);
    expect(kicked.event).toBe('kick');
    expect(kicked.vx).toBe(-WALL_KICK);
    expect(kicked.vy).toBeGreaterThan(JUMP_IMPULSE * 0.9);
    expect(kicked.wall).toBe(0);
    expect(kicked.jumpsUsed).toBe(1);
    // The owl cannot pass through the wall.
    let through = at(w.x - OWL_W / 2 - 30, w.y0 + 100, { grounded: false, coyoteMs: 0 });
    through = hold({ right: true }, through, 20);
    expect(through.x + OWL_W / 2).toBeLessThanOrEqual(w.x + 0.01);
  });

  it('pogos off a hazard with the talons down, and is hurt by it without them', () => {
    const l = layout.lanterns[0]!;
    const b = lanternBob(l, 0, night.pace);
    // Falling onto the glass from above.
    let s = at(b.x, b.y + LANTERN_R + 30, { grounded: false, coyoteMs: 0, vy: -200, jumpsUsed: 2, dashUsed: true });
    let p = s;
    for (let i = 0; i < 30 && p.event !== 'pogo' && p.event !== 'hit'; i++) p = stepClimb(p, { ...NO_INPUT, down: true }, layout, night, all);
    expect(p.event).toBe('pogo');
    expect(p.vy).toBe(POGO_IMPULSE);
    expect(p.jumpsUsed).toBe(1);
    expect(p.dashUsed).toBe(false);
    expect(p.panes).toBe(night.panes);
    // The bounce is never cut by a released button.
    const up = stepClimb(p, NO_INPUT, layout, night, all);
    expect(up.vy).toBeGreaterThan(POGO_IMPULSE * 0.95);
    // Without the talons: a pane cracked, thrown back and up, controls dead, untouchable for a while.
    let h = s;
    for (let i = 0; i < 30 && h.event !== 'pogo' && h.event !== 'hit'; i++) h = stepClimb(h, NO_INPUT, layout, night, all);
    expect(h.event).toBe('hit');
    expect(h.panes).toBe(night.panes - 1);
    expect(h.hurtMs).toBe(HURT_MS);
    expect(h.stunMs).toBe(KNOCK_STUN_MS);
    expect(h.vy).toBeGreaterThan(0);
    const dead = stepClimb(h, { ...NO_INPUT, left: true, jumpPressed: true, jumpHeld: true }, layout, night, all);
    expect(dead.event).toBeNull();
    expect(Math.sign(dead.vx)).toBe(Math.sign(h.vx));
    void s;
  });

  it('sends an owl that touches thorns back to its last safe ground, a pane the poorer', () => {
    const th = layout.thorns[0]!; // band 2, before the first shaft's foot
    const safe = layout.ledges.find((l) => l.y === 1380)!;
    let s = at(safe.x + safe.w / 2, safe.y);
    s = hold({}, s, 2); // stands: safe ground
    expect([s.safeX, s.safeY]).toEqual([safe.x + safe.w / 2, safe.y]);
    s = { ...s, x: th.x + th.w / 2, y: th.y + th.h + 4, grounded: false, coyoteMs: 0, vy: -100 };
    for (let i = 0; i < 30 && s.event !== 'thorns'; i++) s = stepClimb(s, NO_INPUT, layout, night, all);
    expect(s.event).toBe('thorns');
    expect(s.panes).toBe(night.panes - 1);
    expect([s.x, s.y]).toEqual([safe.x + safe.w / 2, safe.y]);
    expect(s.grounded).toBe(true);
  });

  it('takes the shade when the last pane goes, and brings the owl back to its bench relit', () => {
    const l = layout.lanterns[0]!;
    const b = lanternBob(l, 0, night.pace);
    // Standing on the second bench first, then thrown at the glass with one pane left.
    let s = at(240, layout.bandLines[1]!, { band: 2 });
    s = hold({}, s, 2);
    expect(s.bench).toBe(2);
    s = { ...s, x: b.x, y: b.y - OWL_H / 2, grounded: false, coyoteMs: 0, vy: 100, panes: 1, t: 0 };
    for (let i = 0; i < 30 && s.event !== 'shade'; i++) s = stepClimb(s, NO_INPUT, layout, night, all);
    expect(s.event).toBe('shade');
    expect(s.shadeMs).toBe(SHADE_MS);
    expect(s.shades).toBe(1);
    const stillThere = stepClimb(s, { ...NO_INPUT, right: true, jumpPressed: true }, layout, night, all);
    expect([stillThere.x, stillThere.y]).toEqual([s.x, s.y]);
    let back = s;
    for (let i = 0; i < 200 && back.event !== 'respawn'; i++) back = stepClimb(back, NO_INPUT, layout, night, all);
    expect(back.event).toBe('respawn');
    expect(back.y).toBe(layout.bandLines[1]);
    expect(back.panes).toBe(night.panes);
    expect(back.grounded).toBe(true);
  });

  it('relights the panes after a rest on a bench', () => {
    let s = at(240, layout.bandLines[2]!, { band: 3, panes: 1 });
    s = hold({}, s, Math.round(REST_MS / CLIMB_STEP_MS) - 2);
    expect(s.panes).toBe(1);
    s = hold({}, s, 4);
    expect(s.panes).toBe(night.panes);
    expect(s.bench).toBe(3);
  });

  it('lets frail glass give way after FRAIL_MS, with one flap left', () => {
    const weak = layout.ledges.find((l) => l.frail)!;
    let s = at(weak.x + weak.w / 2, weak.y, { band: 4 });
    let gave: ClimbState | null = null;
    for (let i = 0; i < 200 && !gave; i++) {
      s = stepClimb(s, NO_INPUT, layout, night, all);
      if (s.crumbled) gave = s;
    }
    expect(gave?.crumbled).toBe(weak);
    expect(gave!.t).toBeGreaterThanOrEqual(FRAIL_MS);
    expect(gave!.grounded).toBe(false);
    expect(gave!.jumpsUsed).toBe(1);
    const flapped = stepClimb(gave!, { ...NO_INPUT, jumpPressed: true, jumpHeld: true }, layout, night, all);
    expect(flapped.vy).toBeGreaterThan(0);
  });

  it('moves a moth there and back on its track, faster under a harder night', () => {
    const m = layout.moths.find((moth) => !moth.phase)!;
    const a = mothAt(m, 0, 1);
    expect(a.x).toBe(m.x0);
    const span = Math.abs(m.x1 - m.x0);
    const half = (span / m.speed) * 1000;
    expect(mothAt(m, half, 1).x).toBeCloseTo(m.x1, 0);
    expect(mothAt(m, 2 * half, 1).x).toBeCloseTo(m.x0, 0);
    expect(Math.abs(mothAt(m, 300, NIGHTS.hard!.pace).x - m.x0)).toBeGreaterThan(Math.abs(mothAt(m, 300, NIGHTS.easy!.pace).x - m.x0));
  });
});

describe('the two roads, the floors and the brisk windows', () => {
  for (const tier of TIERS) {
    it(`stands on every platform of both roads under the ${tier} night without losing a pane, and freezes the floors and the brisk windows`, () => {
      const n = NIGHTS[tier]!;
      const stairs = drive(n, 'stairs');
      const high = drive(n, 'high');
      expect(stairs.failed).toBeNull();
      expect(high.failed).toBeNull();
      expect(stairs.panes).toBe(n.panes);
      expect(high.panes).toBe(n.panes);
      const stood = new Set([...stairs.stood, ...high.stood]);
      const key = (p: Ledge) => `${p.x},${p.y},${p.w}`;
      for (const p of platforms(layout)) expect(stood.has(key(p)), `a road stands on ${key(p)}`).toBe(true);
      expect(stairs.bandSteps).toHaveLength(BAND_COUNT);
      expect(high.bandSteps).toHaveLength(BAND_COUNT);
      // The main road at scripted speed takes a minute to the clouds (the first tower's took fifty seconds).
      expect(ms(stairs.bandSteps[5]!)).toBeGreaterThan(60_000);
      // The high road is the faster way up every band it exists in.
      for (let b = 1; b < BAND_COUNT; b++) expect(high.bandSteps[b]! - high.bandSteps[b - 1]!, `band ${b + 1}: the high road is faster`).toBeLessThan(stairs.bandSteps[b]! - stairs.bandSteps[b - 1]!);
      const fastest = stairs.bandSteps.map((k, i) => Math.min(k, high.bandSteps[i]!));
      const floors = floorsFrom(fastest);
      const brisk = briskFrom(layout, high.bandSteps);
      const times = (r: number[]) => r.map((k) => Math.round(ms(k))).join(', ');
      expect(CLIMB_FLOORS['city-2']![tier], `CLIMB_FLOORS['city-2'].${tier} must be [${floors.join(', ')}] (main road ${times(stairs.bandSteps)} ms, waited ${Math.round(ms(stairs.waited))}; high road ${times(high.bandSteps)} ms, waited ${Math.round(ms(high.waited))})`).toEqual(floors);
      expect(CLIMB_BRISK['city-2']![tier], `CLIMB_BRISK['city-2'].${tier} must be [${brisk.join(', ')}]`).toEqual(brisk);
      // A brisk window is wider than the high road's own time, and the main road does not make it even a quarter quicker than the script.
      for (let b = 1; b < BAND_COUNT; b++) {
        expect(brisk[b]!).toBeGreaterThan(ms(high.bandSteps[b]! - high.bandSteps[b - 1]!));
        expect(brisk[b]! * 1.25, `band ${b + 1}: the main road is not brisk`).toBeLessThan(ms(stairs.bandSteps[b]! - stairs.bandSteps[b - 1]!));
      }
      expect(brisk[0]).toBe(0);
      expect(CLIMB_BRISK_FACTOR).toBeGreaterThan(1);
    });
  }

  it('is a longer climb than the first tower on both roads, and no night is a short cut', () => {
    const f = CLIMB_FLOORS['city-2']!;
    // The first tower's floors to the clouds (its faster road, less the margin) were 23.6 s on every night.
    for (const tier of TIERS) expect(f[tier][5]!).toBeGreaterThan(32_000);
    expect(f.hard[5]!).toBeLessThanOrEqual(f.easy[5]! * 1.1);
  });

  it('judges a band by its floor with the slack, inside the run limit, and names the brisk window', () => {
    const n = NIGHTS.easy!;
    const floor = leastClimbMs(n, 1);
    expect(plausibleBand(n, 1, floor)).toBe(true);
    expect(plausibleBand(n, 1, floor - CLIMB_SLACK_MS)).toBe(true);
    expect(plausibleBand(n, 1, floor - CLIMB_SLACK_MS - 1)).toBe(false);
    expect(plausibleBand(n, 0, 1e9)).toBe(false);
    expect(plausibleBand(n, 7, 1e9)).toBe(false);
    expect(plausibleBand(n, 6, CLIMB_RUN_MAX_MS + 1)).toBe(false);
    expect(leastClimbMs({ ...n, layout: 'nowhere' }, 1)).toBe(Infinity);
    expect(briskMs(n, 1)).toBe(0);
    expect(briskMs(n, 2)).toBeGreaterThan(0);
    expect(briskMs({ ...n, layout: 'nowhere' }, 2)).toBe(0);
  });
});
