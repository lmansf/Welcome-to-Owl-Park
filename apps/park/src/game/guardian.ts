/**
 * The guardian alive at the heart of the Great Hollow (OP-359; behind `?guardian=1`, flags.ts).
 *
 * The park's story makes its guardians colossal and living. Until this the great horned owl was an
 * idol about four owls tall on the hall's rim. Here it sits at the heart of the hall, about nine owls
 * tall, where every owl that walks through the turnstiles comes in over its head, and it is alive:
 *
 * - it breathes;
 * - it looks at an owl the way an owl does. An owl's eyes are fixed in its head, so it looks at a thing
 *   by turning its head: the guardian's head goes, slowly, toward the owl it attends to (the one that
 *   last called to it, else one just come in, else one riding the heart's rising air, else the nearest);
 * - it blinks, dozes when no owl is near and wakes as one comes;
 * - when an owl comes in by the knothole it lifts its head, tilts it as owls do at something new, and
 *   hoots once;
 * - it answers a hoot with its own, a bow with a bow, a tilt with a tilt;
 * - while an owl rides the rising air at the heart its breath deepens and quickens: the rising air is its.
 *
 * This file is the rules, with nothing of the browser in it, so it is unit-tested: where the guardian
 * stands, what its painting measures, and its mind (GuardianMind), which is told what happens and says,
 * frame by frame, how the guardian holds itself. guardianArt.ts cuts the one painting into a head and a
 * body; guardianView.ts draws them.
 *
 * Nothing here is told to the room server: every page works its own guardian out from the owls it sees,
 * so two visitors see it attend to different owls. That is the first slice's limit, not its design.
 *
 * TODO-DOCS (OP-359): docs/ARCHITECTURE.md's client rules gain the guardian once it is on for every
 * visitor: where it stands, that it is drawn from one painting cut at the neck, and that each page
 * works it out for itself.
 */
import type { Rect, Vec2 } from '@owl-park/shared';
import { HALL_MIDDLE, HALL_ROOM, RUN_Y } from '@owl-park/shared/rooms';
import { OWL_BODY } from './seeThrough';
import type { Look } from './townView';

/**
 * The painting (art/guardian.png) as it is measured, in its own pixels: where the owl stands in its
 * frame, where its head turns, and the boxes that hug what it draws (its head with its ear tufts, and
 * its body down to the bough), which are what an owl can be hidden behind.
 */
export const GUARDIAN_ART = {
  key: 'guardian',
  w: 720,
  h: 820,
  /** The front of its bough, under its talons: its foot in the room, and its depth among the owls. */
  foot: { x: 360, y: 780 },
  /** The middle of its neck: what its head turns about. */
  neck: { x: 385, y: 372 },
  /** Between its eyes: where it looks from. */
  face: { x: 398, y: 255 },
  /** The tip of its beak: where its hoot comes from. */
  beak: { x: 400, y: 338 },
  /** The middle of its chest: where its glow sits. */
  chest: { x: 372, y: 520 },
  boxes: [
    { x: 205, y: 60, w: 352, h: 280 },
    { x: 145, y: 338, w: 420, h: 442 },
  ],
} as const;

/** Where its foot stands in the hall: on the middle line, in front of the gap between the two inner root runs. */
export const GUARDIAN_AT: Vec2 = { x: HALL_MIDDLE, y: RUN_Y + 142 };
/** How big the painting is drawn (room px per painting px): its ear tufts end under the knothole's sign. */
export const GUARDIAN_SCALE = 1.06;
/** The room it lives in. */
export const GUARDIAN_ROOM = HALL_ROOM.id;

/** A point of the painting, in the room. */
export function inRoom(p: Vec2, at: Vec2 = GUARDIAN_AT, scale = GUARDIAN_SCALE): Vec2 {
  return { x: at.x + (p.x - GUARDIAN_ART.foot.x) * scale, y: at.y + (p.y - GUARDIAN_ART.foot.y) * scale };
}

/** A box of the painting, in the room. */
export function boxInRoom(b: Rect, at: Vec2 = GUARDIAN_AT, scale = GUARDIAN_SCALE): Rect {
  const p = inRoom(b, at, scale);
  return { x: p.x, y: p.y, w: b.w * scale, h: b.h * scale };
}

/** The boxes hugging what the guardian draws, in the room: an owl behind one of them is hidden (seeThrough.ts). */
export function guardianBoxes(at: Vec2 = GUARDIAN_AT, scale = GUARDIAN_SCALE): Rect[] {
  return GUARDIAN_ART.boxes.map((b) => boxInRoom(b, at, scale));
}

/**
 * Where no feather of the trail is laid (featherTrail.ts): the floor the guardian's picture covers, a
 * little wider, so a line of feathers goes round it and none lies behind it.
 */
export function guardianShade(pad = 40, at: Vec2 = GUARDIAN_AT, scale = GUARDIAN_SCALE): Rect[] {
  return guardianBoxes(at, scale).map((b) => ({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }));
}

/**
 * Near the guardian the camera keeps its face in view. Followed as in any room, an owl a few strides
 * out in front of it has the guardian's head off the top of the screen, and everything the guardian
 * does it does with its head. So on the floor round it the camera shows the guardian's head and the
 * owl both: moved no further than that takes, and drawn back only when one screen cannot hold the two.
 */
export const GUARDIAN_VIEW = {
  /** The floor where the camera is wholly the guardian's: this far either side of its middle line, behind the top of its head, and out in front of its foot. */
  side: 760,
  back: 320,
  front: 900,
  /** Past that floor the camera goes back to the owl's own over this distance. */
  fade: 280,
  /** Room kept over its ear tufts, under the owl's feet and to either side of the two (beyond what the HUD covers). */
  over: 60,
  under: 70,
  beside: 150,
  /** The camera is drawn back no further than this share of the owl's own zoom: an owl is never drawn much smaller for it. */
  least: 0.72,
  /** How fast the camera goes to it and from it (1/s). */
  rate: 2.6,
} as const;

/** How much the camera is the guardian's for the visitor's own owl standing at `owl`: all of it on the floor round the guardian, none far from it. */
export function presence(owl: Vec2, at: Vec2 = GUARDIAN_AT, scale = GUARDIAN_SCALE): number {
  const V = GUARDIAN_VIEW;
  const top = Math.min(...guardianBoxes(at, scale).map((b) => b.y));
  const dx = Math.max(at.x - V.side - owl.x, 0, owl.x - (at.x + V.side));
  const dy = Math.max(top - V.back - owl.y, 0, owl.y - (at.y + V.front));
  const t = clamp(Math.hypot(dx, dy) / V.fade, 0, 1);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * What the camera shows near the guardian: the owl standing at `owl`, `z` up, with room under its feet,
 * and the guardian's head with room over it. `covered`: what the HUD covers at the top and the foot of
 * the screen, in room px.
 */
export function mustShow(owl: Vec2, z: number, covered: { over: number; under: number } = { over: 0, under: 0 }, at: Vec2 = GUARDIAN_AT, scale = GUARDIAN_SCALE): { owl: Rect; head: Rect } {
  const V = GUARDIAN_VIEW;
  const h = guardianBoxes(at, scale)[0]!;
  const pad = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x: x0 - V.beside, y: y0 - V.over - covered.over, w: x1 - x0 + V.beside * 2, h: y1 - y0 + V.over + covered.over + V.under + covered.under });
  return {
    owl: pad(owl.x - OWL_BODY.w / 2, owl.y - z - OWL_BODY.h, owl.x + OWL_BODY.w / 2, owl.y),
    head: pad(h.x, h.y, h.x + h.w, h.y + h.h),
  };
}

/**
 * The camera's look that shows the owl and the guardian's head on a screen `screen` (the game's own
 * pixels), changed as little from `near` as will do: its zoom unless that cannot hold the two, then
 * drawn back to hold them but no further than `least` of that zoom (an owl is never drawn much smaller
 * for it); and its middle moved only as far as brings the two in. Where even that cannot hold both, the
 * owl stays whole on the screen, with as much of the guardian's head as fits beside it.
 */
export function lookShowing(near: Look, must: { owl: Rect; head: Rect }, screen: { w: number; h: number }, least: number = GUARDIAN_VIEW.least): Look {
  const { owl, head } = must;
  const x0 = Math.min(owl.x, head.x);
  const y0 = Math.min(owl.y, head.y);
  const w = Math.max(owl.x + owl.w, head.x + head.w) - x0;
  const h = Math.max(owl.y + owl.h, head.y + head.h) - y0;
  const zoom = Math.max(near.zoom * least, Math.min(near.zoom, screen.w / w, screen.h / h));
  // Along one way of the screen: the middle that holds both where the view can, else the owl and what it can of the head.
  const along = (c: number, lo: number, span: number, owlLo: number, owlSpan: number, headMid: number, view: number) =>
    span <= view ? clamp(c, lo + span - view / 2, lo + view / 2) : clamp(headMid, owlLo + Math.min(owlSpan, view) - view / 2, owlLo + view / 2);
  return {
    zoom,
    x: along(near.x, x0, w, owl.x, owl.w, head.x + head.w / 2, screen.w / zoom),
    y: along(near.y, y0, h, owl.y, owl.h, head.y + head.h / 2, screen.h / zoom),
  };
}

/** How its eyes are: open, half shut (dozing, or on the way), or shut. */
export type Lids = 'open' | 'half' | 'closed';

/** How its head is held, off the painting's own pose: a roll about the neck (radians, clockwise on screen) and a shift (painting px). */
export interface HeadPose {
  roll: number;
  dx: number;
  dy: number;
}

/** An owl as the guardian sees it. */
export interface OwlSeen {
  id: string;
  /** Its feet on the floor (room px). */
  pos: Vec2;
  /** How high over the floor it is. */
  z: number;
  /** Whether rising air is carrying it up. */
  lifted: boolean;
}

/** What an owl does that the guardian answers: a hoot with its own, a bow with a bow, a tilt with a tilt. */
export type Call = 'hoot' | 'bow' | 'tilt';
/** The emotes it answers, by their names (emotes.ts). */
export const CALLS: Readonly<Record<string, Call>> = { hoot: 'hoot', bow: 'bow', tilt: 'tilt' };

/** How the guardian is, one frame. */
export interface GuardianFrame {
  head: HeadPose;
  lids: Lids;
  /** Its chest's swell, 0 (out) to 1 (in full). */
  breath: number;
  /** How hard it beats, 0 to 1: an owl is riding the heart's rising air, or it has just shrugged its wings. */
  beat: number;
  /** The owl it attends to, or none. */
  attending: string | null;
  /** Whether it dozes. */
  dozing: boolean;
  /** Set on the frame a hoot of its own begins. */
  hooted: boolean;
}

/** Its measures of time and distance (ms, room px unless said). */
export const GUARDIAN_RULES = {
  /** How far from its face it sees an owl, and how far off an owl must be for it to stop seeing one it sees. */
  sight: 1500,
  sightLost: 1700,
  /** Another owl takes its eye from the one it watches only when this much nearer. */
  nearer: 160,
  /** How long it attends to an owl that called to it, and to one that has just come in. */
  callHoldMs: 5000,
  newcomerMs: 7000,
  /** How long after an owl comes in it wakes, tilts its head, and hoots. */
  wakeAfterMs: 900,
  tiltAfterMs: 1700,
  greetAfterMs: 2500,
  /** How long after a call its answer comes, and how soon it may hoot again. */
  answerAfterMs: 650,
  hootGapMs: 2600,
  /** How long a hoot lifts its head, and how long a bow and a tilt are held. */
  hootMs: 1300,
  bowMs: 1500,
  tiltMs: 1300,
  /** With no owl in sight this long, it dozes. */
  dozeAfterMs: 9000,
  /** How fast its head goes where it is going (1/s: about a second and a quarter to settle), and its eyes open or shut. */
  headRate: 3.2,
  lidRate: 2.4,
  wakeRate: 5,
  /** One breath in and out at rest, and while it beats. */
  breathMs: 5200,
  beatMs: 1500,
  /** How fast a beat comes on and dies away (1/s). */
  beatRate: 2.5,
  /** Between two blinks, and how long the eyes are shut and half shut on the way. */
  blinkEveryMs: [3200, 7600],
  blinkShutMs: 130,
  blinkHalfMs: 55,
  /** With no owl on the rising air, it shrugs its wings now and then, and the air stirs: how often, and for how long. */
  shrugEveryMs: [9000, 15000],
  shrugMs: 1800,
} as const;

/** How far its head goes (radians, painting px). */
export const HEAD_REACH = {
  /** A roll toward an owl off to one side, and how far off to the side counts as all the way. */
  roll: (4.5 * Math.PI) / 180,
  side: 700,
  /** A shift toward it, across. */
  dx: 10,
  /** Up for an owl above its face on the screen, down for one below; and how far above or below counts as all the way. */
  up: 9,
  down: 5,
  tall: 520,
  /** The tilt at something new, and the one that answers a tilt. */
  tilt: (9 * Math.PI) / 180,
  /** A bow: its head goes down this far. */
  bow: 14,
  /** A hoot: its head lifts this far. */
  hoot: 7,
  /** Dozing: its head sinks this far. */
  doze: 5,
} as const;

/** The rest pose: the painting's own. */
export const AT_REST: HeadPose = { roll: 0, dx: 0, dy: 0 };

/**
 * Where its head goes to look at a point of the room: rolled and shifted toward it across, lifted for
 * one above its face on the screen and lowered for one below. `face` is where it looks from (room px).
 */
export function headToward(target: Vec2, face: Vec2): HeadPose {
  const side = clamp((target.x - face.x) / HEAD_REACH.side, -1, 1);
  const rise = clamp((face.y - target.y) / HEAD_REACH.tall, -1, 1);
  return { roll: side * HEAD_REACH.roll, dx: side * HEAD_REACH.dx, dy: rise >= 0 ? -rise * HEAD_REACH.up : -rise * HEAD_REACH.down };
}

/** Where an owl is looked at: the middle of its body as it is drawn, up in the air by its height. */
export function seenAt(owl: Pick<OwlSeen, 'pos' | 'z'>): Vec2 {
  return { x: owl.pos.x, y: owl.pos.y - owl.z - 44 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * A value eased toward a goal as a spring that never overshoots, by its exact answer over `dt` seconds:
 * the same at ten frames a second as at a hundred. Returns the value and its speed.
 */
export function eased(value: number, speed: number, goal: number, dt: number, rate: number): [number, number] {
  const x = value - goal;
  const c = speed + rate * x;
  const e = Math.exp(-rate * dt);
  return [goal + (x + c * dt) * e, (speed - c * rate * dt) * e];
}

/** A number from 0 up to 1, the same each time for the same `seed`: what makes a mind's blinks its own and a test's the same every run. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

interface Gesture {
  kind: Call | 'greet';
  /** When it begins and ends. */
  from: number;
  until: number;
  /** Which way a tilt goes: 1 clockwise. */
  way: 1 | -1;
}

/**
 * The guardian's mind: told when an owl comes in and when one calls, and asked each frame how it holds
 * itself. It keeps no clock of its own: every time is one it was given.
 */
export class GuardianMind {
  private readonly rand: () => number;
  private readonly face: Vec2;
  private readonly heart: { pos: Vec2; r: number } | null;
  private head: HeadPose = { ...AT_REST };
  private headSpeed: HeadPose = { ...AT_REST };
  /** How shut its eyes are held, 0 awake to 1 asleep, and how fast that is changing. */
  private drowse = 1;
  private drowseSpeed = 0;
  private beat = 0;
  private last: number | null = null;
  private watching: string | null = null;
  private caller: { id: string; until: number } | null = null;
  private newcomer: { id: string; until: number; greeted: boolean } | null = null;
  /** No waking before this: an owl that has just come in sees its eyes open. */
  private sleepUntil = 0;
  private lastSeen: number | null = null;
  private gestures: Gesture[] = [];
  /** Hoots of its own still to come (when), and when it last hooted. */
  private hootsDue: number[] = [];
  private hootedAt = -Infinity;
  private hoots = 0;
  private blinkAt: number | null = null;
  private shrugAt: number | null = null;
  private breathPhase = 0;

  /**
   * `face`: where it looks from, in the room. `heart`: the rising air it beats for (the hall's thermal).
   * `seed` makes its blinks and shrugs its own.
   */
  constructor(opts: { face: Vec2; heart?: { pos: Vec2; r: number } | null; seed?: number }) {
    this.face = opts.face;
    this.heart = opts.heart ?? null;
    this.rand = seeded(opts.seed ?? 1);
  }

  /** An owl has come into the hall. `greet`: it came in by the knothole, and is hooted to. */
  arrived(id: string, now: number, greet: boolean): void {
    // The owl it is greeting keeps its eye: another that comes in meanwhile is looked at after.
    if (greet || !this.newcomer?.greeted || now >= this.newcomer.until) this.newcomer = { id, until: now + GUARDIAN_RULES.newcomerMs, greeted: greet };
    // Asleep, it sleeps on a moment: the owl that has come in sees its eyes open. Awake, it only looks.
    if (this.drowse > 0.5) this.sleepUntil = Math.max(this.sleepUntil, now + GUARDIAN_RULES.wakeAfterMs);
    this.lastSeen = now;
    if (!greet) return;
    const way = this.rand() < 0.5 ? 1 : -1;
    this.gestures.push({ kind: 'greet', from: now + GUARDIAN_RULES.tiltAfterMs, until: now + GUARDIAN_RULES.tiltAfterMs + GUARDIAN_RULES.tiltMs, way });
    this.hootDue(now + GUARDIAN_RULES.greetAfterMs);
  }

  /** An owl has called to it (emotes.ts: a hoot, a bow, a tilt). It answers in kind, a moment later. */
  called(id: string, call: Call, now: number): void {
    this.caller = { id, until: now + GUARDIAN_RULES.callHoldMs };
    // A call wakes it at once.
    this.sleepUntil = Math.min(this.sleepUntil, now);
    this.lastSeen = now;
    const from = now + GUARDIAN_RULES.answerAfterMs;
    if (call === 'hoot') {
      this.hootDue(from);
      return;
    }
    if (this.gestures.some((g) => g.kind === call && g.until > now)) return;
    const way = this.rand() < 0.5 ? 1 : -1;
    this.gestures.push({ kind: call, from, until: from + (call === 'bow' ? GUARDIAN_RULES.bowMs : GUARDIAN_RULES.tiltMs), way });
  }

  /** A hoot of its own at `at`, unless one is coming or it has only just hooted: a crowd's hoots get one answer. */
  private hootDue(at: number): void {
    if (this.hootsDue.length > 0) return;
    this.hootsDue.push(Math.max(at, this.hootedAt + GUARDIAN_RULES.hootGapMs));
  }

  /** How many times it has hooted. */
  get hooted(): number {
    return this.hoots;
  }

  /** One frame: the owls in the hall now. */
  frame(now: number, owls: readonly OwlSeen[]): GuardianFrame {
    const dt = this.last === null ? 0 : clamp((now - this.last) / 1000, 0, 0.5);
    this.last = now;
    const R = GUARDIAN_RULES;

    // Who it attends to.
    if (this.caller && (now >= this.caller.until || !owls.some((o) => o.id === this.caller!.id))) this.caller = null;
    if (this.newcomer && (now >= this.newcomer.until || !owls.some((o) => o.id === this.newcomer!.id))) this.newcomer = null;
    const far = (o: OwlSeen) => Math.hypot(seenAt(o).x - this.face.x, seenAt(o).y - this.face.y);
    const rider = this.heart ? owls.find((o) => o.lifted && Math.hypot(o.pos.x - this.heart!.pos.x, o.pos.y - this.heart!.pos.y) <= this.heart!.r + 40) : undefined;
    let watched = owls.find((o) => o.id === this.watching);
    if (watched && far(watched) > R.sightLost) watched = undefined;
    for (const o of owls) {
      const d = far(o);
      if (d > R.sight) continue;
      if (!watched || d < far(watched) - R.nearer) watched = o;
    }
    this.watching = watched?.id ?? null;
    const target = owls.find((o) => o.id === this.caller?.id) ?? owls.find((o) => o.id === this.newcomer?.id) ?? rider ?? watched ?? null;
    if (target) this.lastSeen = now;

    // Asleep (before an owl that has come in has seen its eyes open, and with no owl in sight a while), or awake.
    const asleep = now < this.sleepUntil || (target === null && (this.lastSeen === null || now - this.lastSeen > R.dozeAfterMs));
    [this.drowse, this.drowseSpeed] = eased(this.drowse, this.drowseSpeed, asleep ? 1 : 0, dt, asleep ? R.lidRate : R.wakeRate);

    // Its hoots.
    let hooted = false;
    if (this.hootsDue.length > 0 && now >= this.hootsDue[0]!) {
      this.hootsDue.shift();
      this.hootedAt = now;
      this.hoots++;
      hooted = true;
      this.gestures.push({ kind: 'hoot', from: now, until: now + R.hootMs, way: 1 });
    }

    // Where its head goes: slowly toward who it attends to; and over that, at once, what it is doing (a hoot, a bow, a tilt).
    this.gestures = this.gestures.filter((g) => g.until > now);
    const goal: HeadPose = target && !asleep ? headToward(seenAt(target), this.face) : { ...AT_REST };
    if (asleep) goal.dy += HEAD_REACH.doze;
    [this.head.roll, this.headSpeed.roll] = eased(this.head.roll, this.headSpeed.roll, goal.roll, dt, R.headRate);
    [this.head.dx, this.headSpeed.dx] = eased(this.head.dx, this.headSpeed.dx, goal.dx, dt, R.headRate);
    [this.head.dy, this.headSpeed.dy] = eased(this.head.dy, this.headSpeed.dy, goal.dy, dt, R.headRate);
    const head: HeadPose = { ...this.head };
    for (const g of this.gestures) {
      if (now < g.from) continue;
      // Out to its full reach and back, as a breath goes.
      const k = Math.sin((Math.PI * (now - g.from)) / (g.until - g.from)) ** 2;
      if (g.kind === 'hoot') head.dy -= HEAD_REACH.hoot * k;
      else if (g.kind === 'bow') {
        head.dy += HEAD_REACH.bow * k;
        head.roll *= 1 - k;
      } else head.roll += g.way * HEAD_REACH.tilt * k;
    }

    // Its breath, and the beat an owl on the rising air gives it; with none, a shrug of its wings now and then.
    const between = (range: readonly [number, number]) => range[0] + this.rand() * (range[1] - range[0]);
    if (this.shrugAt === null) this.shrugAt = now + between(R.shrugEveryMs);
    const shrugging = !rider && !asleep && now >= this.shrugAt && now < this.shrugAt + R.shrugMs;
    if (now >= this.shrugAt + R.shrugMs || rider) this.shrugAt = now + between(R.shrugEveryMs);
    const beatGoal = rider ? 1 : shrugging ? 0.6 : 0;
    this.beat += (beatGoal - this.beat) * (1 - Math.exp(-R.beatRate * dt));
    this.breathPhase += (dt * 1000) / (R.breathMs + (R.beatMs - R.breathMs) * this.beat);
    this.breathPhase -= Math.floor(this.breathPhase);
    const breath = (1 - Math.cos(2 * Math.PI * this.breathPhase)) / 2;

    // Its eyes: shut asleep, half shut on the way, and a blink now and then awake.
    let lids: Lids = this.drowse > 0.72 ? 'closed' : this.drowse > 0.28 ? 'half' : 'open';
    if (lids === 'open') {
      if (this.blinkAt === null) this.blinkAt = now + between(R.blinkEveryMs);
      const into = now - this.blinkAt;
      const whole = R.blinkHalfMs * 2 + R.blinkShutMs;
      if (into >= whole) this.blinkAt = now + between(R.blinkEveryMs);
      else if (into >= 0) lids = into < R.blinkHalfMs || into >= R.blinkHalfMs + R.blinkShutMs ? 'half' : 'closed';
    } else this.blinkAt = null;

    return { head, lids, breath, beat: this.beat, attending: asleep ? null : (target?.id ?? null), dozing: asleep, hooted };
  }
}
