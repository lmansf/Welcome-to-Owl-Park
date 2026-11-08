/**
 * A painted room seen from above, grown into a plaza a crowd can gather in (the owner's ask, Nov 8: the
 * top-down rooms should "feel big, like a town center, rather than a room. somewhere that 80 people
 * could gather"). The painting stays where it was, its wall and the strip of floor along its foot; the
 * room runs on below it, deeper, its new floor laid in one of the art kit's seamless textures. Pieces
 * laid flat over the join hide where the painting's floor meets the new one, and the new floor's front
 * is shaped by its own edge pieces (edges.ts), as the Great Hollow's is, so it never reads as a box.
 */
import { edgeArt, shapedEdge, type EdgePlacement } from '../src/edges';
import type { Vec2 } from '../src/protocol';
import { ROOM_H, type RoomDef } from '../src/room';

/** What a room needs saying to grow into a plaza. */
export interface PlazaSpec {
  /** The new front of its floor (room y); the room ends 15 below it. */
  front: number;
  /**
   * The painting's floor's front (room y): the corners of its old floor at this y or below are
   * dropped, and the floor runs on down from there.
   */
  oldFront: number;
  /** Its floor's west and east ends below the painting (room x). */
  west: number;
  east: number;
  /** The seamless kit texture the new floor is laid in (a `kit-tex-` key). */
  texture: string;
  /** A colour the texture is drawn multiplied by, so it sits in the painting's light (KitSurface.tint). */
  tint?: number;
  /** The piece laid flat over the join, end to end across it. */
  join: string;
  /** The worn ring laid round each gathering spot, its middle on each of `rings`. */
  ring: string;
  rings: Vec2[];
  /** The front corner piece (the east one is the west one mirrored), and the bumps between them, west to east. */
  corner: string;
  frontBumps: string[];
}

/** The room grown: deeper, its floor run on below its painting, the new floor laid in the kit and edged. */
export function growToPlaza(room: RoomDef, spec: PlazaSpec): RoomDef {
  const old = room.walkable[0]!;
  const top = old.filter((p) => p.y < spec.oldFront);
  const h = spec.front + 15;
  const edges = plazaEdges(room.id, room.size.w, spec);
  const frontEdge = shapedEdge(spec.west, spec.east, spec.front, edges.filter((e) => e.y === spec.front));
  const walkable = [[...top, { x: spec.east, y: spec.oldFront }, ...frontEdge.reverse(), { x: spec.west, y: spec.oldFront }], ...room.walkable.slice(1)];
  return {
    ...room,
    size: { w: room.size.w, h },
    walkable,
    edges: [...(room.edges ?? []), ...edges],
    kit: {
      ...(room.kit ?? { ground: h - 15 }),
      // Under the painting's foot, so its floor's last pixels are the painting's and the rest the plaza's.
      surfaces: [...(room.kit?.surfaces ?? []), { id: 'plaza-floor', texture: spec.texture, rect: { x: 0, y: ROOM_H - 4, w: room.size.w, h: h - ROOM_H + 4 }, ...(spec.tint !== undefined ? { tint: spec.tint } : {}) }],
    },
  };
}

/** The pieces: the join's, end to end along it; a ring round each gathering spot; the front's corners and its bumps. */
function plazaEdges(id: string, w: number, spec: PlazaSpec): EdgePlacement[] {
  // The join's pieces overlap a little, end to end across the room, each inside it.
  const jw = edgeArt(spec.join).w;
  const n = Math.ceil((w - 40) / (jw - 40));
  const joins: EdgePlacement[] = Array.from({ length: n }, (_, i) => ({
    id: `${id}-join-${i}`,
    key: spec.join,
    x: Math.round((i * (w - jw)) / Math.max(1, n - 1)),
    y: ROOM_H - edgeArt(spec.join).h / 2,
    ...(i % 2 ? { flip: true as const } : {}),
  }));
  const rw = edgeArt(spec.ring).w;
  const rh = edgeArt(spec.ring).h;
  const rings = spec.rings.map((r, i) => ({ id: `${id}-ring-${i}`, key: spec.ring, x: r.x - rw / 2, y: r.y - rh / 2 }));
  const cw = edgeArt(spec.corner).w;
  const front: EdgePlacement[] = [{ id: `${id}-corner-front-west`, key: spec.corner, x: spec.west, y: spec.front }];
  let x = spec.west + cw + 20;
  spec.frontBumps.forEach((key, i) => {
    const bw = edgeArt(key).w;
    if (x + bw > spec.east - cw - 20) return;
    front.push({ id: `${id}-front-${i}`, key, x, y: spec.front, ...(i % 2 ? { flip: true as const } : {}) });
    x += bw + 60;
  });
  front.push({ id: `${id}-corner-front-east`, key: spec.corner, x: spec.east - cw, y: spec.front, flip: true });
  return [...joins, ...rings, ...front];
}
