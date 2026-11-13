import { ROOMS } from '@owl-park/shared/rooms';
import { describe, expect, it } from 'vitest';
import { HOLDS, playEast, type Play, type PlayEnd } from './newcomer';

/**
 * The ink course's first screen, played as a newcomer plays it (OP-360). Before it was laid again the
 * same plays gave: at the end of the first bridge no plain jump reached the cliff (0 of 25); off that
 * cliff a jump at its very edge overshot the next stone (13 of 27 landed); the walk over the 40 px gap
 * to the third stone dropped under it (16 of 27); the second cliff was the first again; and only a
 * Jump held all the way crossed the last water (6 of 27). The play log's first phone runs after the
 * cleanup fell at each of those places.
 */
const garden = ROOMS['brush-1']!;
const ledgeOf = (id: string) => {
  const stone = (garden.kit!.ledges ?? []).find((l) => l.id === id)!;
  return { x0: stone.x0, x1: stone.x1, top: stone.top };
};
const K1 = ledgeOf('k1');
const C1 = ledgeOf('c1');
const C2 = ledgeOf('c2');
const pond = garden.course!.pits![0]!;
const POND = { x0: Math.min(...pond.map((p) => p.x)), x1: Math.max(...pond.map((p) => p.x)) };
/** Standing on the first stone, and well onto the far bank. */
const ON_K1 = { x: (K1.x0 + K1.x1) / 2, z: K1.top };
const ACROSS = POND.x1 + 60;

const fallsOf = (ends: Array<{ play: Play; end: PlayEnd }>) => ends.filter((e) => e.end.where === 'fall').map((e) => `jump at ${e.play.jumpAt} held ${e.play.holdMs}${e.play.flaps?.length ? `, flaps at ${e.play.flaps.join(' and ')} held ${e.play.flapHoldMs}` : ''}: fell at ${e.end.x}`);

describe('the ink course’s first screen, as a newcomer plays it (OP-360)', () => {
  it('an owl that only walks east from the first stone crosses the pond: each bridge runs onto ground, each stone starts where the walk before it ends', () => {
    const end = playEast(garden, ON_K1, ACROSS, { jumpAt: null, holdMs: 0 });
    expect(end.path).toEqual(['k1', 'k1~', 'isle1', 'k2', 'k2~', 'k3', 'k3~', 'isle2', 'floor1']);
    expect(end.where).toBe('floor1');
  });

  it('one jump anywhere on the way across, a tap or held the whole flight, is never a fall', { timeout: 30_000 }, () => {
    const ends: Array<{ play: Play; end: PlayEnd }> = [];
    for (let x = K1.x1 - 60; x <= POND.x1; x += 60) {
      for (const holdMs of HOLDS) {
        const play = { jumpAt: x, holdMs };
        ends.push({ play, end: playEast(garden, ON_K1, ACROSS, play) });
      }
    }
    expect(ends.length).toBeGreaterThan(200);
    expect(fallsOf(ends)).toEqual([]);
  });

  it('nor is a jump with a flap or two after it, tapped or held', { timeout: 30_000 }, () => {
    const ends: Array<{ play: Play; end: PlayEnd }> = [];
    for (let x = K1.x1 - 60; x <= POND.x1; x += 100) {
      for (const first of [200, 350, 500]) {
        for (const flapHoldMs of [150, Number.POSITIVE_INFINITY]) {
          for (const flaps of [[first], [first, first + 300]]) {
            const play = { jumpAt: x, holdMs: 400, flaps, flapHoldMs };
            ends.push({ play, end: playEast(garden, ON_K1, ACROSS, play) });
          }
        }
      }
    }
    expect(ends.length).toBeGreaterThan(300);
    expect(fallsOf(ends)).toEqual([]);
  });

  it('from the bank’s floor, a jump anywhere in the last strides before the water passes over the first stone and comes down on its bridge', () => {
    const ends: Array<{ play: Play; end: PlayEnd }> = [];
    for (let x = POND.x0 - 220; x < POND.x0; x += 20) {
      for (const holdMs of HOLDS) {
        const play = { jumpAt: x, holdMs };
        ends.push({ play, end: playEast(garden, { x: 200, z: 0 }, ACROSS, play) });
      }
    }
    expect(fallsOf(ends)).toEqual([]);
    for (const e of ends) expect(e.end.path.some((id) => id === 'k1' || id === 'k1~'), `jump at ${e.play.jumpAt}`).toBe(true);
    // What the screen still asks of a walker: the first stone is jumped onto. Walking on is the water.
    expect(playEast(garden, { x: 200, z: 0 }, ACROSS, { jumpAt: null, holdMs: 0 })).toMatchObject({ where: 'fall', x: expect.closeTo(POND.x0, -1) });
  });

  it('off either cliff, walking off its end or jumping at its edge with any hold comes down on the way or the far bank', () => {
    for (const cliff of [C1, C2]) {
      const from = { x: cliff.x1 - 120, z: cliff.top };
      const ends: Array<{ play: Play; end: PlayEnd }> = [{ play: { jumpAt: null, holdMs: 0 }, end: playEast(garden, from, ACROSS, { jumpAt: null, holdMs: 0 }) }];
      // From three strides before the edge to a stride past it (the grace a jump has after a ledge's end).
      for (const short of [60, 40, 20, 0, -20]) {
        for (const holdMs of HOLDS) {
          const play = { jumpAt: cliff.x1 - short, holdMs };
          ends.push({ play, end: playEast(garden, from, ACROSS, play) });
        }
      }
      expect(fallsOf(ends)).toEqual([]);
    }
  });

  it('a Jump held from the last strides of the bridge before a cliff, or the first of the island at its foot, rises on the air beside it to the cliff', () => {
    for (const [cliff, stone] of [[C1, 'k1'], [C2, 'k3']] as const) {
      const from = ledgeOf(stone);
      const bridgeEnd = from.x1 + 480;
      for (let x = bridgeEnd - 200; x <= bridgeEnd + 20; x += 20) {
        const end = playEast(garden, { x: (from.x0 + from.x1) / 2, z: from.top }, cliff.x1 + 400, { jumpAt: x, holdMs: Number.POSITIVE_INFINITY });
        expect(end.path, `a Jump held from ${x}`).toContain(cliff === C1 ? 'c1' : 'c2');
        expect(end.where).not.toBe('fall');
      }
    }
  });
});
