/**
 * The tower `city-2` (designs/the-stained-glass-climb.md, Appendix A, third pass): six storeys of
 * 1,200 px, each a set piece around one verb and then all of them stacked, with a bench (the band
 * line) at the top of each. From the second storey every storey has two roads: the main road, and
 * the high road, the risky shortcut that pays the brisk feather. The routes are authored here, move
 * by move, and the floor test drives them with the pilot under every night.
 *
 *  1. The foot: run, jump, the double, the dash. No hazards.
 *  2. The walls: a shaft climbed by kicking between its walls, thorns at its foot; the high road
 *     kicks straight up the tower's own wall past a lantern.
 *  3. The lanterns: timed swings, and a gap crossed only by a pogo off a lantern; the high road is a
 *     pogo chain straight up.
 *  4. The moths: corridors under thorn ceilings (no double jump) with moths to hop over; the high
 *     road is a column of doubles across the moths' tracks.
 *  5. Frail glass: a staircase of frail ledges crossed by dashes with moths in the gaps; the high
 *     road is a frail column with pogo lanterns.
 *  6. The clouds: a shaft with a lantern in it, frail dashes among moths, and the clouds; the high
 *     road kicks up the tower's wall past two lanterns.
 */
import type { Lantern, Layout, Ledge, Moth, Road, RouteMove, Thorns, Wall } from './climb';

const W = 480;
const ledge = (x: number, y: number, w: number): Ledge => ({ x, y, w });
const high = (x: number, y: number, w: number): Ledge => ({ x, y, w, road: 'high' });
const frail = (x: number, y: number, w: number): Ledge => ({ x, y, w, frail: true });
const highFrail = (x: number, y: number, w: number): Ledge => ({ x, y, w, road: 'high', frail: true });
const wall = (x: number, y0: number, y1: number): Wall => ({ x, y0, y1 });
const thorns = (x: number, y: number, w: number, h = 24): Thorns => ({ x, y, w, h });
const moth = (x0: number, x1: number, y: number, speed: number, phase = 0): Moth => ({ x0, x1, y, speed, phase });
const lantern = (x: number, y: number, len: number, amp: number, periodMs: number, phase = 0): Lantern => ({ x, y, len, amp, periodMs, phase });
const line = (y: number): Ledge => ({ x: 0, y, w: W });

const run = (to: Ledge, toward: 'L' | 'R', jump: RouteMove['jump'] = 'single'): RouteMove => ({ kind: 'run', to, toward, jump });
const up = (to: Ledge, jump: RouteMove['jump'] = 'single'): RouteMove => ({ kind: 'U', to, toward: 'R', jump });
const dash = (to: Ledge, toward: 'L' | 'R', jump: RouteMove['jump'] = 'single', dashAfter = false, hold?: number): RouteMove => ({ kind: 'dash', to, toward, jump, dashAfter, ...(hold !== undefined ? { hold } : {}) });
const climb = (to: Ledge, toward: 'L' | 'R', walls: 'both' | 'one'): RouteMove => ({ kind: 'wall', to, toward, jump: 'single', walls });
const pogo = (to: Ledge, toward: 'L' | 'R', jump: RouteMove['jump'] = 'single', vertical = false): RouteMove => ({ kind: 'pogo', to, toward, jump, ...(vertical ? { vertical: true } : {}) });
const cross = (to: Ledge, toward: 'L' | 'R'): RouteMove => ({ kind: 'cross', to, toward, jump: 'single' });

export const BAND_H = 1200;
const LINES = [1, 2, 3, 4, 5, 6].map((b) => b * BAND_H);
const [L1, L2, L3, L4, L5, L6] = LINES.map(line) as [Ledge, Ledge, Ledge, Ledge, Ledge, Ledge];

// ---- Band 1: the foot ----
const s1 = ledge(0, 120, 160);
const s2 = ledge(260, 230, 180);
const s3 = ledge(0, 330, 160);
const s4 = ledge(260, 450, 180);
const s5 = ledge(0, 570, 160);
const s6 = ledge(300, 690, 180);
const s7 = ledge(0, 810, 160);
const s8 = ledge(260, 960, 180);
const s9 = ledge(0, 1060, 160);

// ---- Band 2: the walls ----
const e1 = ledge(0, 1320, 150);
const e2 = ledge(280, 1440, 80); // the shaft's foot, its right half; thorns fill the left
const eTop = ledge(200, 2060, 160);
const e3 = ledge(0, 2200, 140);
const h2a = high(380, 1240, 100);

// ---- Band 3: the lanterns (a wall at x 300 keeps the main road left of the high road's chain) ----
const l1 = ledge(0, 2520, 120);
const l2 = ledge(180, 2640, 100);
const l3 = ledge(0, 2790, 120);
const l4 = ledge(180, 2920, 100);
const l5 = ledge(0, 3160, 100); // only a pogo off the lantern under it reaches this one
const l6 = ledge(180, 3260, 100);
const l7 = ledge(0, 3360, 120);
const l8 = ledge(180, 3450, 100);
const l9 = ledge(0, 3540, 120);
const h3a = high(330, 3420, 120);

// ---- Band 4: the moths ----
const m1 = ledge(0, 3720, 200);
const m2 = ledge(0, 3840, W); // corridor 1, a thorn ceiling over x 0..380, crossed left to right
const x1 = high(400, 4080, 80); // the way out, up the right-hand gap and over the ceiling (both roads)
const m4 = ledge(120, 4100, 160);
const m5 = ledge(0, 4200, W); // corridor 2, the same, crossed left to right
const x2 = high(400, 4440, 80);
const m7 = ledge(120, 4460, 160);
const m8 = ledge(0, 4580, 160);
const m9 = ledge(260, 4700, 160);
const h4a = high(400, 3740, 80);
const h4b = high(400, 3940, 80);
const h4c = high(400, 4260, 80);
const h4e = high(400, 4620, 80);

// ---- Band 5: frail glass (a wall at x 300 again) ----
const f0 = ledge(0, 4920, 120);
const f1 = frail(220, 5040, 80);
const f2 = frail(0, 5160, 80);
const f3 = frail(220, 5280, 80);
const f4 = frail(0, 5400, 80);
const f5 = ledge(200, 5520, 100);
const f6 = ledge(0, 5640, 120);
const f7 = ledge(180, 5760, 120);
const f8 = ledge(0, 5880, 120);
const h5a = highFrail(320, 4960, 100);
const h5b = highFrail(340, 5300, 100);
const h5c = highFrail(320, 5540, 100);
const h5d = high(340, 5880, 100);

// ---- Band 6: the clouds ----
const g1 = ledge(0, 6120, 160);
const g2 = ledge(160, 6160, 160); // the shaft's foot
const gTop = ledge(160, 6760, 160);
const g4 = frail(0, 6880, 80);
const g5 = frail(200, 7000, 80);
const h6a = high(380, 6040, 100);

const CITY_2: Layout = {
  id: 'city-2',
  bandLines: LINES,
  start: ledge(0, 0, W),
  ledges: [
    s1, s2, s3, s4, s5, s6, s7, s8, s9,
    e1, e2, eTop, e3, h2a,
    l1, l2, l3, l4, l5, l6, l7, l8, l9, h3a,
    m1, m2, x1, m4, m5, x2, m7, m8, m9, h4a, h4b, h4c, h4e,
    f0, f1, f2, f3, f4, f5, f6, f7, f8, h5a, h5b, h5c, h5d,
    g1, g2, gTop, g4, g5, h6a,
  ],
  walls: [
    // Band 2: the shaft's two walls, and the tower's own wall for the high road.
    wall(200, 1560, 2060),
    wall(360, 1440, 2100),
    wall(W, 1240, 2360),
    // Bands 3 and 5: the dividing wall between the main road and the high road's chain.
    wall(300, 2460, 3540),
    wall(300, 4860, 5940),
    // Band 6: the shaft, and the tower's wall.
    wall(160, 6220, 6760),
    wall(320, 6160, 6800),
    wall(W, 6040, 7160),
  ],
  thorns: [
    // Band 2: the shaft's foot, left half.
    thorns(200, 1416, 80),
    // Band 4: the corridors' ceilings (no double jump under them).
    thorns(0, 4040, 380),
    thorns(0, 4400, 380),
  ],
  moths: [
    // Band 2: across the tower's wall, on the high road.
    moth(300, 440, 1800, 120),
    // Band 3: across two of the main road's gaps.
    moth(40, 260, 3222, 130, 0.4),
    moth(40, 260, 3425, 140, 0.9),
    // Band 4: one in each corridor, and one across the high road's column above them.
    moth(80, 360, 3870, 160),
    moth(80, 360, 4230, 170, 0.5),
    moth(320, 470, 4530, 150, 0.7),
    // Band 5: across the frail staircase, and the last two gaps.
    moth(40, 260, 5110, 140, 0.1),
    moth(40, 260, 5350, 150, 0.6),
    moth(60, 260, 5702, 150, 0.3),
    moth(40, 260, 5822, 160, 0.8),
    // Band 6: over the shaft's exit, across the frail dashes, and twice across the tower's wall on the high road.
    moth(40, 300, 6830, 150, 0.5),
    moth(40, 300, 6950, 160, 0.3),
    moth(40, 300, 7070, 170, 0.8),
    moth(300, 440, 6400, 120, 0.2),
    moth(300, 440, 6900, 130, 0.7),
  ],
  lanterns: [
    // Band 3: one to time over the first gap, one to pogo up to l5, and the high road's chain, zigzagging at x 360 and 420.
    lantern(150, 2760, 50, 0.9, 2200),
    lantern(60, 3102, 60, 0.9, 2000, 0.5),
    lantern(420, 2600, 40, 0.5, 2400),
    lantern(360, 2760, 40, 0.5, 2400, 0.3),
    lantern(420, 2920, 40, 0.5, 2400, 0.6),
    lantern(360, 3080, 40, 0.5, 2400, 0.1),
    lantern(420, 3240, 40, 0.5, 2400, 0.4),
    // Band 5: the high road's pogo lanterns at x 440, beside the rise from each frail ledge.
    lantern(440, 5130, 40, 0.3, 2200),
    lantern(440, 5710, 40, 0.3, 2200, 0.5),
  ],
  routes: {
    stairs: [
      // 1
      up(s1), run(s2, 'R'), run(s3, 'L'), run(s4, 'R', 'double'), run(s5, 'L', 'double'), dash(s6, 'R'), dash(s7, 'L'), dash(s8, 'R', 'double'), run(s9, 'L'), up(L1),
      // 2
      up(e1), dash(e2, 'R'), climb(eTop, 'R', 'both'), run(e3, 'L', 'double'), up(L2, 'double'),
      // 3
      up(l1), run(l2, 'R'), run(l3, 'L', 'double'), run(l4, 'R'), pogo(l5, 'L'), run(l6, 'R'), run(l7, 'L'), run(l8, 'R'), run(l9, 'L'), up(L3),
      // 4
      up(m1), up(m2), cross(m2, 'R'), up(x1, 'double'), dash(m4, 'L', 'single', false, 60), up(m5), cross(m5, 'R'), up(x2, 'double'), dash(m7, 'L', 'single', false, 60), up(m8), run(m9, 'R'), up(L4),
      // 5
      up(f0), dash(f1, 'R'), dash(f2, 'L'), dash(f3, 'R'), dash(f4, 'L'), dash(f5, 'R'), dash(f6, 'L'), run(f7, 'R'), run(f8, 'L'), up(L5),
      // 6
      up(g1), run(g2, 'R'), climb(gTop, 'R', 'both'), dash(g4, 'L'), dash(g5, 'R'), up(L6, 'double'),
    ],
    high: [
      // 2
      up(h2a), climb(L2, 'R', 'one'),
      // 3
      pogo(h3a, 'R', 'double', true), up(L3, 'double'),
      // 4
      up(h4a), up(h4b, 'double'), up(x1), up(h4c, 'double'), up(x2, 'double'), up(h4e, 'double'), up(L4, 'double'),
      // 5
      up(h5a, 'double'), pogo(h5b, 'R', 'double', true), up(h5c, 'double'), pogo(h5d, 'R', 'double', true), up(L5),
      // 6
      up(h6a), climb(L6, 'R', 'one'),
    ],
  },
};

export const LAYOUTS: Readonly<Record<string, Layout>> = { 'city-2': CITY_2 };

/**
 * The platforms of one road, lowest first: the start, the band lines, and in each band the road's
 * ledges (the main road's where a band has no high road, such as band 1).
 */
export function roadPlatforms(layout: Layout, road: Road): Ledge[] {
  const out: Ledge[] = [layout.start];
  let floor = layout.start.y;
  for (const y of layout.bandLines) {
    const inBand = layout.ledges.filter((l) => l.y > floor && l.y < y);
    const own = inBand.filter((l) => (l.road === 'high') === (road === 'high'));
    out.push(...(own.length ? own : inBand.filter((l) => !l.road)), line(y));
    floor = y;
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The route of one road, a band at a time: the high road's moves in the bands it has them, the main road's elsewhere. */
export function routeOf(layout: Layout, road: Road): RouteMove[] {
  if (road === 'stairs') return [...layout.routes.stairs];
  const out: RouteMove[] = [];
  let floor = layout.start.y;
  for (const y of layout.bandLines) {
    const inBand = (m: RouteMove) => m.to.y > floor && m.to.y <= y;
    const own = layout.routes.high.filter(inBand);
    out.push(...(own.length ? own : layout.routes.stairs.filter(inBand)));
    floor = y;
  }
  return out;
}
