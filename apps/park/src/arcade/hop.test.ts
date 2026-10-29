import { describe, expect, it } from 'vitest';
import { HOP_LANES, HOP_MS, leastRunMs, plausibleRun } from '@owl-park/shared';
import { FIELD_W, runRandom } from './field';
import {
  COL_W,
  FANFARE_MS,
  HOP_LIVES,
  HOP_ROWS,
  HopGame,
  LANE_LOOP,
  LEVELS,
  LOG_GAP,
  OWL_HALF,
  PASS_S,
  RESPAWN_MS,
  colX,
  levelLanes,
  type HopDir,
  type Lane,
} from './hop';

const FRAME = 1000 / 60;

/** Plays on for `ms`, a frame at a time, as a page does. */
const play = (g: HopGame, ms: number) => {
  for (let t = 0; t < ms; t += FRAME) g.advance(FRAME);
};

/** One hop, played until it lands (or the owl is hit on the way). */
const hop = (g: HopGame, dir: HopDir) => {
  g.hopTo(dir);
  play(g, HOP_MS + 20);
};

/** A level with nothing in its lanes: the owl alone. */
const emptied = (g: HopGame, kinds: Lane['kind'][] = ['safe', 'safe', 'safe', 'safe', 'safe']) => {
  g.lanes = kinds.map((kind) => ({ kind, dir: 1 as const, speed: 0, items: [] }));
  return g;
};

/** The edge-to-edge gaps between a lane's items round its loop. */
function gaps(lane: Lane): number[] {
  const on = lane.items.map((it) => ({ left: (((it.x - it.w / 2) % LANE_LOOP) + LANE_LOOP) % LANE_LOOP, w: it.w })).sort((a, b) => a.left - b.left);
  return on.map((it, i) => {
    const next = on[(i + 1) % on.length]!;
    return (((next.left - (it.left + it.w)) % LANE_LOOP) + LANE_LOOP) % LANE_LOOP;
  });
}

// ---------- a careful owl: a search over hops and waits, ahead of the play ----------

type Act = 'wait' | HopDir;
const ACTS: readonly Act[] = ['up', 'wait', 'left', 'right', 'down'];
/** A wait is three frames (50 ms); a hop is played until it lands. */
function act(g: HopGame, a: Act): boolean {
  if (a === 'wait') {
    for (let i = 0; i < 3; i++) g.advance(FRAME);
    return true;
  }
  g.hopTo(a);
  if (!g.hop) return false;
  while (g.hop && !g.over) g.advance(FRAME);
  return true;
}

/**
 * The quickest way to the perch from here that loses no life, found by trying hops and waits ahead
 * (best first, by time plus the rows left), or null within `limitMs` of play.
 */
function planLevel(start: HopGame, limitMs = 40_000): Act[] | null {
  interface Node {
    g: HopGame;
    f: number;
    from: Node | null;
    a: Act | null;
  }
  const lives = start.lives;
  const cleared = start.cleared;
  const heap: Node[] = [];
  const push = (n: Node) => {
    heap.push(n);
    for (let i = heap.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (heap[p]!.f <= heap[i]!.f) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = (): Node => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]!.f < heap[m]!.f) m = l;
        if (r < heap.length && heap[r]!.f < heap[m]!.f) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  const f = (g: HopGame) => g.time + (HOP_ROWS - 1 - g.row) * HOP_MS;
  const seen = new Set<string>();
  push({ g: start, f: f(start), from: null, a: null });
  while (heap.length) {
    const n = pop();
    if (n.g.cleared > cleared) {
      const acts: Act[] = [];
      for (let m: Node | null = n; m?.a; m = m.from) acts.unshift(m.a);
      return acts;
    }
    if (n.g.time - start.time > limitMs) continue;
    for (const a of ACTS) {
      const c = n.g.clone();
      if (!act(c, a) || c.lives < lives || c.over) continue;
      const key = `${Math.round(c.time / 50)}:${c.row}:${Math.round(c.x / 4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      push({ g: c, f: f(c), from: n, a });
    }
  }
  return null;
}

/** Plays level after level as the careful owl does, until `levels` are cleared or no way is found. */
function careful(g: HopGame, levels: number): void {
  while (!g.over && g.cleared < levels) {
    while (g.waiting) g.advance(FRAME);
    const acts = planLevel(g);
    if (!acts) return;
    for (const a of acts) act(g, a);
  }
}

describe('Hoot & Hop', () => {
  it('lays out the same levels for the same seed, and other levels for another', () => {
    const lanes = (seed: number, level: number) => JSON.stringify(levelLanes(level, runRandom(seed, `level ${level}`)));
    expect(JSON.stringify(new HopGame(7).lanes)).toBe(lanes(7, 1));
    for (const level of [1, 5, 14]) {
      expect(lanes(7, level)).toBe(lanes(7, level));
      expect(lanes(7, level)).not.toBe(lanes(8, level));
    }
    // The laid-out levels are the same lanes for every seed; only where things are on them differs.
    const kinds = (seed: number, level: number) => levelLanes(level, runRandom(seed, 'x')).map((l) => `${l.kind}:${l.speed}`);
    for (let level = 1; level <= LEVELS.length; level++) expect(kinds(1, level)).toEqual(kinds(2, level));
  });

  it('brings rivers and bats at level 4, a pavement to rest on in every later level, and quicker lanes as it goes', () => {
    const lanesOf = (level: number, seed = 3) => levelLanes(level, runRandom(seed, `level ${level}`));
    for (let level = 1; level <= 3; level++) {
      expect(lanesOf(level).some((l) => l.kind === 'river')).toBe(false);
      expect(lanesOf(level).flatMap((l) => l.items).some((it) => it.kind === 'bat')).toBe(false);
    }
    expect(lanesOf(4).filter((l) => l.kind === 'river')).toHaveLength(2);
    const bats = [1, 2, 3, 4, 5].flatMap((seed) => [5, 6, 8, 9, 10].flatMap((level) => lanesOf(level, seed).flatMap((l) => l.items)));
    expect(bats.some((it) => it.kind === 'bat')).toBe(true);
    for (let seed = 0; seed < 20; seed++) {
      for (let level = LEVELS.length + 1; level <= 40; level++) {
        const lanes = lanesOf(level, seed);
        expect(lanes).toHaveLength(HOP_LANES);
        expect(lanes.filter((l) => l.kind === 'safe')).toHaveLength(1);
        const rest = lanes.findIndex((l) => l.kind === 'safe') + 1;
        expect(rest).toBeGreaterThanOrEqual(2);
        expect(rest).toBeLessThanOrEqual(4);
      }
    }
    const pace = (level: number) => {
      const lanes = [0, 1, 2, 3, 4].flatMap((seed) => lanesOf(level, seed)).filter((l) => l.kind !== 'safe');
      return lanes.reduce((sum, l) => sum + l.speed, 0) / lanes.length;
    };
    expect(pace(10)).toBeGreaterThan(pace(1));
    expect(pace(30)).toBeGreaterThan(pace(12));
  });

  it('leaves a gap in every hazard lane the owl can hop through at its pace, and water between logs', () => {
    for (let seed = 0; seed < 40; seed++) {
      for (let level = 1; level <= 40; level++) {
        for (const lane of levelLanes(level, runRandom(seed, `level ${level}`))) {
          if (lane.kind === 'safe') {
            expect(lane.items).toHaveLength(0);
            continue;
          }
          expect(lane.items.length, `seed ${seed} level ${level}`).toBeGreaterThan(0);
          const least = lane.kind === 'river' ? LOG_GAP : 2 * OWL_HALF + lane.speed * PASS_S;
          for (const g of gaps(lane)) expect(g, `seed ${seed} level ${level} ${lane.kind}`).toBeGreaterThanOrEqual(least - 0.001);
          for (const it of lane.items) {
            if (lane.kind === 'river') {
              expect(it.kind).toBe('log');
              expect(it.w).toBeGreaterThanOrEqual(120);
              expect(it.w).toBeLessThanOrEqual(210);
            }
            // Every item starts somewhere on its loop, none beyond it.
            expect(it.x).toBeGreaterThanOrEqual(-140);
            expect(it.x).toBeLessThan(LANE_LOOP - 140);
          }
        }
      }
    }
  });

  it('starts at the kerb in the middle, with three lives, at level 1', () => {
    const g = new HopGame(1);
    expect(g.row).toBe(0);
    expect(g.x).toBe(FIELD_W / 2);
    expect(g.lives).toBe(HOP_LIVES);
    expect(g.level).toBe(1);
    expect(g.banner).toBe('Level 1 · 3 lives');
  });

  it('hops four ways a row or a column at a time, one hop at a time, never off the field', () => {
    const g = emptied(new HopGame(3));
    g.hopTo('up');
    g.hopTo('up');
    play(g, HOP_MS + 20);
    expect(g.row).toBe(1);
    hop(g, 'down');
    expect(g.row).toBe(0);
    hop(g, 'down');
    expect(g.row).toBe(0);
    // Three columns to the left edge, and no further.
    for (let i = 0; i < 4; i++) hop(g, 'left');
    expect(g.x).toBeCloseTo(colX(0));
    hop(g, 'right');
    expect(g.x).toBeCloseTo(colX(1));
    for (let i = 0; i < 7; i++) hop(g, 'right');
    expect(g.x).toBeCloseTo(colX(6));
    // Mid-hop the owl is between the two places.
    g.hopTo('left');
    play(g, HOP_MS / 2);
    expect(g.at.x).toBeLessThan(colX(6));
    expect(g.at.x).toBeGreaterThan(colX(5));
    play(g, HOP_MS);
    expect(g.x).toBeCloseTo(colX(5));
  });

  it('scores each row the first time it is reached in a level, and one more for the level at the perch', () => {
    const g = emptied(new HopGame(4));
    hop(g, 'up');
    hop(g, 'up');
    expect(g.score).toBe(2);
    hop(g, 'down');
    hop(g, 'up');
    expect(g.score).toBe(2);
    for (let i = 0; i < HOP_ROWS - 3; i++) hop(g, 'up');
    expect(g.row).toBe(HOP_ROWS - 1);
    expect(g.score).toBe(HOP_ROWS);
    expect(g.cleared).toBe(1);
    expect(g.waiting).toBe('fanfare');
    expect(g.banner).toBe('Level 1 cleared!');
    // No hops in the fanfare; then the next level, the owl at its kerb.
    g.hopTo('down');
    expect(g.hop).toBeNull();
    const first = JSON.stringify(g.lanes);
    play(g, FANFARE_MS);
    expect(g.waiting).toBeNull();
    expect(g.level).toBe(2);
    expect(g.row).toBe(0);
    expect(g.x).toBe(FIELD_W / 2);
    expect(JSON.stringify(g.lanes)).not.toBe(first);
    // A level cleared at the quickest is never quicker than the room server's check allows.
    expect(g.time + 1000).toBeGreaterThanOrEqual(leastRunMs({ game: 'crossing', score: g.score }));
  });

  it('is bumped by a cart from halfway through its hop into the lane, and starts again from the kerb', () => {
    const g = emptied(new HopGame(5), ['road', 'safe', 'safe', 'safe', 'safe']);
    g.lanes[0]!.items = [{ kind: 'cart', x: FIELD_W / 2, w: 96 }];
    g.hopTo('up');
    play(g, HOP_MS * 0.4);
    expect(g.lives).toBe(HOP_LIVES);
    play(g, HOP_MS * 0.2);
    expect(g.lives).toBe(HOP_LIVES - 1);
    expect(g.end).toBe('bumped');
    // The hit shows a moment, the owl where it was hit; hops wait for the owl back at the kerb.
    expect(g.waiting).toBe('respawn');
    expect(g.row).toBe(1);
    expect(g.banner).toBe('Bumped! 2 lives left');
    g.hopTo('up');
    expect(g.hop).toBeNull();
    play(g, RESPAWN_MS + 20);
    expect(g.waiting).toBeNull();
    expect(g.row).toBe(0);
    expect(g.x).toBe(FIELD_W / 2);
    expect(g.level).toBe(1);
  });

  it('rides a log, hops along it, and is swept away at the field’s edge', () => {
    const g = emptied(new HopGame(6), ['river', 'safe', 'safe', 'safe', 'safe']);
    g.lanes[0] = { kind: 'river', dir: 1, speed: 60, items: [{ kind: 'log', x: FIELD_W / 2, w: 200 }] };
    hop(g, 'up');
    expect(g.row).toBe(1);
    expect(g.lives).toBe(HOP_LIVES);
    const landed = g.x;
    play(g, 1000);
    expect(Math.abs(g.x - landed - 60)).toBeLessThan(2);
    // Along the log: a column's width, the log carrying the owl through the hop too.
    const before = g.x;
    hop(g, 'right');
    expect(g.x - before).toBeGreaterThan(COL_W);
    expect(g.x - before).toBeLessThan(COL_W + 20);
    expect(g.lives).toBe(HOP_LIVES);
    // On to the field's edge, where the owl is swept away.
    for (let i = 0; i < 600 && g.lives === HOP_LIVES; i++) g.advance(FRAME);
    expect(g.lives).toBe(HOP_LIVES - 1);
    expect(g.end).toBe('carried');
    expect(g.x).toBeGreaterThan(FIELD_W - OWL_HALF - 2);
  });

  it('falls in the water off a log, on landing and not in the air', () => {
    const g = emptied(new HopGame(7), ['river', 'safe', 'safe', 'safe', 'safe']);
    g.lanes[0] = { kind: 'river', dir: -1, speed: 0, items: [{ kind: 'log', x: 60, w: 120 }] };
    g.hopTo('up');
    play(g, HOP_MS * 0.8);
    expect(g.lives).toBe(HOP_LIVES);
    play(g, HOP_MS * 0.3);
    expect(g.lives).toBe(HOP_LIVES - 1);
    expect(g.end).toBe('splash');
    // A hop onto the log lands on it; sideways off it is back in the water.
    play(g, RESPAWN_MS + 20);
    for (let i = 0; i < 3; i++) hop(g, 'left');
    hop(g, 'up');
    expect(g.row).toBe(1);
    hop(g, 'right');
    expect(g.lives).toBe(HOP_LIVES - 1);
    hop(g, 'right');
    expect(g.lives).toBe(HOP_LIVES - 2);
  });

  it('ends the run with the third life, with the line that says so', () => {
    const g = new HopGame(11);
    for (let i = 0; i < 4000 && !g.over; i++) {
      g.tap();
      g.advance(FRAME);
    }
    expect(g.over).toBe(true);
    expect(g.lives).toBe(0);
    expect(g.banner).toBe('');
    const how = { bumped: 'Bumped!', splash: 'Splash!', carried: 'Swept away!' }[g.end!];
    expect(g.overLine()).toBe(`${how} ${g.cleared} ${g.cleared === 1 ? 'level' : 'levels'} cleared.`);
    // Nothing moves on once it is over.
    const time = g.time;
    play(g, 500);
    expect(g.time).toBe(time);
  });

  it('copies itself to look ahead: the copy plays on as the game would, and the game is untouched', () => {
    const g = new HopGame(12);
    play(g, 1234);
    const copy = g.clone();
    const was = JSON.stringify(g);
    for (const a of ['up', 'wait', 'left', 'wait', 'up'] as const) act(copy, a);
    expect(JSON.stringify(g)).toBe(was);
    for (const a of ['up', 'wait', 'left', 'wait', 'up'] as const) act(g, a);
    expect(JSON.stringify(g)).toBe(JSON.stringify(copy));
  });

  it('can be cleared level after level by a careful owl, the ten laid out by hand and on, within the room server’s check', () => {
    for (const seed of [1, 2, 3]) {
      const g = new HopGame(seed);
      careful(g, LEVELS.length + 2);
      expect(g.cleared, `seed ${seed}: stuck at level ${g.level}`).toBe(LEVELS.length + 2);
      expect(g.lives).toBe(HOP_LIVES);
      expect(g.score).toBe(g.cleared * HOP_ROWS);
      expect(plausibleRun({ game: 'crossing', score: g.score }, g.time)).toBe(true);
    }
  }, 120_000);
});
