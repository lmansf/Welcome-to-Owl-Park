import { AIRBORNE, DIVE_ARRIVAL, distance, hiddenPieces, type Air, type Flaps, type GlideLane, type RoomDef, type Vec2 } from '@owl-park/shared';

/**
 * The movers as a page plays them (OP-287, shared movers.ts): a dive down a knot hole, a glide lane,
 * a knot-hole tunnel, where a hatch, a long walk and a stair were. All of it is behind the `movers`
 * flag (flags.ts): a page without it never calls anything here, and its rooms are as their doorways say.
 *
 * Pure, so it is unit-tested; moversView.ts draws the three stand-in pieces and RoomScene.ts plays them.
 *
 * TODO-DOCS (OP-287): docs/ART-PIPELINE.md's list of pieces to make gains the three below, with their
 * sizes, once the owner has said how each should look.
 */

/**
 * The three new pieces, by their art keys (art.ts, ART). None is painted yet: each is drawn as a box
 * with its name and the size to make it at, and a file delivered under its key takes the box's place
 * with no code change.
 */
export const MOVER_ART = {
  /** A knot hole's mouth: in the floor where a downdraft sinks into it, and in a wall where a tunnel begins. Its foot is the middle of its bottom edge. */
  mouth: 'mover-knot-hole-mouth',
  /** The air sinking over a knot hole: stands on the mouth and reaches up the screen, as a height does in a room seen from above. */
  column: 'mover-downdraft-column',
  /** A glide lane's streamers: one stretch of them, repeated along the lane at the height it holds a glide. */
  streamers: 'mover-glide-lane-streamers',
} as const;

/** What the park says of its movers. Drafts for the owner's approval; nothing here shows without the flag. */
export const MOVER_WORDS = {
  /** The first time an owl stands under a glide lane on a visit to its room: the thermal's line, for a lane. */
  lane: 'A glide lane runs here. Jump and keep holding to ride it along.',
} as const;

/** How fast an owl comes up out of a tunnel's far mouth (px/s up): a hop, about half a jump's height. */
export const TUNNEL_HOP = 620;
/** How long an owl takes to go into a mouth before the room changes (ms): seen, and no wait. */
export const INTO_MOUTH_MS = 260;

/** How an owl came into a room by a mover of the room it left: falling from a dive, or up out of a tunnel. */
export type CameBy = 'dive' | 'tunnel';

/** The room as a page with the movers on draws it: without the set pieces its movers stand in place of. */
export function roomWithMovers(room: RoomDef): RoomDef {
  const hidden = new Set(hiddenPieces(room.movers));
  if (!hidden.size || !room.pieces) return room;
  return { ...room, pieces: room.pieces.filter((p) => !hidden.has(p.id)) };
}

/** The air an owl comes into a room with, by the mover it came by: over where it lands and falling, or hopping up out of the mouth. */
export function arrivalAir(came: CameBy, flaps: Flaps): Air {
  return came === 'dive' ? { z: DIVE_ARRIVAL.z, vz: DIVE_ARRIVAL.vz, s: AIRBORNE, f: flaps } : { z: 0, vz: TUNNEL_HOP, s: AIRBORNE, f: flaps };
}

/** Where along a lane its stretches of streamers stand: end to end, each `every` px long, the last one cut to fit. */
export function streamerSpots(lane: GlideLane, every: number): Array<{ at: Vec2; length: number }> {
  const total = distance(lane.a, lane.b);
  const out: Array<{ at: Vec2; length: number }> = [];
  for (let from = 0; from < total - 1; from += every) {
    const length = Math.min(every, total - from);
    const mid = (from + length / 2) / total;
    out.push({ at: { x: lane.a.x + (lane.b.x - lane.a.x) * mid, y: lane.a.y + (lane.b.y - lane.a.y) * mid }, length });
  }
  return out;
}

/** The way an owl is heading, for a lane to carry it on: its walk's, else the way it is pushed, else none. */
export function headingOf(walk: { from: Vec2; to: Vec2 } | null, pushed: Vec2 | null): Vec2 | null {
  if (walk && (walk.to.x !== walk.from.x || walk.to.y !== walk.from.y)) return { x: walk.to.x - walk.from.x, y: walk.to.y - walk.from.y };
  return pushed && (pushed.x !== 0 || pushed.y !== 0) ? pushed : null;
}
