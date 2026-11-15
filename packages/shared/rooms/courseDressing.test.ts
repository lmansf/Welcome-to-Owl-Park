import { describe, expect, it } from 'vitest';
import { BRUSH_ROOMS } from './brushstrokeBridges';
import { inTurn } from './courseAir';
import { CIRCUIT_ROOMS } from './neonCourse';
import { CANOPY_ROOMS } from './updraftCanopy';

/**
 * The courses' set dressing (OP-419): the backdrop layers take turns, so no screen shows its
 * neighbour's picture, and the props are owl-world things, not human gadgets.
 */
const COURSES = { ...CANOPY_ROOMS, ...BRUSH_ROOMS, ...CIRCUIT_ROOMS };

/** Each screen's backdrop, sky aside (the one sky drifts behind every screen): its layers' keys. */
function screens(id: string): string[] {
  const out: string[][] = [];
  for (const b of COURSES[id]!.kit?.backdrops ?? []) {
    if (b.rate === 0.5 || b.key.includes('-sky')) continue;
    for (let s = b.screens[0]; s <= b.screens[1]; s++) (out[s] ??= []).push(b.key);
  }
  return out.map((keys) => keys.sort().join(' '));
}

describe("the courses' set dressing (OP-419)", () => {
  it('takes layers in turn, round and round', () => {
    const keys = ['a', 'b', 'c'];
    expect([0, 1, 2, 3, 4, -1].map((n) => inTurn(keys, n))).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
  });

  it('never shows a screen the same backdrop as the screen beside it', () => {
    for (const id of Object.keys(COURSES)) {
      const shown = screens(id);
      for (let s = 1; s < shown.length; s++) expect(shown[s], `${id} screen ${s}`).not.toBe(shown[s - 1]);
    }
  });

  it('starts each act on a backdrop the act before it did not end on', () => {
    for (const [from, to] of [
      ['circuit-1', 'circuit-2'],
      ['circuit-2', 'circuit-3'],
      ['brush-1', 'brush-2'],
    ] as const) {
      expect(screens(to)[0], `${from} to ${to}`).not.toBe(screens(from).at(-1));
    }
  });

  it('dresses the courses with owl-world things, not human gadgets', () => {
    const gadgets = /vending-machine|noodle-stall|satellite-dish|tea-stall|telescope-brass|cabinet-miniature/;
    for (const [id, room] of Object.entries(COURSES)) for (const p of room.kit?.props ?? []) expect(p.piece, `${id} ${p.id}`).not.toMatch(gadgets);
  });
});
