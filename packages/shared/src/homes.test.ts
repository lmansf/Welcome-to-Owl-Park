import { describe, expect, it } from 'vitest';
import { NEST_ROOM } from '../rooms';
import { DUPLICATE_FEATHERS } from './collectibles';
import { distance, distanceToRect, isWalkable } from './geometry';
import {
  FURNITURE,
  FURNITURE_GIFT_FEATHERS,
  NEST_ID_LENGTH,
  NEST_SPOTS,
  NEST_WORDS,
  STARTER_FURNITURE,
  STREET_DOORS,
  furnitureGift,
  furnitureGiftReady,
  getFurniture,
  getNestSpot,
  isNestId,
  isNestRoom,
  nestDoorIndex,
  nestIdOf,
  nestLook,
  nestRoomId,
  parseNestEdit,
  placeFurniture,
  randomNestId,
  sanitizeLayout,
  type NestLayout,
} from './homes';
import { DEFAULT_LOOK } from './look';
import { parkDay, rotationRandom } from './parktime';
import { isLook } from './validate';

/** A fixed sequence standing in for Math.random. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length]!;
};
const ALL = FURNITURE.map((f) => f.id);
const FLOOR_PIECES = FURNITURE.filter((f) => f.place === 'floor');
const WALL_PIECES = FURNITURE.filter((f) => f.place === 'wall');
const FLOOR_SPOTS = NEST_SPOTS.filter((s) => s.place === 'floor');
const WALL_SPOTS = NEST_SPOTS.filter((s) => s.place === 'wall');

describe('furniture', () => {
  it('sixteen pieces with the names visitors see, five of them for the walls', () => {
    expect(FURNITURE.map((f) => [f.id, f.name])).toEqual([
      ['rug', 'Rug'],
      ['armchair', 'Armchair'],
      ['bookshelf', 'Bookshelf'],
      ['lamp', 'Lamp'],
      ['potted-fern', 'Potted fern'],
      ['mushroom-stool', 'Mushroom stool'],
      ['quilt-bed', 'Quilt bed'],
      ['acorn-bowl', 'Acorn bowl'],
      ['teapot-table', 'Teapot table'],
      ['wall-clock', 'Wall clock'],
      ['framed-leaf', 'Framed leaf'],
      ['window-box', 'Window box'],
      ['lantern-string', 'String of lanterns'],
      ['moss-rug', 'Moss rug'],
      ['stump-table', 'Stump table'],
      ['feather-mobile', 'Feather mobile'],
    ]);
    expect(WALL_PIECES.map((f) => f.id)).toEqual(['wall-clock', 'framed-leaf', 'window-box', 'lantern-string', 'feather-mobile']);
    expect(FLOOR_PIECES).toHaveLength(11);
    expect(new Set(ALL).size).toBe(FURNITURE.length);
  });

  it('gives each piece its art key and a size beside an owl in a one-screen room', () => {
    for (const f of FURNITURE) {
      expect(f.art).toBe(`decor-${f.id}`);
      const [narrowest, widest] = f.place === 'floor' ? [120, 260] : [80, 180];
      expect(f.size.w, f.id).toBeGreaterThanOrEqual(narrowest);
      expect(f.size.w, f.id).toBeLessThanOrEqual(widest);
      expect(f.size.h, f.id).toBeGreaterThanOrEqual(60);
      expect(f.size.h, f.id).toBeLessThanOrEqual(260);
    }
  });

  it('lays the two rugs flat on the floor, for owls to walk on, and nothing else', () => {
    expect(FURNITURE.filter((f) => f.flat).map((f) => f.id)).toEqual(['rug', 'moss-rug']);
    for (const f of FURNITURE) {
      if (f.flat) expect(f.place, f.id).toBe('floor');
      else expect(f, f.id).not.toHaveProperty('flat');
    }
  });

  it('starts every owl with four floor pieces', () => {
    expect(STARTER_FURNITURE).toEqual(['rug', 'lamp', 'potted-fern', 'stump-table']);
    for (const id of STARTER_FURNITURE) expect(getFurniture(id)?.place).toBe('floor');
  });

  it('looks a piece up by its exact id only', () => {
    expect(getFurniture('lantern-string')?.name).toBe('String of lanterns');
    for (const bad of ['Rug', 'rug ', 'sofa', 'witch-hat~0', 'decor-rug', '__proto__', 'constructor', 'toString', '', 42, null, undefined]) expect(getFurniture(bad)).toBeNull();
  });
});

describe('the spots in a nest', () => {
  const floorTop = Math.min(...NEST_ROOM.walkable.flat().map((p) => p.y));
  const doorway = NEST_ROOM.doors.find((d) => d.id === 'to-street')!.rect;

  it('eight on the floor and four on the wall', () => {
    expect(FLOOR_SPOTS.map((s) => s.id)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8']);
    expect(WALL_SPOTS.map((s) => s.id)).toEqual(['w1', 'w2', 'w3', 'w4']);
    expect(NEST_SPOTS).toHaveLength(12);
    expect(getNestSpot('w3')?.place).toBe('wall');
    for (const bad of ['f0', 'f9', 'w0', 'w5', 'F1', '__proto__', 'constructor', '', 1, null]) expect(getNestSpot(bad)).toBeNull();
  });

  it("puts the floor spots on the nest's floor, apart and clear of the doorway", () => {
    const widest = Math.max(...FLOOR_PIECES.map((f) => f.size.w));
    for (const s of FLOOR_SPOTS) {
      expect(isWalkable(s, NEST_ROOM.walkable), `${s.id} on the floor`).toBe(true);
      // Even the widest piece leaves the way to the door free.
      expect(distanceToRect(s, doorway), `${s.id} clear of the doorway`).toBeGreaterThan(widest / 2);
    }
    for (let i = 0; i < FLOOR_SPOTS.length; i++) {
      for (let j = i + 1; j < FLOOR_SPOTS.length; j++) expect(distance(FLOOR_SPOTS[i]!, FLOOR_SPOTS[j]!), `${FLOOR_SPOTS[i]!.id} vs ${FLOOR_SPOTS[j]!.id}`).toBeGreaterThanOrEqual(120);
    }
  });

  it('hangs the wall spots on the back wall above the floor, clear of the tallest floor piece beneath', () => {
    const reach = (Math.max(...WALL_PIECES.map((f) => f.size.w)) + Math.max(...FLOOR_PIECES.map((f) => f.size.w))) / 2;
    const tallest = Math.max(...FLOOR_PIECES.map((f) => f.size.h));
    for (const w of WALL_SPOTS) {
      expect(isWalkable(w, NEST_ROOM.walkable), `${w.id} off the floor`).toBe(false);
      expect(w.y, `${w.id} above the floor`).toBeLessThan(floorTop);
      for (const f of FLOOR_SPOTS) if (Math.abs(w.x - f.x) < reach) expect(f.y - tallest, `${w.id} over ${f.id}`).toBeGreaterThanOrEqual(w.y);
    }
  });

  it('fits every piece inside the room at every spot of its place', () => {
    const { w, h } = NEST_ROOM.size;
    for (const s of NEST_SPOTS) {
      for (const f of FURNITURE.filter((p) => p.place === s.place)) {
        expect(s.x - f.size.w / 2, `${f.id} at ${s.id}`).toBeGreaterThanOrEqual(0);
        expect(s.x + f.size.w / 2, `${f.id} at ${s.id}`).toBeLessThanOrEqual(w);
        expect(s.y - f.size.h, `${f.id} at ${s.id}`).toBeGreaterThanOrEqual(0);
        expect(s.y, `${f.id} at ${s.id}`).toBeLessThanOrEqual(h);
      }
    }
  });
});

describe('decorating', () => {
  const OWNED = [...STARTER_FURNITURE, 'armchair', 'wall-clock'];

  it('puts a piece the owl owns in an empty spot, leaving the layout it was given as it was', () => {
    const before: NestLayout = { f1: 'rug' };
    expect(placeFurniture(before, 'f2', 'lamp', OWNED)).toEqual({ ok: true, layout: { f1: 'rug', f2: 'lamp' } });
    expect(placeFurniture(before, 'w1', 'wall-clock', new Set(OWNED))).toEqual({ ok: true, layout: { f1: 'rug', w1: 'wall-clock' } });
    expect(before).toEqual({ f1: 'rug' });
  });

  it('sends the piece in the spot back to the owl, and moves a piece that stands elsewhere', () => {
    expect(placeFurniture({ f1: 'rug', f2: 'lamp' }, 'f2', 'armchair', OWNED)).toEqual({ ok: true, layout: { f1: 'rug', f2: 'armchair' } });
    expect(placeFurniture({ f1: 'rug', f2: 'lamp' }, 'f2', 'rug', OWNED)).toEqual({ ok: true, layout: { f2: 'rug' } });
    expect(placeFurniture({ f1: 'rug' }, 'f1', 'rug', OWNED)).toEqual({ ok: true, layout: { f1: 'rug' } });
  });

  it('takes a piece away, and taking from an empty spot changes nothing', () => {
    expect(placeFurniture({ f1: 'rug', w1: 'wall-clock' }, 'w1', null, OWNED)).toEqual({ ok: true, layout: { f1: 'rug' } });
    expect(placeFurniture({ f1: 'rug' }, 'f5', null, [])).toEqual({ ok: true, layout: { f1: 'rug' } });
  });

  it('refuses an unknown spot, an unknown piece, a piece in the wrong place and one the owl does not own', () => {
    const layout: NestLayout = { f1: 'rug' };
    for (const spot of ['f0', 'f9', 'w5', 'F1', '', '__proto__', 'constructor']) expect(placeFurniture(layout, spot, 'lamp', OWNED), spot).toEqual({ ok: false, reason: 'spot' });
    expect(placeFurniture(layout, 'f9', null, OWNED)).toEqual({ ok: false, reason: 'spot' });
    for (const item of ['sofa', 'witch-hat~0', 'decor-rug', 'Rug', '', 'toString']) expect(placeFurniture(layout, 'f2', item, [...OWNED, item]), item).toEqual({ ok: false, reason: 'unknown' });
    expect(placeFurniture(layout, 'w1', 'lamp', OWNED)).toEqual({ ok: false, reason: 'wrong-place' });
    expect(placeFurniture(layout, 'f2', 'wall-clock', OWNED)).toEqual({ ok: false, reason: 'wrong-place' });
    expect(placeFurniture(layout, 'f2', 'bookshelf', OWNED)).toEqual({ ok: false, reason: 'not-owned' });
    expect(placeFurniture(layout, 'w2', 'feather-mobile', STARTER_FURNITURE)).toEqual({ ok: false, reason: 'not-owned' });
    // The spot is checked first, then the piece, then its place, then whether the owl owns it.
    expect(placeFurniture(layout, 'f9', 'sofa', [])).toEqual({ ok: false, reason: 'spot' });
    expect(placeFurniture(layout, 'w1', 'sofa', [])).toEqual({ ok: false, reason: 'unknown' });
    expect(placeFurniture(layout, 'w1', 'bookshelf', [])).toEqual({ ok: false, reason: 'wrong-place' });
  });

  it('keeps each piece in one spot at most, and each spot holding an owned piece of its place, whatever the owner does', () => {
    const rnd = rotationRandom('nest-edits');
    const owned = ALL.filter((_, i) => i % 4 !== 3);
    let layout: NestLayout = {};
    let placed = 0;
    for (let k = 0; k < 500; k++) {
      const spot = NEST_SPOTS[Math.floor(rnd() * NEST_SPOTS.length)]!.id;
      const item = rnd() < 0.2 ? null : ALL[Math.floor(rnd() * ALL.length)]!;
      const r = placeFurniture(layout, spot, item, owned);
      if (!r.ok) continue;
      layout = r.layout;
      placed++;
      const pieces = Object.values(layout);
      expect(new Set(pieces).size).toBe(pieces.length);
      for (const [s, id] of Object.entries(layout)) {
        expect(getFurniture(id)?.place).toBe(getNestSpot(s)?.place);
        expect(owned).toContain(id);
      }
    }
    expect(placed).toBeGreaterThan(100);
  });
});

describe('nest edits from a page', () => {
  it('reads a piece for a spot (null takes it away), or opening and closing, and ignores the rest of the frame', () => {
    expect(parseNestEdit({ t: 'nest', spot: 'f1', item: 'rug', r: 3 })).toEqual({ spot: 'f1', item: 'rug' });
    expect(parseNestEdit({ spot: 'w2', item: null })).toEqual({ spot: 'w2', item: null });
    expect(parseNestEdit({ open: true })).toEqual({ open: true });
    expect(parseNestEdit({ t: 'nest', open: false, r: 4 })).toEqual({ open: false });
  });

  it('passes a well-formed but unknown spot or piece on, for the rules to refuse with a reason', () => {
    expect(parseNestEdit({ spot: 'f9', item: 'sofa' })).toEqual({ spot: 'f9', item: 'sofa' });
    expect(placeFurniture({}, 'f9', 'sofa', ALL)).toEqual({ ok: false, reason: 'spot' });
  });

  it('rejects anything malformed', () => {
    for (const bad of [
      null,
      undefined,
      'f1',
      42,
      [],
      ['f1', 'rug'],
      {},
      { spot: 'f1' }, // a piece or null must be named
      { item: 'rug' },
      { spot: 'f1', item: 7 },
      { spot: 'f1', item: true },
      { spot: 7, item: 'rug' },
      { spot: 'F1', item: 'rug' },
      { spot: '1f', item: 'rug' },
      { spot: 'f1', item: 'Rug' },
      { spot: 'f1', item: 'rug ' },
      { spot: 'f1', item: '<b>rug</b>' },
      { spot: 'f1', item: 'x'.repeat(33) },
      { open: 'yes' },
      { open: 1 },
      { open: null },
      { spot: 'f1', item: 'rug', open: true }, // one change at a time
    ]) {
      expect(parseNestEdit(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('nest ids and rooms', () => {
  it("names a nest's room nest- and its eight letters and digits", () => {
    expect(NEST_ID_LENGTH).toBe(8);
    expect(isNestId('k3x9q2ab')).toBe(true);
    expect(nestRoomId('k3x9q2ab')).toBe('nest-k3x9q2ab');
    expect(isNestRoom('nest-k3x9q2ab')).toBe(true);
    expect(nestIdOf('nest-k3x9q2ab')).toBe('k3x9q2ab');
    for (const id of ['aaaaaaaa', '00000000', 'z9z9z9z9']) expect(nestIdOf(nestRoomId(id))).toBe(id);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'k3x9q2a', 'k3x9q2abc', 'K3X9Q2AB', 'k3x-q2ab', 'k3x_q2ab', 'k3x9q2aé', ' k3x9q2a', 'k3x9q2ab\n', 'nest-k3x9q2ab']) {
      expect(isNestId(bad), bad).toBe(false);
      expect(nestRoomId(bad), bad).toBeNull();
      expect(isNestRoom(`nest-${bad}`), bad).toBe(false);
      expect(nestIdOf(`nest-${bad}`), bad).toBeNull();
    }
    for (const room of ['nest', 'nest-', 'homes', 'lobby', 'Nest-k3x9q2ab', 'nests-k3x9q2ab', 'nest_k3x9q2ab', 'nest-k3x9q2ab-x', 'xnest-k3x9q2ab', 'k3x9q2ab']) {
      expect(isNestRoom(room), room).toBe(false);
      expect(nestIdOf(room), room).toBeNull();
    }
    for (const v of [42, null, undefined, {}, ['nest-k3x9q2ab']]) {
      expect(isNestId(v)).toBe(false);
      expect(isNestRoom(v)).toBe(false);
      expect(nestIdOf(v)).toBeNull();
    }
  });

  it('picks a new id from the random source alone', () => {
    expect(randomNestId(() => 0)).toBe('aaaaaaaa');
    expect(randomNestId(() => 0.999999)).toBe('99999999');
    expect(randomNestId(() => 0.5)).toBe('ssssssss');
    expect(randomNestId(seq(0.1, 0.7, 0.3))).toBe(randomNestId(seq(0.1, 0.7, 0.3)));
    // Every letter and digit can come up, and a source that strays out of [0, 1) still gives an id.
    const chars = new Set(Array.from({ length: 36 }, (_, k) => randomNestId(() => (k + 0.5) / 36)).join(''));
    expect(chars.size).toBe(36);
    for (const r of [1, -0.5, 7, NaN, Infinity]) expect(isNestId(randomNestId(() => r)), String(r)).toBe(true);
    for (let i = 0; i < 50; i++) expect(isNestId(randomNestId(Math.random))).toBe(true);
  });
});

describe("the day's furniture gift", () => {
  it('is a piece the owl does not own yet, picked by the random source', () => {
    const missing = ALL.filter((id) => !STARTER_FURNITURE.includes(id));
    expect(furnitureGift(STARTER_FURNITURE, () => 0)).toEqual({ item: missing[0], feathers: 0 });
    expect(furnitureGift(STARTER_FURNITURE, () => 0.999999)).toEqual({ item: missing[missing.length - 1], feathers: 0 });
    // Each missing piece can come, and never one the owl owns.
    expect(missing.map((_, k) => furnitureGift(new Set(STARTER_FURNITURE), () => (k + 0.5) / missing.length).item)).toEqual(missing);
    expect(furnitureGift(STARTER_FURNITURE, () => 1).item).toBe(missing[missing.length - 1]);
  });

  it('is feathers once the owl owns every piece, what a common collectible pays when it comes again', () => {
    expect(FURNITURE_GIFT_FEATHERS).toBe(DUPLICATE_FEATHERS.common);
    expect(furnitureGift(ALL, Math.random)).toEqual({ item: null, feathers: DUPLICATE_FEATHERS.common });
    // Ids that are not furniture are no pieces owned.
    expect(furnitureGift([...ALL.slice(1), 'witch-hat~0', 'sofa'], Math.random)).toEqual({ item: 'rug', feathers: 0 });
  });

  it('comes once a park day, new at midnight in the park', () => {
    const late = Date.UTC(2026, 9, 21, 3, 59); // 23:59 on 20 October in New York
    const day = parkDay(late);
    expect(day).toBe('2026-10-20');
    expect(furnitureGiftReady(null, late)).toBe(true);
    expect(furnitureGiftReady(undefined, late)).toBe(true);
    expect(furnitureGiftReady('2026-10-19', late)).toBe(true);
    expect(furnitureGiftReady(day, late)).toBe(false);
    expect(furnitureGiftReady(day, late + 60_000)).toBe(true);
  });
});

describe('the street', () => {
  it("numbers its nest doors 0 to 5, door 0 the visitor's own", () => {
    expect(STREET_DOORS).toBe(6);
    for (let n = 0; n < STREET_DOORS; n++) expect(nestDoorIndex(`nest-door-${n}`)).toBe(n);
    for (const bad of ['nest-door-6', 'nest-door-10', 'nest-door-01', 'nest-door--1', 'nest-door-', 'nest-door-1 ', 'Nest-door-1', 'nest-door-1.0', 'to-lobby', 'to-street', '', 1, null, undefined]) expect(nestDoorIndex(bad), String(bad)).toBeNull();
  });

  it("flies only the owner's three colours on its nest's door", () => {
    const look = { body: '#2F3E5C', belly: '#E0D4F0', accent: '#FF2AA1', pledge: 'grove', species: 'barn' as const, wear: { head: 'crown~0' } };
    expect(nestLook(look)).toEqual({ body: '#2F3E5C', belly: '#E0D4F0', accent: '#FF2AA1' });
    expect(Object.keys(nestLook(look)).sort()).toEqual(['accent', 'belly', 'body']);
    expect(isLook(nestLook(DEFAULT_LOOK))).toBe(true);
  });
});

describe('a stored layout', () => {
  it('keeps catalogue pieces in spots of their place', () => {
    expect(sanitizeLayout({ f1: 'rug', w1: 'wall-clock', f2: 'lamp' })).toEqual({ f1: 'rug', f2: 'lamp', w1: 'wall-clock' });
    expect(sanitizeLayout({ f3: 'sofa', f4: 7, f5: null, f9: 'lamp', w1: 'lamp', f6: 'wall-clock', w2: 'framed-leaf' })).toEqual({ w2: 'framed-leaf' });
    expect(sanitizeLayout(JSON.parse('{"__proto__": "rug", "f1": "lamp"}'))).toEqual({ f1: 'lamp' });
    expect(sanitizeLayout(Object.create({ f1: 'rug' }))).toEqual({});
  });

  it('keeps a piece placed twice in its first spot, in spot order', () => {
    expect(sanitizeLayout({ f1: 'rug', f2: 'rug' })).toEqual({ f1: 'rug' });
    expect(sanitizeLayout({ w3: 'wall-clock', f7: 'lamp', w1: 'wall-clock', f2: 'lamp' })).toEqual({ f2: 'lamp', w1: 'wall-clock' });
  });

  it('makes an empty nest of anything that is not a layout', () => {
    for (const bad of [null, undefined, 'f1', 42, ['rug']]) expect(sanitizeLayout(bad)).toEqual({});
  });
});

describe('the words visitors see', () => {
  it('are the defaults awaiting the owner, all in one place', () => {
    expect(NEST_WORDS).toEqual({
      toNests: 'To the nests',
      yourNest: 'Your nest',
      decorate: 'Decorate',
      mirror: 'Look in the mirror',
      done: 'Done',
      takeAway: 'Take away',
      openToVisitors: 'Open to visitors',
      closedToVisitors: 'Closed to visitors',
      closedForNow: 'Closed for now',
      furnitureGift: "Today's furniture gift",
      nextGift: 'Next gift tomorrow',
      newPiece: 'New for your nest:',
      everyPiece: 'You have every piece already!',
      onTheFloor: 'On the floor',
      onTheWall: 'On the wall',
      noPieces: "No pieces for this spot yet. Each day's furniture gift brings a new one.",
      notAnswering: 'The nests are not answering just now. Try again in a moment.',
    });
  });
});
