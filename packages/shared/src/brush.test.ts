import { describe, expect, it } from 'vitest';
import { BRIDGE_LEN, BRIDGE_MS, RAIN_BRIDGE_MS, brushPerches, brushStrokes, inkLeft, livePerches, liveStrokes, stoneUnder, type BrushStone } from './brush';
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

  it('keep their ink four seconds from the landing, or two out in the rain', () => {
    expect(inkLeft(across, undefined, 1000)).toBe(0);
    expect(inkLeft(across, 1000, 1000)).toBe(BRIDGE_MS);
    expect(inkLeft(across, 1000, 1000 + BRIDGE_MS)).toBe(0);
    expect(inkLeft({ ms: RAIN_BRIDGE_MS }, 1000, 2500)).toBe(500);
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
