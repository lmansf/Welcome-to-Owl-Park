/**
 * What a bot owl stands on in a room seen from the side: the stretches of floor between the pits and
 * the walls, and each perch (a ledge, a slope, a brush stroke while painted, a neon sign while lit).
 * These are the places a route runs between; walking along one is free, getting from one to another
 * is a hop (kid.ts).
 */
import { footing, inPit, isWalkable, lowTop, pointInPolygon, shutShortcuts, topAt, type Perch } from '@owl-park/shared';
import type { BotRoom } from './owl';

export interface Surface {
  /** The perch's id, or floor0, floor1, ... west to east. */
  id: string;
  x0: number;
  x1: number;
  /** Its height at its lowest (a slope's lowest end; 0 for the floor). */
  low: number;
  perch?: Perch;
  /** A brush stroke (`k1~`, `k4~2`): there only while its stone's ink lasts. */
  stone?: string;
  /** A neon sign: there only while lit. */
  sign?: boolean;
}

const SAMPLE = 4;

/** The x stretches along the ground line where `inside` holds, sampled every SAMPLE px. */
function stretches(w: number, inside: (x: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let from: number | null = null;
  for (let x = 0; x <= w; x += SAMPLE) {
    const ok = inside(x);
    if (ok && from === null) from = x;
    if (!ok && from !== null) {
      out.push([from, x - SAMPLE]);
      from = null;
    }
  }
  if (from !== null) out.push([from, w]);
  return out.filter(([a, b]) => b - a >= 8);
}

export function surfacesOf(br: BotRoom): Surface[] {
  const r = br.room;
  const y = br.y;
  const strokes = new Map<string, string>();
  for (const s of r.brushStones ?? []) for (const p of r.perches ?? []) if (p.id.startsWith(`${s.id}~`)) strokes.set(p.id, s.id);
  const signs = new Set((r.neonSigns ?? []).map((s) => s.id));
  const f0 = footing({ walkable: r.walkable, perches: [] }, 0, [...shutShortcuts(r, new Set()), ...(r.perches ?? []).filter((p) => p.solid && lowTop(p) > 4).map((p) => p.area)]);
  const out: Surface[] = stretches(r.size.w, (x) => isWalkable({ x, y }, f0.walkable, f0.shut) && !inPit(r, { x, y })).map(([x0, x1], i) => ({ id: `floor${i}`, x0, x1, low: 0 }));
  for (const p of r.perches ?? []) {
    const parts = stretches(r.size.w, (x) => pointInPolygon({ x, y }, p.area));
    if (parts.length === 0) continue;
    const x0 = parts[0]![0];
    const x1 = parts[parts.length - 1]![1];
    const s: Surface = { id: p.id, x0, x1, low: lowTop(p), perch: p };
    const stone = strokes.get(p.id);
    if (stone) s.stone = stone;
    if (signs.has(p.id)) s.sign = true;
    out.push(s);
  }
  return out;
}

/** A surface's height at `x`. */
export function heightOf(s: Surface, x: number): number {
  return s.perch ? topAt(s.perch, x) : 0;
}

/** The surface an owl standing at `x`, `z` up stands on (null for none: it is in the air, or off the plan). */
export function surfaceAt(surfaces: readonly Surface[], x: number, z: number): Surface | null {
  let best: Surface | null = null;
  for (const s of surfaces) {
    if (x < s.x0 - 1 || x > s.x1 + 1) continue;
    if (Math.abs(heightOf(s, x) - z) > 0.6) continue;
    if (!best || (best.perch === undefined && s.perch !== undefined)) best = s;
  }
  return best;
}

/** Whether footing at the floor reaches `x` at all (a doorway in a wall reads as off the floor). */
export function onFloor(br: BotRoom, x: number): boolean {
  const f = footing({ walkable: br.room.walkable, perches: br.room.perches ?? [] }, 0);
  return isWalkable({ x, y: br.y }, f.walkable, f.shut);
}
