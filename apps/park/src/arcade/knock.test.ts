import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import { GAMES, KNOCK_LEVELS, KNOCK_MAX_SCORE, KNOCK_SHOTS, KNOCK_SHOT_MS, leastRunMs, plausibleRun } from '@owl-park/shared';
import { FIELD_W } from './field';
import { FADE_MS, GROUND_Y, KNOCK_STEP_MS, KnockGame, SHOT_MAX_MS, TARGETS, drawnAt, loadPhysics, piecePoints, shown } from './knock';

const FRAME = 1000 / 60;
type Aim = readonly [angle: number, power: number];

/** Takes a shot at this aim and plays it to its end; how long it took (field ms). */
function shoot(g: KnockGame, [angle, power]: Aim): number {
  g.angle = angle;
  g.power = power;
  const from = g.time;
  g.release();
  for (let t = 0; t < 12_000 && g.phase === 'flying'; t += FRAME) g.advance(FRAME);
  return g.time - from;
}

/** Plays the pause after a target to its end. */
function onward(g: KnockGame): void {
  for (let t = 0; t < 3000 && g.phase === 'between'; t += FRAME) g.advance(FRAME);
}

/** A target played from the start with these shots. */
function played(level: number, shots: readonly Aim[]): KnockGame {
  const g = new KnockGame(Matter, level);
  for (const aim of shots) shoot(g, aim);
  return g;
}

/** A shot into the ground just in front of the slingshot: it knocks nothing. */
const MISS: Aim = [-10, 0.4];

/** The aim, among a grid of them, that scores the most after these shots (the first such, low and gentle first). */
function bestAim(level: number, shots: readonly Aim[]): Aim {
  let best: Aim = MISS;
  let most = -1;
  for (let angle = -10; angle <= 70; angle += 5) {
    for (let power = 0.4; power <= 1.0001; power += 0.05) {
      const g = played(level, shots);
      shoot(g, [angle, power]);
      if (g.score > most) {
        most = g.score;
        best = [angle, power];
      }
    }
  }
  return best;
}

describe('Talon Toss (OP-137)', () => {
  it('stands three targets on their stands inside the field, still until the first shot', () => {
    expect(TARGETS.map((t) => t.name)).toEqual(['the stack', 'the tower', 'the nest']);
    expect(TARGETS).toHaveLength(KNOCK_LEVELS);
    for (let level = 0; level < KNOCK_LEVELS; level++) {
      const g = new KnockGame(Matter, level);
      const at = g.pieces.map((p) => ({ x: p.x, y: p.y }));
      for (const p of g.pieces) {
        expect(p.x).toBeGreaterThan(200);
        expect(p.x).toBeLessThan(FIELD_W);
        expect(p.y).toBeLessThan(GROUND_Y - 30);
        // Where the plan put it, give or take settling.
        const plan = TARGETS[level]!.pieces[g.pieces.indexOf(p)]!;
        expect(Math.hypot(p.x - plan.x, p.y - plan.y)).toBeLessThan(2);
      }
      // Ten seconds and nothing moves, falls or scores.
      g.advance(0);
      for (let t = 0; t < 10_000; t += FRAME) g.advance(FRAME);
      g.pieces.forEach((p, i) => expect(Math.hypot(p.x - at[i]!.x, p.y - at[i]!.y), `${TARGETS[level]!.name}: piece ${i}`).toBeLessThan(1));
      expect(g.score).toBe(0);
      expect(g.phase).toBe('aim');
    }
  });

  it('is worth thirty in all: a point a crate or plank, eight for the nest', () => {
    const all = TARGETS.flatMap((t) => t.pieces).reduce((sum, p) => sum + piecePoints(p.kind), 0);
    expect(all).toBe(KNOCK_MAX_SCORE);
    expect(GAMES.sling.maxScore).toBe(KNOCK_MAX_SCORE);
    expect(TARGETS[2]!.pieces.filter((p) => p.kind === 'nest')).toHaveLength(1);
  });

  it('flies the owl where the dotted path says, until it meets something', () => {
    const g = new KnockGame(Matter, 0);
    g.angle = 40;
    g.power = 0.5;
    const dots = g.path(6, 4);
    g.release();
    expect(g.phase).toBe('flying');
    for (const dot of dots) {
      for (let i = 0; i < 4; i++) g.advance(KNOCK_STEP_MS);
      expect(Math.abs(g.owl.x - dot.x)).toBeLessThan(0.01);
      expect(Math.abs(g.owl.y - dot.y)).toBeLessThan(0.01);
    }
  });

  it('topples a target with a good shot: what fell scores and is cleared away, and the shot ends once all is still', () => {
    const g = new KnockGame(Matter, 0);
    expect(g.banner).toBe('The stack · 5 shots left');
    const took = shoot(g, bestAim(0, []));
    expect(g.score).toBeGreaterThanOrEqual(3);
    expect(g.phase).toBe('aim');
    expect(g.shotsHere).toBe(1);
    expect(g.banner).toBe('The stack · 4 shots left');
    // Still for a second before the next shot, and never more than eight seconds.
    expect(took).toBeGreaterThanOrEqual(1000);
    expect(took).toBeLessThanOrEqual(SHOT_MAX_MS + KNOCK_STEP_MS);
    const down = g.pieces.filter((p) => p.down);
    expect(down.reduce((sum, p) => sum + piecePoints(p.kind), 0)).toBe(g.score);
    expect(g.standing).toHaveLength(g.pieces.length - down.length);
    // Cleared away, fading out (a broken crate is gone at once).
    for (const p of down) {
      if (p.broken) {
        expect(shown(p, g.time)).toBe(0);
        continue;
      }
      expect(p.goneAt).not.toBeNull();
      expect(shown(p, p.goneAt!)).toBe(1);
      expect(shown(p, p.goneAt! + FADE_MS / 2)).toBeCloseTo(0.5);
      expect(shown(p, p.goneAt! + FADE_MS)).toBe(0);
    }
    for (const p of g.standing) expect(shown(p, g.time)).toBe(1);
  });

  it('breaks a crate struck hard, its shards flying a moment', () => {
    const g = new KnockGame(Matter, 0);
    g.angle = 8;
    g.power = 1;
    g.release();
    let shards = 0;
    for (let t = 0; t < 3000; t += FRAME) {
      g.advance(FRAME);
      shards = Math.max(shards, g.shards.length);
    }
    const broken = g.pieces.filter((p) => p.broken);
    expect(broken.length).toBeGreaterThan(0);
    expect(shards).toBeGreaterThanOrEqual(4);
    for (const p of broken) {
      expect(p.down).toBe(true);
      expect(shown(p, g.time)).toBe(0);
    }
    for (let t = 0; t < 1000; t += FRAME) g.advance(FRAME);
    expect(g.shards).toEqual([]);
  });

  it('moves on when a target is down or out of shots, and ends the run after the third', () => {
    // Out of shots at the stack: the tower comes next.
    const a = new KnockGame(Matter, 0);
    for (let i = 0; i < KNOCK_SHOTS; i++) shoot(a, MISS);
    expect(a.phase).toBe('between');
    expect(a.banner).toBe('Out of shots at the stack.');
    expect(a.shots).toBe(KNOCK_SHOTS);
    onward(a);
    expect(a.level).toBe(1);
    expect(a.phase).toBe('aim');
    expect(a.banner).toBe('The tower · 5 shots left');
    // The nest missed five times: the run is over.
    const b = new KnockGame(Matter, 2);
    for (let i = 0; i < KNOCK_SHOTS; i++) shoot(b, MISS);
    onward(b);
    expect(b.over).toBe(true);
    expect(b.phase).toBe('over');
    expect(b.overLine()).toBe('No target down, 0 points.');
    // Aim and launch do nothing once it is over.
    b.release();
    expect(b.shots).toBe(KNOCK_SHOTS);
  });

  it('can be played to all thirty points, each target down before its shots run out, in the time the room counts on', () => {
    let total = 0;
    let shots = 0;
    let time = 0;
    for (let level = 0; level < KNOCK_LEVELS; level++) {
      const aims: Aim[] = [];
      let g = played(level, aims);
      while (g.phase === 'aim' && aims.length < KNOCK_SHOTS) {
        aims.push(bestAim(level, aims));
        g = played(level, aims);
      }
      expect(g.phase, TARGETS[level]!.name).toBe('between');
      expect(g.banner).toMatch(/^(Cleared|The nest is down) in [1-5] shots?!$/);
      expect(g.standing).toEqual([]);
      total += g.score;
      shots += g.shots;
      time += g.time;
    }
    expect(total).toBe(KNOCK_MAX_SCORE);
    expect(plausibleRun({ game: 'sling', score: total, shots }, time)).toBe(true);
    expect(leastRunMs({ game: 'sling', score: total, shots })).toBeLessThanOrEqual(time);
  }, 120_000);

  it('takes at least the time the room counts on for every shot, whatever the aim', () => {
    for (const aim of [MISS, [-30, 1], [0, 1], [80, 1], [80, 0.2], [30, 0.6]] as const) {
      const g = new KnockGame(Matter, 1);
      expect(shoot(g, aim), `aim ${aim.join(', ')}`).toBeGreaterThanOrEqual(KNOCK_SHOT_MS);
    }
  });

  it('says how the run went', () => {
    const g = new KnockGame(Matter, 1);
    for (const aim of [[45, 0.7], [20, 0.8], [15, 0.9]] as const) {
      if (g.phase !== 'aim') break;
      shoot(g, aim);
    }
    Object.assign(g, { cleared: 3, score: 30 });
    expect(g.overLine()).toBe('All three targets down! 30 points.');
    Object.assign(g, { cleared: 1, score: 9 });
    expect(g.overLine()).toBe('1 target down, 9 points.');
    Object.assign(g, { cleared: 0, score: 1 });
    expect(g.overLine()).toBe('No target down, 1 point.');
  });

  it('aims by the pull: back and down sends the owl up and on; hardly a pull launches nothing', () => {
    const g = new KnockGame(Matter, 0);
    g.aimByPull(-100, 100);
    expect(g.angle).toBeCloseTo(45);
    expect(g.power).toBeCloseTo(1);
    g.aimByPull(-60, 0);
    expect(g.angle).toBeCloseTo(0);
    expect(g.power).toBeCloseTo(0.5);
    g.nudge(5, 0.1);
    expect(g.angle).toBeCloseTo(5);
    expect(g.power).toBeCloseTo(0.6);
    g.aimByPull(2, -1);
    g.release();
    expect(g.phase).toBe('aim');
    expect(g.shots).toBe(0);
  });

  it('plays the same shots the same way every time', () => {
    const shots: Aim[] = [[20, 0.9], [8, 1], [35, 0.75]];
    const a = played(0, shots);
    const b = played(0, shots);
    expect(a.score).toBe(b.score);
    expect(a.pieces.map((p) => [p.x, p.y, p.angle, p.down])).toEqual(b.pieces.map((p) => [p.x, p.y, p.angle, p.down]));
  });

  it('draws between two steps', () => {
    const g = new KnockGame(Matter, 0);
    g.angle = 30;
    g.power = 0.8;
    g.release();
    g.advance(KNOCK_STEP_MS * 3.5);
    expect(g.alpha).toBeCloseTo(0.5);
    const at = drawnAt({ x: g.owl.x, y: g.owl.y, angle: 0, px: g.owl.px, py: g.owl.py, pangle: 0 }, g.alpha);
    expect(at.x).toBeCloseTo((g.owl.x + g.owl.px) / 2);
    expect(at.y).toBeCloseTo((g.owl.y + g.owl.py) / 2);
  });

  it('fetches the engine once, for this game only', async () => {
    const [a, b] = await Promise.all([loadPhysics(), loadPhysics()]);
    expect(a).toBe(b);
    expect(typeof a.Engine.create).toBe('function');
  });
});
