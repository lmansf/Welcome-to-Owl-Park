import { describe, expect, it } from 'vitest';
import { FRONT_POINTS_MAX, MASK_LIST_MAX, MASK_REASONS, checkMasks, emptyMasks, isPaintable, ledgesOf, type MaskCheck, type MaskDraft } from './masks';
import { MAX_PERCH_TOP } from './perches';
import { ROOMS } from '../rooms';

// The ledge painter's draft (OP-156): the one check the Worker, the overflow object and the painter make.

const SIZE = { w: 6400, h: 900 };
const TRI = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 150, y: 300 },
];
const GOOD: MaskDraft = {
  ledges: [{ id: 'ledge-1', x0: 100, x1: 300, top: 120 }],
  walls: [{ id: 'wall-1', x: 640, y0: 300, y1: 770 }],
  hazards: [{ id: 'hazard-1', x0: 900, x1: 1000, top: 1 }],
  fronts: [{ id: 'front-1', points: TRI }],
};
/** GOOD with one list's first item changed (or replaced, given a non-object). */
const withItem = (list: keyof MaskDraft, change: unknown): unknown => ({ ...GOOD, [list]: [change !== null && typeof change === 'object' && !Array.isArray(change) ? { ...GOOD[list][0], ...change } : change] });
const refusal = (c: MaskCheck) => (c.ok ? null : { reason: c.reason, list: c.list, index: c.index });

describe('a ledge draft (OP-156)', () => {
  it('takes four lists of items inside the room, copying only their own fields', () => {
    const c = checkMasks(JSON.parse(JSON.stringify(GOOD)), SIZE);
    expect(c).toEqual({ ok: true, draft: GOOD });
    // Edges of the room and of the rules are in: a ledge the room's whole width, a top at the highest perch's, a wall the room's height.
    const edges = { ...emptyMasks(), ledges: [{ id: 'a', x0: 0, x1: 6400, top: MAX_PERCH_TOP }], walls: [{ id: 'b', x: 6400, y0: 0, y1: 900 }], fronts: [{ id: 'c', points: [{ x: 0, y: 0 }, { x: 6400, y: 0 }, { x: 6400, y: 900 }] }] };
    expect(checkMasks(edges, SIZE).ok).toBe(true);
    expect(checkMasks(emptyMasks(), SIZE)).toEqual({ ok: true, draft: emptyMasks() });
  });

  it('refuses a body that is not the four lists and nothing else', () => {
    for (const body of [null, 'ledges', 42, [], { ...GOOD, extra: [] }, { ledges: [], walls: [], hazards: [] }]) {
      expect(refusal(checkMasks(body, SIZE))?.reason, JSON.stringify(body)).toBe('body');
    }
    // A key JSON can carry that an object literal cannot: refused like any other extra.
    expect(refusal(checkMasks(JSON.parse('{"ledges":[],"walls":[],"hazards":[],"fronts":[],"__proto__":[]}'), SIZE))?.reason).toBe('body');
    expect(refusal(checkMasks({ ...GOOD, walls: {} }, SIZE))).toEqual({ reason: 'list', list: 'walls', index: undefined });
  });

  it('holds each list to MASK_LIST_MAX items', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `ledge-${i}`, x0: i, x1: i + 10, top: 50 }));
    expect(checkMasks({ ...emptyMasks(), ledges: many(MASK_LIST_MAX) }, SIZE).ok).toBe(true);
    expect(refusal(checkMasks({ ...emptyMasks(), ledges: many(MASK_LIST_MAX + 1) }, SIZE))).toEqual({ reason: 'too-many', list: 'ledges', index: undefined });
  });

  it('refuses an item with a field missing, extra or of the wrong kind, and says which', () => {
    expect(refusal(checkMasks(withItem('ledges', 'ledge-1'), SIZE))).toEqual({ reason: 'item', list: 'ledges', index: 0 });
    expect(refusal(checkMasks(withItem('walls', { colour: 'red' }), SIZE))).toEqual({ reason: 'item', list: 'walls', index: 0 });
    expect(refusal(checkMasks({ ...GOOD, hazards: [GOOD.hazards[0], { id: 'hazard-2', x0: 1, x1: 2 }] }, SIZE))).toEqual({ reason: 'item', list: 'hazards', index: 1 });
    for (const x0 of ['100', null, Number.NaN, Number.POSITIVE_INFINITY, true]) expect(refusal(checkMasks(withItem('ledges', { x0 }), SIZE))?.reason, String(x0)).toBe('number');
    expect(refusal(checkMasks(withItem('walls', { y1: '770' }), SIZE))?.reason).toBe('number');
    expect(refusal(checkMasks(withItem('fronts', { points: [...TRI.slice(0, 2), { x: 1, y: 'x' }] }), SIZE))?.reason).toBe('number');
  });

  it('takes ids of [a-z0-9-] up to 32 long, each once across the draft', () => {
    for (const id of ['', 'Ledge-1', 'ledge_1', 'ledge 1', 'x'.repeat(33), '<b>', 7]) expect(refusal(checkMasks(withItem('ledges', { id }), SIZE))?.reason, String(id)).toBe('id');
    expect(checkMasks(withItem('ledges', { id: 'x'.repeat(32) }), SIZE).ok).toBe(true);
    expect(refusal(checkMasks({ ...GOOD, ledges: [GOOD.ledges[0], { ...GOOD.ledges[0], x0: 400, x1: 500 }] }, SIZE))).toEqual({ reason: 'same-id', list: 'ledges', index: 1 });
    // Ids are the draft's, not a list's: a wall may not take a ledge's.
    expect(refusal(checkMasks(withItem('walls', { id: 'ledge-1' }), SIZE))).toEqual({ reason: 'same-id', list: 'walls', index: 0 });
  });

  it('keeps every item inside the room, its ends in order and its top over the ground and within reach', () => {
    const cases: Array<[keyof MaskDraft, Record<string, unknown>, string]> = [
      ['ledges', { x0: -1 }, 'outside'],
      ['ledges', { x1: 6401 }, 'outside'],
      ['ledges', { x0: 300, x1: 300 }, 'order'],
      ['ledges', { x0: 310, x1: 300 }, 'order'],
      ['ledges', { top: 0 }, 'top'],
      ['ledges', { top: -20 }, 'top'],
      ['ledges', { top: MAX_PERCH_TOP + 1 }, 'top'],
      ['hazards', { top: 0 }, 'top'],
      ['hazards', { x0: 1000, x1: 900 }, 'order'],
      ['walls', { x: 6401 }, 'outside'],
      ['walls', { x: -0.5 }, 'outside'],
      ['walls', { y0: -1 }, 'outside'],
      ['walls', { y1: 901 }, 'outside'],
      ['walls', { y0: 500, y1: 500 }, 'order'],
      ['fronts', { points: [...TRI.slice(0, 2), { x: 6401, y: 10 }] }, 'outside'],
      ['fronts', { points: [...TRI.slice(0, 2), { x: 10, y: -1 }] }, 'outside'],
    ];
    for (const [list, change, reason] of cases) expect(refusal(checkMasks(withItem(list, change), SIZE)), `${list} ${JSON.stringify(change)}`).toEqual({ reason, list, index: 0 });
    // A smaller room has a smaller inside.
    expect(refusal(checkMasks(GOOD, { w: 950, h: 900 }))).toEqual({ reason: 'outside', list: 'hazards', index: 0 });
  });

  it('takes a front of 3 to 64 points, each just {x, y}', () => {
    const ring = (n: number) => Array.from({ length: n }, (_, i) => ({ x: 500 + 100 * Math.cos(i), y: 400 + 100 * Math.sin(i) }));
    expect(checkMasks(withItem('fronts', { points: ring(FRONT_POINTS_MAX) }), SIZE).ok).toBe(true);
    for (const points of [ring(2), ring(FRONT_POINTS_MAX + 1), 'points', null, [...TRI.slice(0, 2), [1, 2]], [...TRI.slice(0, 2), { x: 1, y: 2, z: 3 }]]) {
      expect(refusal(checkMasks(withItem('fronts', { points }), SIZE))?.reason, JSON.stringify(points)).toBe('points');
    }
  });

  it('says why in one of its own words only, never what was sent', () => {
    const hostile = ["' OR '1'='1", '<img src=x onerror=alert(1)>', '../../../etc/passwd', '\u0000', 'x'.repeat(10_000)];
    for (const v of hostile) {
      for (const list of ['ledges', 'walls', 'hazards', 'fronts'] as const) {
        for (const field of ['id', 'x0', 'x', 'points']) {
          const c = checkMasks(withItem(list, { [field]: v }), SIZE);
          expect(c.ok).toBe(false);
          if (!c.ok) expect(MASK_REASONS).toContain(c.reason);
          expect(JSON.stringify(c)).not.toContain(v.slice(0, 40));
        }
      }
    }
  });
});

describe('the rooms the painter works over (OP-156)', () => {
  it('are the tree’s, and a room’s own ledges are its perches’ spans and tops', () => {
    expect(isPaintable(ROOMS['l1'])).toBe(true);
    expect(isPaintable(ROOMS['hub'])).toBe(false);
    expect(isPaintable(undefined)).toBe(false);
    const strip = (x0: number, x1: number) => [
      { x: x0, y: 766 },
      { x: x1, y: 766 },
      { x: x1, y: 774 },
      { x: x0, y: 774 },
    ];
    expect(ledgesOf({ perches: [{ id: 'log', area: strip(1010, 1210), top: 85 }] })).toEqual([{ id: 'log', x0: 1010, x1: 1210, top: 85 }]);
    expect(ledgesOf({})).toEqual([]);
    // The tree's own ledges, whatever they are today, start a draft that passes the draft's check.
    const ledges = ledgesOf(ROOMS['l1']!);
    expect(ledges.map((l) => l.id)).toEqual(ROOMS['l1']!.perches!.map((p) => p.id));
    expect(checkMasks({ ...emptyMasks(), ledges }, ROOMS['l1']!.size).ok).toBe(true);
  });
});
