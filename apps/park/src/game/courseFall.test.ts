import { describe, expect, it } from 'vitest';
import { COURSES, ROOMS } from '../rooms';
import { fallBackHere } from './courseFall';

describe('a fall the room cannot answer (OP-405)', () => {
  const room = ROOMS['brush-1']!;
  const def = COURSES[room.course!.id!]!;
  const bench = room.course!.benches!.find((b) => b.id === 'bench-1')!;

  it('puts the owl back at the way it came in, on the floor', () => {
    expect(fallBackHere(room, def, 'from-gate', undefined, { x: 900, y: room.spawns['from-gate']!.y })).toEqual({ at: room.spawns['from-gate'], top: 0 });
  });

  it('or at the bench it last stood at here, when that is nearer, up at the bench’s height', () => {
    expect(fallBackHere(room, def, 'from-gate', bench, { x: bench.at.x + 200, y: bench.at.y })).toEqual({ at: { x: bench.at.x, y: bench.at.y }, top: bench.top });
  });

  it('comes in at the far end, it goes back there (up at that way in’s height), not to a bench behind it', () => {
    const far = room.spawns['from-rain']!;
    expect(fallBackHere(room, def, 'from-rain', bench, { x: far.x - 100, y: far.y })).toEqual({ at: far, top: room.spawnTops!['from-rain'] });
  });

  it('with no way in known, on the first act: the trail gate’s way in', () => {
    expect(fallBackHere(room, def, undefined, undefined, { x: 900, y: 0 }).at).toEqual(room.spawns[def.gate.spawn]);
  });
});
