/**
 * The Great Hollow's root runs (OP-308) flown by the kid bot: each run climbed from the floor beside the
 * hatch, and the glide off its stump to the next Commons' run, each a hop a kid lands at least every other
 * try (the kid bar). The hollow is seen from above; a run lies along one line of its floor plan (RUN_Y),
 * so the bot plays that line as it plays a room seen from the side.
 */
import { describe, expect, it } from 'vitest';
import { HALL_MIDDLE, HALL_ROOM, ROOT_RUNS, RUN_Y, rootId, type HallLevel } from '@owl-park/shared/rooms';
import { actionsToward, canAim, type Action } from './kid';
import { botRoom } from './owl';
import { KID_BAR } from './playtest';
import { routeFrom, solve } from './route';
import { surfaceAt, surfacesOf } from './surfaces';

const br = { ...botRoom(HALL_ROOM), y: RUN_Y };
const surfaces = surfacesOf(br);
const ids = surfaces.map((s) => s.id);
const surface = (id: string) => surfaces.find((s) => s.id === id)!;
const actions = new Map<string, Action[]>();
for (const F of surfaces) {
  const list: Action[] = [];
  for (const T of surfaces) if (F !== T && canAim(br, F, T) && (F.perch || T.perch)) list.push(...actionsToward(br, surfaces, F, T));
  actions.set(F.id, list);
}
/** The best a kid does at a hop from F to T: the share of its tries, at its best spot and plan, that land on T. */
const bestRate = (from: string, to: string) => Math.max(0, ...(actions.get(from) ?? []).filter((a) => a.to === to).map((a) => a.out.get(to) ?? 0));

describe('the Great Hollow’s root runs, as a kid plays them (OP-308)', () => {
  it('finds every root on the run’s line, and floor beside the hatch to start from', () => {
    for (const run of ROOT_RUNS) for (const [kind] of run.steps) expect(ids, rootId(run.level, kind)).toContain(rootId(run.level, kind));
    expect(surfaceAt(surfaces, HALL_MIDDLE, 0)?.perch).toBeUndefined();
  });

  it('climbs each run from the floor to its stump, every hop over the kid bar', () => {
    for (const run of ROOT_RUNS) {
      const stump = rootId(run.level, 'stump');
      const goal = { id: stump, on: new Set([stump]) };
      const solved = solve(ids, actions, goal);
      const start = surfaceAt(surfaces, run.steps[0]![1] + (run.flip ? 220 : -220), 0)!.id;
      const route = routeFrom(start, solved, goal);
      expect(route.tries, run.level).toBeLessThan(Infinity);
      for (const hop of route.hops) expect(hop.rate, `${run.level}: ${hop.from} to ${hop.to}`).toBeGreaterThanOrEqual(KID_BAR);
    }
  });

  it('glides off the stump by the hatch onto the next Commons’ run, west and east, over the kid bar', () => {
    for (const [from, to] of [
      ['ink', 'glass'],
      ['grove', 'market'],
    ] as Array<[HallLevel, HallLevel]>) {
      const rate = bestRate(rootId(from, 'stump'), rootId(to, 'log'));
      expect(rate, `${from} stump to ${to} log`).toBeGreaterThanOrEqual(KID_BAR);
      // And a glide that falls short lands on the floor: nothing lost.
      expect(surface(rootId(to, 'log')).x0).toBeGreaterThan(0);
    }
  });
});
