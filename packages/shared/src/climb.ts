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
/** Visitor-facing names (defaults for the owner's approval). */
export const BAND_NAMES: readonly string[] = ['First storey', 'Second storey', 'Third storey', 'Fourth storey', 'Fifth storey', 'The clouds'];

// ---------- structs ----------

/** A one-way platform: the owl passes it from below and lands on its top surface at `y`. */
export interface Ledge {
  x: number;
  y: number;
  w: number;
}

export interface Layout {
  id: string;
  ledges: readonly Ledge[];
  /** The six band lines, lowest first; the last is the cloud line. Each is a ledge spanning the field. */
  bandLines: readonly number[];
  start: Ledge;
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
}

export const NO_INPUT: ClimbInput = { left: false, right: false, jumpPressed: false, jumpHeld: false };

/** The owl on the start ledge, at its centre. */
export function startState(layout: Layout): ClimbState {
  return { x: layout.start.x + layout.start.w / 2, y: layout.start.y, vx: 0, vy: 0, grounded: true, coyoteMs: COYOTE_MS, bufferMs: 0, jumpsUsed: 0, rising: false, gliding: false, band: 0 };
}

// ---------- the layout ----------

const ledge = (x: number, y: number, w: number): Ledge => ({ x, y, w });

/**
 * `city-1`: six bands of 900 px. Bands 1 and 2 are single jumps between 160-wide ledges 80 px apart; 3 and 4 need the double jump; 5 and 6 cross open field on 140-wide ledges that only a glide
 * after the double jump reaches. Each band line is a full-width balcony.
 */
const CITY_1: Layout = {
  id: 'city-1',
  bandLines: [900, 1800, 2700, 3600, 4500, 5400],
  start: ledge(0, 0, CLIMB_FIELD_W),
  ledges: [
    // Band 1: one jump, 128 px up and across.
    ledge(0, 128, 160),
    ledge(240, 256, 160),
    ledge(0, 384, 160),
    ledge(240, 512, 160),
    ledge(0, 640, 160),
    ledge(240, 768, 160),
    // Band 2.
    ledge(0, 1028, 160),
    ledge(240, 1156, 160),
    ledge(0, 1284, 160),
    ledge(240, 1412, 160),
    ledge(0, 1540, 160),
    ledge(240, 1668, 160),
    // Band 3: the double jump, 180 px up.
    ledge(0, 1980, 160),
    ledge(320, 2160, 160),
    ledge(0, 2340, 160),
    ledge(320, 2520, 160),
    // Band 4.
    ledge(0, 2880, 160),
    ledge(320, 3060, 160),
    ledge(0, 3240, 160),
    ledge(320, 3420, 160),
    // Band 5: the double jump then a glide across 200 px of open field, 200 px up.
    ledge(0, 3800, 140),
    ledge(340, 4000, 140),
    ledge(0, 4200, 140),
    ledge(340, 4400, 140),
    // Band 6.
    ledge(0, 4700, 140),
    ledge(340, 4900, 140),
    ledge(0, 5100, 140),
    ledge(340, 5300, 140),
  ],
};

export const LAYOUTS: Readonly<Record<string, Layout>> = { 'city-1': CITY_1 };

/** Every platform of a layout, lowest first: the start, the ledges and the band lines. */
export function platforms(layout: Layout): Ledge[] {
  const lines = layout.bandLines.map((y) => ledge(0, y, CLIMB_FIELD_W));
  return [layout.start, ...layout.ledges, ...lines].sort((a, b) => a.y - b.y || a.x - b.x);
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

// ---------- the simulation ----------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const overlaps = (x: number, p: Ledge) => x - OWL_W / 2 < p.x + p.w && x + OWL_W / 2 > p.x;

/** One fixed step, as designs/the-stained-glass-climb.md Appendix A orders it. A pure function of its inputs. */
export function stepClimb(s: ClimbState, input: ClimbInput, layout: Layout, night: Night, all: readonly Ledge[] = platforms(layout)): ClimbState {
  const dt = CLIMB_STEP_MS / 1000;
  let { x, y, vx, vy, grounded, coyoteMs, bufferMs, jumpsUsed, rising, gliding, band } = s;
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
  // 7. Move and collide.
  x = clamp(x + vx * dt, OWL_W / 2, CLIMB_FIELD_W - OWL_W / 2);
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
  // 8. Band.
  for (let i = layout.bandLines.length; i > band; i--) {
    if (y >= layout.bandLines[i - 1]!) {
      band = i;
      break;
    }
  }
  return { x, y, vx, vy, grounded, coyoteMs, bufferMs, jumpsUsed, rising, gliding, band };
}

// ---------- the route and the floors ----------

/** One move of the scripted route: run toward a side and make this kind of jump to the next platform up. */
export interface RouteMove {
  toward: 'L' | 'R';
  jump: 'single' | 'double' | 'double-glide';
}

/** The route the floor test drives through `city-1`: one move per platform above the start, lowest first. */
export const ROUTES: Readonly<Record<string, readonly RouteMove[]>> = {
  'city-1': platforms(CITY_1)
    .slice(1)
    .map((p, i, list) => {
      const below = i === 0 ? CITY_1.start : list[i - 1]!;
      const line = p.w === CLIMB_FIELD_W;
      const toward: 'L' | 'R' = line ? (below.x === 0 ? 'R' : 'L') : p.x === 0 ? 'L' : 'R';
      const gap = p.y - below.y;
      const jump: RouteMove['jump'] = line ? (gap > 150 ? 'double' : 'single') : p.w === 140 ? 'double-glide' : gap > 150 ? 'double' : 'single';
      return { toward, jump };
    }),
};

/**
 * The least time to each band, by tier, in ms: the scripted route's time less CLIMB_FLOOR_MARGIN,
 * rounded down to 100 ms. climb.test.ts derives them and fails when a constant or the layout moves one.
 */
export const CLIMB_FLOORS: Readonly<Record<string, Readonly<Record<Tier, readonly number[]>>>> = {
  'city-1': {
    easy: [5700, 11300, 17500, 23900, 30200, 36800],
    medium: [5700, 11300, 17500, 23900, 29500, 35500],
    hard: [5700, 11300, 17500, 23900, 29300, 35000],
  },
};

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
