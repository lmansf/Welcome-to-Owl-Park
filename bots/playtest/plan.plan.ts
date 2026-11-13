/**
 * The plan the browser walk reads (out/plan.json): every room, how it is seen (from the side or from
 * above), its spawns, its doorways and where an owl can stand. Written from packages/shared, so a new
 * room or doorway is in the walk with nothing listed by hand. A room folded into another (FOLDED_ROOMS,
 * OP-306) is left out: its link opens the room it was folded into, which the walk opens as itself.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { FOLDED_ROOMS, lowTop } from '@owl-park/shared';
import { groundOf, ROOMS } from '@owl-park/shared/rooms';
import { OUT } from '../sim/run';
import type { PlanRoom } from '../browser/plan';

it('writes the plan', () => {
  const rooms: PlanRoom[] = Object.values(ROOMS)
    .filter((r) => !Object.hasOwn(FOLDED_ROOMS, r.id))
    .map((r) => ({
      id: r.id,
      side: r.map === 2,
      ground: groundOf(r),
      size: r.size,
      spawns: r.spawns,
      doors: r.doors.map((d) => ({ id: d.id, ...d.rect, top: d.top ?? 0, to: d.toNew?.room ?? d.to?.room ?? d.toTree?.room ?? null })),
      floor: r.walkable,
      ledges: (r.perches ?? []).map((p) => ({ id: p.id, low: lowTop(p), area: p.area })),
      keeperOnly: !!r.keeperOnly,
    }));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'plan.json'), JSON.stringify({ rooms }, null, 1));
  expect(rooms.length).toBeGreaterThan(0);
});
