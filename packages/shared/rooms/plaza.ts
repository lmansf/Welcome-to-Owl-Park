/**
 * A painted room seen from above, grown into a plaza a crowd can gather in (the owner's ask, Nov 8: the
 * top-down rooms should "feel big, like a town center, rather than a room. somewhere that 80 people
 * could gather"). The painting stays where it was, its wall and the strip of floor along its foot; the
 * room runs on below it, deeper, its new floor laid in one of the art kit's seamless textures, tinted
 * to the painting's light. The painting's foot runs on over the new floor, mirrored and fading
 * (KitSurface.skirt), so the painted floor eases into the plaza with no seam, and the new floor's front
 * is shaped by its own edge pieces (edges.ts), as the Great Hollow's is, so it never reads as a box.
 */
import { edgeArt, shapedEdge, type EdgePlacement } from '../src/edges';
import type { Polygon } from '../src/geometry';
import type { Vec2 } from '../src/protocol';
import type { Perch } from '../src/perches';
import { ROOM_H, type RoomDef } from '../src/room';

/** How far the painting's foot runs on over the plaza, fading (KitSurface.skirt). */
export const PLAZA_SKIRT = 180;

/** What a room needs saying to grow into a plaza. */
export interface PlazaSpec {
  /** The new front of its floor (room y); the room ends 15 below it. */
  front: number;
  /**
   * Where the painting's floor opens onto the plaza (room y): every corner of a floor at this y or
   * below is dropped, and the floor runs on down from there. The corners above it must be one run
   * round each floor (its back and sides), or the floor can't be opened.
   */
  oldFront: number;
  /** Its floor's west and east ends below the painting (room x). */
  west: number;
  east: number;
  /** The seamless kit texture the new floor is laid in (a `kit-tex-` key). */
  texture: string;
  /** A colour the texture is drawn multiplied by, so it sits in the painting's light (KitSurface.tint). */
  tint?: number;
  /** The worn ring laid round each gathering spot, its middle on each of `rings`. */
  ring: string;
  rings: Vec2[];
  /** The front corner piece (the east one is the west one mirrored), and the bumps between them, west to east. */
  corner: string;
  frontBumps: string[];
  /** Things in the painting's foot that the opened floor now reaches (a mossy mound): solid, hopped up on. */
  perches?: Perch[];
  /**
   * For a room whose floors overlap, so no one run round each can be joined (the grove): the back of
   * the grown floor traced by hand, west to east, and the floors that stay as they are.
   */
  back?: { run: Vec2[]; others: Polygon[] };
}

/** A floor's corners above `oldFront`, as one run west to east; null when none of it reaches `oldFront`. */
export function keptRun(poly: Polygon, oldFront: number): Vec2[] | null {
  const n = poly.length;
  const drop = poly.findIndex((p) => p.y >= oldFront);
  if (drop < 0) return null;
  // Start just after a dropped corner, so the kept corners come in one piece.
  const order = Array.from({ length: n }, (_, i) => poly[(drop + 1 + i) % n]!);
  const runs: Vec2[][] = [];
  let cur: Vec2[] = [];
  for (const p of order) {
    if (p.y < oldFront) cur.push(p);
    else if (cur.length) (runs.push(cur), (cur = []));
  }
  if (cur.length) runs.push(cur);
  if (runs.length !== 1) throw new Error(`growToPlaza: the floor's corners above y ${oldFront} come in ${runs.length} runs, not one`);
  const run = runs[0]!;
  return run[0]!.x <= run.at(-1)!.x ? run : run.reverse();
}

/** The room grown: deeper, its floors run on below its painting into one, the new floor laid in the kit and edged. */
export function growToPlaza(room: RoomDef, spec: PlazaSpec): RoomDef {
  const h = spec.front + 15;
  const edges = plazaEdges(room.id, spec);
  const opened = spec.back ? spec.back.others.map((poly) => ({ poly, run: null })) : room.walkable.map((poly) => ({ poly, run: keptRun(poly, spec.oldFront) }));
  const runs = spec.back ? [spec.back.run] : opened.flatMap((o) => (o.run ? [o.run] : [])).sort((a, b) => a[0]!.x - b[0]!.x);
  if (!runs.length) throw new Error(`growToPlaza(${room.id}): no floor reaches y ${spec.oldFront}`);
  // Each floor's back, west to east, joined at the opening: down from one's east end, along, up into the next.
  const back: Vec2[] = [{ x: spec.west, y: spec.oldFront }];
  runs.forEach((run, i) => {
    if (i > 0) back.push({ x: run[0]!.x, y: spec.oldFront });
    back.push(...run);
    if (i < runs.length - 1) back.push({ x: run.at(-1)!.x, y: spec.oldFront });
  });
  back.push({ x: spec.east, y: spec.oldFront });
  const frontEdge = shapedEdge(spec.west, spec.east, spec.front, edges.filter((e) => e.y === spec.front));
  const plaza = [...back.slice(1), ...frontEdge.reverse(), back[0]!];
  return {
    ...room,
    size: { w: room.size.w, h },
    walkable: [plaza, ...opened.filter((o) => !o.run).map((o) => o.poly)],
    ...(spec.perches ? { perches: [...(room.perches ?? []), ...spec.perches] } : {}),
    edges: [...(room.edges ?? []), ...edges],
    kit: {
      ...(room.kit ?? { ground: h - 15 }),
      // Under the painting's foot, so its floor's last pixels are the painting's and the rest the plaza's.
      surfaces: [
        ...(room.kit?.surfaces ?? []),
        { id: 'plaza-floor', texture: spec.texture, rect: { x: 0, y: ROOM_H - 4, w: room.size.w, h: h - ROOM_H + 4 }, ...(spec.tint !== undefined ? { tint: spec.tint } : {}), skirt: PLAZA_SKIRT },
      ],
    },
  };
}

/** The pieces: a ring round each gathering spot; the front's corners and its bumps. */
function plazaEdges(id: string, spec: PlazaSpec): EdgePlacement[] {
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
  return [...rings, ...front];
}
