/**
 * The stained-glass climb (designs/the-stained-glass-climb.md): a solo platformer up a city of
 * backlit glass, played on the page and judged by the room server against the least time each
 * height band can honestly take. Everything both sides must agree on lives here, with no platform
 * code: the physics and its constants, the layout as data, the nights the moon and the keepers
 * choose between, the scripted route the floor test runs, and the floors it froze.
 *
 * TODO-DOCS: docs/ACTIVITIES.md gets a section for the climb (the portal, the bands, the moon).
 */
import { BAND_COUNT } from './edge';

export { BAND_COUNT };

// ---------- constants ----------

/** One simulation step: the arcade's pace, so a run plays the same on every device. */
export const CLIMB_STEP_MS = 1000 / 120;
/** The field's width in field pixels; the page fits it to the device, portrait and letterboxed. */
export const CLIMB_FIELD_W = 480;
/** The owl's collision box, with (x, y) its bottom centre. */
export const OWL_W = 36;
export const OWL_H = 44;
export const RUN_ACCEL = 1800;
export const RUN_SPEED = 220;
export const GRAVITY = 1400;
export const MAX_FALL = 900;
export const JUMP_IMPULSE = 650;
export const JUMP_CUT_SPEED = 200;
export const DOUBLE_JUMP_IMPULSE = 520;
export const COYOTE_MS = 80;
export const JUMP_BUFFER_MS = 80;
export const GLIDE_SPEED = 180;
// The obstacles (Appendix A of the design, second pass): swinging lanterns, gusts and frail glass.
/** A lantern's glass is this wide across (its hit circle's radius, field px). */
export const LANTERN_R = 18;
/** The owl's box is this much smaller on every side when a lantern is tested against it: a graze is forgiven. */
export const KNOCK_INSET = 4;
/** A lantern's knock throws the owl aside at this speed, downward, with its controls dead for KNOCK_STUN_MS. */
export const KNOCK_SPEED = 240;
export const KNOCK_STUN_MS = 450;
/** A gust blows for GUST_ON_MS, then the air is still for GUST_OFF_MS; every wind of a layout keeps the one phase, from the run's start. */
export const GUST_ON_MS = 900;
export const GUST_OFF_MS = 1700;
export const GUST_PERIOD_MS = GUST_ON_MS + GUST_OFF_MS;
/** Frail glass gives way this long after the owl lands on it; the owl keeps one flap (the double jump) on the way down. */
export const FRAIL_MS = 600;
/** The owl's height in the view, as a fraction of it. */
export const CLIMB_CAMERA_ANCHOR = 0.58;
/** Slack for the clocks, as the arcade's: the page starts after the server and the answer has a trip to make. */
export const CLIMB_SLACK_MS = 1000;
/** A run is forgotten this long after it started. */
export const CLIMB_RUN_MAX_MS = 60 * 60_000;
/** A floor is the scripted route's time to the band less this fraction. */
export const CLIMB_FLOOR_MARGIN = 0.2;
/** Band rows older than this are swept. */
export const CLIMB_ROW_KEEP_DAYS = 30;
/** Feathers per band, paid once a park day each: ten in all for the clouds. */
export const BAND_FEATHERS: readonly number[] = [1, 1, 2, 2, 2, 2];
/**
 * One more feather for a storey climbed briskly: within the high road's time and a tenth, in the
 * bands whose high road asks for the double jump (3 to 6). Band 2's high road is a column of single
 * jumps, no gamble, so it pays none; nor does band 1, which has no high road.
 */
export const BRISK_FEATHERS = 1;
/** The brisk window is the high road's time through the band, times this. */
export const CLIMB_BRISK_FACTOR = 1.1;
/** Visitor-facing names (defaults for the owner's approval). */
export const BAND_NAMES: readonly string[] = ['First storey', 'Second storey', 'Third storey', 'Fourth storey', 'Fifth storey', 'The clouds'];

// ---------- structs ----------

/** A one-way platform: the owl passes it from below and lands on its top surface at `y`. */
export interface Ledge {
  x: number;
  y: number;
  w: number;
  /** The high road: a narrow ledge at the limit of a move, skipping the stairs' steps. Absent on the stairs and the band lines. */
  road?: 'high';
  /** Frail glass: it gives way FRAIL_MS after the owl lands on it, and is whole again once the owl has gone. */
  frail?: true;
}

/** A wind: the air between two field heights, where a gust carries anything airborne sideways. */
export interface Wind {
  y0: number;
  y1: number;
  /** The gust's carry, px/s, east when positive. */
  drift: number;
}

/** A lantern on a chain, swinging across a gap: its knock throws the owl down. */
export interface Lantern {
  /** The chain's hook. */
  x: number;
  y: number;
  /** The chain's length. */
  len: number;
  /** Half the swing, radians. */
  amp: number;
  periodMs: number;
  /** Where in its swing it hangs at t = 0, as a fraction of a period. */
  phase: number;
}

export interface Layout {
  id: string;
  ledges: readonly Ledge[];
  /** The six band lines, lowest first; the last is the cloud line. Each is a ledge spanning the field. */
  bandLines: readonly number[];
  start: Ledge;
  winds: readonly Wind[];
  lanterns: readonly Lantern[];
}

export type Tier = 'easy' | 'medium' | 'hard';
export const TIERS: readonly Tier[] = ['easy', 'medium', 'hard'];

export interface Night {
  key: string;
  layout: string;
  tier: Tier;
  /** The one night parameter: how fast a gliding owl sinks (px/s). */
  glideFall: number;
}

export interface ClimbInput {
  left: boolean;
  right: boolean;
  /** True on the step the jump button went down. */
  jumpPressed: boolean;
  /** True while it is down. */
  jumpHeld: boolean;
}

export interface ClimbState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  coyoteMs: number;
  bufferMs: number;
  jumpsUsed: 0 | 1 | 2;
  rising: boolean;
  gliding: boolean;
  /** The highest band reached this run (0 before the first line). */
  band: number;
  /** Time since this play of the run began, ms: the lanterns and the gusts keep to it. */
  t: number;
  /** How long the owl has stood on its platform, ms (frail glass counts it). */
  stoodMs: number;
  /** Time left with the controls dead after a lantern's knock. */
  stunMs: number;
  /** The frail ledge that gave way under the owl this step, for the page to show. */
  crumbled: Ledge | null;
}

export const NO_INPUT: ClimbInput = { left: false, right: false, jumpPressed: false, jumpHeld: false };

/** The owl on the start ledge, at its centre. */
export function startState(layout: Layout): ClimbState {
  return { x: layout.start.x + layout.start.w / 2, y: layout.start.y, vx: 0, vy: 0, grounded: true, coyoteMs: COYOTE_MS, bufferMs: 0, jumpsUsed: 0, rising: false, gliding: false, band: 0, t: 0, stoodMs: 0, stunMs: 0, crumbled: null };
}

// ---------- the layout ----------

const ledge = (x: number, y: number, w: number): Ledge => ({ x, y, w });
const high = (x: number, y: number, w: number): Ledge => ({ x, y, w, road: 'high' });
const frail = (x: number, y: number, w: number): Ledge => ({ x, y, w, road: 'high', frail: true });
const lantern = (x: number, y: number, len: number, amp: number, periodMs: number, phase = 0): Lantern => ({ x, y, len, amp, periodMs, phase });

/**
 * `city-1`: six bands of 900 px, each a storey of the tower with a balcony (the band line) at its top.
 * From band 2 up every band has two roads. The stairs zigzag across the field on wide ledges in
 * small steps, with a run between jumps; they forgive a short jump, and in bands 5 and 6 they are
 * the glide across the open field. The high road goes straight up a column of narrow ledges in the
 * gap the stairs leave, with no run between jumps but the full height of each one (a double jump
 * needs its second press at the apex) and a narrow landing every time; it is the faster way up a
 * storey, and a storey climbed within its time pays a brisk feather. Missing the high road lands on
 * the stairs or the balcony below: the price is time, never the run. Each band teaches one thing:
 * 1 single jumps; 2 narrower ledges and a step straight up; 3 the double jump; 4 the double jump on
 * narrower ledges; 5 the glide across the field; 6 the same, narrower.
 *
 * The obstacles come in from band 3, one kind a band, and stack: lanterns swing across the gaps
 * from band 3 (a knock throws the owl down to whatever is below); gusts blow through bands 4 to 6,
 * each band's wind from one side and a little stronger, with lulls to jump in; the high road's
 * glass is frail from band 4 (land, and jump again within FRAIL_MS). Nothing hangs where an owl
 * can stand: climb.test.ts checks every lantern's whole swing against every standing spot.
 */
const CITY_1: Layout = {
  id: 'city-1',
  bandLines: [900, 1800, 2700, 3600, 4500, 5400],
  start: ledge(0, 0, CLIMB_FIELD_W),
  ledges: [
    // Band 1, the steps: single jumps, 128 px up, 80 px across. No high road: the band teaches the jump.
    ledge(0, 128, 160),
    ledge(240, 256, 160),
    ledge(0, 384, 160),
    ledge(240, 512, 160),
    ledge(0, 640, 160),
    ledge(240, 768, 160),
    // Band 2, narrowing: the ledges thin to 120, the gap grows to 100, and the last step is straight up.
    ledge(0, 1028, 140),
    ledge(240, 1156, 140),
    ledge(0, 1284, 120),
    ledge(220, 1412, 120),
    ledge(0, 1540, 120),
    ledge(30, 1680, 120),
    // Its high road: a column of 100-wide ledges 140 px apart up the right-hand edge, single jumps.
    high(380, 1040, 100),
    high(380, 1180, 100),
    high(380, 1320, 100),
    high(380, 1460, 100),
    high(380, 1600, 100),
    high(380, 1740, 100),
    // Band 3, the double jump: 180 px up, 160 across.
    ledge(0, 1980, 160),
    ledge(320, 2160, 160),
    ledge(0, 2340, 160),
    ledge(320, 2520, 160),
    // Its high road: 240 px straight up the middle, three times; the second press must come at the apex.
    high(190, 2040, 100),
    high(190, 2280, 100),
    high(190, 2520, 100),
    // Band 4, the double jump on narrower ledges: 180 px up, 160 across, 140 wide.
    ledge(0, 2880, 140),
    ledge(300, 3060, 140),
    ledge(0, 3240, 140),
    ledge(300, 3420, 140),
    // Its high road: 240 px up on 80-wide ledges.
    high(200, 2940, 80),
    high(200, 3180, 80),
    frail(200, 3420, 80),
    // Band 5, the glide: 200 px up and 200 across on 140-wide ledges, a double jump at the edge and a glide.
    ledge(0, 3800, 140),
    ledge(340, 4000, 140),
    ledge(0, 4200, 140),
    ledge(340, 4400, 140),
    // Its high road: 225 px up on 80-wide ledges, the double jump's whole height each time.
    high(200, 3825, 80),
    frail(200, 4050, 80),
    frail(200, 4275, 80),
    // Band 6, the clouds: the glide on 130-wide ledges, and the high road on 70-wide ones.
    ledge(0, 4700, 130),
    ledge(330, 4900, 130),
    ledge(0, 5100, 130),
    ledge(330, 5300, 130),
    frail(205, 4725, 70),
    frail(205, 4950, 70),
    frail(205, 5175, 70),
  ],
  winds: [
    // Band 4 blows from the east, 5 from the west, 6 from the east again, each a little harder.
    { y0: 2700, y1: 3600, drift: -40 },
    { y0: 3600, y1: 4500, drift: 55 },
    { y0: 4500, y1: 5400, drift: -70 },
  ],
  lanterns: [
    // The gap lanterns hang under the high road's ledges and swing through the air both roads cross;
    // the balcony lanterns hang under a balcony, over a road's last jump up to it.
    // Band 3: one gap lantern.
    lantern(240, 2505, 45, 1.0, 2400),
    // Band 4: a gap lantern, and a balcony lantern over the stairs' last jump.
    lantern(240, 3405, 45, 1.0, 2200),
    lantern(330, 3516, 30, 0.9, 2200, 0.5),
    // Band 5: a gap lantern, and a balcony lantern over the high road's last jump, swinging faster.
    lantern(240, 4260, 45, 1.0, 2000),
    lantern(240, 4416, 60, 0.9, 2000, 0.5),
    // Band 6: two gap lanterns and a balcony lantern over the high road's last jump, the fastest.
    lantern(240, 4921, 40, 1.0, 1800, 0.25),
    lantern(240, 5160, 45, 1.0, 1800),
    lantern(240, 5316, 60, 0.9, 1800, 0.5),
  ],
};;;

export const LAYOUTS: Readonly<Record<string, Layout>> = { 'city-1': CITY_1 };

/** Every platform of a layout, lowest first: the start, the ledges of both roads and the band lines. */
export function platforms(layout: Layout): Ledge[] {
  const lines = layout.bandLines.map((y) => ledge(0, y, CLIMB_FIELD_W));
  return [layout.start, ...layout.ledges, ...lines].sort((a, b) => a.y - b.y || a.x - b.x);
}

export type Road = 'stairs' | 'high';

/**
 * The platforms of one road, lowest first: the start, the band lines, and in each band the road's
 * ledges (the stairs' where a band has no high road, such as band 1).
 */
export function roadPlatforms(layout: Layout, road: Road): Ledge[] {
  const lines = layout.bandLines.map((y) => ledge(0, y, CLIMB_FIELD_W));
  const out: Ledge[] = [layout.start];
  let floor = layout.start.y;
  for (const line of lines) {
    const inBand = layout.ledges.filter((l) => l.y > floor && l.y < line.y);
    const own = inBand.filter((l) => (l.road === 'high') === (road === 'high'));
    out.push(...(own.length ? own : inBand.filter((l) => !l.road)), line);
    floor = line.y;
  }
  return out.sort((a, b) => a.y - b.y || a.x - b.x);
}

// ---------- nights ----------

/** The three regular nights are the moon's tiers; special nights are added here when one is designed. */
export const NIGHTS: Readonly<Record<string, Night>> = {
  easy: { key: 'easy', layout: 'city-1', tier: 'easy', glideFall: 90 },
  medium: { key: 'medium', layout: 'city-1', tier: 'medium', glideFall: 130 },
  hard: { key: 'hard', layout: 'city-1', tier: 'hard', glideFall: 170 },
};

export function isNightKey(v: unknown): v is string {
  return typeof v === 'string' && Object.hasOwn(NIGHTS, v);
}

export function layoutOf(night: Night): Layout {
  return LAYOUTS[night.layout]!;
}

// ---------- the obstacles ----------

/** Whether a gust blows at time `t` (ms since the run's play began). */
export function gusting(t: number): boolean {
  return ((t % GUST_PERIOD_MS) + GUST_PERIOD_MS) % GUST_PERIOD_MS < GUST_ON_MS;
}

/** How long until the air is still at `t` (0 in a lull), and how much of the lull is left then. */
export function lullIn(t: number): { wait: number; left: number } {
  const at = ((t % GUST_PERIOD_MS) + GUST_PERIOD_MS) % GUST_PERIOD_MS;
  return at < GUST_ON_MS ? { wait: GUST_ON_MS - at, left: GUST_OFF_MS } : { wait: 0, left: GUST_PERIOD_MS - at };
}

/** The wind's carry at a field height, px/s east: the gust's drift while it blows, else 0. */
export function windAt(layout: Layout, y: number, t: number): number {
  if (!gusting(t)) return 0;
  let drift = 0;
  for (const w of layout.winds) if (y >= w.y0 && y < w.y1) drift += w.drift;
  return drift;
}

/** The wind that covers a field height, whether or not it blows now. */
export function windOver(layout: Layout, y: number): Wind | null {
  return layout.winds.find((w) => y >= w.y0 && y < w.y1) ?? null;
}

/** Where a lantern's glass hangs at time `t`. */
export function lanternBob(l: Lantern, t: number): { x: number; y: number } {
  const a = l.amp * Math.sin(2 * Math.PI * (t / l.periodMs + l.phase));
  return { x: l.x + l.len * Math.sin(a), y: l.y - l.len * Math.cos(a) };
}

/** Whether a lantern's glass, at (bx, by), touches the owl whose feet are at (x, y). */
export function lanternTouches(bx: number, by: number, x: number, y: number): boolean {
  const x0 = x - OWL_W / 2 + KNOCK_INSET;
  const x1 = x + OWL_W / 2 - KNOCK_INSET;
  const y0 = y + KNOCK_INSET;
  const y1 = y + OWL_H - KNOCK_INSET;
  const nx = Math.min(x1, Math.max(x0, bx));
  const ny = Math.min(y1, Math.max(y0, by));
  return (nx - bx) ** 2 + (ny - by) ** 2 < LANTERN_R ** 2;
}

// ---------- the simulation ----------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const overlaps = (x: number, p: Ledge) => x - OWL_W / 2 < p.x + p.w && x + OWL_W / 2 > p.x;

/** One fixed step, as designs/the-stained-glass-climb.md Appendix A orders it. A pure function of its inputs. */
export function stepClimb(s: ClimbState, input: ClimbInput, layout: Layout, night: Night, all: readonly Ledge[] = platforms(layout)): ClimbState {
  const dt = CLIMB_STEP_MS / 1000;
  let { x, y, vx, vy, grounded, coyoteMs, bufferMs, jumpsUsed, rising, gliding, band, stoodMs, stunMs } = s;
  const wasGrounded = grounded;
  let crumbled: Ledge | null = null;
  // 0. The clock, and the knock's stun: a stunned owl's controls are dead.
  const t = s.t + CLIMB_STEP_MS;
  stunMs = Math.max(0, stunMs - CLIMB_STEP_MS);
  if (stunMs > 0) input = NO_INPUT;
  // 1. Timers.
  coyoteMs = grounded ? COYOTE_MS : Math.max(0, coyoteMs - CLIMB_STEP_MS);
  bufferMs = input.jumpPressed ? JUMP_BUFFER_MS : Math.max(0, bufferMs - CLIMB_STEP_MS);
  // 2. Horizontal.
  const want = input.left === input.right ? 0 : input.left ? -RUN_SPEED : RUN_SPEED;
  const dv = RUN_ACCEL * dt;
  vx = vx < want ? Math.min(want, vx + dv) : Math.max(want, vx - dv);
  if (gliding) vx = clamp(vx, -GLIDE_SPEED, GLIDE_SPEED);
  // 3. Jump.
  if (bufferMs > 0 && (coyoteMs > 0 || jumpsUsed === 1)) {
    vy = jumpsUsed === 1 ? DOUBLE_JUMP_IMPULSE : JUMP_IMPULSE;
    jumpsUsed = jumpsUsed === 1 ? 2 : 1;
    grounded = false;
    rising = true;
    gliding = false;
    bufferMs = 0;
    coyoteMs = 0;
  }
  // 4. Jump cut.
  if (rising && vy > 0 && !input.jumpHeld) {
    vy = Math.min(vy, JUMP_CUT_SPEED);
    rising = false;
  }
  // 5. Glide.
  gliding = input.jumpHeld && vy <= 0 && jumpsUsed === 2 && !grounded;
  // 6. Vertical.
  if (gliding) vy = -night.glideFall;
  else vy = Math.max(-MAX_FALL, vy - GRAVITY * dt);
  if (vy <= 0) rising = false;
  // 7. Move and collide. A gust carries an airborne owl sideways.
  const carry = grounded ? 0 : windAt(layout, y, t);
  x = clamp(x + (vx + carry) * dt, OWL_W / 2, CLIMB_FIELD_W - OWL_W / 2);
  const oldY = y;
  y += vy * dt;
  if (vy < 0) {
    let landed: Ledge | null = null;
    for (const p of all) if (overlaps(x, p) && oldY >= p.y && y < p.y && (!landed || p.y > landed.y)) landed = p;
    if (landed) {
      y = landed.y;
      vy = 0;
      grounded = true;
      jumpsUsed = 0;
      gliding = false;
    } else grounded = false;
  } else if (grounded) {
    grounded = all.some((p) => Math.abs(p.y - y) < 0.5 && overlaps(x, p));
  }
  stoodMs = grounded ? (wasGrounded ? stoodMs + CLIMB_STEP_MS : 0) : 0;
  // 8. Frail glass: stood on too long, it gives way (unless sound glass also holds the owl); one flap is left.
  if (grounded && stoodMs >= FRAIL_MS) {
    const under = all.filter((p) => Math.abs(p.y - y) < 0.5 && overlaps(x, p));
    const weak = under.find((p) => p.frail);
    if (weak && under.every((p) => p.frail)) {
      crumbled = weak;
      grounded = false;
      stoodMs = 0;
      coyoteMs = 0;
      jumpsUsed = 1;
    }
  }
  // 9. A lantern's knock: thrown aside and down, controls dead for a moment, no jump left.
  if (stunMs === 0) {
    for (const l of layout.lanterns) {
      const b = lanternBob(l, t);
      if (!lanternTouches(b.x, b.y, x, y)) continue;
      stunMs = KNOCK_STUN_MS;
      vx = (x >= b.x ? 1 : -1) * KNOCK_SPEED;
      vy = Math.min(vy, -60);
      grounded = false;
      gliding = false;
      rising = false;
      jumpsUsed = 2;
      coyoteMs = 0;
      break;
    }
  }
  // 10. Band.
  for (let i = layout.bandLines.length; i > band; i--) {
    if (y >= layout.bandLines[i - 1]!) {
      band = i;
      break;
    }
  }
  return { x, y, vx, vy, grounded, coyoteMs, bufferMs, jumpsUsed, rising, gliding, band, t, stoodMs, stunMs, crumbled };
}

// ---------- the routes and the floors ----------

/**
 * One move of a scripted route: toward a side (run to the ledge's end and jump) or `U` (stand under
 * the target and jump straight up), with the kind of jump, to the platform `to`.
 */
export interface RouteMove {
  toward: 'L' | 'R' | 'U';
  jump: 'single' | 'double' | 'double-glide';
  to: Ledge;
}

const overlapsX = (a: Ledge, b: Ledge) => a.x < b.x + b.w && a.x + a.w > b.x;

/** The move from `from` to `to`, by the gap: a single jump rises 150 px, a double 245, a glide carries across the field. */
export function moveBetween(from: Ledge, to: Ledge): RouteMove {
  const gap = to.y - from.y;
  if (to.w === CLIMB_FIELD_W || overlapsX(from, to)) return { toward: 'U', jump: gap <= 140 ? 'single' : 'double', to };
  const toward: 'L' | 'R' = to.x + to.w / 2 > from.x + from.w / 2 ? 'R' : 'L';
  const across = toward === 'R' ? to.x - (from.x + from.w) : from.x - (to.x + to.w);
  const jump: RouteMove['jump'] = gap <= 140 && across <= 100 ? 'single' : across > 170 ? 'double-glide' : 'double';
  return { toward, jump, to };
}

/** A road's route: the move onto each of its platforms above the start. */
export function routeOf(layout: Layout, road: Road): RouteMove[] {
  const list = roadPlatforms(layout, road);
  return list.slice(1).map((p, i) => moveBetween(list[i]!, p));
}

/** The routes the floor test drives through each layout: the stairs, and the high road where a band has one. */
export const ROUTES: Readonly<Record<string, Readonly<Record<Road, readonly RouteMove[]>>>> = {
  'city-1': { stairs: routeOf(CITY_1, 'stairs'), high: routeOf(CITY_1, 'high') },
};

/**
 * The least time to each band, by tier, in ms: the faster road's scripted time less CLIMB_FLOOR_MARGIN,
 * rounded down to 100 ms. climb.test.ts derives them and fails when a constant or the layout moves one.
 */
export const CLIMB_FLOORS: Readonly<Record<string, Readonly<Record<Tier, readonly number[]>>>> = {
  'city-1': {
    easy: [5600, 10000, 13500, 16900, 20600, 25100],
    medium: [5600, 10000, 13500, 16800, 20600, 24400],
    hard: [5600, 10000, 13500, 16800, 20600, 24400],
  },
};

/**
 * The brisk window of each band, by tier, in ms: the high road's scripted time through the band times
 * CLIMB_BRISK_FACTOR, rounded up to 100 ms, in the bands whose high road needs a double jump; 0
 * elsewhere (no bonus there). Derived and frozen by climb.test.ts like the floors, which also checks
 * that the stairs' scripted time is at least a quarter again as long as the window.
 */
export const CLIMB_BRISK: Readonly<Record<string, Readonly<Record<Tier, readonly number[]>>>> = {
  'city-1': {
    easy: [0, 0, 4900, 4700, 5200, 6200],
    medium: [0, 0, 4900, 4600, 5300, 5200],
    hard: [0, 0, 4900, 4600, 5200, 5200],
  },
};

/** The brisk window of `band` under this night (0: the band pays no brisk feather). */
export function briskMs(night: Night, band: number): number {
  return CLIMB_BRISK[night.layout]?.[night.tier]?.[band - 1] ?? 0;
}

/** The least time a run under this night can have reached `band` (1 to BAND_COUNT). */
export function leastClimbMs(night: Night, band: number): number {
  return CLIMB_FLOORS[night.layout]?.[night.tier]?.[band - 1] ?? Infinity;
}

/** Whether a band could honestly have been reached `elapsedMs` (the server's clock) after the run started. */
export function plausibleBand(night: Night, band: number, elapsedMs: number): boolean {
  if (!Number.isInteger(band) || band < 1 || band > BAND_COUNT) return false;
  return elapsedMs >= 0 && elapsedMs <= CLIMB_RUN_MAX_MS && elapsedMs + CLIMB_SLACK_MS >= leastClimbMs(night, band);
}

/** The band line a banked band stands on (0 for none). */
export function bandLine(layout: Layout, band: number): number {
  return band <= 0 ? layout.start.y : (layout.bandLines[band - 1] ?? layout.start.y);
}
