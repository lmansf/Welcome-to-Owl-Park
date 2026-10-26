/**
 * The stained-glass climb (designs/the-stained-glass-climb.md, third pass): a solo platformer up a
 * tower of backlit glass, played on the page and judged by the room server against the least time
 * each storey can honestly take. Everything both sides must agree on lives here, with no platform
 * code: the physics and its constants, the hazards and what they cost, the nights, and the floors
 * the test froze. The tower itself (the layout, its roads and their scripted moves) is climbCity.ts.
 *
 * The kit: a short, heavy jump with a cut, a double jump, a dash, a cling and kick off walls, and
 * the talons-down pogo off a hazard. The stakes: panes of glass for health; a hazard cracks one and
 * thorns send the owl back to its last safe ground; the last pane gone is the shade, which returns
 * the owl to the bench (the balcony) it last stood on with its panes relit. A rest on a bench relights
 * them too. Nothing is ever lost but time.
 *
 * TODO-DOCS: docs/ACTIVITIES.md gets a section for the climb (the portal, the bands, the moon).
 */
import { BAND_COUNT } from './edge';
import { LAYOUTS } from './climbCity';

export { BAND_COUNT };

// ---------- constants ----------

/** One simulation step: the arcade's pace, so a run plays the same on every device. */
export const CLIMB_STEP_MS = 1000 / 120;
/** The field's width in field pixels; the page fits it to the device, portrait and letterboxed. */
export const CLIMB_FIELD_W = 480;
/** The owl's collision box, with (x, y) its bottom centre. */
export const OWL_W = 36;
export const OWL_H = 44;
export const RUN_ACCEL = 2600;
export const RUN_SPEED = 230;
export const GRAVITY = 2600;
export const MAX_FALL = 1150;
/** The jump: 880 px/s rises 149 px in 0.34 s; a release early cuts it to the cut speed. */
export const JUMP_IMPULSE = 880;
export const JUMP_CUT_SPEED = 180;
export const DOUBLE_JUMP_IMPULSE = 760;
export const COYOTE_MS = 90;
export const JUMP_BUFFER_MS = 100;
/** The dash: a burst sideways with no fall, once in the air until the owl lands, clings or pogos. */
export const DASH_SPEED = 640;
export const DASH_MS = 150;
export const DASH_COOLDOWN_MS = 420;
/** Walls: an airborne owl pressing into a wall clings and slides; a press of jump kicks it off. */
export const WALL_SLIDE = 140;
export const WALL_KICK = 240;
export const WALL_JUMP_IMPULSE = 840;
/** After the kick the owl's own steering is dead this long, so it leaves the wall. */
export const WALL_LOCK_MS = 90;
/** The pogo: talons down on a hazard from above throws the owl up again and refills the double jump and the dash. */
export const POGO_IMPULSE = 820;
/** A pane cracked: thrown away from the hazard and up a little, controls dead for the stun, untouchable for the rest. */
export const KNOCK_SPEED = 260;
export const KNOCK_UP = 360;
export const KNOCK_STUN_MS = 300;
export const HURT_MS = 900;
/** The shade: the last pane gone, the owl fades for this long, then stands on its bench again with its panes relit. */
export const SHADE_MS = 900;
/** Standing on a bench this long relights the panes. */
export const REST_MS = 1000;
/** A lantern's glass is this wide across (its hit circle's radius, field px). */
export const LANTERN_R = 18;
/** A glass moth's size (its hit circle's radius). */
export const MOTH_R = 14;
/** The owl's box is this much smaller on every side when a hazard is tested against it: a graze is forgiven. */
export const HIT_INSET = 4;
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
 * bands that have a high road (2 to 6). Band 1 has none and pays none.
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
  /** The high road: a ledge of the risky shortcut up a storey. Absent on the main road and the band lines. */
  road?: 'high';
  /** Frail glass: it gives way FRAIL_MS after the owl lands on it, and is whole again once the owl has gone. */
  frail?: true;
}

/** A wall: a vertical face at `x` between two heights. The owl cannot pass it, and clings to it in the air. */
export interface Wall {
  x: number;
  y0: number;
  y1: number;
}

/** Thorn glass: a bed of shards. Touched, it cracks a pane and sends the owl back to its last safe ground; a pogo off its top is safe. */
export interface Thorns {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A glass moth on a track between two x's at one height, there and back at `speed` px/s (times the night's pace). */
export interface Moth {
  x0: number;
  x1: number;
  y: number;
  speed: number;
  /** Where on its track it is at t = 0, as a fraction of a there-and-back. */
  phase: number;
}

/** A lantern on a chain, swinging across a gap. */
export interface Lantern {
  /** The chain's hook. */
  x: number;
  y: number;
  len: number;
  /** Half the swing, radians. */
  amp: number;
  periodMs: number;
  /** Where in its swing it hangs at t = 0, as a fraction of a period. */
  phase: number;
}

export type Road = 'stairs' | 'high';

/**
 * One move of a scripted route, to the platform `to`:
 *  - `run`: run to the ledge's end facing the move and jump (a double where it says), holding on;
 *  - `U`: stand under the target and jump straight up;
 *  - `dash`: run and jump, dash toward the target at the apex, and double jump after the dash where it says;
 *  - `wall`: jump at the wall on `side` and kick up it; with `walls` both, kick between the two;
 *  - `pogo`: run and jump toward the target, talons down over the hazard on the way, and on again after the bounce;
 *  - `cross`: run along the ledge the owl stands on to its far end, hopping over a moth in the way.
 */
export interface RouteMove {
  kind: 'run' | 'U' | 'dash' | 'wall' | 'pogo' | 'cross';
  to: Ledge;
  toward: 'L' | 'R';
  jump: 'single' | 'double';
  /** `wall`: whether the shaft has a wall on both sides (kick between them) or one (kick off and back). */
  walls?: 'both' | 'one';
  /** `dash`: whether the dash comes before the double jump (the default) or after it. */
  dashAfter?: boolean;
  /** `pogo`: straight up a chain of hazards under the target's middle, rather than across to it. */
  vertical?: true;
  /** How long the jump button is held, ms: a short hop under a ceiling. Absent: through the whole rise. */
  hold?: number;
}

export interface Layout {
  id: string;
  /** The six band lines, lowest first; the last is the cloud line. Each is a ledge spanning the field, and a bench. */
  bandLines: readonly number[];
  start: Ledge;
  ledges: readonly Ledge[];
  walls: readonly Wall[];
  thorns: readonly Thorns[];
  moths: readonly Moth[];
  lanterns: readonly Lantern[];
  routes: Readonly<Record<Road, readonly RouteMove[]>>;
}

export type Tier = 'easy' | 'medium' | 'hard';
export const TIERS: readonly Tier[] = ['easy', 'medium', 'hard'];

export interface Night {
  key: string;
  layout: string;
  tier: Tier;
  /** The owl's panes: how many hazards it can take before the shade. */
  panes: number;
  /** The hazards' pace: the moths' speed and the lanterns' swing, as a multiple. */
  pace: number;
}

export interface ClimbInput {
  left: boolean;
  right: boolean;
  /** Talons down: in the air, a hazard under the owl is pogoed instead of felt. */
  down: boolean;
  /** True on the step the jump button went down. */
  jumpPressed: boolean;
  /** True while it is down. */
  jumpHeld: boolean;
  /** True on the step the dash button went down. */
  dashPressed: boolean;
}

/** What happened this step, for the page to show (one thing a step). */
export type ClimbEvent = 'land' | 'jump' | 'double' | 'dash' | 'cling' | 'kick' | 'pogo' | 'hit' | 'thorns' | 'shade' | 'respawn' | 'rest' | null;

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
  facing: 1 | -1;
  /** Time left in the dash; its cooldown; whether the air dash is spent. */
  dashMs: number;
  dashCooldownMs: number;
  dashUsed: boolean;
  /** Clinging to a wall: +1 when the wall is to the owl's right, -1 to its left, 0 when not. */
  wall: 0 | 1 | -1;
  wallLockMs: number;
  /** The highest band reached this run (0 before the first line). */
  band: number;
  /** Time since this play of the run began, ms: the lanterns and the moths keep to it. */
  t: number;
  /** How long the owl has stood on its platform, ms (frail glass and the benches count it). */
  stoodMs: number;
  /** Panes of glass left; the night sets how many the owl starts with. */
  panes: number;
  /** Time left untouchable after a crack, and with the controls dead. */
  hurtMs: number;
  stunMs: number;
  /** The shade: time left before the owl stands on its bench again (0 when not fading). */
  shadeMs: number;
  /** The bench (band line) the shade returns the owl to: 0 is the start. */
  bench: number;
  /** The last safe ground (sound glass, no hazard): thorns send the owl back here. */
  safeX: number;
  safeY: number;
  /** How many times the shade took the owl this play. */
  shades: number;
  /** The frail ledge that gave way under the owl this step, for the page to show. */
  crumbled: Ledge | null;
  event: ClimbEvent;
}

export const NO_INPUT: ClimbInput = { left: false, right: false, down: false, jumpPressed: false, jumpHeld: false, dashPressed: false };

/** The owl on the start ledge, at its centre, with the night's panes. */
export function startState(layout: Layout, night: Night): ClimbState {
  const x = layout.start.x + layout.start.w / 2;
  return {
    x,
    y: layout.start.y,
    vx: 0,
    vy: 0,
    grounded: true,
    coyoteMs: COYOTE_MS,
    bufferMs: 0,
    jumpsUsed: 0,
    rising: false,
    facing: 1,
    dashMs: 0,
    dashCooldownMs: 0,
    dashUsed: false,
    wall: 0,
    wallLockMs: 0,
    band: 0,
    t: 0,
    stoodMs: 0,
    panes: night.panes,
    hurtMs: 0,
    stunMs: 0,
    shadeMs: 0,
    bench: 0,
    safeX: x,
    safeY: layout.start.y,
    shades: 0,
    crumbled: null,
    event: null,
  };
}

/** Every platform of a layout, lowest first: the start, the ledges of both roads and the band lines. */
export function platforms(layout: Layout): Ledge[] {
  const lines = layout.bandLines.map((y): Ledge => ({ x: 0, y, w: CLIMB_FIELD_W }));
  return [layout.start, ...layout.ledges, ...lines].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The band line a banked band stands on (0 for none). */
export function bandLine(layout: Layout, band: number): number {
  return band <= 0 ? layout.start.y : (layout.bandLines[band - 1] ?? layout.start.y);
}

// ---------- nights ----------

/** The three regular nights are the moon's tiers; special nights are added here when one is designed. */
export const NIGHTS: Readonly<Record<string, Night>> = {
  easy: { key: 'easy', layout: 'city-2', tier: 'easy', panes: 4, pace: 0.9 },
  medium: { key: 'medium', layout: 'city-2', tier: 'medium', panes: 3, pace: 1 },
  hard: { key: 'hard', layout: 'city-2', tier: 'hard', panes: 2, pace: 1.15 },
};

export function isNightKey(v: unknown): v is string {
  return typeof v === 'string' && Object.hasOwn(NIGHTS, v);
}

export function layoutOf(night: Night): Layout {
  return LAYOUTS[night.layout]!;
}

// ---------- the hazards ----------

/** Where a lantern's glass hangs at time `t` under a night's pace. */
export function lanternBob(l: Lantern, t: number, pace = 1): { x: number; y: number } {
  const a = l.amp * Math.sin(2 * Math.PI * ((t * pace) / l.periodMs + l.phase));
  return { x: l.x + l.len * Math.sin(a), y: l.y - l.len * Math.cos(a) };
}

/** Where a moth is on its track at time `t` under a night's pace, and which way it flies. */
export function mothAt(m: Moth, t: number, pace = 1): { x: number; y: number; dir: 1 | -1 } {
  const span = Math.abs(m.x1 - m.x0);
  if (span === 0) return { x: m.x0, y: m.y, dir: 1 };
  const period = (2 * span) / (m.speed * pace);
  const f = ((((t / 1000) * 1) / period + m.phase) % 1 + 1) % 1;
  const along = f < 0.5 ? f * 2 : (1 - f) * 2;
  const dir: 1 | -1 = (f < 0.5) === m.x1 > m.x0 ? 1 : -1;
  return { x: m.x0 + (m.x1 - m.x0) * along, y: m.y, dir };
}

/** Whether a circle of radius `r` at (cx, cy) touches the owl whose feet are at (x, y). */
export function circleTouches(cx: number, cy: number, r: number, x: number, y: number): boolean {
  const x0 = x - OWL_W / 2 + HIT_INSET;
  const x1 = x + OWL_W / 2 - HIT_INSET;
  const y0 = y + HIT_INSET;
  const y1 = y + OWL_H - HIT_INSET;
  const nx = Math.min(x1, Math.max(x0, cx));
  const ny = Math.min(y1, Math.max(y0, cy));
  return (nx - cx) ** 2 + (ny - cy) ** 2 < r * r;
}

/** Whether a rectangle touches the owl whose feet are at (x, y). */
export function rectTouches(rx: number, ry: number, rw: number, rh: number, x: number, y: number): boolean {
  return x - OWL_W / 2 + HIT_INSET < rx + rw && x + OWL_W / 2 - HIT_INSET > rx && y + HIT_INSET < ry + rh && y + OWL_H - HIT_INSET > ry;
}

/** A hazard the owl is touching at (x, y, t), or null: where its middle is (for the knock, and for whether it is under the owl). */
export function hazardAt(layout: Layout, night: Night, x: number, y: number, t: number): { kind: 'lantern' | 'moth' | 'thorns'; cx: number; cy: number } | null {
  for (const l of layout.lanterns) {
    const b = lanternBob(l, t, night.pace);
    if (circleTouches(b.x, b.y, LANTERN_R, x, y)) return { kind: 'lantern', cx: b.x, cy: b.y };
  }
  for (const m of layout.moths) {
    const p = mothAt(m, t, night.pace);
    if (circleTouches(p.x, p.y, MOTH_R, x, y)) return { kind: 'moth', cx: p.x, cy: p.y };
  }
  for (const th of layout.thorns) if (rectTouches(th.x, th.y, th.w, th.h, x, y)) return { kind: 'thorns', cx: th.x + th.w / 2, cy: th.y + th.h / 2 };
  return null;
}

// ---------- the simulation ----------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const overlaps = (x: number, p: Ledge) => x - OWL_W / 2 < p.x + p.w && x + OWL_W / 2 > p.x;
/** The wall's face is in reach of the owl's box at height y: the box spans [y, y + OWL_H]. */
const wallInReach = (w: Wall, y: number) => y < w.y1 && y + OWL_H > w.y0;

/** One fixed step, as designs/the-stained-glass-climb.md Appendix A orders it. A pure function of its inputs. */
export function stepClimb(s: ClimbState, input: ClimbInput, layout: Layout, night: Night, all: readonly Ledge[] = platforms(layout)): ClimbState {
  const dt = CLIMB_STEP_MS / 1000;
  let { x, y, vx, vy, grounded, coyoteMs, bufferMs, jumpsUsed, rising, facing, dashMs, dashCooldownMs, dashUsed, wall, wallLockMs, band, stoodMs, panes, hurtMs, stunMs, shadeMs, bench, safeX, safeY, shades } = s;
  const wasGrounded = grounded;
  let crumbled: Ledge | null = null;
  let event: ClimbEvent = null;
  // 0. The clock and the timers. In the shade nothing moves; when it ends the owl is on its bench.
  const t = s.t + CLIMB_STEP_MS;
  if (shadeMs > 0) {
    shadeMs = Math.max(0, shadeMs - CLIMB_STEP_MS);
    if (shadeMs > 0) return { ...s, t, shadeMs, crumbled: null, event: null };
    x = CLIMB_FIELD_W / 2;
    y = bandLine(layout, bench);
    return {
      ...s,
      x,
      y,
      vx: 0,
      vy: 0,
      grounded: true,
      coyoteMs: COYOTE_MS,
      bufferMs: 0,
      jumpsUsed: 0,
      rising: false,
      dashMs: 0,
      dashCooldownMs: 0,
      dashUsed: false,
      wall: 0,
      wallLockMs: 0,
      t,
      stoodMs: 0,
      panes: night.panes,
      hurtMs: HURT_MS,
      stunMs: 0,
      shadeMs: 0,
      safeX: x,
      safeY: y,
      crumbled: null,
      event: 'respawn',
    };
  }
  hurtMs = Math.max(0, hurtMs - CLIMB_STEP_MS);
  stunMs = Math.max(0, stunMs - CLIMB_STEP_MS);
  dashCooldownMs = Math.max(0, dashCooldownMs - CLIMB_STEP_MS);
  wallLockMs = Math.max(0, wallLockMs - CLIMB_STEP_MS);
  if (stunMs > 0) input = NO_INPUT;
  // 1. Timers.
  coyoteMs = grounded ? COYOTE_MS : Math.max(0, coyoteMs - CLIMB_STEP_MS);
  bufferMs = input.jumpPressed ? JUMP_BUFFER_MS : Math.max(0, bufferMs - CLIMB_STEP_MS);
  // 2. The dash: a press with the cooldown over and the air dash unspent.
  if (input.dashPressed && dashCooldownMs === 0 && dashMs === 0 && (grounded || wall !== 0 || !dashUsed)) {
    if (input.left !== input.right) facing = input.left ? -1 : 1;
    else if (wall !== 0) facing = wall === 1 ? -1 : 1;
    dashMs = DASH_MS;
    dashCooldownMs = DASH_COOLDOWN_MS;
    if (!grounded) dashUsed = true;
    wall = 0;
    rising = false;
    event = 'dash';
  }
  // 3. Horizontal: the dash's burst, the kick's lock, or the run.
  const want = input.left === input.right ? 0 : input.left ? -RUN_SPEED : RUN_SPEED;
  if (dashMs > 0) {
    vx = facing * DASH_SPEED;
    dashMs = Math.max(0, dashMs - CLIMB_STEP_MS);
    if (dashMs === 0) vx = facing * RUN_SPEED;
  } else if (wallLockMs === 0) {
    const dv = RUN_ACCEL * dt;
    vx = vx < want ? Math.min(want, vx + dv) : Math.max(want, vx - dv);
  }
  if (want !== 0 && wallLockMs === 0) facing = want < 0 ? -1 : 1;
  // 4. Jump: off a wall, off the ground (or just after it), or the double in the air.
  if (bufferMs > 0 && wall !== 0) {
    vx = -wall * WALL_KICK;
    vy = WALL_JUMP_IMPULSE;
    facing = wall === 1 ? -1 : 1;
    wallLockMs = WALL_LOCK_MS;
    wall = 0;
    dashMs = 0;
    rising = true;
    bufferMs = 0;
    coyoteMs = 0;
    // The double is still there after a kick.
    jumpsUsed = 1;
    event = 'kick';
  } else if (bufferMs > 0 && (coyoteMs > 0 || jumpsUsed === 1)) {
    const double = coyoteMs === 0;
    vy = double ? DOUBLE_JUMP_IMPULSE : JUMP_IMPULSE;
    jumpsUsed = double ? 2 : 1;
    grounded = false;
    rising = true;
    dashMs = 0;
    bufferMs = 0;
    coyoteMs = 0;
    event = double ? 'double' : 'jump';
  }
  // 5. Jump cut.
  if (rising && vy > 0 && !input.jumpHeld) {
    vy = Math.min(vy, JUMP_CUT_SPEED);
    rising = false;
  }
  // 6. Vertical: none in a dash, a slide on a wall, gravity otherwise.
  if (dashMs > 0) vy = 0;
  else if (wall !== 0) vy = Math.max(-WALL_SLIDE, vy - GRAVITY * dt);
  else vy = Math.max(-MAX_FALL, vy - GRAVITY * dt);
  if (vy <= 0) rising = false;
  // 7. Move and collide: the walls block sideways, the platforms catch a fall.
  const oldY = y;
  let nx = clamp(x + vx * dt, OWL_W / 2, CLIMB_FIELD_W - OWL_W / 2);
  y += vy * dt;
  for (const w of layout.walls) {
    if (!wallInReach(w, y)) continue;
    if (x + OWL_W / 2 <= w.x && nx + OWL_W / 2 > w.x) nx = w.x - OWL_W / 2;
    else if (x - OWL_W / 2 >= w.x && nx - OWL_W / 2 < w.x) nx = w.x + OWL_W / 2;
  }
  if (nx !== x + vx * dt && dashMs > 0) dashMs = 0;
  x = nx;
  if (vy < 0) {
    let landed: Ledge | null = null;
    for (const p of all) if (overlaps(x, p) && oldY >= p.y && y < p.y && (!landed || p.y > landed.y)) landed = p;
    if (landed) {
      y = landed.y;
      vy = 0;
      grounded = true;
      jumpsUsed = 0;
      dashUsed = false;
      wall = 0;
      if (!wasGrounded) event = event ?? 'land';
    } else grounded = false;
  } else if (grounded) {
    grounded = all.some((p) => Math.abs(p.y - y) < 0.5 && overlaps(x, p));
  }
  stoodMs = grounded ? (wasGrounded ? stoodMs + CLIMB_STEP_MS : 0) : 0;
  // 8. The cling: in the air, not dashing, pressing into a wall the box touches, and not rising fast.
  if (!grounded && dashMs === 0 && wallLockMs === 0 && vy <= 60 && want !== 0) {
    const side: 1 | -1 = want > 0 ? 1 : -1;
    const edge = x + side * (OWL_W / 2);
    const touching = layout.walls.some((w) => wallInReach(w, y) && Math.abs(w.x - edge) < 1.5);
    if (touching) {
      if (wall !== side) {
        event = event ?? 'cling';
        jumpsUsed = 0;
        dashUsed = false;
      }
      wall = side;
    } else wall = 0;
  } else wall = 0;
  // 9. Frail glass: stood on too long, it gives way (unless sound glass also holds the owl); one flap is left.
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
  // 10. The benches and the safe ground: a band line stood on is the bench; sound glass is safe ground.
  if (grounded) {
    const lineIndex = layout.bandLines.findIndex((ly) => Math.abs(ly - y) < 0.5);
    if (lineIndex >= 0) {
      bench = lineIndex + 1;
      if (stoodMs >= REST_MS && panes < night.panes) {
        panes = night.panes;
        event = 'rest';
      }
    }
    if (hurtMs === 0 && !all.some((p) => p.frail && Math.abs(p.y - y) < 0.5 && overlaps(x, p))) {
      safeX = x;
      safeY = y;
    }
  }
  // 11. The hazards: a pogo from above with the talons down, or a pane cracked.
  if (hurtMs === 0) {
    const hz = hazardAt(layout, night, x, y, t);
    if (hz) {
      // The pogo: talons down, falling, and the hazard's middle no higher than the owl's.
      const pogo = input.down && !grounded && dashMs === 0 && vy <= 0 && hz.cy <= y + OWL_H / 2;
      if (pogo) {
        // The bounce is no jump: it is never cut short by a released button; the double comes back with it.
        vy = POGO_IMPULSE;
        jumpsUsed = 1;
        dashUsed = false;
        rising = false;
        wall = 0;
        hurtMs = 120;
        event = 'pogo';
      } else {
        panes = Math.max(0, panes - 1);
        if (panes === 0) {
          shadeMs = SHADE_MS;
          shades++;
          vx = 0;
          vy = 0;
          event = 'shade';
        } else if (hz.kind === 'thorns') {
          // Back to the last safe ground, as if the shards had never been touched.
          x = safeX;
          y = safeY;
          vx = 0;
          vy = 0;
          grounded = true;
          jumpsUsed = 0;
          dashMs = 0;
          dashUsed = false;
          wall = 0;
          hurtMs = HURT_MS;
          stunMs = KNOCK_STUN_MS;
          event = 'thorns';
        } else {
          vx = (x >= hz.cx ? 1 : -1) * KNOCK_SPEED;
          vy = KNOCK_UP;
          grounded = false;
          dashMs = 0;
          wall = 0;
          rising = false;
          jumpsUsed = 2;
          coyoteMs = 0;
          hurtMs = HURT_MS;
          stunMs = KNOCK_STUN_MS;
          event = 'hit';
        }
      }
    }
  }
  // 12. Band.
  for (let i = layout.bandLines.length; i > band; i--) {
    if (y >= layout.bandLines[i - 1]!) {
      band = i;
      break;
    }
  }
  return { x, y, vx, vy, grounded, coyoteMs, bufferMs, jumpsUsed, rising, facing, dashMs, dashCooldownMs, dashUsed, wall, wallLockMs, band, t, stoodMs, panes, hurtMs, stunMs, shadeMs, bench, safeX, safeY, shades, crumbled, event };
}

// ---------- the floors ----------

/**
 * The least time to each band, by tier, in ms: the faster road's scripted time less CLIMB_FLOOR_MARGIN,
 * rounded down to 100 ms. climb.test.ts derives them and fails when a constant or the layout moves one.
 */
export const CLIMB_FLOORS: Readonly<Record<string, Readonly<Record<Tier, readonly number[]>>>> = {
  'city-2': {
    easy: [8400, 12400, 17800, 23000, 29400, 33800],
    medium: [8400, 12400, 17900, 23900, 30400, 34500],
    hard: [8400, 12400, 17600, 22800, 28800, 32500],
  },
};

/**
 * The brisk window of each band, by tier, in ms: the high road's scripted time through the band times
 * CLIMB_BRISK_FACTOR, rounded up to 100 ms, in the bands that have a high road; 0 elsewhere (no bonus
 * there). Derived and frozen by climb.test.ts like the floors, which also checks that the main road's
 * scripted time is at least a quarter again as long as the window.
 */
export const CLIMB_BRISK: Readonly<Record<string, Readonly<Record<Tier, readonly number[]>>>> = {
  'city-2': {
    easy: [0, 5500, 7400, 7200, 8900, 6100],
    medium: [0, 5500, 7600, 8300, 8900, 5700],
    hard: [0, 5500, 7100, 7200, 8300, 5200],
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
