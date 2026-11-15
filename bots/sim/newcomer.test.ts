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

/**
 * The Blackout Circuit's first screen, played as a newcomer plays it (OP-378). Before it was laid again
 * the first breaker stood on the first high roof, two jumps up by way of a timed sign: of 2,640 plays
 * of one press (a tap to a held glide, a flap or two after it, pressed anywhere from the start to the
 * roof, the signs met at eight times of their cycle) not one stood on that roof. Now the first breaker
 * stands on the air unit by the start, one hop up over the deck.
 */
describe('the Blackout Circuit’s first screen, as a newcomer plays it (OP-378)', () => {
  const circuit = ROOMS['circuit-1']!;
  const box = (circuit.kit!.ledges ?? []).find((l) => l.id === 'ac1')!;
  const breaker = circuit.course!.parts!.find((p) => p.id === 'breaker-1')!;
  const START = { x: circuit.spawns.default!.x, z: 0 };
  const play = (p: Play) => playEast(circuit, START, breaker.at.x, p);

  it('the first breaker stands on the air unit by the start, the first landing, and a glint marks it until it is on', () => {
    expect(breaker.top).toBe(box.top);
    expect(breaker.at.x).toBeGreaterThan(box.x0);
    expect(breaker.at.x).toBeLessThan(box.x1);
    expect(circuit.course!.leads).toEqual([{ id: 'lead-1', at: breaker.at, top: box.top, until: 'breaker-1' }]);
  });

  it('a plain jump anywhere in the last strides before the box, a tap or held the whole flight, comes down on it by the breaker: the first try', () => {
    for (let x = box.x0 - 100; x <= box.x0 - 20; x += 20) {
      for (const holdMs of HOLDS) expect(play({ jumpAt: x, holdMs }).where, `jump at ${x} held ${holdMs}`).toBe('ac1');
    }
  });

  // A Jump held the whole way with two flaps after it still glides from the deck over the high roof's
  // foot and into the street (it comes down past 1,440): the deck is not long enough to land that glide.
  it('no play of one press, or a press and a flap, on the way to it is a fall: a jump too early, too late or flapped over the box comes down on the deck to try again', () => {
    const ends: Array<{ play: Play; end: PlayEnd }> = [];
    for (let x = START.x; x <= box.x1; x += 20) {
      for (const holdMs of HOLDS) {
        for (const flaps of [[], [300]]) {
          for (const flapHoldMs of [150, Number.POSITIVE_INFINITY]) {
            const p = { jumpAt: x, holdMs, flaps, flapHoldMs };
            ends.push({ play: p, end: play(p) });
          }
        }
      }
    }
    expect(ends.length).toBeGreaterThanOrEqual(300);
    expect(fallsOf(ends)).toEqual([]);
    // Even pressed anywhere from the start to the box's far end (under it and past it too), with a flap or
    // none, a third of the plays take the breaker at once; the rest are back on the deck by it.
    const took = ends.filter((e) => e.end.where === 'ac1').length;
    expect(took / ends.length).toBeGreaterThan(0.3);
    // What the screen asks: one hop. Walking on passes under the box.
    expect(play({ jumpAt: null, holdMs: 0 }).where).toBe('floor0');
  });
});

/**
 * The Updraft Canopy's first screen, played as a newcomer plays it (OP-361). Before it was laid again
 * the fern floor ended at 700 in bramble that ran to 1500, with every hop from the boulders to the
 * first bough over it: of the one-press plays from the boulders and fronds (a tap to a Jump held the
 * whole flight, with or without one flap) 153 of 440 came down in it before they stood anywhere, and
 * a fall sent the owl back to the door. From the last frond no play but a held Jump got up to the
 * bough, and that one rode the rising air and glided on past the bough and its bell (0 of 17 came down
 * on it). Now the fern floor runs on under the fronds, so
 * a miss is ground to walk back from; the rising air stands from the frond's end to over the bough and
 * tops out just above it, so the Jump held from the frond comes down on the bough; and a bench on that
 * frond keeps a fall further on from sending the owl back to the door.
 */
const canopy = ROOMS['canopy-1']!;
const canopyLedge = (id: string) => {
  const l = (canopy.kit!.ledges ?? []).find((k) => k.id === id)!;
  return { x0: l.x0, x1: l.x1, top: l.top };
};
const SCREEN = 1600;

describe('the Updraft Canopy’s first screen, as a newcomer plays it (OP-361)', () => {
  // Each place an owl stands on the first screen, and the stretch it presses Jump over going east.
  const STARTS: ReadonlyArray<readonly [string, { x: number; z: number }, number, number]> = [
    ['the floor by the door', { x: canopy.spawns.default!.x, z: 0 }, canopy.spawns.default!.x, 680],
    ...(['s1', 's2', 'f1', 'f2'] as const).map((id) => {
      const l = canopyLedge(id);
      return [id, { x: l.x0, z: l.top }, l.x0, l.x1] as const;
    }),
    ['the fern hollow', { x: 700, z: 0 }, 700, 1460],
    ['the first bough', { x: canopyLedge('b1').x0, z: canopyLedge('b1').top }, canopyLedge('b1').x0, SCREEN - 20],
  ];

  it('has no pit on it: the fern floor runs from the door to past the first bough', () => {
    for (const p of canopy.course!.pits ?? []) expect(Math.min(...p.map((v) => v.x))).toBeGreaterThan(canopyLedge('b1').x1);
  });

  it('no play of one press, a tap or held the whole flight, with or without a flap, falls anywhere on it', { timeout: 60_000 }, () => {
    const ends: Array<{ play: Play; end: PlayEnd }> = [];
    for (const [, from, x0, x1] of STARTS) {
      for (let x = x0; x <= x1; x += 20) {
        for (const holdMs of HOLDS) {
          for (const flaps of [[], [300]]) {
            const play = { jumpAt: x, holdMs, flaps, flapHoldMs: 150 };
            ends.push({ play, end: playEast(canopy, from, SCREEN, play) });
          }
        }
      }
    }
    expect(ends.length).toBeGreaterThan(700);
    // A Jump held the whole flight from under the rising air can carry an owl past the screen's end: what comes of it there is the next screen's.
    expect(fallsOf(ends.filter((e) => e.end.x < SCREEN))).toEqual([]);
  });

  it('a Jump held the whole flight from anywhere on the last frond rides the rising air and comes down on the first bough, by its bell', () => {
    const f2 = canopyLedge('f2');
    const b1 = canopyLedge('b1');
    const bell = canopy.course!.parts!.find((p) => p.id === 'bell-1')!;
    expect(bell.at.x).toBeGreaterThan(b1.x0);
    expect(bell.at.x).toBeLessThan(b1.x1);
    for (let x = f2.x0; x <= f2.x1; x += 10) {
      const end = playEast(canopy, { x: f2.x0, z: f2.top }, b1.x0, { jumpAt: x, holdMs: Number.POSITIVE_INFINITY });
      expect(end.where, `held from ${x}`).toBe('b1');
      // With room to spare before the bough's far end.
      expect(b1.x1 - end.x, `held from ${x}`).toBeGreaterThanOrEqual(40);
    }
    // The air stands from the frond's end and tops out over the bough, no higher than a jump off it.
    const u1 = canopy.updrafts!.find((u) => u.id === 'U1')!;
    expect(u1.x).toBeLessThanOrEqual(f2.x1);
    expect(u1.x + u1.w).toBeGreaterThan(b1.x0);
    expect(u1.top).toBeGreaterThan(b1.top);
    expect(u1.top - b1.top).toBeLessThanOrEqual(20);
  });

  it('keeps its bench on that frond, so a fall past the bough sends an owl back one held Jump from it, not to the door', () => {
    const f2 = canopyLedge('f2');
    const bench = [...canopy.course!.benches!].sort((a, b) => a.at.x - b.at.x)[0]!;
    expect(bench.at.x).toBeGreaterThan(f2.x0);
    expect(bench.at.x).toBeLessThan(f2.x1);
    expect(bench.top).toBe(f2.top);
  });
});

/**
 * The ink course's second screen, the river in the rain (OP-361). A newcomer comes to it having been
 * taught, over ground on the first screen, the jump, the full jump and the held Jump (with rising air
 * at each cliff). Before this was laid again the end of the third bridge (k8's, under the temple eave)
 * asked for something never taught: the rock r2 stands 220 up past the mooring post, and of every
 * press from the bridge's last strides, a tap to a Jump held the whole flight, not one came down on
 * it (a jump and a flap a third of a second after it, or a dash, was the only way). Now rising air
 * stands over the post, as it does by the first rock, and a held Jump rides it onto r2 and its bench.
 */
describe('the ink course’s second screen, as a newcomer plays it (OP-361)', () => {
  const river = ROOMS['brush-2']!;
  const ledge = (id: string) => (river.kit!.ledges ?? []).find((l) => l.id === id)!;
  const across = (stone: string, past: readonly string[]) => (play: Play) => {
    const s = ledge(stone);
    const end = playEast(river, { x: (s.x0 + s.x1) / 2, z: s.top }, 4700, play);
    return { end, over: end.path.some((id) => past.includes(id)) };
  };
  /** The bridge each stone paints runs 480 east of it. */
  const bridgeEnd = (stone: string) => ledge(stone).x1 + 480;

  it('at the end of the first bridge, a Jump held from its last strides rides the rising air by the first rock across', () => {
    const play = across('k6', ['r1', 'k7', 'k7~']);
    for (let x = bridgeEnd('k6') - 240; x <= bridgeEnd('k6'); x += 20) {
      expect(play({ jumpAt: x, holdMs: Number.POSITIVE_INFINITY }).over, `a Jump held from ${x}`).toBe(true);
    }
  });

  it('at the end of the third bridge, a Jump held from its last strides rides the rising air over the mooring post onto r2, by its bench', () => {
    const play = across('k8', ['post', 'r2']);
    for (let x = bridgeEnd('k8') - 240; x <= bridgeEnd('k8'); x += 20) {
      const { end, over } = play({ jumpAt: x, holdMs: Number.POSITIVE_INFINITY });
      expect(over, `a Jump held from ${x}: ${end.path.join(' ')}, then ${end.where} at ${end.x}`).toBe(true);
      expect(end.path, `a Jump held from ${x}`).toContain('r2');
    }
    const bench = river.course!.benches!.find((b) => b.id === 'bench-2c')!;
    expect(bench.at.x).toBeGreaterThan(ledge('r2').x0);
    expect(bench.at.x).toBeLessThan(ledge('r2').x1);
  });

  it('the rising air over the post tops out under the post’s lost feather, a flap from it, and lifts no owl past r2', () => {
    const lift = (river.updrafts ?? []).find((u) => u.id === 'post-lift')!;
    const post = ledge('post');
    const r2 = ledge('r2');
    const feather = river.course!.feathers!.find((f) => f.id === 'feather-4')!;
    expect(lift.x).toBeGreaterThanOrEqual(bridgeEnd('k8'));
    expect(lift.x + lift.w).toBeLessThanOrEqual(r2.x0);
    expect(lift.top).toBeGreaterThan(r2.top);
    expect(lift.top).toBeLessThan(post.top);
    expect((feather.top ?? 0) - lift.top).toBe(post.top - lift.top);
    expect(post.top - lift.top).toBeLessThanOrEqual(60);
  });
});

/**
 * The Blackout Circuit's first roof, as a newcomer leaves it (OP-361). The way on from b1 is a glide
 * off its east end on the roof wind to the footbridge; before the deck was laid on under that wind it
 * ended at the roof's own end, 1400, and of the one-press plays off b1 (a tap to a Jump held the whole
 * flight, with or without one flap) 168 of 210 came straight down into the street and back to the
 * bench. Now the deck runs on to 1800, past where any of them comes down, so a miss is deck to walk
 * back from. (Logan, Nov 15, accepted that a strong flyer can ride the wind up from that deck to b1, or
 * flap across to the footbridge, without the sign.)
 */
describe('the Blackout Circuit’s first roof, as a newcomer leaves it (OP-361)', () => {
  const rooftops = ROOMS['circuit-1']!;
  const b1 = (rooftops.kit!.ledges ?? []).find((l) => l.id === 'b1')!;

  it('no play of one press off the first roof comes straight down into the street', { timeout: 60_000 }, () => {
    const ends: Array<{ play: Play; end: PlayEnd }> = [];
    for (let x = b1.x0; x <= b1.x1; x += 20) {
      for (const holdMs of HOLDS) {
        for (const flaps of [[], [300]]) {
          const play = { jumpAt: x, holdMs, flaps, flapHoldMs: 150 };
          ends.push({ play, end: playEast(rooftops, { x: b1.x0, z: b1.top }, 2700, play) });
        }
      }
    }
    expect(ends.length).toBeGreaterThan(200);
    // The bot walks on east once it has stood somewhere, so an owl that comes down on the deck walks off its end later: that is not this.
    expect(fallsOf(ends.filter((e) => e.end.path.length === 1))).toEqual([]);
  });

  it('runs the deck on under the whole roof wind', () => {
    const deck = (rooftops.kit!.paths ?? []).find((p) => p.id === 'deck-a')!;
    const wind = (rooftops.winds ?? []).find((w) => w.id === 'roof-wind')!;
    expect(deck.x1).toBeGreaterThanOrEqual(wind.x1);
    expect(Math.min(...rooftops.course!.pits![0]!.map((v) => v.x))).toBe(deck.x1);
  });
});
