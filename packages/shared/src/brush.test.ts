import { describe, expect, it } from 'vitest';
import { BRIDGE_LEN, BRIDGE_MS, BRUSH_SWEEP, NO_TOUCH, RAIN_BRIDGE_MS, brushPerches, brushStrokes, brushTouch, inkLeft, livePerches, liveStrokes, paintsStone, stoneUnder, type BrushStone } from './brush';
import { FLAP_RISE, JUMP_RISE, MAX_FLAPS } from './flight';
import { groundAt, MAX_PERCH_TOP } from './perches';

const G = 770;
const across: BrushStone = { id: 'k1', x0: 480, x1: 620, top: 100, arrow: 'R' };
const back: BrushStone = { id: 'k12', x0: 1060, x1: 1180, top: 150, arrow: 'L' };
const up: BrushStone = { id: 'k4', x0: 4100, x1: 4260, top: 100, arrow: 'U' };
const high: BrushStone = { id: 'k13', x0: 440, x1: 560, top: 300, arrow: 'U' };

describe('brush stones (OP-235)', () => {
  it('paint a bridge from the edge their arrow points to, at their own top', () => {
    expect(brushStrokes(across)).toEqual([{ id: 'k1~', stone: 'k1', x0: 620, x1: 620 + BRIDGE_LEN, top: 100, kind: 'bridge' }]);
    expect(brushStrokes(back)).toEqual([{ id: 'k12~', stone: 'k12', x0: 1060 - BRIDGE_LEN, x1: 1060, top: 150, kind: 'bridge' }]);
  });

  it('paint three treads up, a single jump apart, centred over the stone, none over the highest a perch may be', () => {
    expect(brushStrokes(up).map((s) => [s.id, s.x0, s.x1, s.top])).toEqual([
      ['k4~1', 4100, 4260, 230],
      ['k4~2', 4100, 4260, 360],
      ['k4~3', 4100, 4260, 490],
    ]);
    const tops = brushStrokes(high).map((s) => s.top);
    expect(tops).toEqual([430]);
    expect(Math.max(...tops)).toBeLessThanOrEqual(MAX_PERCH_TOP);
  });

  it('keep their ink six seconds from the landing, or four out in the rain (eased for younger players, Nov 7)', () => {
    expect([BRIDGE_MS, RAIN_BRIDGE_MS]).toEqual([6000, 4000]);
    expect(inkLeft(across, undefined, 1000)).toBe(0);
    expect(inkLeft(across, 1000, 1000)).toBe(BRIDGE_MS);
    expect(inkLeft(across, 1000, 1000 + BRIDGE_MS)).toBe(0);
    expect(inkLeft({ ms: RAIN_BRIDGE_MS }, 1000, 4500)).toBe(500);
  });

  it('lets an owl stand on a bridge only while it lasts, and drop through once it fades', () => {
    const perches = brushPerches([across, up], G);
    expect(perches.map((p) => p.id)).toEqual(['k1~', 'k4~1', 'k4~2', 'k4~3']);
    const onBridge = { x: 900, y: G };
    const painted = new Map([['k1', 0]]);
    expect(groundAt(livePerches(perches, [across, up], painted, 1000), onBridge, 100)).toBe(100);
    expect(groundAt(livePerches(perches, [across, up], painted, BRIDGE_MS + 1), onBridge, 100)).toBe(0);
    expect(groundAt(livePerches(perches, [across, up], new Map(), 0), onBridge, 100)).toBe(0);
    expect([...liveStrokes([across, up], new Map([['k4', 0]]), 10)]).toEqual(['k4~1', 'k4~2', 'k4~3']);
  });

  it('knows the stone an owl stands on, at its top only', () => {
    expect(stoneUnder([across, up], 500, 100)?.id).toBe('k1');
    expect(stoneUnder([across, up], 500, 160)).toBeUndefined();
    expect(stoneUnder([across, up], 700, 100)).toBeUndefined();
  });
});

describe('what paints a brush stone (OP-360)', () => {
  const stones = [across, up];

  it('an owl standing on a stone touches it, and one standing anywhere else touches none', () => {
    expect(brushTouch(stones, 500, 100, true)).toEqual({ stone: 'k1', standing: true });
    // On the floor under the stone, on a tread over one, and beside it on its own bridge.
    expect(brushTouch(stones, 500, 0, true)).toBe(NO_TOUCH);
    expect(brushTouch(stones, 4180, 230, true)).toBe(NO_TOUCH);
    expect(brushTouch(stones, 700, 100, true)).toBe(NO_TOUCH);
    expect(brushTouch(undefined, 500, 100, true)).toBe(NO_TOUCH);
  });

  it('an owl in the air touches the stone it is over, from its top up to the sweep and no higher', () => {
    expect(brushTouch(stones, 500, 100, false)).toEqual({ stone: 'k1', standing: false });
    expect(brushTouch(stones, 480, 100 + BRUSH_SWEEP, false)).toEqual({ stone: 'k1', standing: false });
    expect(brushTouch(stones, 620, 180, false)).toEqual({ stone: 'k1', standing: false });
    expect(brushTouch(stones, 500, 100 + BRUSH_SWEEP, false)).toEqual({ stone: 'k1', standing: false });
    // A glide high overhead, a jump still coming up under the stone, and the air either side of it.
    expect(brushTouch(stones, 500, 100 + BRUSH_SWEEP + 1, false)).toBe(NO_TOUCH);
    expect(brushTouch(stones, 500, 99, false)).toBe(NO_TOUCH);
    expect(brushTouch(stones, 479, 150, false)).toBe(NO_TOUCH);
    expect(brushTouch(stones, 621, 150, false)).toBe(NO_TOUCH);
  });

  it('the sweep is as high as a jump with every flap rises, so no jump from the stone’s own height goes over it unpainted', () => {
    expect(BRUSH_SWEEP).toBeGreaterThanOrEqual(JUMP_RISE + MAX_FLAPS * FLAP_RISE);
    // And not the whole sky: an owl gliding in from the top of the room paints nothing under it.
    expect(BRUSH_SWEEP).toBeLessThan(MAX_PERCH_TOP);
  });

  it('a landing paints, and so does coming over the stone in the air; staying on it or over it does not', () => {
    const on = { stone: 'k1', standing: true };
    const over = { stone: 'k1', standing: false };
    // A landing: from the air beside it, from the air over it, and as a room starts with the owl on it.
    expect(paintsStone(NO_TOUCH, on)).toBe(true);
    expect(paintsStone(over, on)).toBe(true);
    expect(paintsStone(undefined, on)).toBe(true);
    // Coming over it in the air, from beside it or from another stone.
    expect(paintsStone(NO_TOUCH, over)).toBe(true);
    expect(paintsStone({ stone: 'k4', standing: true }, over)).toBe(true);
    expect(paintsStone(undefined, over)).toBe(true);
    // Still standing on it; a jump up off it; still over it.
    expect(paintsStone(on, on)).toBe(false);
    expect(paintsStone(on, over)).toBe(false);
    expect(paintsStone(over, over)).toBe(false);
    // Touching none paints none.
    expect(paintsStone(on, NO_TOUCH)).toBe(false);
    expect(paintsStone(undefined, NO_TOUCH)).toBe(false);
  });
});
