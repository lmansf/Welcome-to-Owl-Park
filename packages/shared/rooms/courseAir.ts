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
  // Updraft Canopy, act 3: past the last thorn curtain (K4), up from the low bough c12 in a column of
  // its own, out of its top in a glide that sinks onto the wind along the crown, and across the drop to
  // c13. The wind runs too high to flap up into from c12, so c13 stays a ledge only the air reaches.
  // Every other drop in the act has a thorn curtain across it, which a current would carry an owl
  // straight into: the curtains and the cycled columns behind them are the act's own way on.
  'canopy-3': { updrafts: [up('crown-lift', 5120, 740)], winds: [wind('crown-wind', 5300, 5640, 660)] },
  // Brushstroke Bridges, act 1 (OP-360): rising air on the way up to each paper cliff, wide enough that
  // an owl still walking east as it rises is carried over the cliff's edge. A Jump held from the end
  // of the bridge before a cliff, or from the island at its foot, rises to it; let go too soon and the
  // owl comes down on the island. The first tops out 20 under the reed's feather, a flap from its top.
  // (The column over the pond and the wind from it to the second cliff are gone: the second column does
  // their work where the climb is, and the first wind a visitor meets is the rain's, in act 2.)
  'brush-1': { updrafts: [up('cliff-lift', 1100, 430, 260), up('far-cliff-lift', 2800, 450, 440)] },
  // Act 2: up beside the first rock; then on the wind toward the falls ledge.
  'brush-2': { updrafts: [up('river-lift', 1150, 450)], winds: [wind('rain-wind', 3460, 4060, 580)] },
  // Act 3a: up over the water to m2. (No current here: the cloud bank across the drop from m1 is a fall
  // from its foot up, so a current toward m2 would carry an owl into it; the same goes for act 3b.)
  'brush-3a': { updrafts: [up('scroll-lift', 1850, 420, 110)] },
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
