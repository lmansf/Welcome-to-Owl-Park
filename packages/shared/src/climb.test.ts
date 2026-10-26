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
  FRAIL_MS,
  GUST_PERIOD_MS,
  KNOCK_STUN_MS,
  LANTERN_R,
  LAYOUTS,
  NIGHTS,
  NO_INPUT,
  OWL_H,
  OWL_W,
  ROUTES,
  TIERS,
  bandLine,
  briskMs,
  gusting,
  lanternBob,
  lanternTouches,
  layoutOf,
  leastClimbMs,
  lullIn,
  platforms,
  plausibleBand,
  roadPlatforms,
  startState,
  stepClimb,
  windAt,
  type ClimbState,
  type Layout,
  type Ledge,
  type Night,
  type Road,
  type RouteMove,
} from './climb';
import { pilotFor, playMove, waitToLaunch } from './climbPilot';

/**
 * Drives a road's scripted route through the simulation with the shared pilot (climbPilot.ts): for
 * each move it waits for the first launch whose dry run lands (a lantern past, a lull), then plays
 * the move. Returns the step at which each band was first reached, and the platforms stood on.
 */
function drive(night: Night, road: Road): { bandSteps: number[]; stood: Set<Ledge>; failed: string | null; waited: number } {
  const layout = layoutOf(night);
  const all = platforms(layout);
  const route = ROUTES[layout.id]![road];
  let s = startState(layout);
  let step = 0;
  let waited = 0;
  const bandSteps: number[] = [];
  const stood = new Set<Ledge>([layout.start]);
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
    const where = `${road} move ${i} (${move.toward} ${move.jump} to ${move.to.x},${move.to.y})`;
    if (r.outcome !== 'landed') return { bandSteps, stood, failed: `${where} ${r.outcome} (at ${s.x.toFixed(0)},${s.y.toFixed(0)} grounded ${s.grounded}${wait === null ? ', no launch found' : ''})`, waited };
    standing = move.to;
    stood.add(standing);
  }
  return { bandSteps, stood, failed: null, waited };
}

const ms = (steps: number) => steps * CLIMB_STEP_MS;
const floorsFrom = (bandSteps: number[]) => bandSteps.map((n) => Math.floor((ms(n) * (1 - CLIMB_FLOOR_MARGIN)) / 100) * 100);
/** The brisk window per band: the high road's time through the band times the factor, up to 100 ms; 0 where the band's high road needs no double jump (or there is none). */
const briskFrom = (layout: Layout, bandSteps: number[]) =>
  bandSteps.map((n, i) => {
    const lo = i === 0 ? 0 : layout.bandLines[i - 1]!;
    const gamble = ROUTES[layout.id]!.high.some((m) => m.to.road === 'high' && m.to.y > lo && m.to.y < layout.bandLines[i]! && m.jump !== 'single');
    const segment = ms(n) - (i === 0 ? 0 : ms(bandSteps[i - 1]!));
    return gamble ? Math.ceil((segment * CLIMB_BRISK_FACTOR) / 100) * 100 : 0;
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

describe('the obstacles', () => {
  const layout = LAYOUTS['city-1']!;
  const night = NIGHTS.medium!;

  it('hangs no lantern where an owl can stand, at any moment of its swing', () => {
    for (const l of layout.lanterns) {
      const reach = l.len + LANTERN_R + OWL_H;
      let touched: string | null = null;
      for (const p of platforms(layout)) {
        if (Math.abs(p.y - l.y) > reach) continue;
        for (let x = p.x + OWL_W / 2; x <= p.x + p.w - OWL_W / 2 + 0.01 && !touched; x += 3) {
          for (let t = 0; t < l.periodMs && !touched; t += 10) {
            const b = lanternBob(l, t);
            if (lanternTouches(b.x, b.y, x, p.y)) touched = `lantern at (${l.x}, ${l.y}) touches an owl standing at (${x}, ${p.y}) at t ${t}`;
          }
        }
      }
      expect(touched).toBeNull();
      expect(l.len * Math.sin(l.amp)).toBeGreaterThan(20);
      expect(l.periodMs).toBeGreaterThanOrEqual(1500);
    }
  });

  it('keeps bands 1 and 2 clear of obstacles, and stacks them from band 3 up', () => {
    const lo = (y: number) => layout.bandLines.findIndex((line) => y < line) + 1;
    for (const l of layout.lanterns) expect(lo(l.y), `lantern at ${l.y}`).toBeGreaterThanOrEqual(3);
    for (const w of layout.winds) expect(lo(w.y0 + 1), `wind from ${w.y0}`).toBeGreaterThanOrEqual(4);
    for (const l of layout.ledges) if (l.frail) expect(lo(l.y), `frail ledge at ${l.y}`).toBeGreaterThanOrEqual(4);
    // Frail glass is the high road's gamble, never the stairs'.
    for (const l of layout.ledges) if (l.frail) expect(l.road).toBe('high');
    // Every band from 3 has a lantern; from 4 a wind and frail glass; the winds alternate sides and grow.
    for (let b = 3; b <= BAND_COUNT; b++) expect(layout.lanterns.some((l) => lo(l.y) === b), `band ${b} has a lantern`).toBe(true);
    for (let b = 4; b <= BAND_COUNT; b++) {
      expect(layout.winds.some((w) => lo(w.y0 + 1) === b), `band ${b} has a wind`).toBe(true);
      expect(layout.ledges.some((l) => l.frail && lo(l.y) === b), `band ${b} has frail glass`).toBe(true);
    }
    for (let i = 1; i < layout.winds.length; i++) {
      expect(Math.sign(layout.winds[i]!.drift)).toBe(-Math.sign(layout.winds[i - 1]!.drift));
      expect(Math.abs(layout.winds[i]!.drift)).toBeGreaterThan(Math.abs(layout.winds[i - 1]!.drift));
    }
  });

  it('gusts and lulls on one clock, and carries only an airborne owl', () => {
    expect(gusting(0)).toBe(true);
    expect(gusting(GUST_PERIOD_MS - 1)).toBe(false);
    expect(lullIn(0).wait).toBeGreaterThan(0);
    expect(lullIn(GUST_PERIOD_MS - 100)).toEqual({ wait: 0, left: 100 });
    const w = layout.winds[0]!;
    expect(windAt(layout, w.y0 + 10, 0)).toBe(w.drift);
    expect(windAt(layout, w.y0 - 10, 0)).toBe(0);
    expect(windAt(layout, w.y0 + 10, GUST_PERIOD_MS - 1)).toBe(0);
    const all = platforms(layout);
    const line = layout.bandLines[3]!;
    // Standing on the balcony in a gust: no carry. In the air above it: carried downwind.
    let s: ClimbState = { ...startState(layout), x: 240, y: line, band: 4 };
    for (let i = 0; i < 60; i++) s = stepClimb(s, NO_INPUT, layout, night, all);
    expect(s.x).toBe(240);
    s = { ...startState(layout), x: 240, y: line + 1, grounded: false, band: 4 };
    s = stepClimb(s, NO_INPUT, layout, night, all);
    expect(Math.sign(s.x - 240)).toBe(Math.sign(layout.winds[1]!.drift));
  });

  it('lets frail glass give way after FRAIL_MS, with one flap left', () => {
    const all = platforms(layout);
    const weak = layout.ledges.find((l) => l.frail)!;
    let s: ClimbState = { ...startState(layout), x: weak.x + weak.w / 2, y: weak.y, band: 3 };
    let gave: ClimbState | null = null;
    for (let i = 0; i < 200 && !gave; i++) {
      s = stepClimb(s, NO_INPUT, layout, night, all);
      if (s.crumbled) gave = s;
    }
    expect(gave?.crumbled).toBe(weak);
    expect(gave!.t).toBeGreaterThanOrEqual(FRAIL_MS);
    expect(gave!.t).toBeLessThan(FRAIL_MS + 3 * CLIMB_STEP_MS);
    expect(gave!.grounded).toBe(false);
    expect(gave!.jumpsUsed).toBe(1);
    // The flap: a press in the fall lifts the owl again.
    const flapped = stepClimb(gave!, { ...NO_INPUT, jumpPressed: true, jumpHeld: true }, layout, night, all);
    expect(flapped.vy).toBeGreaterThan(0);
    expect(flapped.jumpsUsed).toBe(2);
    // Sound glass under the owl too: it holds.
    const sound = layout.ledges.find((l) => !l.frail)!;
    s = { ...startState(layout), x: sound.x + sound.w / 2, y: sound.y };
    for (let i = 0; i < 200; i++) s = stepClimb(s, NO_INPUT, layout, night, all);
    expect(s.grounded).toBe(true);
  });

  it('knocks an owl a lantern touches: down, aside, controls dead for KNOCK_STUN_MS, no jump left', () => {
    const all = platforms(layout);
    const l = layout.lanterns[0]!;
    const b = lanternBob(l, 0);
    // The owl in the air with its chest at the glass.
    let s: ClimbState = { ...startState(layout), x: b.x + 10, y: b.y - OWL_H / 2, vy: 300, grounded: false, jumpsUsed: 1, band: 2 };
    s = stepClimb(s, { left: true, right: false, jumpPressed: true, jumpHeld: true }, layout, night, all);
    expect(s.stunMs).toBe(KNOCK_STUN_MS);
    expect(s.vx).toBeGreaterThan(0);
    expect(s.vy).toBeLessThan(0);
    expect(s.jumpsUsed).toBe(2);
    // Stunned: the keys do nothing, the owl keeps falling and drifting; the stun runs out.
    const after = stepClimb(s, { left: true, right: false, jumpPressed: true, jumpHeld: true }, layout, night, all);
    expect(after.vx).toBeGreaterThan(0);
    expect(after.vy).toBeLessThan(s.vy);
    expect(after.stunMs).toBeLessThan(s.stunMs);
    let n = 0;
    while (s.stunMs > 0 && n++ < 100) s = stepClimb(s, NO_INPUT, layout, night, all);
    // The steps are 8.33 ms: the stun ends on the 54th, or the 55th when the arithmetic leaves a hair.
    expect(n).toBeGreaterThanOrEqual(Math.round(KNOCK_STUN_MS / CLIMB_STEP_MS));
    expect(n).toBeLessThanOrEqual(Math.round(KNOCK_STUN_MS / CLIMB_STEP_MS) + 1);
  });

  it('lets the pilot find a launch past a lantern from the ledge under it', () => {
    const all = platforms(layout);
    const from = layout.ledges.find((l) => l.x === 0 && l.y === 2340)!;
    const to = layout.ledges.find((l) => l.x === 320 && l.y === 2520)!;
    const move = ROUTES['city-1']!.stairs.find((m) => m.to === to)!;
    let waits = 0;
    for (let t0 = 0; t0 < 2400; t0 += 200) {
      const s: ClimbState = { ...startState(layout), x: from.x + from.w / 2, y: from.y, t: t0, band: 2 };
      const wait = waitToLaunch(s, from, move, layout, night, all);
      expect(wait, `from t ${t0}`).not.toBeNull();
      waits += wait!;
      expect(playMove(s, pilotFor(from, move, wait!), layout, night, all).outcome).toBe('landed');
    }
    expect(waits).toBeGreaterThan(0);
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
      expect(CLIMB_FLOORS['city-1']![tier], `CLIMB_FLOORS['city-1'].${tier} must be [${floors.join(', ')}] (stairs ${times(stairs.bandSteps)} ms, waited ${Math.round(ms(stairs.waited))}; high road ${times(high.bandSteps)} ms, waited ${Math.round(ms(high.waited))})`).toEqual(floors);
      expect(CLIMB_BRISK['city-1']![tier], `CLIMB_BRISK['city-1'].${tier} must be [${brisk.join(', ')}]`).toEqual(brisk);
      // A brisk window is wider than the high road's own time, and the stairs do not make it even a
      // quarter quicker than the script (a player need not wait to face a jump as the driver does).
      for (let b = 2; b < BAND_COUNT; b++) {
        expect(brisk[b]!).toBeGreaterThan(ms(high.bandSteps[b]! - high.bandSteps[b - 1]!));
        expect(brisk[b]! * 1.25, `band ${b + 1}: the stairs are not brisk`).toBeLessThan(ms(stairs.bandSteps[b]! - stairs.bandSteps[b - 1]!));
      }
      expect(brisk[0]).toBe(0);
      expect(brisk[1], 'band 2: a column of single jumps is no gamble').toBe(0);
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
    expect(briskMs(night, 2)).toBe(0);
    expect(briskMs(night, 3)).toBeGreaterThan(0);
    expect(briskMs({ ...night, layout: 'nowhere' }, 2)).toBe(0);
  });
});
