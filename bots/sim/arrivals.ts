/**
 * An owl that comes into a room by a mover (OP-287, packages/shared/src/movers.ts): out of a tunnel's
 * far mouth with a hop, or falling in from a dive. It is in the air before it has stood anywhere, so a
 * kid can steer and spread its wings on the way down, and may come down on a ledge its spawn's floor
 * never reaches.
 *
 * The bots play every such way in: each way held (west, none, east), with Jump never held, held as the
 * room comes up, or held after a drop of the kid's own choosing (KID_DROPS), from the spawn and from as
 * far either side of it as the room server may set an arrival down. The surfaces those come down on
 * count as reached in the room's stuck check (playtest.ts), and an owl that presses nothing has to come
 * down somewhere it can stand: a spawn that drops a diver into a pit or the thorns is a finding.
 */
import { arrivalAir, GROUNDED, type Air, type CameBy, type RoomDef } from '@owl-park/shared';
import { ROOMS } from '@owl-park/shared/rooms';
import { KID_DROPS } from './kid';
import { owlAt, STEPS_PER_S, stepOwl, type BotRoom } from './owl';
import { surfaceAt, type Surface } from './surfaces';

/** How far off its spawn the room server may set an arrival down by a doorway (px): LIMITS.scatterDoor (apps/edge/src/Room.ts). */
export const ARRIVAL_SCATTER = 60;
/** The longest an arrival is played (s): a glide down from a dive's height, with room to spare. */
const ARRIVAL_S = 8;

/** A way into a room by a mover: the spawn it comes in at, and how. */
export interface MoverWayIn {
  spawn: string;
  came: CameBy;
}

/**
 * Every way into `room` by a mover of another room: a tunnel whose doorway leads here (falling in where
 * it goes straight down), and a downdraft's dive. On any map, as the bots read doorways.
 */
export function moverWaysIn(room: RoomDef, rooms: Readonly<Record<string, RoomDef>> = ROOMS): MoverWayIn[] {
  const out = new Map<string, MoverWayIn>();
  const add = (spawn: string, came: CameBy) => {
    if (room.spawns[spawn]) out.set(`${spawn}:${came}`, { spawn, came });
  };
  for (const r of Object.values(rooms)) {
    if (r.id === room.id || !r.movers) continue;
    const leads = (doorId: string) => {
      const d = r.doors.find((x) => x.id === doorId);
      return d ? [d.to, d.toNew, d.toTree].filter((to): to is { room: string; spawn: string } => to?.room === room.id) : [];
    };
    for (const t of r.movers.tunnels ?? []) for (const to of leads(t.door)) add(to.spawn, t.drop ? 'dive' : 'tunnel');
    for (const d of r.movers.downdrafts ?? []) for (const to of leads(d.door)) add(d.lands ?? to.spawn, 'dive');
  }
  return [...out.values()];
}

export interface ArrivalReport extends MoverWayIn {
  /** Every surface a kid can bring the arrival down on. */
  lands: string[];
  /** Pressing nothing, from the spawn itself, it comes down in a pit or the thorns, or nowhere it can stand. */
  unsafe: boolean;
}

/** The park times an arrival is played at: across the room's cycle of timed things (columns, signs), or once. */
function times(br: BotRoom): number[] {
  const r = br.room;
  const cyc = Math.max(0, ...[...(r.neonSigns ?? []), ...(r.updrafts ?? [])].map((u) => ('onMs' in u && u.onMs !== undefined && u.offMs !== undefined ? u.onMs + u.offMs : 0)));
  return cyc === 0 ? [0] : Array.from({ length: 8 }, (_, i) => 100_000 + (cyc * i) / 8);
}

/** One arrival played: from `x`, the way held all the way down, Jump held from step `holdFrom` (-1 for never). The surface it comes down on, 'fall', or null for nowhere. */
function play(br: BotRoom, surfaces: readonly Surface[], x: number, air: Air, t0: number, way: -1 | 0 | 1, holdFrom: number): string | 'fall' | null {
  const o = owlAt(x, air.z, t0);
  o.fl = { ...o.fl, air: { ...air } };
  for (let i = 0; i < ARRIVAL_S * STEPS_PER_S; i++) {
    if (stepOwl(br, o, { way, pressed: false, held: holdFrom >= 0 && i >= holdFrom }) === 'fall') return 'fall';
    if (o.fl.air.s === GROUNDED) return surfaceAt(surfaces, o.x, o.fl.air.z)?.id ?? null;
    if (o.x < -50 || o.x > br.room.size.w + 50) return null;
  }
  return null;
}

/** Where a kid can bring down an owl that comes into the room at `spawn` by a mover, and whether doing nothing is safe. */
export function playArrival(br: BotRoom, surfaces: readonly Surface[], wayIn: MoverWayIn): ArrivalReport {
  const room = br.room;
  const at = room.spawns[wayIn.spawn]!;
  const air = arrivalAir(wayIn.came, 0, room.spawnTops?.[wayIn.spawn] ?? 0);
  const stepOf = (ms: number) => Math.round((ms / 1000) * STEPS_PER_S);
  const holds = [-1, ...KID_DROPS.map(stepOf)];
  const lands = new Set<string>();
  let unsafe = false;
  for (const t0 of times(br)) {
    const still = play(br, surfaces, at.x, air, t0, 0, -1);
    if (still === 'fall' || still === null) unsafe = true;
    for (const dx of [-ARRIVAL_SCATTER, 0, ARRIVAL_SCATTER]) {
      const x = Math.min(room.size.w - 8, Math.max(8, at.x + dx));
      for (const way of [-1, 0, 1] as const) {
        for (const hold of holds) {
          const end = play(br, surfaces, x, air, t0, way, hold);
          if (end !== null && end !== 'fall') lands.add(end);
        }
      }
    }
  }
  return { ...wayIn, lands: [...lands].sort(), unsafe };
}
