import { describe, expect, it } from 'vitest';
import { FRONT_POINTS_MAX, MAX_PERCH_TOP, checkMasks, emptyMasks, groundAt, type MaskDraft } from '@owl-park/shared';
import { MIN_SPAN, PaintEditor, UNDO_STEPS, dragged, drawnMark, hitTest, nextId, readout, trialPerches, withSpot, type Frame, type Hit } from './editor';

// The ledge painter's editing (OP-156), in room px over a room 6400 x 900 with its ground line at 770.

const FRAME: Frame = { size: { w: 6400, h: 900 }, ground: 770 };
const G = FRAME.ground;
const SQUARE = [
  { x: 1000, y: 300 },
  { x: 1100, y: 300 },
  { x: 1100, y: 400 },
  { x: 1000, y: 400 },
];
const DRAFT: MaskDraft = {
  ledges: [{ id: 'stair-1', x0: 100, x1: 300, top: 100 }],
  walls: [{ id: 'wall-1', x: 500, y0: 300, y1: 700 }],
  hazards: [{ id: 'hazard-1', x0: 700, x1: 800, top: 20 }],
  fronts: [{ id: 'front-1', points: SQUARE }],
  spots: [{ id: 'booth-lobby', x: 2431, y: G }],
};
const ledge = (d: MaskDraft, id = 'stair-1') => d.ledges.find((l) => l.id === id)!;
const spot = (d: MaskDraft, id = 'booth-lobby') => d.spots.find((s) => s.id === id);
/** A level's names, as the painter gives them to the editor (treeSpotsFor). */
const NAMES = ['closed-west', 'stair-l2-l1', 'booth-lobby', 'to-market'];

describe('the painter’s ids (OP-156)', () => {
  it('gives a new item the next number of its kind across the draft', () => {
    const d: MaskDraft = { ...emptyMasks(), ledges: [{ id: 'ledge-2', x0: 0, x1: 10, top: 5 }, { id: 'stair-1', x0: 20, x1: 30, top: 5 }, { id: 'ledge-7', x0: 40, x1: 50, top: 5 }], walls: [{ id: 'wall-3', x: 1, y0: 1, y1: 20 }] };
    expect(nextId(d, 'ledge')).toBe('ledge-8');
    expect(nextId(d, 'wall')).toBe('wall-4');
    expect(nextId(d, 'front')).toBe('front-1');
    // A number past any the painter makes is passed over, so a new id always passes the draft's check.
    expect(nextId({ ...emptyMasks(), ledges: [{ id: 'ledge-99999999999999999999', x0: 0, x1: 10, top: 5 }] }, 'ledge')).toBe('ledge-1');
  });
});

describe('what a press lands on (OP-156)', () => {
  const at = (x: number, y: number, tol = 10) => hitTest(DRAFT, { x, y }, tol, G);
  it('is an end before the line it ends, then a line, within the tolerance', () => {
    expect(at(103, G - 102)).toEqual({ kind: 'ledge', id: 'stair-1', part: 'start' });
    expect(at(296, G - 95)).toEqual({ kind: 'ledge', id: 'stair-1', part: 'end' });
    expect(at(200, G - 92)).toEqual({ kind: 'ledge', id: 'stair-1', part: 'line' });
    expect(at(200, G - 85)).toBeNull();
    expect(at(200, G - 85, 16)).toEqual({ kind: 'ledge', id: 'stair-1', part: 'line' });
    expect(at(498, 305)).toEqual({ kind: 'wall', id: 'wall-1', part: 'start' });
    expect(at(504, 694)).toEqual({ kind: 'wall', id: 'wall-1', part: 'end' });
    expect(at(507, 500)).toEqual({ kind: 'wall', id: 'wall-1', part: 'line' });
    expect(at(793, G - 22)).toEqual({ kind: 'hazard', id: 'hazard-1', part: 'end' });
  });

  it('on a front: a point, an edge, or inside it', () => {
    expect(at(1098, 402)).toEqual({ kind: 'front', id: 'front-1', part: 'point', point: 2 });
    expect(at(1050, 305)).toEqual({ kind: 'front', id: 'front-1', part: 'line' });
    expect(at(1050, 350)).toEqual({ kind: 'front', id: 'front-1', part: 'inside' });
    expect(at(1200, 350)).toBeNull();
  });
});

describe('what a press lands on, spots among them (OP-156, part 3)', () => {
  it('is a spot by its point, or by its pin’s head over it, before an end or a line', () => {
    expect(hitTest(DRAFT, { x: 2434, y: G - 4 }, 10, G)).toEqual({ kind: 'spot', id: 'booth-lobby', part: 'point' });
    // The pin's head, 20 room px over the point: only when the press knows where the head is drawn.
    expect(hitTest(DRAFT, { x: 2431, y: G - 21 }, 10, G)).toBeNull();
    expect(hitTest(DRAFT, { x: 2431, y: G - 21 }, 10, G, { lift: 20 })).toEqual({ kind: 'spot', id: 'booth-lobby', part: 'point' });
    // A spot by a ledge's end: the nearer is taken.
    const d: MaskDraft = { ...DRAFT, spots: [{ id: 'stair-l2-l1', x: 106, y: G - 100 }] };
    expect(hitTest(d, { x: 103, y: G - 100 }, 10, G)).toEqual({ kind: 'ledge', id: 'stair-1', part: 'start' });
    expect(hitTest(d, { x: 105, y: G - 100 }, 10, G)).toEqual({ kind: 'spot', id: 'stair-l2-l1', part: 'point' });
  });

  it('is only what a tool may take: the spot tool’s spots, the front tool’s fronts, the nearer of another kind passed over', () => {
    const d: MaskDraft = { ...DRAFT, spots: [{ id: 'stair-l2-l1', x: 108, y: G - 100 }], fronts: [{ id: 'front-1', points: [{ x: 98, y: G - 104 }, { x: 60, y: G - 104 }, { x: 60, y: G - 40 }] }] };
    expect(hitTest(d, { x: 101, y: G - 100 }, 10, G)).toEqual({ kind: 'ledge', id: 'stair-1', part: 'start' });
    expect(hitTest(d, { x: 101, y: G - 100 }, 10, G, { kinds: ['spot'] })).toEqual({ kind: 'spot', id: 'stair-l2-l1', part: 'point' });
    expect(hitTest(d, { x: 101, y: G - 100 }, 10, G, { kinds: ['front'] })).toEqual({ kind: 'front', id: 'front-1', part: 'point', point: 0 });
    expect(hitTest(d, { x: 70, y: G - 90 }, 2, G, { kinds: ['front'] })).toEqual({ kind: 'front', id: 'front-1', part: 'inside' });
    expect(hitTest(d, { x: 70, y: G - 90 }, 2, G, { kinds: ['spot'] })).toBeNull();
    expect(hitTest(d, { x: 200, y: G - 100 }, 10, G, { kinds: ['spot'] })).toBeNull();
  });
});

describe('dragging what was pressed (OP-156)', () => {
  const drag = (hit: Omit<Hit, 'kind' | 'id'> & Partial<Hit>, dx: number, dy: number) => dragged(DRAFT, { kind: 'ledge', id: 'stair-1', ...hit } as Hit, { x: 0, y: 0 }, { x: dx, y: dy }, FRAME);
  it('moves a ledge’s ends along it and its line up and down, never past each other, the room or a perch’s reach', () => {
    expect(ledge(drag({ part: 'end' }, 50.4, 30))).toEqual({ id: 'stair-1', x0: 100, x1: 350, top: 100 });
    expect(ledge(drag({ part: 'start' }, -150, 0)).x0).toBe(0);
    expect(ledge(drag({ part: 'start' }, 500, 0)).x0).toBe(300 - MIN_SPAN);
    expect(ledge(drag({ part: 'end' }, 9000, 0)).x1).toBe(6400);
    expect(ledge(drag({ part: 'line' }, 40, -30))).toEqual({ id: 'stair-1', x0: 100, x1: 300, top: 130 });
    expect(ledge(drag({ part: 'line' }, 0, -900)).top).toBe(MAX_PERCH_TOP);
    expect(ledge(drag({ part: 'line' }, 0, 900)).top).toBe(1);
    // Nothing else moves, and the draft as pressed is left as it was.
    const d = drag({ part: 'line' }, 0, -30);
    expect({ ...d, ledges: [] }).toEqual({ ...DRAFT, ledges: [] });
    expect(ledge(DRAFT).top).toBe(100);
  });

  it('moves a wall’s ends up and down and its line sideways; a hazard as a ledge', () => {
    const wall = (part: Hit['part'], dx: number, dy: number) => dragged(DRAFT, { kind: 'wall', id: 'wall-1', part }, { x: 0, y: 0 }, { x: dx, y: dy }, FRAME).walls[0];
    expect(wall('start', 30, -400)).toEqual({ id: 'wall-1', x: 500, y0: 0, y1: 700 });
    expect(wall('end', 0, 500)).toEqual({ id: 'wall-1', x: 500, y0: 300, y1: 900 });
    expect(wall('end', 0, -600)).toEqual({ id: 'wall-1', x: 500, y0: 300, y1: 300 + MIN_SPAN });
    expect(wall('line', -42, 80)).toEqual({ id: 'wall-1', x: 458, y0: 300, y1: 700 });
    expect(dragged(DRAFT, { kind: 'hazard', id: 'hazard-1', part: 'line' }, { x: 0, y: 0 }, { x: 0, y: -10 }, FRAME).hazards[0]!.top).toBe(30);
  });

  it('moves a front’s point, or the front whole as far as the room lets it', () => {
    const front = (hit: Omit<Hit, 'kind' | 'id'>, dx: number, dy: number) => dragged(DRAFT, { kind: 'front', id: 'front-1', ...hit } as Hit, { x: 0, y: 0 }, { x: dx, y: dy }, FRAME).fronts[0]!.points;
    expect(front({ part: 'point', point: 1 }, 20, -10)).toEqual([SQUARE[0], { x: 1120, y: 290 }, SQUARE[2], SQUARE[3]]);
    expect(front({ part: 'inside' }, 10, 20)).toEqual(SQUARE.map((q) => ({ x: q.x + 10, y: q.y + 20 })));
    expect(front({ part: 'inside' }, 0, -1000)).toEqual(SQUARE.map((q) => ({ x: q.x, y: q.y - 300 })));
  });
});

describe('placing a spot (OP-156, part 3)', () => {
  it('drags a spot anywhere in the room, to whole pixels, and nothing else with it', () => {
    const drag = (dx: number, dy: number) => dragged(DRAFT, { kind: 'spot', id: 'booth-lobby', part: 'point' }, { x: 0, y: 0 }, { x: dx, y: dy }, FRAME);
    expect(spot(drag(40.4, -10.6))).toEqual({ id: 'booth-lobby', x: 2471, y: G - 11 });
    expect(spot(drag(-9000, 900))).toEqual({ id: 'booth-lobby', x: 0, y: 900 });
    expect(spot(drag(9000, -900))).toEqual({ id: 'booth-lobby', x: 6400, y: 0 });
    expect({ ...drag(40, 0), spots: [] }).toEqual({ ...DRAFT, spots: [] });
    expect(spot(DRAFT)).toEqual({ id: 'booth-lobby', x: 2431, y: G });
  });

  it('places a name anew at the list’s end, or moves it when it is placed already, at a whole pixel inside the room', () => {
    expect(withSpot(DRAFT, 'to-market', { x: 6165.6, y: 769.5 }, FRAME).spots).toEqual([...DRAFT.spots, { id: 'to-market', x: 6166, y: 770 }]);
    expect(withSpot(DRAFT, 'booth-lobby', { x: 2440, y: G }, FRAME).spots).toEqual([{ id: 'booth-lobby', x: 2440, y: G }]);
    expect(withSpot(emptyMasks(), 'closed-west', { x: -20, y: 950 }, FRAME).spots).toEqual([{ id: 'closed-west', x: 0, y: 900 }]);
  });
});

describe('drawing a new line (OP-156)', () => {
  it('draws a ledge along a drag at the press’s height, and a wall down one at the press’s x', () => {
    expect(drawnMark('ledge', { x: 300.4, y: 600 }, { x: 199.6, y: 640 }, FRAME)).toEqual({ x0: 200, x1: 300, top: 170 });
    expect(drawnMark('hazard', { x: 10, y: 0 }, { x: 90, y: 0 }, FRAME)).toEqual({ x0: 10, x1: 90, top: MAX_PERCH_TOP });
    expect(drawnMark('ledge', { x: 10, y: 800 }, { x: 90, y: 800 }, FRAME)).toEqual({ x0: 10, x1: 90, top: 1 });
    expect(drawnMark('ledge', { x: -50, y: 700 }, { x: 7000, y: 700 }, FRAME)).toEqual({ x0: 0, x1: 6400, top: 70 });
    expect(drawnMark('wall', { x: 500.2, y: 700 }, { x: 520, y: 400 }, FRAME)).toEqual({ x: 500, y0: 400, y1: 700 });
    // Shorter than MIN_SPAN: a tap, not a line.
    expect(drawnMark('ledge', { x: 100, y: 600 }, { x: 100 + MIN_SPAN - 1, y: 600 }, FRAME)).toBeNull();
    expect(drawnMark('wall', { x: 100, y: 600 }, { x: 100, y: 600 + MIN_SPAN - 1 }, FRAME)).toBeNull();
  });
});

describe('the painter’s editor (OP-156)', () => {
  it('adds an item with the next id and picks it, deletes the one picked, and undoes either', () => {
    const e = new PaintEditor(DRAFT, true);
    expect(e.unsaved).toBe(false);
    expect(e.add('ledge', { x0: 2000, x1: 2100, top: 90 })).toEqual({ kind: 'ledge', id: 'ledge-1' });
    expect(e.selected).toEqual({ kind: 'ledge', id: 'ledge-1' });
    expect(readout(e.draft, e.selected!)).toBe('ledge-1  x0 2000  x1 2100  top 90');
    expect(e.unsaved).toBe(true);
    e.selected = { kind: 'wall', id: 'wall-1' };
    expect(readout(e.draft, e.selected)).toBe('wall-1  x 500  y0 300  y1 700');
    expect(e.remove()).toBe(true);
    expect(e.selected).toBeNull();
    expect(e.draft.walls).toEqual([]);
    expect(e.remove()).toBe(false);
    expect(e.undo()).toBe(true);
    expect(e.draft.walls).toEqual(DRAFT.walls);
    expect(e.undo()).toBe(true);
    expect(e.draft).toEqual(DRAFT);
    expect(e.unsaved).toBe(false);
    expect(e.undo()).toBe(false);
    expect(e.canUndo).toBe(false);
  });

  it('makes one undo step of a whole drag, and none of a drag that changed nothing', () => {
    const e = new PaintEditor(DRAFT, false);
    const hit: Hit = { kind: 'ledge', id: 'stair-1', part: 'line' };
    for (const dy of [-5, -10, -20]) e.preview(dragged(DRAFT, hit, { x: 0, y: 0 }, { x: 0, y: dy }, FRAME));
    e.settle(DRAFT);
    expect(ledge(e.draft).top).toBe(120);
    e.settle(e.draft);
    expect(e.undo()).toBe(true);
    expect(e.draft).toEqual(DRAFT);
    expect(e.canUndo).toBe(false);
  });

  it('keeps the last UNDO_STEPS changes', () => {
    const e = new PaintEditor(emptyMasks(), false);
    for (let i = 0; i < UNDO_STEPS + 5; i++) e.add('ledge', { x0: i * 20, x1: i * 20 + 10, top: 50 });
    let undone = 0;
    while (e.undo()) undone += 1;
    expect(undone).toBe(UNDO_STEPS);
    expect(e.draft.ledges).toHaveLength(5);
  });

  it('knows a draft as saved until it changes, and a draft never saved as not', () => {
    const e = new PaintEditor(DRAFT, false);
    expect(e.unsaved).toBe(true);
    // Saved as sent, whatever order its lists were written in.
    e.markSaved({ spots: DRAFT.spots, fronts: DRAFT.fronts, hazards: DRAFT.hazards, walls: DRAFT.walls, ledges: DRAFT.ledges });
    expect(e.unsaved).toBe(false);
    e.add('hazard', { x0: 10, x1: 30, top: 5 });
    expect(e.unsaved).toBe(true);
  });

  it('draws a front a tap a point, closed on its first point or by Enter, at most 64 points', () => {
    const e = new PaintEditor(emptyMasks(), false);
    e.setTool('front');
    expect(e.addPoint({ x: 100.2, y: 100 }, 10)).toBe('added');
    expect(e.addPoint({ x: 200, y: 100 }, 10)).toBe('added');
    // A tap on the first point with two: one more point, not a close.
    expect(e.closeFront()).toBe(false);
    expect(e.addPoint({ x: 150, y: 250 }, 10)).toBe('added');
    expect(e.undo()).toBe(true);
    expect(e.pending).toEqual([
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ]);
    e.addPoint({ x: 150, y: 250 }, 10);
    expect(e.addPoint({ x: 104, y: 97 }, 10)).toBe('closed');
    expect(e.pending).toBeNull();
    expect(e.draft.fronts).toEqual([{ id: 'front-1', points: [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 250 }] }]);
    expect(e.selected).toEqual({ kind: 'front', id: 'front-1' });
    expect(readout(e.draft, e.selected!)).toBe('front-1  3 points');
    // Enter closes one too; at 64 points a front takes no more.
    for (let i = 0; i < FRONT_POINTS_MAX; i++) e.addPoint({ x: 2000 + 10 * i, y: 100 + (i % 2) * 50 }, 1);
    expect(e.addPoint({ x: 3000, y: 500 }, 1)).toBe('full');
    expect(e.closeFront()).toBe(true);
    expect(e.draft.fronts[1]!.points).toHaveLength(FRONT_POINTS_MAX);
    expect(checkMasks(e.draft, FRAME.size).ok).toBe(true);
    // Another tool lets the front being drawn go.
    e.addPoint({ x: 10, y: 10 }, 1);
    e.setTool('ledge');
    expect(e.pending).toBeNull();
  });
});

describe('trying the draft (OP-156)', () => {
  it('makes the draft’s ledges perches as deep as the floor’s strip, which an owl comes down on', () => {
    const floor = [
      [
        { x: 600, y: G - 4 },
        { x: 6376, y: G - 4 },
        { x: 6376, y: G + 4 },
        { x: 600, y: G + 4 },
      ],
    ];
    const perches = trialPerches([{ id: 'ledge-1', x0: 2370, x1: 2480, top: 100 }], floor);
    expect(perches).toEqual([{ id: 'ledge-1', top: 100, area: [{ x: 2370, y: G - 4 }, { x: 2480, y: G - 4 }, { x: 2480, y: G + 4 }, { x: 2370, y: G + 4 }] }]);
    expect(groundAt(perches, { x: 2420, y: G }, 140)).toBe(100);
    expect(groundAt(perches, { x: 2500, y: G }, 140)).toBe(0);
  });
});

describe('the spot tool (OP-156, part 3)', () => {
  it('places a picked name of the room’s, picks it, moves it, deletes it, and undoes each a step at a time', () => {
    const e = new PaintEditor({ ...DRAFT, spots: [] }, true, NAMES);
    e.setTool('spot');
    expect(e.naming).toBeNull();
    // Picking a name places nothing yet; a tap does, and picks it.
    expect(e.pickName('closed-west')).toBe(true);
    expect([e.naming, e.selected, e.unsaved]).toEqual(['closed-west', null, false]);
    expect(e.place('closed-west', { x: 660.4, y: 770.2 }, FRAME)).toEqual({ kind: 'spot', id: 'closed-west' });
    expect(e.draft.spots).toEqual([{ id: 'closed-west', x: 660, y: 770 }]);
    expect(e.selected).toEqual({ kind: 'spot', id: 'closed-west' });
    expect(readout(e.draft, e.selected!)).toBe('closed-west  x 660  y 770');
    expect(e.unsaved).toBe(true);
    // Placed again: moved, one more step.
    e.place('closed-west', { x: 700, y: 760 }, FRAME);
    expect(e.draft.spots).toEqual([{ id: 'closed-west', x: 700, y: 760 }]);
    // A second name; then the first dragged by its pin, a step for the whole drag.
    e.place('to-market', { x: 6165, y: 770 }, FRAME);
    const before = e.draft;
    const hit: Hit = { kind: 'spot', id: 'closed-west', part: 'point' };
    for (const dx of [5, 10, 15]) e.preview(dragged(before, hit, { x: 0, y: 0 }, { x: dx, y: 10 }, FRAME));
    e.settle(before);
    expect(e.draft.spots).toEqual([{ id: 'closed-west', x: 715, y: 770 }, { id: 'to-market', x: 6165, y: 770 }]);
    // Picking a placed name picks its spot, and Delete takes it away.
    expect(e.pickName('to-market')).toBe(true);
    expect(e.selected).toEqual({ kind: 'spot', id: 'to-market' });
    expect(e.remove()).toBe(true);
    expect(e.draft.spots).toEqual([{ id: 'closed-west', x: 715, y: 770 }]);
    expect(e.selected).toBeNull();
    expect(e.naming).toBe('to-market');
    expect(checkMasks(e.draft, FRAME.size).ok).toBe(true);
    // Undo: back through the delete, the drag, the second name, the move and the first placing.
    const back = () => (e.undo(), e.draft.spots);
    expect(back()).toEqual([{ id: 'closed-west', x: 715, y: 770 }, { id: 'to-market', x: 6165, y: 770 }]);
    expect(back()).toEqual([{ id: 'closed-west', x: 700, y: 760 }, { id: 'to-market', x: 6165, y: 770 }]);
    expect(back()).toEqual([{ id: 'closed-west', x: 700, y: 760 }]);
    expect(back()).toEqual([{ id: 'closed-west', x: 660, y: 770 }]);
    expect(back()).toEqual([]);
    expect([e.unsaved, e.canUndo, e.undo()]).toEqual([false, false, false]);
  });

  it('places only the room’s own names', () => {
    const e = new PaintEditor(DRAFT, false, NAMES);
    for (const id of ['idol-market', 'ledge-1', 'stair-1', 'Booth-Lobby', '']) {
      expect(e.pickName(id), id).toBe(false);
      expect(e.place(id, { x: 100, y: G }, FRAME), id).toBeNull();
    }
    expect([e.naming, e.selected, e.draft, e.canUndo]).toEqual([null, null, DRAFT, false]);
    // A painter that has no names for its room (none given) places none.
    expect(new PaintEditor(DRAFT, false).place('booth-lobby', { x: 100, y: G }, FRAME)).toBeNull();
    // A spot the draft has under another name (a saved draft's) is moved and deleted as any item is.
    const stray: MaskDraft = { ...DRAFT, spots: [{ id: 'old-door', x: 50, y: G }] };
    const f = new PaintEditor(stray, true, NAMES);
    f.preview(dragged(stray, { kind: 'spot', id: 'old-door', part: 'point' }, { x: 0, y: 0 }, { x: 10, y: 0 }, FRAME));
    f.settle(stray);
    expect(spot(f.draft, 'old-door')).toEqual({ id: 'old-door', x: 60, y: G });
    f.selected = { kind: 'spot', id: 'old-door' };
    expect(f.remove()).toBe(true);
    expect(f.draft.spots).toEqual([]);
  });
});
