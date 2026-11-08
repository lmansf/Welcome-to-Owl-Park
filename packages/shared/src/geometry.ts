import type { Vec2 } from './protocol';

export type Polygon = Vec2[];

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Ray-casting point-in-polygon test. Points on an edge count as inside. */
export function pointInPolygon(p: Vec2, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (onSegment(p, a, b)) return true;
    const intersects = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function onSegment(p: Vec2, a: Vec2, b: Vec2): boolean {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (Math.abs(cross) > 1e-6) return false;
  return (
    p.x >= Math.min(a.x, b.x) - 1e-6 &&
    p.x <= Math.max(a.x, b.x) + 1e-6 &&
    p.y >= Math.min(a.y, b.y) - 1e-6 &&
    p.y <= Math.max(a.y, b.y) + 1e-6
  );
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + dx * t, y: a.y + dy * t };
}

export function closestPointOnPolygon(p: Vec2, poly: Polygon): Vec2 {
  let best: Vec2 = poly[0] ?? { x: p.x, y: p.y };
  let bestDist = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = closestPointOnSegment(p, poly[j]!, poly[i]!);
    const d = distance(p, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * Floor an owl cannot be on for now: a rect (the way into an arch whose realm is closed) or a polygon
 * (a solid ledge's top, below it, ledges.ts).
 */
export type Shut = Rect | Polygon;

/**
 * A point is walkable if it lies inside any of the room's walkable polygons, and outside everything
 * `shut`.
 */
export function isWalkable(p: Vec2, polys: Polygon[], shut: readonly Shut[] = []): boolean {
  return polys.some((poly) => pointInPolygon(p, poly)) && !shut.some((r) => (Array.isArray(r) ? pointInPolygon(p, r) : pointInRect(p, r)));
}

/**
 * Snap an arbitrary point to the walkable area: unchanged if already walkable,
 * otherwise the nearest point on the boundary of the nearest polygon. This makes
 * taps slightly off the path still do something sensible on a phone.
 */
export function snapToWalkable(p: Vec2, polys: Polygon[]): Vec2 {
  if (isWalkable(p, polys)) return p;
  let best: Vec2 = p;
  let bestDist = Infinity;
  for (const poly of polys) {
    const c = closestPointOnPolygon(p, poly);
    const d = distance(p, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function pointInRect(p: Vec2, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Distance from a point to the nearest point of a rectangle (0 inside it). */
export function distanceToRect(p: Vec2, r: Rect): number {
  return Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.w)), Math.max(r.y - p.y, 0, p.y - (r.y + r.h)));
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
