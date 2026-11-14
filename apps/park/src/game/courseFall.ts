import { findSpawn, type CourseDef, type CoursePiece, type RoomDef, type Vec2 } from '@owl-park/shared';

/**
 * Where a fall puts the owl when the room server cannot answer it (OP-405): the same way back the room
 * would give with no run (coursebook.ts fall), worked out on the page. Back to the way the owl came into
 * this room (the trail gate's way in on the course's first act), or to the bench it last stood at here
 * when that is nearer, so a fall is never a walk on water while the park cannot connect.
 */
export function fallBackHere(
  room: Pick<RoomDef, 'id' | 'spawns' | 'spawnTops' | 'size'>,
  def: Pick<CourseDef, 'acts' | 'gate'>,
  spawn: string | undefined,
  bench: CoursePiece | undefined,
  pos: Vec2,
): { at: Vec2; top: number } {
  const entry = spawn !== undefined && Object.hasOwn(room.spawns, spawn) ? spawn : undefined;
  const way = entry ?? (room.id === def.acts[0] ? def.gate.spawn : undefined);
  const wayAt = findSpawn(room as RoomDef, way);
  const far = (p: Vec2) => Math.hypot(p.x - pos.x, p.y - pos.y);
  if (bench && (entry === undefined || far(bench.at) <= far(wayAt))) return { at: { x: bench.at.x, y: bench.at.y }, top: bench.top ?? 0 };
  return { at: { x: wayAt.x, y: wayAt.y }, top: (way !== undefined ? room.spawnTops?.[way] : undefined) ?? 0 };
}
