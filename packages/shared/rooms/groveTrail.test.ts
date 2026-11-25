import { describe, expect, it } from 'vitest';
import { FISHING_REACH, FISHING_ROOM, FISHING_SPOT } from '../src/activities';
import { distance, isWalkable, snapToWalkable } from '../src/geometry';
import { footing } from '../src/perches';
import type { Vec2 } from '../src/protocol';
import { resolveTarget, steerTarget } from '../src/resolveTarget';
import { wayAround } from '../src/wayAround';
import { ROOMS } from './index';

/**
 * The treehouse clearing's feather trail to the jetty (the Nov 25 QA walk): the feathers lead west from
 * the treehouse doorway, past the lantern on its mound, to the fishing spot; an owl following them by
 * the keys snagged on the mound's corner and could go no further. Walked here as the page walks it: the
 * floor at the owl's height with the mounds it cannot walk through shut (footing), a tap's way round
 * (wayAround) and held keys (steerTarget), a few px a frame.
 */
const room = ROOMS[FISHING_ROOM]!;
const floor = footing(room, 0);

/**
 * Where an owl held toward `dir` from `from` ends up after `frames` frames of a few px each, or as soon
 * as it is `past` (each frame is costly when the floor's code is instrumented for mutation testing).
 */
function held(from: Vec2, dir: Vec2, frames = 700, past?: (p: Vec2) => boolean): Vec2 {
  let p = { ...from };
  for (let i = 0; i < frames && !past?.(p); i++) {
    const to = steerTarget(p, dir, floor.walkable, undefined, floor.shut);
    if (!to) break;
    const d = distance(p, to);
    if (d < 0.5) break;
    const k = Math.min(1, 6 / d);
    p = { x: p.x + (to.x - p.x) * k, y: p.y + (to.y - p.y) * k };
  }
  return p;
}

describe('the treehouse clearing: the feathers to the jetty can be followed', () => {
  it('has the fishing spot on the floor, clear of every mound', () => {
    expect(isWalkable(FISHING_SPOT, floor.walkable, floor.shut)).toBe(true);
  });

  it('finds a tap’s way to the fishing spot from every way into the clearing, each leg a straight walk on the floor', () => {
    const aim = snapToWalkable(FISHING_SPOT, floor.walkable);
    for (const [name, from] of Object.entries(room.spawns)) {
      const legs = wayAround(from, aim, floor.walkable, floor.shut);
      expect(legs, `from ${name}`).not.toBeNull();
      let at = from;
      for (const leg of [...legs!, aim]) {
        const reached = resolveTarget(at, leg, floor.walkable, floor.shut);
        expect(distance(reached, leg), `from ${name}: the leg to ${leg.x},${leg.y}`).toBeLessThan(2);
        at = leg;
      }
      expect(distance(at, FISHING_SPOT)).toBeLessThanOrEqual(FISHING_REACH);
    }
  });

  it('carries an owl held west along the path past the lantern’s mound to the jetty, from any row of the path (it snagged on the mound’s corner)', () => {
    // From the open path just east of the mound, between it and the treehouse doorway (the one west of
    // the doorway, test below, walks the open stretch before it).
    const doorway = room.doors.find((d) => d.id === 'to-hub')!;
    const mound = room.perches!.find((p) => p.id === 'grove-lantern-mound')!;
    const startX = Math.max(...mound.area.map((p) => p.x)) + 100;
    expect(startX).toBeLessThan(doorway.rect.x);
    // West of the jetty's east end: the fishing spot is then a step up the floor.
    const atJetty = (p: Vec2) => p.x <= FISHING_SPOT.x + 100;
    const stuck: string[] = [];
    for (let y = 740; y <= 890; y += 10) {
      const from = { x: startX, y };
      if (!isWalkable(from, floor.walkable, floor.shut)) continue;
      const end = held(from, { x: -1, y: 0 }, 700, atJetty);
      if (!atJetty(end)) stuck.push(`from ${from.x},${y}: stopped at ${Math.round(end.x)},${Math.round(end.y)}`);
    }
    expect(stuck).toEqual([]);
  });

  it('carries an owl held west, then up, from the doorway to the fishing spot', () => {
    const west = held(room.spawns['default']!, { x: -1, y: 0 }, 700, (p) => p.x <= FISHING_SPOT.x);
    expect(west.x).toBeLessThan(FISHING_SPOT.x + 100);
    // Back east to the jetty's foot, then up onto it.
    const under = held(west, { x: 1, y: 0 }, Math.max(0, Math.round((FISHING_SPOT.x - west.x) / 6)));
    const up = held(under, { x: 0, y: -1 });
    expect(distance(up, FISHING_SPOT), `ended at ${Math.round(up.x)},${Math.round(up.y)}`).toBeLessThanOrEqual(FISHING_REACH);
  });
});
