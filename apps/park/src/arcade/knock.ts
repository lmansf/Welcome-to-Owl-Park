/**
 * Talon Toss (C40, rebuilt on a physics engine for OP-137): pull the owl back in the slingshot and let
 * go at three targets on their stands, one after the other: a stack of crates, a tower, and a nest
 * sheltered under a plank roof. Five shots at each. The crates, the plank and the nest are rigid bodies
 * (matter.js): they push, topple and fall, and a crate or the plank struck hard enough breaks. Each
 * crate or the plank knocked to the ground, broken or off the field scores a point, the nest
 * KNOCK_NEST_POINTS. A shot ends once everything has been still for a second, or eight seconds after
 * the launch; a target knocked down entirely moves the run on before its shots are used.
 *
 * The world steps at 60 Hz in fixed slices, so the same shot always does the same thing; the drawing
 * in between two steps is interpolated (`alpha`). The engine is fetched only when this game is played
 * (loadPhysics). Input: pull back and let go (a pointer on the field, or the pad's stick), or aim and
 * power with the keys and launch.
 */
import type Matter from 'matter-js';
import { KNOCK_LEVELS, KNOCK_NEST_POINTS, KNOCK_SHOTS } from '@owl-park/shared';
import { FIELD_H, FIELD_W, StepClock, count } from './field';

/** The physics engine's module (matter.js). */
export type Physics = typeof Matter;

let physics: Promise<Physics> | null = null;

/** The physics engine, fetched the first time it is wanted (only this game uses it); a failed fetch is tried again next time. */
export function loadPhysics(): Promise<Physics> {
  physics ??= import('matter-js').then(
    (m) => ((m as { default?: Physics }).default ?? (m as unknown as Physics)),
    (err: unknown) => {
      physics = null;
      throw err;
    },
  );
  return physics;
}

export const CRATE = 36;
export const GROUND_Y = 560;
/** Where the owl sits in the slingshot, and how big it is. */
export const SLING = { x: 96, y: 450 } as const;
export const OWL_R = 14;
/** Launch speed per field pixel of pull (px/s), and the longest pull. */
const POWER = 7;
export const MAX_PULL = 120;
/** The world's step: sixty a second. */
export const KNOCK_STEP_MS = 1000 / 60;
/** Field pixels a second, each second. */
const GRAVITY = 900;
/** The share of the owl's speed the air takes each step. */
const OWL_DRAG = 0.002;
const PIECE_DRAG = 0.002;
/** A crate or the plank struck this fast or faster (field px a step, along the blow) breaks: a hard hit from the owl, or a long fall. */
const BREAK_SPEED = 9;
/** Slower than this (field px a step, and radians a step) is still. */
const STILL_SPEED = 0.12;
const STILL_SPIN = 0.01;
/** A shot ends once everything has been still this long, or this long after the launch at the latest. */
const STILL_MS = 1000;
export const SHOT_MAX_MS = 8000;
/** The pause after a target is done before the next stands. */
const NEXT_TARGET_MS = 1200;
/** A target settles this long before it shows, so it stands as it will when the first shot comes. */
const SETTLE_STEPS = 90;
/** A broken crate's shards fly this long. */
const SHARD_MS = 650;
/** Off the field by this much is gone. */
const OFF = 60;

/** A stand: its top's left and right ends and its height; it goes down to the ground. */
export interface Stand {
  x1: number;
  x2: number;
  y: number;
}

export type PieceKind = 'crate' | 'plank' | 'nest';

/** Each kind's size on the field. */
export const PIECE_SIZE: Readonly<Record<PieceKind, { w: number; h: number }>> = {
  crate: { w: CRATE, h: CRATE },
  plank: { w: 4 * CRATE, h: 16 },
  nest: { w: 60, h: 24 },
};

/** What a piece knocked down scores. */
export function piecePoints(kind: PieceKind): number {
  return kind === 'nest' ? KNOCK_NEST_POINTS : 1;
}

/** A crate, the plank or the nest, as the drawing wants it. */
export interface Piece {
  readonly kind: PieceKind;
  /** Its centre and turn after the last step, and before it: the drawing goes between them by `alpha`. */
  x: number;
  y: number;
  angle: number;
  px: number;
  py: number;
  pangle: number;
  /** Knocked down, and scored: on the ground, broken, or off the field. */
  down: boolean;
  /** Broken: gone from the world, its shards flying. */
  broken: boolean;
  /** Field time it was cleared away (knocked down, at the end of the shot that did it); it fades out from then. */
  goneAt: number | null;
}

/** A piece of a broken crate, flying off (it does not touch anything). */
export interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  /** Field time it is gone at. */
  until: number;
}

interface TargetPlan {
  /** Visitor-facing, after "Out of shots at". */
  name: string;
  stands: Stand[];
  /** Each piece and its centre. */
  pieces: Array<{ kind: PieceKind; x: number; y: number }>;
}

const stand = (x1: number, crates: number, y: number): Stand => ({ x1, x2: x1 + crates * CRATE, y });
/** A crate at a column and row of a stand, counted from its left end and its top up (a half column sits on two below). */
const crate = (s: Stand, col: number, row: number) => ({ kind: 'crate' as const, x: s.x1 + (col + 0.5) * CRATE, y: s.y - (row + 0.5) * CRATE });

const STACK = stand(300, 3, 480);
const TOWER = stand(340, 2, 470);
const SHELTER = stand(300, 4, 490);
/** The shelter's roof: the plank on its two walls, two crates high. */
const ROOF_Y = SHELTER.y - 2 * CRATE - PIECE_SIZE.plank.h / 2;

/** The three targets, in the order they come. */
export const TARGETS: readonly TargetPlan[] = [
  {
    name: 'the stack',
    stands: [STACK],
    pieces: [crate(STACK, 0, 0), crate(STACK, 1, 0), crate(STACK, 2, 0), crate(STACK, 0.5, 1), crate(STACK, 1.5, 1), crate(STACK, 1, 2)],
  },
  {
    name: 'the tower',
    stands: [TOWER],
    pieces: [...[0, 1, 2].flatMap((row) => [crate(TOWER, 0, row), crate(TOWER, 1, row)]), crate(TOWER, 0.5, 3), crate(TOWER, 0.5, 4)],
  },
  {
    name: 'the nest',
    stands: [SHELTER],
    pieces: [
      crate(SHELTER, 0, 0),
      crate(SHELTER, 0, 1),
      crate(SHELTER, 3, 0),
      crate(SHELTER, 3, 1),
      { kind: 'plank', x: (SHELTER.x1 + SHELTER.x2) / 2, y: ROOF_Y },
      ...[0.5, 1.5, 2.5].map((col) => ({ kind: 'crate' as const, x: SHELTER.x1 + (col + 0.5) * CRATE, y: ROOF_Y - PIECE_SIZE.plank.h / 2 - CRATE / 2 })),
      { kind: 'nest', x: (SHELTER.x1 + SHELTER.x2) / 2, y: SHELTER.y - PIECE_SIZE.nest.h / 2 },
    ],
  },
];

/** How each kind of body behaves: crates and the plank are wood, the nest twigs that grip, the owl heavy for its size. */
const BODY: Readonly<Record<PieceKind | 'owl', Matter.IChamferableBodyDefinition>> = {
  crate: { density: 0.001, friction: 0.6, frictionStatic: 0.9, restitution: 0.05, frictionAir: PIECE_DRAG },
  plank: { density: 0.0012, friction: 0.7, frictionStatic: 0.9, restitution: 0.02, frictionAir: PIECE_DRAG },
  nest: { density: 0.0008, friction: 0.4, frictionStatic: 0.6, restitution: 0, frictionAir: PIECE_DRAG, chamfer: { radius: [3, 3, 10, 10] } },
  owl: { density: 0.004, friction: 0.5, restitution: 0.25, frictionAir: OWL_DRAG },
};

/** A piece cleared away fades out over this long. */
export const FADE_MS = 300;

/** Where to draw a piece this frame: `alpha` of the way from where the step before left it to where the last one did. */
export function drawnAt(p: Pick<Piece, 'x' | 'y' | 'angle' | 'px' | 'py' | 'pangle'>, alpha: number): { x: number; y: number; angle: number } {
  return { x: p.px + (p.x - p.px) * alpha, y: p.py + (p.y - p.py) * alpha, angle: p.pangle + (p.angle - p.pangle) * alpha };
}

/** How much of a piece shows at field time `time`: all of it, fading once it is cleared away, then none. */
export function shown(p: Pick<Piece, 'broken' | 'goneAt'>, time: number): number {
  if (p.broken) return 0;
  return p.goneAt === null ? 1 : Math.max(0, 1 - (time - p.goneAt) / FADE_MS);
}

export type KnockPhase = 'aim' | 'flying' | 'between' | 'over';

/** The owl: in the slingshot while aiming, then where its body is after the last step and before it. */
export interface TossOwl {
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  flying: boolean;
}

export class KnockGame {
  readonly game = 'sling' as const;
  /** The target being played (0 to 2). */
  level = 0;
  stands: Stand[] = [];
  pieces: Piece[] = [];
  shards: Shard[] = [];
  /** Shots at this target, and in the whole run. */
  shotsHere = 0;
  shots = 0;
  score = 0;
  /** Targets knocked down entirely. */
  cleared = 0;
  phase: KnockPhase = 'aim';
  over = false;
  owl: TossOwl = { x: SLING.x, y: SLING.y, px: SLING.x, py: SLING.y, vx: 0, vy: 0, flying: false };
  /** Aiming: the pull's angle (degrees above level, toward the targets) and its share of the longest pull. */
  angle = 25;
  power = 0.7;
  /** The line over the field: the target and the shots left, or how the last target went. */
  banner = '';
  /** Field time since the run began, ms. */
  time = 0;
  private shotAt = 0;
  private stillFor = 0;
  private betweenAt = 0;
  private readonly clock = new StepClock(KNOCK_STEP_MS);
  private engine!: Matter.Engine;
  private readonly bodies = new Map<Piece, Matter.Body>();
  private readonly pieceOf = new Map<Matter.Body, Piece>();
  private owlBody: Matter.Body | null = null;
  /** Crates and the plank struck hard enough this step: broken once the step is over. */
  private readonly struck = new Set<Matter.Body>();

  constructor(
    private readonly M: Physics,
    level = 0,
  ) {
    this.load(Math.max(0, Math.min(KNOCK_LEVELS - 1, level)));
  }

  /** How far the clock is into its next step (0 to 1), for the drawing between two steps. */
  get alpha(): number {
    return this.clock.alpha;
  }

  /** Every piece still standing: not knocked down. */
  get standing(): Piece[] {
    return this.pieces.filter((p) => !p.down);
  }

  /** The target's name (visitor-facing). */
  get target(): string {
    return TARGETS[this.level]!.name;
  }

  private load(level: number): void {
    const M = this.M;
    this.level = level;
    const plan = TARGETS[level]!;
    const engine = M.Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
    engine.gravity.y = GRAVITY / 1000;
    engine.gravity.scale = 0.001;
    M.Events.on(engine, 'collisionStart', (e) => this.blows(e.pairs));
    this.engine = engine;
    this.stands = plan.stands.map((s) => ({ ...s }));
    const fixed = [
      M.Bodies.rectangle(FIELD_W / 2, GROUND_Y + 40, FIELD_W + 2 * OFF, 80, { isStatic: true, friction: 0.9 }),
      ...this.stands.map((s) => M.Bodies.rectangle((s.x1 + s.x2) / 2, (s.y + GROUND_Y) / 2, s.x2 - s.x1, GROUND_Y - s.y, { isStatic: true, friction: 0.8 })),
    ];
    this.bodies.clear();
    this.pieceOf.clear();
    this.struck.clear();
    this.shards = [];
    this.pieces = plan.pieces.map(({ kind, x, y }) => {
      const size = PIECE_SIZE[kind];
      const body = M.Bodies.rectangle(x, y, size.w, size.h, BODY[kind]);
      const piece: Piece = { kind, x, y, angle: 0, px: x, py: y, pangle: 0, down: false, broken: false, goneAt: null };
      this.bodies.set(piece, body);
      this.pieceOf.set(body, piece);
      return piece;
    });
    M.Composite.add(engine.world, [...fixed, ...this.bodies.values()]);
    // The target settles before it shows: it stands as it will when the first shot comes.
    for (let i = 0; i < SETTLE_STEPS; i++) M.Engine.update(engine, KNOCK_STEP_MS);
    this.struck.clear();
    this.sync();
    this.sync();
    this.owlBody = null;
    this.shotsHere = 0;
    this.toAim();
  }

  private toAim(): void {
    this.phase = 'aim';
    this.owl = { x: SLING.x, y: SLING.y, px: SLING.x, py: SLING.y, vx: 0, vy: 0, flying: false };
    this.banner = this.aimLine();
  }

  /** "The tower · 3 shots left". */
  private aimLine(): string {
    const name = this.target;
    return `${name[0]!.toUpperCase()}${name.slice(1)} · ${count(KNOCK_SHOTS - this.shotsHere, 'shot', 'shots')} left`;
  }

  /** The launch for an angle and a power, in field pixels a second. */
  static launch(angle: number, power: number): { vx: number; vy: number } {
    const speed = Math.max(0, Math.min(1, power)) * MAX_PULL * POWER;
    const a = (angle * Math.PI) / 180;
    return { vx: Math.cos(a) * speed, vy: -Math.sin(a) * speed };
  }

  /** Aim by the pull itself: back and down from the slingshot sends the owl up and on. Hardly a pull at all is no shot. */
  aimByPull(dx: number, dy: number): void {
    if (this.phase !== 'aim') return;
    const len = Math.min(MAX_PULL, Math.hypot(dx, dy));
    if (len < 4) {
      this.power = 0;
      return;
    }
    this.angle = Math.max(-30, Math.min(80, (Math.atan2(dy, -dx) * 180) / Math.PI));
    this.power = len / MAX_PULL;
  }

  /** Aim with the keys: a little higher or lower, a little more or less power. */
  nudge(dAngle: number, dPower: number): void {
    if (this.phase !== 'aim') return;
    this.angle = Math.max(-30, Math.min(80, this.angle + dAngle));
    this.power = Math.max(0.2, Math.min(1, this.power + dPower));
  }

  /** Let go: the owl flies, and a shot is counted. Too short a pull launches nothing. */
  release(): void {
    if (this.phase !== 'aim' || this.power < 0.15) return;
    const M = this.M;
    const v = KnockGame.launch(this.angle, this.power);
    const body = M.Bodies.circle(SLING.x, SLING.y, OWL_R, BODY.owl);
    M.Body.setVelocity(body, { x: (v.vx * KNOCK_STEP_MS) / 1000, y: (v.vy * KNOCK_STEP_MS) / 1000 });
    M.Composite.add(this.engine.world, body);
    this.owlBody = body;
    this.owl = { x: SLING.x, y: SLING.y, px: SLING.x, py: SLING.y, vx: v.vx, vy: v.vy, flying: true };
    this.shots += 1;
    this.shotsHere += 1;
    this.shotAt = this.time;
    this.stillFor = 0;
    this.phase = 'flying';
    this.banner = this.aimLine();
  }

  /**
   * Where a shot at this aim goes until it meets something, a dot every `every` steps: worked out as the
   * engine moves the owl (its drag, then gravity, each step), so the dots are where it will fly.
   */
  path(dots = 12, every = 4): Array<{ x: number; y: number }> {
    const v = KnockGame.launch(this.angle, this.power);
    const g = (GRAVITY / 1000) * 0.001 * KNOCK_STEP_MS * KNOCK_STEP_MS;
    let vx = (v.vx * KNOCK_STEP_MS) / 1000;
    let vy = (v.vy * KNOCK_STEP_MS) / 1000;
    let x: number = SLING.x;
    let y: number = SLING.y;
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 1; i <= dots * every; i++) {
      vx *= 1 - OWL_DRAG;
      vy = vy * (1 - OWL_DRAG) + g;
      x += vx;
      y += vy;
      if (i % every === 0) out.push({ x, y });
    }
    return out;
  }

  advance(ms: number): void {
    if (this.over) return;
    this.clock.advance(ms, () => this.step());
  }

  private step(): boolean {
    const M = this.M;
    this.time += KNOCK_STEP_MS;
    M.Engine.update(this.engine, KNOCK_STEP_MS);
    if (this.struck.size) {
      for (const body of this.struck) {
        const piece = this.pieceOf.get(body);
        if (piece && !piece.broken) this.shatter(piece, body);
      }
      this.struck.clear();
      // What stood on a broken crate falls: nothing stays asleep in the air.
      this.wakeAll();
    }
    // Well off the field is gone from the world.
    for (const [piece, body] of this.bodies) {
      if (!offField(body.position, OFF)) continue;
      M.Composite.remove(this.engine.world, body);
      this.bodies.delete(piece);
      if (!piece.down) piece.down = this.scores(piece);
    }
    if (this.owlBody && offField(this.owlBody.position, OFF)) {
      M.Composite.remove(this.engine.world, this.owlBody);
      this.owlBody = null;
    }
    this.sync();
    // On the ground, or past the field's sides where no shot can reach it: knocked down.
    for (const [piece, body] of this.bodies) if (!piece.down && (body.bounds.max.y >= GROUND_Y - 1 || offField(body.position, 0))) piece.down = this.scores(piece);
    this.stepShards();
    if (this.phase === 'flying') this.watchShot();
    else if (this.phase === 'between' && this.time - this.betweenAt >= NEXT_TARGET_MS) {
      if (this.level + 1 >= KNOCK_LEVELS) this.finish();
      else this.load(this.level + 1);
    }
    return !this.over;
  }

  /** A piece knocked down scores (once): true. */
  private scores(piece: Piece): boolean {
    this.score += piecePoints(piece.kind);
    return true;
  }

  /** The pieces and the owl as the step left them, the last ones kept for the drawing between. */
  private sync(): void {
    for (const [piece, body] of this.bodies) {
      piece.px = piece.x;
      piece.py = piece.y;
      piece.pangle = piece.angle;
      piece.x = body.position.x;
      piece.y = body.position.y;
      piece.angle = body.angle;
    }
    const o = this.owl;
    o.px = o.x;
    o.py = o.y;
    if (this.owlBody) {
      o.x = this.owlBody.position.x;
      o.y = this.owlBody.position.y;
      o.vx = (this.owlBody.velocity.x * 1000) / KNOCK_STEP_MS;
      o.vy = (this.owlBody.velocity.y * 1000) / KNOCK_STEP_MS;
    }
  }

  /** The bodies that met this step: a crate or the plank struck hard enough breaks (the nest only falls). */
  private blows(pairs: Matter.Pair[]): void {
    for (const pair of pairs) {
      const a = pair.bodyA.parent;
      const b = pair.bodyB.parent;
      const n = pair.collision.normal;
      const speed = Math.abs((a.velocity.x - b.velocity.x) * n.x + (a.velocity.y - b.velocity.y) * n.y);
      if (speed < BREAK_SPEED) continue;
      for (const body of [a, b]) {
        const piece = this.pieceOf.get(body);
        if (piece && piece.kind !== 'nest') this.struck.add(body);
      }
    }
  }

  /** A crate or the plank broken: gone from the world, knocked down, its shards flying off the way it went. */
  private shatter(piece: Piece, body: Matter.Body): void {
    this.M.Composite.remove(this.engine.world, body);
    this.bodies.delete(piece);
    piece.broken = true;
    if (!piece.down) piece.down = this.scores(piece);
    const vx = (body.velocity.x * 1000) / KNOCK_STEP_MS;
    const vy = (body.velocity.y * 1000) / KNOCK_STEP_MS;
    const size = PIECE_SIZE[piece.kind];
    [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ].forEach(([sx, sy], i) => {
      this.shards.push({
        x: body.position.x + (sx! * size.w) / 4,
        y: body.position.y + (sy! * size.h) / 4,
        vx: vx * 0.5 + sx! * 90,
        vy: vy * 0.5 + sy! * 60 - 120,
        angle: body.angle,
        spin: (i % 2 ? 1 : -1) * 7,
        until: this.time + SHARD_MS,
      });
    });
  }

  private stepShards(): void {
    if (!this.shards.length) return;
    const dt = KNOCK_STEP_MS / 1000;
    for (const s of this.shards) {
      s.vy += GRAVITY * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.angle += s.spin * dt;
    }
    this.shards = this.shards.filter((s) => s.until > this.time && s.y < FIELD_H + OFF);
  }

  private wakeAll(): void {
    for (const body of this.M.Composite.allBodies(this.engine.world)) if (!body.isStatic) this.M.Sleeping.set(body, false);
  }

  /** The shot ends once everything has been still for a second, or at the latest eight seconds after the launch. */
  private watchShot(): void {
    const moving = this.M.Composite.allBodies(this.engine.world).some((b) => !b.isStatic && !b.isSleeping && (b.speed > STILL_SPEED || Math.abs(b.angularSpeed) > STILL_SPIN));
    this.stillFor = moving ? 0 : this.stillFor + KNOCK_STEP_MS;
    if (this.stillFor >= STILL_MS || this.time - this.shotAt >= SHOT_MAX_MS) this.endShot();
  }

  private endShot(): void {
    if (this.owlBody) {
      this.M.Composite.remove(this.engine.world, this.owlBody);
      this.owlBody = null;
    }
    // The owl is back in the slingshot, for the next shot or to watch the next target come.
    this.owl = { x: SLING.x, y: SLING.y, px: SLING.x, py: SLING.y, vx: 0, vy: 0, flying: false };
    // What was knocked down has scored: it is cleared away, so the next shot meets only what still stands.
    for (const [piece, body] of this.bodies) {
      if (!piece.down) continue;
      this.M.Composite.remove(this.engine.world, body);
      this.bodies.delete(piece);
      piece.goneAt = this.time;
    }
    this.wakeAll();
    if (this.pieces.every((p) => p.down)) {
      this.cleared += 1;
      this.banner = `${TARGETS[this.level]!.name === 'the nest' ? 'The nest is down' : 'Cleared'} in ${count(this.shotsHere, 'shot', 'shots')}!`;
      this.between();
      return;
    }
    if (this.shotsHere >= KNOCK_SHOTS) {
      this.banner = `Out of shots at ${this.target}.`;
      this.between();
      return;
    }
    this.toAim();
  }

  /** A target done: the next one stands after a moment, or the run is over. */
  private between(): void {
    this.phase = 'between';
    this.betweenAt = this.time;
  }

  private finish(): void {
    this.over = true;
    this.phase = 'over';
  }

  /** The run-over line. */
  overLine(): string {
    const points = count(this.score, 'point', 'points');
    if (this.cleared === KNOCK_LEVELS) return `All three targets down! ${points}.`;
    return `${this.cleared ? `${count(this.cleared, 'target', 'targets')} down` : 'No target down'}, ${points}.`;
  }
}

/** Past the field's sides or below it by `by` or more. */
function offField(p: Matter.Vector, by: number): boolean {
  return p.x < -by || p.x > FIELD_W + by || p.y > FIELD_H + by;
}
