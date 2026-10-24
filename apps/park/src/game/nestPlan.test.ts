import { describe, expect, it } from 'vitest';
import { NEST_SPOTS, getFurniture, getNestSpot } from '@owl-park/shared';
import { FLAT_DEPTH, MIRROR_GLINT_KEY, WALL_DEPTH, firstGlint, mirrorKey, pieceDepth, piecesFor, spotNumber, stepSpot, streetDoors, streetSpawnBack, type MirrorKeyState } from './nestPlan';

const spot = (id: string) => getNestSpot(id)!;
const piece = (id: string) => getFurniture(id)!;

describe('pieceDepth', () => {
  it('hangs wall pieces and lays rugs behind every owl, and sorts the rest with the owls by their spot', () => {
    expect(pieceDepth(spot('w2'), piece('wall-clock'))).toBe(WALL_DEPTH);
    expect(pieceDepth(spot('f6'), piece('rug'))).toBe(FLAT_DEPTH);
    expect(pieceDepth(spot('f1'), piece('moss-rug'))).toBe(FLAT_DEPTH);
    expect(pieceDepth(spot('f6'), piece('armchair'))).toBe(spot('f6').y);
    // Owls stand on the floor, so even the nearest wall spot and a rug stay behind them.
    const floorTop = Math.min(...NEST_SPOTS.filter((s) => s.place === 'floor').map((s) => s.y));
    expect(Math.max(WALL_DEPTH, FLAT_DEPTH)).toBeLessThan(floorTop);
    // The background is at -1: wall pieces and rugs are in front of it.
    expect(Math.min(WALL_DEPTH, FLAT_DEPTH)).toBeGreaterThan(-1);
  });
});

describe('piecesFor', () => {
  const owned = ['rug', 'lamp', 'potted-fern', 'stump-table', 'wall-clock', 'framed-leaf'];

  it('offers the owned pieces of the spot’s place, in catalogue order, with where each stands now', () => {
    const layout = { f1: 'lamp', f3: 'rug', w2: 'framed-leaf' };
    expect(piecesFor('f2', owned, layout).map((c) => [c.piece.id, c.at])).toEqual([
      ['rug', 'f3'],
      ['lamp', 'f1'],
      ['potted-fern', null],
      ['stump-table', null],
    ]);
    expect(piecesFor('w1', owned, layout).map((c) => [c.piece.id, c.at])).toEqual([
      ['wall-clock', null],
      ['framed-leaf', 'w2'],
    ]);
  });

  it('offers nothing for a wall spot to an owl with only the starter pieces, and nothing for no spot', () => {
    expect(piecesFor('w4', ['rug', 'lamp', 'potted-fern', 'stump-table'], {})).toEqual([]);
    expect(piecesFor('x9' as never, owned, {})).toEqual([]);
  });

  it('ignores pieces in the layout the owl does not own, and ids that are no piece', () => {
    expect(piecesFor('f1', ['lamp', 'not-a-piece'], { f2: 'armchair' }).map((c) => [c.piece.id, c.at])).toEqual([['lamp', null]]);
  });
});

describe('stepping through the spots', () => {
  it('goes round all twelve both ways, the floor first and then the wall', () => {
    expect(stepSpot('f1', 1)).toBe('f2');
    expect(stepSpot('f8', 1)).toBe('w1');
    expect(stepSpot('w4', 1)).toBe('f1');
    expect(stepSpot('f1', -1)).toBe('w4');
    expect(stepSpot('f3', 12)).toBe('f3');
    expect(stepSpot('f3', -25)).toBe('f2');
    expect(spotNumber('f1')).toBe(1);
    expect(spotNumber('w4')).toBe(12);
  });
});

describe('streetDoors', () => {
  const look = { body: '#8B5A2B', belly: '#F6F1E3', accent: '#C9A227' };

  it('puts the visitor’s own nest behind door 0 and the open nests behind the next doors, the rest empty', () => {
    const doors = streetDoors({ own: { nestId: 'mine0000', open: true }, doors: [{ nestId: 'abcd1234', look }, null, { nestId: 'efgh5678', look: null }] });
    expect(doors).toEqual([
      { kind: 'own', nestId: 'mine0000' },
      { kind: 'nest', nestId: 'abcd1234', look },
      { kind: 'empty' },
      { kind: 'nest', nestId: 'efgh5678', look: null },
      { kind: 'empty' },
      { kind: 'empty' },
    ]);
  });

  it('shows the own door without a nest and the rest empty before the street answers', () => {
    expect(streetDoors(null)).toEqual([{ kind: 'own', nestId: null }, ...Array(5).fill({ kind: 'empty' })]);
    expect(streetDoors({ own: null, doors: [] })[0]).toEqual({ kind: 'own', nestId: null });
  });

  it('leaves a door empty for a malformed id, the visitor’s own nest again, or a sixth nest', () => {
    const doors = streetDoors({
      own: { nestId: 'mine0000', open: false },
      doors: [{ nestId: 'NOPE', look }, { nestId: 'mine0000', look }, null, null, null, { nestId: 'extra000', look }],
    });
    expect(doors.map((d) => d.kind)).toEqual(['own', 'empty', 'empty', 'empty', 'empty', 'empty']);
    expect(streetDoors({ own: { nestId: '../x', open: true }, doors: [] })[0]).toEqual({ kind: 'own', nestId: null });
  });
});

describe('streetSpawnBack', () => {
  it('brings the owl back out in front of the door it went in by', () => {
    expect(streetSpawnBack({ room: 'homes', spawn: 'from-nest-3' })).toBe('from-nest-3');
    expect(streetSpawnBack({ room: 'homes', spawn: 'from-nest-0' })).toBe('from-nest-0');
  });

  it('brings it out in front of its own door otherwise', () => {
    expect(streetSpawnBack(undefined)).toBe('from-nest-0');
    expect(streetSpawnBack({ room: 'lobby', spawn: 'from-nest-3' })).toBe('from-nest-0');
    expect(streetSpawnBack({ room: 'homes', spawn: 'from-lobby' })).toBe('from-nest-0');
    expect(streetSpawnBack({ room: 'homes', spawn: 'from-nest-9' })).toBe('from-nest-0');
    expect(streetSpawnBack({ room: 'homes' })).toBe('from-nest-0');
  });
});

describe("the nest's mirror (OP-077)", () => {
  const storage = (keys: Record<string, string> = {}) => ({
    keys,
    getItem: (k: string) => keys[k] ?? null,
    setItem: (k: string, v: string) => void (keys[k] = v),
  });

  it('glints once on a device, the first time its owl is home, and never again', () => {
    const device = storage();
    expect(firstGlint(device)).toBe(true);
    expect(device.keys[MIRROR_GLINT_KEY]).toBe('1');
    expect(firstGlint(device)).toBe(false);
    expect(firstGlint(device)).toBe(false);
    // Another device has its own first time.
    expect(firstGlint(storage())).toBe(true);
  });

  it('does not glint where the browser keeps nothing, so it never glints on every visit', () => {
    expect(firstGlint(null)).toBe(false);
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => undefined };
    expect(firstGlint(denied)).toBe(false);
    const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(firstGlint(full)).toBe(false);
  });

  it('makes Q lead to the mirror: the nest from the home screen, the mirror in the park, and Q again closes Your owl', () => {
    const at = (over: Partial<MirrorKeyState>): MirrorKeyState => ({ owlOpen: false, blocking: false, atHome: false, loggedIn: true, ...over });
    expect(mirrorKey(at({}))).toBe('mirror');
    expect(mirrorKey(at({ atHome: true }))).toBe('nest');
    // No owl on this device yet: Make your owl comes first, and Q does nothing.
    expect(mirrorKey(at({ atHome: true, loggedIn: false }))).toBeNull();
    // Your owl open (at a mirror, or the first run's on the home screen): Q closes it, whatever else is up.
    expect(mirrorKey(at({ owlOpen: true }))).toBe('close');
    expect(mirrorKey(at({ owlOpen: true, blocking: true, atHome: true }))).toBe('close');
    // Another screen open: the owl stays put.
    expect(mirrorKey(at({ blocking: true }))).toBeNull();
    expect(mirrorKey(at({ blocking: true, atHome: true }))).toBeNull();
  });
});
