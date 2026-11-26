import { describe, expect, it } from 'vitest';
import { isWalkable } from '../src/geometry';
import { INTERACTABLES } from '../src/interactables';
import { footing } from '../src/perches';
import { GROVE_ROOTS, ROOMS } from './index';

/** Floor edges from the Nov 25 cleanup walk: where a room's floor ran over what is drawn standing in it. */
describe("the treehouse clearing's floor round the great tree's roots (OP-481)", () => {
  const grove = ROOMS['grove']!;
  const floor = (p: { x: number; y: number }) => isWalkable(p, grove.walkable);

  it('keeps an owl off the roots either side of the hollow’s door, and off the trunk', () => {
    for (const p of [{ x: 2420, y: 760 }, { x: 2500, y: 800 }, { x: 2560, y: 760 }, { x: 2700, y: 760 }, { x: 2950, y: 800 }]) expect(floor(p), `${p.x},${p.y}`).toBe(false);
  });

  it('still has floor in front of the roots, on the hollow’s threshold, and up by the idol', () => {
    for (const p of [{ x: 2420, y: 870 }, { x: 2737, y: 830 }, { x: 2400, y: 600 }]) expect(floor(p), `${p.x},${p.y}`).toBe(true);
    const door = grove.doors.find((d) => d.id === 'to-hub')!;
    expect(floor({ x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h - 4 })).toBe(true);
    const idol = grove.doors.find((d) => d.id === 'idol')!;
    expect(floor({ x: idol.rect.x + idol.rect.w / 2, y: idol.rect.y + idol.rect.h / 2 })).toBe(true);
  });

  it('lays every spawn, hiding spot and thing to walk to on the floor still', () => {
    const on = footing(grove, 0);
    for (const [name, s] of Object.entries(grove.spawns)) expect(isWalkable(s, on.walkable), name).toBe(true);
    for (const s of grove.spots ?? []) if (!s.top) expect(floor(s), `spot ${s.x},${s.y}`).toBe(true);
    for (const t of INTERACTABLES.filter((i) => i.room === 'grove' && !i.top)) expect(floor(t.pos), t.id).toBe(true);
  });

  it("is the same run along the clearing's floor and its plaza's back edge", () => {
    const clearing = grove.walkable.find((poly) => poly.some((p) => p.x === 2645 && p.y === 812))!;
    expect(clearing).toBeDefined();
    for (const p of GROVE_ROOTS) expect(clearing.some((q) => q.x === p.x && q.y === p.y), `${p.x},${p.y}`).toBe(true);
  });
});

describe("the neon street's floor along the candy stall counter (OP-483)", () => {
  const market = ROOMS['market']!;
  const floor = (p: { x: number; y: number }) => isWalkable(p, market.walkable);

  it('ends at the counter’s foot: no walking up behind it', () => {
    for (const x of [1560, 1640, 1720]) {
      expect(floor({ x, y: 715 }), `${x} behind the counter`).toBe(false);
      expect(floor({ x, y: 740 }), `${x} in front of it`).toBe(true);
    }
  });

  it('keeps every hiding spot and thing to walk to on the street on the floor', () => {
    for (const s of market.spots ?? []) if (!s.top) expect(floor(s), `spot ${s.x},${s.y}`).toBe(true);
    for (const t of INTERACTABLES.filter((i) => i.room === 'market' && !i.top)) expect(floor(t.pos), t.id).toBe(true);
  });
});
