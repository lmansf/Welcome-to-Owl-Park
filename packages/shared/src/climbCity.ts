/**
 * The tower `city-2` (designs/the-stained-glass-climb.md, the fourth pass): six storeys of 1,200 px,
 * each a set piece around one verb and then all of them stacked. From the second storey each storey
 * has two benches, a landing halfway up and the band line at its top, and two strands between
 * them: the intended path (the main road) and the hard strand (the high road), which leaves the
 * path at every bench and rejoins it at the next. Below a landing the path climbs the left and the
 * strand the right; above it they swap, so they cross at every landing. Every hazard belongs to
 * one half of one strand. The routes are authored here, move by move, and the floor test drives
 * them with the pilot under every night.
 *
 *  1. The foot: run, jump, the double, the dash. No hazards, one path.
 *  2. The walls: a shaft kicked wall to wall over thorns, a second from a frail foot; the strand
 *     climbs the tower's own walls past moths.
 *  3. The lanterns: a lantern to time, a gap only a pogo reaches, moths; the strand is a chain of
 *     lanterns pogoed straight up, twice.
 *  4. The moths: corridors under thorn ceilings (no double jump) with moths to hop, left by their
 *     gaps; the strand is a column up the right past moths.
 *  5. Frail glass: staircases of frail ledges crossed by dashes with moths in the gaps; the strand
 *     is frail holds and a pogo off a lantern between them.
 *  6. The clouds: a shaft over thorns, frail dashes among moths, and the clouds; the strand climbs
 *     the tower's wall, then times a moth to a frail hold and a pogo.
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
const pogo = (to: Ledge, toward: 'L' | 'R', jump: RouteMove['jump'] = 'single', vertical = false, at?: number): RouteMove => ({ kind: 'pogo', to, toward, jump, ...(vertical ? { vertical: true } : {}), ...(at !== undefined ? { at } : {}) });
const cross = (to: Ledge, toward: 'L' | 'R'): RouteMove => ({ kind: 'cross', to, toward, jump: 'single' });

export const BAND_H = 1200;
const LINES = [1, 2, 3, 4, 5, 6].map((b) => b * BAND_H);
const [L1, L2, L3, L4, L5, L6] = LINES.map(line) as [Ledge, Ledge, Ledge, Ledge, Ledge, Ledge];
/** A storey's landing: a bench spanning the field halfway up. */
const landing = (y: number): Ledge => ({ x: 0, y, w: W, bench: true });

// ---- Band 1: the foot ----
const s1 = ledge(0, 120, 160);
const s2 = ledge(260, 230, 180);
const s3 = ledge(0, 330, 160);
const s4 = ledge(260, 450, 180);
const s5 = ledge(0, 570, 160);
const s6 = ledge(300, 690, 180);
const s7 = ledge(0, 810, 160);
const s8 = ledge(260, 960, 180);
const s9 = ledge(100, 1060, 160);

// ---- Band 2: the walls ----
const B2 = landing(1800);
const e0 = ledge(160, 1290, 100);
const e1 = ledge(0, 1380, 140);
const e1b = ledge(140, 1450, 80);
const e2 = ledge(280, 1500, 80); // the first shaft's foot; a bed of thorns before it
const e2c = ledge(0, 1710, 240); // the first shaft's top
const e2a = ledge(320, 1900, 80);
const e2b = ledge(140, 1990, 80);
const e3 = frail(0, 2090, 140); // the second shaft's foot: frail glass, no time to think
const e4 = ledge(0, 2310, 120); // the second shaft's top
const h2a = high(380, 1240, 100);
const h2b = high(400, 1930, 80);

// ---- Band 3: the lanterns ----
const B3 = landing(3000);
const l1 = ledge(0, 2520, 120);
const l2 = ledge(180, 2640, 100);
const l3 = ledge(0, 2790, 120);
const l4 = ledge(180, 2900, 100);
const u1 = ledge(180, 3120, 100);
const u2 = ledge(0, 3360, 100); // only a pogo off the lantern under it reaches this one
const u3 = ledge(160, 3450, 120);
const u4 = ledge(0, 3540, 100);

// ---- Band 4: the moths ----
const B4 = landing(4200);
const m0 = ledge(160, 3690, 100);
const m1 = ledge(0, 3770, 120);
const m2 = ledge(180, 3850, 100);
const c1 = ledge(0, 3920, W); // corridor 1, a thorn ceiling over x 0..380, crossed left to right
const x1 = ledge(400, 4130, 80); // its way out, up the right-hand gap
const c2 = ledge(0, 4320, W); // corridor 2, a thorn ceiling over x 100..400, crossed right to left
const x2 = ledge(0, 4560, 80); // its way out, up the left-hand gap
const m8 = ledge(140, 4640, 120);
const m9 = ledge(300, 4720, 100);
const h4a = high(400, 3830, 80);
const h4b = high(400, 4075, 80); // above the corridor's hop, under its exit
const h4d = high(400, 4560, 80); // the strand's way out of corridor 2, up the right-hand gap

// ---- Band 5: frail glass ----
const B5 = landing(5400);
const f0a = ledge(180, 4900, 100);
const f0 = ledge(0, 4990, 120);
const f1 = frail(220, 5090, 80);
const f2 = frail(0, 5200, 80);
const f3 = frail(220, 5310, 80);
const f5 = ledge(0, 5500, 100);
const f6 = frail(200, 5610, 100);
const f7 = frail(0, 5720, 100);
const f8 = frail(200, 5830, 100);
const f9 = ledge(0, 5930, 100);
const h5a = highFrail(320, 4960, 100);
const h5b = highFrail(340, 5300, 100);
const h5c = highFrail(320, 5540, 100);
const h5d = high(340, 5880, 100);

// ---- Band 6: the clouds ----
const B6 = landing(6600);
const g0 = ledge(0, 6070, 100);
const g0b = ledge(180, 6130, 100);
const g1 = ledge(0, 6220, 120);
const g2 = ledge(220, 6300, 120); // the shaft's foot, thorns before it
const g3 = ledge(0, 6510, 300); // the shaft's top
const g4 = ledge(0, 6700, 80);
const g5 = frail(200, 6800, 80);
const g6 = frail(0, 6900, 80);
const g7 = frail(200, 7000, 80);
const g8 = ledge(0, 7100, 100);
const h6a = high(400, 6040, 80);
const h6b = highFrail(340, 6760, 100);
const h6c = high(360, 7100, 100);

const CITY_2: Layout = {
  id: 'city-2',
  bandLines: LINES,
  start: ledge(0, 0, W),
  ledges: [
    s1, s2, s3, s4, s5, s6, s7, s8, s9,
    e0, e1, e1b, e2, e2c, B2, e2a, e2b, e3, e4, h2a, h2b,
    l1, l2, l3, l4, B3, u1, u2, u3, u4,
    m0, m1, m2, c1, x1, B4, c2, x2, m8, m9, h4a, h4b, h4d,
    f0a, f0, f1, f2, f3, B5, f5, f6, f7, f8, f9, h5a, h5b, h5c, h5d,
    g0, g0b, g1, g2, g3, B6, g4, g5, g6, g7, g8, h6a, h6b, h6c,
  ],
  walls: [
    // Band 2: the two shafts, and the tower's own wall for the strand.
    wall(200, 1620, 1700),
    wall(360, 1500, 1710),
    wall(0, 2170, 2290),
    wall(160, 2140, 2300),
    wall(W, 1240, 1800),
    wall(W, 1930, 2400),
    // Band 3: the dividing wall between the path and the strand's chains.
    wall(300, 2600, 2960),
    wall(300, 3050, 3560),
    // Band 5: the same.
    wall(300, 4900, 5360),
    wall(300, 5450, 5960),
    // Band 6: the shaft, the tower's wall, and the dividing wall above the landing.
    wall(220, 6360, 6460),
    wall(380, 6300, 6470),
    wall(W, 6040, 6600),
    wall(300, 6650, 7160),
  ],
  thorns: [
    // Band 2: before the first shaft's foot.
    thorns(240, 1476, 40),
    // Band 4: the corridors' ceilings (no double jump under them).
    thorns(0, 4120, 380),
    thorns(100, 4520, 300),
    // Band 6: before the shaft's foot.
    thorns(192, 6276, 28),
  ],
  moths: [
    // Band 2: across the path's first gap and its hop to the shaft, and across the tower's wall on the strand, twice.
    moth(60, 200, 1350, 120, 0.2),
    moth(200, 300, 1565, 120, 0.3),
    moth(380, 460, 1460, 120),
    moth(370, 450, 2150, 150),
    // Band 3: under the landing, on the path, and across the pogo gap's far side.
    moth(40, 260, 2972, 130, 0.4),
    moth(80, 260, 3425, 130, 0.9),
    // Band 4: one in each corridor, one across the strand's column below the first, two across its way out of the second.
    moth(80, 360, 3950, 160),
    moth(400, 470, 3700, 140),
    moth(120, 400, 4350, 170, 0.5),
    moth(120, 400, 4350, 170, 0),
    moth(400, 470, 4440, 150, 0.2),
    moth(400, 470, 4640, 160, 0.7),
    // Band 5: across the path's gaps.
    moth(40, 260, 5155, 140, 0.1),
    moth(40, 260, 5265, 150, 0.6),
    moth(40, 260, 5565, 150, 0.3),
    moth(40, 260, 5785, 160, 0.8),
    // Band 6: across the path's dash to the shaft, the tower's wall on the strand, the path's frail dashes, and before the strand's frail hold.
    moth(40, 180, 6195, 120, 0.5),
    moth(340, 420, 6250, 120),
    moth(40, 260, 6760, 150, 0.5),
    moth(320, 460, 6680, 150),
  ],
  lanterns: [
    // Band 3: one to time over the path's second gap, one to pogo up to u2, and the strand's two chains.
    lantern(150, 2760, 50, 0.9, 2200),
    lantern(60, 3302, 60, 0.9, 2000, 0.5),
    lantern(420, 2620, 40, 0.5, 2400),
    lantern(360, 2820, 40, 0.5, 2400, 0.3),
    lantern(420, 3220, 40, 0.5, 2400),
    lantern(360, 3420, 40, 0.5, 2400, 0.3),
    // Band 5: the strand's pogo lanterns, beside each frail hold's rise.
    lantern(440, 5130, 40, 0.3, 2200),
    lantern(440, 5710, 40, 0.3, 2200, 0.5),
    // Band 6: one to time on the path's second frail dash, and the strand's last pogo.
    lantern(150, 6960, 50, 0.9, 2200, 0.5),
    lantern(440, 6930, 40, 0.3, 2200),
  ],
  routes: {
    stairs: [
      // 1
      up(s1), run(s2, 'R'), run(s3, 'L'), run(s4, 'R', 'double'), run(s5, 'L', 'double'), dash(s6, 'R'), dash(s7, 'L'), dash(s8, 'R', 'double'), run(s9, 'L'), up(L1),
      // 2
      up(e0), run(e1, 'L'), up(e1b), run(e2, 'R'), climb(e2c, 'R', 'both'), up(B2), up(e2a), run(e2b, 'L'), run(e3, 'L'), climb(e4, 'R', 'both'), up(L2),
      // 3
      up(l1), run(l2, 'R'), run(l3, 'L', 'double'), run(l4, 'R'), up(B3), up(u1), pogo(u2, 'L'), run(u3, 'R'), run(u4, 'L'), up(L3),
      // 4
      up(m0), run(m1, 'L'), run(m2, 'R'), up(c1), cross(c1, 'R'), up(x1, 'double'), up(B4), up(c2), cross(c2, 'L'), up(x2, 'double'), run(m8, 'R'), run(m9, 'R'), up(L4),
      // 5
      up(f0a), run(f0, 'L'), dash(f1, 'R'), dash(f2, 'L'), dash(f3, 'R'), up(B5), up(f5), dash(f6, 'R'), dash(f7, 'L'), dash(f8, 'R'), dash(f9, 'L'), up(L5),
      // 6
      up(g0), run(g0b, 'R'), run(g1, 'L'), dash(g2, 'R'), climb(g3, 'R', 'both'), up(B6), up(g4), dash(g5, 'R'), dash(g6, 'L'), dash(g7, 'R'), dash(g8, 'L'), up(L6),
    ],
    high: [
      // 2
      up(h2a), climb(B2, 'R', 'one'), up(h2b), climb(L2, 'R', 'one'),
      // 3
      pogo(B3, 'R', 'double', true, 420), pogo(L3, 'R', 'double', true, 420),
      // 4
      up(h4a, 'double'), up(h4b, 'double'), up(B4), run(c2, 'R'), up(h4d, 'double'), up(L4, 'double'),
      // 5
      up(h5a, 'double'), pogo(h5b, 'R', 'double', true), up(B5), up(h5c, 'double'), pogo(h5d, 'R', 'double', true), up(L5),
      // 6
      up(h6a), climb(B6, 'R', 'one'), up(h6b, 'double'), pogo(h6c, 'R', 'double', true), up(L6),
    ],
  },
};

export const LAYOUTS: Readonly<Record<string, Layout>> = { 'city-2': CITY_2 };

/**
 * The platforms of one road, lowest first: the start, the band lines, the landings, and in each
 * band the road's ledges (the main road's where a band has no high road, such as band 1).
 */
export function roadPlatforms(layout: Layout, road: Road): Ledge[] {
  const out: Ledge[] = [layout.start];
  let floor = layout.start.y;
  for (const y of layout.bandLines) {
    const inBand = layout.ledges.filter((l) => l.y > floor && l.y < y);
    const own = inBand.filter((l) => l.bench || (l.road === 'high') === (road === 'high'));
    out.push(...(own.some((l) => !l.bench) ? own : inBand.filter((l) => !l.road)), line(y));
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
