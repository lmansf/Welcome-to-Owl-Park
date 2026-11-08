/**
 * Hoot & Hop (C40, OP-137): a crossing game in levels. The owl starts on the kerb at the foot of the
 * field and hops up to the perch at the top, across lanes of traffic (noodle carts on the road,
 * drones and bats in the air) and rivers it crosses on floating logs. Four hops: up is forward, left
 * and right move a column, down steps back a row; one hop at a time. A hit (a cart, a drone or a bat,
 * the water, or a log carrying the owl to the field's edge) costs a life, and the owl starts the
 * level again from the kerb; a run has three. At the perch the level is cleared: a short fanfare, and
 * the next level comes, quicker and busier. The first ten levels are laid out by hand; after them each
 * level comes from the run's seed, the ramp going on. The score is the rows the owl reaches for the
 * first time in each level, and one more for each level cleared: seven a level.
 */
import { HOP_LANES, HOP_MS } from '@owl-park/shared';
import { FIELD_W, STEP_MS, StepClock, count, runRandom } from './field';

/** Rows from the start kerb (0) through the lanes to the perch (HOP_ROWS - 1), bottom to top. */
export const HOP_ROWS = HOP_LANES + 2;
const ROW_H = 80;
/** The row's middle, in field pixels (the painted street's kerbs and lanes sit on these). */
export const rowY = (row: number) => 580 - row * ROW_H;
/** The columns the owl hops between on solid ground, and where each one's middle is. */
export const HOP_COLS = 7;
export const COL_W = FIELD_W / HOP_COLS;
export const colX = (col: number) => COL_W * (col + 0.5);
const START_COL = 3;
/** How wide the owl is to the traffic and the field's edges, and how much of it may hang off a log. */
export const OWL_HALF = 16;
const LOG_GRIP = 6;
/** Hazards and logs go round a loop this far beyond the field's edges. */
const WRAP = 140;
export const LANE_LOOP = FIELD_W + 2 * WRAP;
/** A hazard lane leaves the owl at least this long to hop through it at the lane's pace (s). */
export const PASS_S = 0.5;
/** Water between logs, at least (field pixels). */
export const LOG_GAP = 60;
/** Lives a run starts with. */
export const HOP_LIVES = 3;
/** The fanfare between levels, and how long a hit shows before the owl is back at the kerb (ms). */
export const FANFARE_MS = 1400;
export const RESPAWN_MS = 700;

export type LaneKind = 'safe' | 'road' | 'air' | 'river';
export type ItemKind = 'cart' | 'drone' | 'bat' | 'log';
export type HopDir = 'up' | 'down' | 'left' | 'right';
export type HopEnd = 'bumped' | 'splash' | 'carried';

export interface Item {
  kind: ItemKind;
  /** Middle, field pixels. */
  x: number;
  w: number;
}

export interface Lane {
  kind: LaneKind;
  /** 1 moves right, -1 left. */
  dir: 1 | -1;
  /** Field pixels per second. */
  speed: number;
  items: Item[];
}

/** A lane as a level lays it out: its kind, its pace and how many hazards or logs go round its loop. */
interface LaneDef {
  kind: LaneKind;
  speed: number;
  n: number;
}

const S = (): LaneDef => ({ kind: 'safe', speed: 0, n: 0 });
const road = (speed: number, n: number): LaneDef => ({ kind: 'road', speed, n });
const air = (speed: number, n: number): LaneDef => ({ kind: 'air', speed, n });
const river = (speed: number, n: number): LaneDef => ({ kind: 'river', speed, n });

/** The ten levels laid out by hand, each from the kerb up. Rivers come at level 4, and bats join the drones there too. */
export const LEVELS: readonly (readonly LaneDef[])[] = [
  [road(60, 2), S(), road(70, 2), road(60, 2), S()],
  [road(70, 3), road(80, 2), S(), air(110, 2), road(70, 2)],
  [road(80, 3), air(120, 2), road(90, 3), S(), road(80, 3)],
  [S(), river(50, 3), river(60, 3), S(), road(90, 3)],
  [road(90, 3), road(100, 3), river(60, 3), river(70, 3), air(130, 3)],
  [air(130, 3), road(100, 3), river(70, 3), river(80, 2), road(100, 3)],
  [road(100, 3), river(70, 3), river(80, 3), S(), air(140, 3)],
  [air(140, 3), air(150, 3), river(80, 2), road(110, 4), road(120, 3)],
  [road(120, 4), river(90, 2), river(100, 2), air(150, 4), road(120, 4)],
  [river(90, 2), river(100, 2), river(110, 2), road(130, 4), air(160, 4)],
];

/**
 * A level after the tenth, from the run's seed: a pavement to rest on at a row from 2 to 4 and the
 * rest hazards or rivers, quicker each level up to twice the pace, and busier every third.
 */
function laterLevel(level: number, rnd: () => number): LaneDef[] {
  const ramp = level - LEVELS.length;
  const pace = 1 + Math.min(1, ramp * 0.08);
  const busy = Math.min(2, Math.floor(ramp / 3));
  const rest = 2 + Math.floor(rnd() * 3);
  return Array.from({ length: HOP_LANES }, (_, i) => {
    if (i + 1 === rest) return S();
    const pick = rnd();
    if (pick < 0.4) return road(Math.round((110 + rnd() * 30) * pace), 3 + busy);
    if (pick < 0.7) return air(Math.round((140 + rnd() * 30) * pace), 3 + busy);
    return river(Math.round((90 + rnd() * 20) * pace), busy > 1 ? 2 : 3);
  });
}

const ITEM_W: Readonly<Record<Exclude<ItemKind, 'log'>, number>> = { cart: 96, drone: 44, bat: 40 };

/** A place on a lane's loop, as the lanes keep it: from just off the field's left edge round to its right. */
const onLoop = (x: number) => (((x % LANE_LOOP) + LANE_LOOP) % LANE_LOOP) - WRAP;

/** A level's lanes from the kerb up, their hazards and logs spread round each loop from the run's random numbers. */
export function levelLanes(level: number, rnd: () => number): Lane[] {
  const defs = level <= LEVELS.length ? LEVELS[level - 1]! : laterLevel(level, rnd);
  let dir: 1 | -1 = rnd() < 0.5 ? 1 : -1;
  return defs.map((d) => {
    const lane: Lane = { kind: d.kind, dir, speed: d.speed, items: [] };
    dir = dir === 1 ? -1 : 1;
    if (d.kind === 'safe') return lane;
    if (d.kind === 'river') {
      // Logs long enough to land on, each in its share of the loop with water after it.
      const share = LANE_LOOP / d.n;
      const offset = rnd() * share;
      for (let i = 0; i < d.n; i++) {
        const w = Math.round(Math.min(share - LOG_GAP - 10, 120 + rnd() * 90));
        lane.items.push({ kind: 'log', x: onLoop(offset + i * share + w / 2 + rnd() * (share - w - LOG_GAP)), w });
      }
      return lane;
    }
    // Hazards with a gap after each that the owl can hop through at the lane's pace: as many as fit.
    const w = d.kind === 'road' ? ITEM_W.cart : ITEM_W.drone;
    const gap = 2 * OWL_HALF + d.speed * PASS_S;
    const n = Math.max(1, Math.min(d.n, Math.floor(LANE_LOOP / (w + gap))));
    const share = LANE_LOOP / n;
    const offset = rnd() * share;
    for (let i = 0; i < n; i++) {
      const kind = d.kind === 'road' ? 'cart' : level >= 4 && rnd() < 0.5 ? 'bat' : 'drone';
      const iw = ITEM_W[kind];
      lane.items.push({ kind, x: onLoop(offset + i * share + iw / 2 + rnd() * (share - w - gap)), w: iw });
    }
    return lane;
  });
}

/** A hop under way: from where to where, and how far along (0 to 1). */
export interface Hop {
  fromRow: number;
  toRow: number;
  fromX: number;
  toX: number;
  t: number;
}

export class HopGame {
  readonly game = 'crossing' as const;
  /** The level being played (1 is the first). */
  level = 1;
  lanes: Lane[];
  /** The row the owl stands on, or hops from, and where it stands across the field. */
  row = 0;
  x = colX(START_COL);
  hop: Hop | null = null;
  lives = HOP_LIVES;
  score = 0;
  /** The highest row reached in this level: going further scores. */
  best = 0;
  /** Levels cleared this run. */
  cleared = 0;
  over = false;
  /** How the last life went (and so the run, once over). */
  end: HopEnd | null = null;
  /** Field time the run has gone (ms). */
  time = 0;
  /** A pause in the play, and until when: a level's fanfare, or a hit showing before the owl is back at the kerb. */
  waiting: 'fanfare' | 'respawn' | null = null;
  waitUntil = 0;
  private clock = new StepClock();

  constructor(readonly seed: number) {
    this.lanes = levelLanes(1, runRandom(seed, 'level 1'));
  }

  /** A copy to look ahead with: the same field, owl and clock, played on without touching this one. */
  clone(): HopGame {
    const copy = Object.create(HopGame.prototype) as HopGame;
    return Object.assign(copy, this, {
      lanes: this.lanes.map((l) => ({ ...l, items: l.items.map((it) => ({ ...it })) })),
      hop: this.hop && { ...this.hop },
      clock: this.clock.copy(),
    });
  }

  /** The lane at a row (none for the kerb and the perch). */
  laneAt(row: number): Lane | null {
    return row >= 1 && row <= HOP_LANES ? this.lanes[row - 1]! : null;
  }

  /** The row the owl counts as standing on: its landing row from halfway through a hop. */
  get standing(): number {
    return this.hop && this.hop.t >= 0.5 ? this.hop.toRow : this.row;
  }

  /** Where the owl is this moment: across the field, and its row (between two rows mid-hop). */
  get at(): { x: number; row: number } {
    if (!this.hop) return { x: this.x, row: this.row };
    const { fromRow, toRow, fromX, toX, t } = this.hop;
    return { x: fromX + (toX - fromX) * t, row: fromRow + (toRow - fromRow) * t };
  }

  /** The line over the field as the run goes: the level and the lives, or what just happened. */
  get banner(): string {
    if (this.over) return '';
    if (this.waiting === 'fanfare') return `Level ${this.level} cleared!`;
    const lives = count(this.lives, 'life', 'lives');
    return this.waiting === 'respawn' ? `${HIT_LINE[this.end ?? 'bumped']} ${lives} left` : `Level ${this.level} · ${lives}`;
  }

  /** One hop, unless one is under way, the play is paused, or it would leave the field. */
  hopTo(dir: HopDir): void {
    if (this.over || this.hop || this.waiting) return;
    const toRow = this.row + (dir === 'up' ? 1 : dir === 'down' ? -1 : 0);
    if (toRow < 0 || toRow >= HOP_ROWS) return;
    let toX = this.x;
    if (dir === 'left' || dir === 'right') {
      // Sideways on solid ground is to the next column; on a log, a column's width along it.
      const step = dir === 'left' ? -COL_W : COL_W;
      toX = this.laneAt(this.row)?.kind === 'river' ? this.x + step : colX(Math.round((this.x + step) / COL_W - 0.5));
      if (toX < OWL_HALF || toX > FIELD_W - OWL_HALF) return;
    } else if (this.laneAt(toRow)?.kind !== 'river') {
      // Onto solid ground: its nearest column.
      toX = colX(Math.min(HOP_COLS - 1, Math.max(0, Math.round(this.x / COL_W - 0.5))));
    }
    this.hop = { fromRow: this.row, toRow, fromX: this.x, toX, t: 0 };
  }

  /** A tap on the field: a hop forward. */
  tap(): void {
    this.hopTo('up');
  }

  advance(ms: number): void {
    if (this.over) return;
    this.clock.advance(ms, () => this.step());
  }

  private step(): boolean {
    this.time += STEP_MS;
    const dt = STEP_MS / 1000;
    for (const lane of this.lanes) {
      for (const it of lane.items) {
        it.x += lane.dir * lane.speed * dt;
        if (lane.dir > 0 && it.x - it.w / 2 > FIELD_W + WRAP) it.x -= LANE_LOOP;
        if (lane.dir < 0 && it.x + it.w / 2 < -WRAP) it.x += LANE_LOOP;
      }
    }
    if (this.waiting) {
      if (this.time >= this.waitUntil) {
        if (this.waiting === 'fanfare') this.nextLevel();
        else this.toKerb();
        this.waiting = null;
      }
      return true;
    }
    // On a log the owl goes where the log goes, and so does a hop along it.
    const ride = this.laneAt(this.row);
    if (ride?.kind === 'river' && (!this.hop || this.hop.toRow === this.row)) {
      const dx = ride.dir * ride.speed * dt;
      if (this.hop) {
        this.hop.fromX += dx;
        this.hop.toX += dx;
      } else this.x += dx;
    }
    if (this.hop) {
      this.hop.t = Math.min(1, this.hop.t + STEP_MS / HOP_MS);
      if (this.hop.t >= 1) this.land();
      if (this.waiting) return true;
    }
    const hit = this.hit();
    if (hit) this.lose(hit);
    return !this.over;
  }

  /** A hop's landing: a row reached for the first time this level scores, and the perch clears the level. */
  private land(): void {
    const hop = this.hop!;
    this.row = hop.toRow;
    this.x = hop.toX;
    this.hop = null;
    if (this.row > this.best) {
      this.score += this.row - this.best;
      this.best = this.row;
    }
    if (this.row === HOP_ROWS - 1) {
      this.score += 1;
      this.cleared += 1;
      this.waiting = 'fanfare';
      this.waitUntil = this.time + FANFARE_MS;
    }
  }

  /** Whether the owl, across the field at `x`, stands on one of a river's logs. */
  private onLog(lane: Lane, x: number): boolean {
    return lane.items.some((it) => Math.abs(it.x - x) <= it.w / 2 + LOG_GRIP);
  }

  /** What hits the owl where it is now, if anything. */
  hit(): HopEnd | null {
    const lane = this.laneAt(this.standing);
    if (!lane || lane.kind === 'safe') return null;
    const { x } = this.at;
    if (lane.kind === 'river') {
      // Over the water the owl is in the air until it lands: on a log, or in the river.
      if (this.hop) return null;
      if (!this.onLog(lane, x)) return 'splash';
      return x < OWL_HALF || x > FIELD_W - OWL_HALF ? 'carried' : null;
    }
    return lane.items.some((it) => Math.abs(it.x - x) < it.w / 2 + OWL_HALF) ? 'bumped' : null;
  }

  /** A life gone: the run is over at the last; else the hit shows a moment, the owl where it was. */
  private lose(how: HopEnd): void {
    const { x } = this.at;
    this.row = this.standing;
    this.x = x;
    this.hop = null;
    this.end = how;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.over = true;
      return;
    }
    this.waiting = 'respawn';
    this.waitUntil = this.time + RESPAWN_MS;
  }

  private toKerb(): void {
    this.row = 0;
    this.x = colX(START_COL);
  }

  /** The next level: its lanes, and the owl at its kerb. */
  private nextLevel(): void {
    this.level += 1;
    this.lanes = levelLanes(this.level, runRandom(this.seed, `level ${this.level}`));
    this.best = 0;
    this.toKerb();
  }

  /** The run-over line. */
  overLine(): string {
    return `${HIT_LINE[this.end ?? 'bumped']} ${count(this.cleared, 'level', 'levels')} cleared.`;
  }
}

const HIT_LINE: Readonly<Record<HopEnd, string>> = { bumped: 'Bumped!', splash: 'Splash!', carried: 'Swept away!' };
