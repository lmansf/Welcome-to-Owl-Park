/**
 * The air of the realms' courses (OP-275): the updrafts and wind currents each act has beside its own
 * mechanic, so owls get about like owls in every course and not only in Updraft Canopy. An updraft
 * (updraft.ts) lifts a gliding owl up to a high ledge it would otherwise climb to, and a wind current
 * (wind.ts) carries a glide across a gap, from the ledge before it to the one after. Each one is a way
 * on beside the course's own (the brush stones, the neon signs, the plan's hops), never the only way,
 * so the route checks of each course (routes.ts) hold: no updraft or current reaches a ledge that the
 * course keeps for its own mechanic. In the neon course the high roofs are all the signs', so its
 * updraft is the mast's, in the last act.
 *
 * By room id; a room listed here takes these on top of any updrafts it has of its own.
 */
import { kitSlotKey } from '../src/kitArt';
import type { KitRealm } from '../src/kitCatalog';
import type { RoomDef } from '../src/room';
import type { Updraft } from '../src/updraft';
import type { WindCurrent } from '../src/wind';

/** An always-on column `w` wide from `x`, lifting to `top`. */
const up = (id: string, x: number, top: number, w = 120): Updraft => ({ id, x, w, top });
/** A current from `x0` to `x1` at height `z`, blowing east (1) or west (-1). */
const wind = (id: string, x0: number, x1: number, z: number, dir: 1 | -1 = 1): WindCurrent => ({ id, x0, x1, z, dir });

export const COURSE_AIR: Readonly<Record<string, { updrafts?: Updraft[]; winds?: WindCurrent[] }>> = {
  // Updraft Canopy, act 3: off the end of the long bough c3 on the wind over the drop to c5 (beside the
  // cycled column U12); and the plan's wind along the crown, from the high bough c10 over the drop to c13.
  'canopy-3': { winds: [wind('bough-wind', 1700, 2420, 580), wind('crown-wind', 4440, 5460, 610)] },
  // Brushstroke Bridges, act 1: up beside the first cliff; then up over the pond and across to the second cliff on the wind.
  'brush-1': { updrafts: [up('pond-lift', 2520, 470)], winds: [wind('pond-wind', 2600, 3120, 450)] },
  // Act 2: up beside the first rock; then on the wind toward the falls ledge.
  'brush-2': { updrafts: [up('river-lift', 1150, 450)], winds: [wind('rain-wind', 3460, 4060, 580)] },
  // Act 3a: off the high shelf m1 on the wind toward m2, and up over the water to m2.
  'brush-3a': { updrafts: [up('scroll-lift', 1850, 420, 110)], winds: [wind('scroll-wind', 840, 1900, 400)] },
  // Act 3b: off n1 on the wind to n2 (the cliff n3 stays the dash's).
  'brush-3b': { winds: [wind('fold-wind', 560, 1640, 240)] },
  // Blackout Circuit, act 1: off the first roof on the wind over the street to the footbridge.
  'circuit-1': { winds: [wind('roof-wind', 1400, 1700, 460)] },
  // Act 2: from the lit signs on the wind over the dark block to roof r2.
  'circuit-2': { winds: [wind('gap-wind', 1100, 2050, 480)] },
  // Act 3: off the mast's shelf on the wind to the billboard; up to the mast's top.
  'circuit-3': { updrafts: [up('mast-lift', 2100, 620)], winds: [wind('mast-wind', 1000, 1500, 440)] },
};

/**
 * A realm's course rooms with their course air added: each listed room's updrafts after its own, and
 * its wind currents; every column and current of the rooms named for the realm's `updraft` and
 * `wind-current` slots, so the realm's art for them is drawn there once it comes (kitSlots.ts).
 */
export function withCourseAir(realm: KitRealm, rooms: Record<string, RoomDef>): Record<string, RoomDef> {
  const lift = kitSlotKey(realm, 'updraft');
  const gust = kitSlotKey(realm, 'wind-current');
  return Object.fromEntries(
    Object.entries(rooms).map(([id, r]): [string, RoomDef] => {
      const air = COURSE_AIR[id] ?? {};
      const updrafts = [...(r.updrafts ?? []), ...(air.updrafts ?? [])].map((u) => ({ ...u, art: lift }));
      const winds = [...(r.winds ?? []), ...(air.winds ?? [])].map((w) => ({ ...w, art: gust }));
      return [id, { ...r, ...(updrafts.length ? { updrafts } : {}), ...(winds.length ? { winds } : {}) }];
    }),
  );
}
