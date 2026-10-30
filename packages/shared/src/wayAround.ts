import { distance, isWalkable, type Polygon, type Shut } from './geometry';
import type { Vec2 } from './protocol';
import { WALK_SAMPLE_PX, resolveTarget } from './resolveTarget';

/**
 * The way around a bend in the floor, for a tap (OP-148). A tap walks the owl in a straight line and
 * stops where the floor ends on that line, so where the floor bends (the street's mounds where its two
 * screens join) a tap past the bend stopped the owl short of it, and a second tap from there did
 * nothing: the straight line left the floor at once. Now, when a tap's straight walk would stop short,
 * the page asks for the way around and walks it in legs, each an ordinary straight walk, so the room
 * server and the other owls' pages see walks as they always have. The held keys and the thumbstick
 * slide along the edge instead (steerTarget).
 *
 * TODO-DOCS (OP-148): docs/ARCHITECTURE.md's Movement row (a tap that a straight walk stops short of
 * is walked round the bend in legs, each one move message, set off as the one before ends).
 */

/** Grid step of the search over the floor, in room pixels. */
const WAY_GRID_PX = 16;
/** How far from the floor's edge each point of the search stands. */
const WAY_EDGE_PX = 6;
/**
 * How far from the floor's edge a leg keeps along its length, on either side. The room's copy of the
 * owl may be a step behind it when the next leg sets off, and its straight walk has to reach the same
 * end; at either end of a leg the margin narrows to nothing, as the owl may stand by the edge.
 */
const WAY_SIDE_PX = 5;
/** A straight walk that ends this far short of where it was aimed was stopped by the floor's shape, not by the snap to its edge: the page's test before it asks for a way. */
export const WAY_SHORT_PX = 24;
/** At most this many legs: a way that winds more is not found. */
const WAY_MAX_LEGS = 12;
/** A leg is tried at every this many points of the way, then at each one past the furthest it reached. */
const WAY_STRIDE = 4;

/**
 * The legs of a walk from `from` to `to` over the floor `walkable` less what is `shut`: the points
 * the owl walks to in turn, each a straight walk on from the one before, before it walks straight on
 * to `to`. Empty when a straight walk already reaches `to`; null when no way does (`to` is on floor
 * shut for now, a perch's face or a closed arch, or on a piece of floor of its own). The page counts
 * the doorways the walk is not aimed at as shut too, so no leg takes the owl through one on its way.
 */
export function wayAround(from: Vec2, to: Vec2, walkable: Polygon[], shut: readonly Shut[] = []): Vec2[] | null {
  const reaches = (a: Vec2, b: Vec2) => distance(resolveTarget(a, b, walkable, shut), b) <= WALK_SAMPLE_PX;
  if (reaches(from, to)) return [];
  if (isWalkable(to, walkable) && !isWalkable(to, walkable, shut)) return null;
  const on = (p: Vec2) => isWalkable(p, walkable, shut);

  // The search's points: a grid over the floor, each clear of the floor's edge, found as needed.
  const xs = walkable.flatMap((poly) => poly.map((p) => p.x));
  const ys = walkable.flatMap((poly) => poly.map((p) => p.y));
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const cols = Math.floor((Math.max(...xs) - x0) / WAY_GRID_PX) + 1;
  const rows = Math.floor((Math.max(...ys) - y0) / WAY_GRID_PX) + 1;
  const point = (c: number): Vec2 => ({ x: x0 + (c % cols) * WAY_GRID_PX, y: y0 + Math.floor(c / cols) * WAY_GRID_PX });
  const known = new Int8Array(cols * rows);
  const open = (c: number) => {
    if (known[c] === 0) {
      const p = point(c);
      const e = WAY_EDGE_PX;
      known[c] = on(p) && on({ x: p.x + e, y: p.y }) && on({ x: p.x - e, y: p.y }) && on({ x: p.x, y: p.y + e }) && on({ x: p.x, y: p.y - e }) ? 1 : -1;
    }
    return known[c] === 1;
  };
  const cellsNear = (p: Vec2, r: number) => {
    const out: number[] = [];
    const ci = Math.round((p.x - x0) / WAY_GRID_PX);
    const cj = Math.round((p.y - y0) / WAY_GRID_PX);
    for (let j = Math.max(0, cj - r); j <= Math.min(rows - 1, cj + r); j++) for (let i = Math.max(0, ci - r); i <= Math.min(cols - 1, ci + r); i++) out.push(j * cols + i);
    return out;
  };

  // The shortest way over the grid (A*), from the points the owl walks straight to, over neighbours a
  // step apart, to the first point that walks straight to `to`.
  const cost = new Float64Array(cols * rows).fill(Infinity);
  const prev = new Int32Array(cols * rows).fill(-1);
  const done = new Uint8Array(cols * rows);
  const heap = new Heap();
  for (let r = 2; r <= 4 && heap.size === 0; r += 2) {
    for (const c of cellsNear(from, r)) {
      if (cost[c] === Infinity && open(c) && reaches(from, point(c))) {
        cost[c] = distance(from, point(c));
        heap.push(cost[c]! + distance(point(c), to), c);
      }
    }
  }
  let end = -1;
  while (heap.size > 0) {
    const c = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    const p = point(c);
    if (distance(p, to) <= 3 * WAY_GRID_PX && reaches(p, to)) {
      end = c;
      break;
    }
    const i = c % cols;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if ((di === 0 && dj === 0) || i + di < 0 || i + di >= cols) continue;
        const n = c + dj * cols + di;
        if (n < 0 || n >= cols * rows || done[n] || !open(n)) continue;
        const m = point(n);
        const g = cost[c]! + distance(p, m);
        if (g >= cost[n]!) continue;
        if (![0.25, 0.5, 0.75].every((t) => on({ x: p.x + (m.x - p.x) * t, y: p.y + (m.y - p.y) * t }))) continue;
        cost[n] = g;
        prev[n] = c;
        heap.push(g + distance(m, to), n);
      }
    }
  }
  if (end < 0) return null;
  const path: Vec2[] = [];
  for (let c = end; c >= 0; c = prev[c]!) path.unshift(point(c));

  // The fewest legs: each on to the furthest point of the way it reaches. The first sets off from
  // where the owl stands, which may be by the edge, as any straight walk does; the rest set off from
  // points of the search and keep clear of the edge, unless the floor is too narrow there for that.
  const legs: Vec2[] = [];
  let here = from;
  let k = 0;
  const furthest = (goes: (a: Vec2, b: Vec2) => boolean) => {
    // On along the way a stride at a time while the leg reaches its points (two strides missed end
    // that), then each point just past the furthest one reached.
    let best = -1;
    for (let j = k, missed = 0; j < path.length && missed < 2; j += WAY_STRIDE) {
      if (goes(here, path[j]!)) {
        best = j;
        missed = 0;
      } else missed += 1;
    }
    const past = best < 0 ? k : best + 1;
    for (let j = past; j < Math.min(path.length, past + WAY_STRIDE); j++) if (goes(here, path[j]!)) best = j;
    return best;
  };
  while (!reaches(here, to)) {
    let best = legs.length === 0 ? -1 : furthest((a, b) => clearOfEdge(a, b, on));
    if (best < 0) best = furthest(reaches);
    if (best < 0 || legs.length === WAY_MAX_LEGS) return null;
    here = path[best]!;
    legs.push(here);
    k = best + 1;
  }
  return legs;
}

/** The search's frontier: grid points by their estimated length of way, the shortest first. */
class Heap {
  private keys: number[] = [];
  private values: number[] = [];

  get size(): number {
    return this.values.length;
  }

  push(key: number, value: number): void {
    let i = this.values.length;
    this.keys.push(key);
    this.values.push(value);
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (this.keys[up]! <= key) break;
      this.keys[i] = this.keys[up]!;
      this.values[i] = this.values[up]!;
      i = up;
    }
    this.keys[i] = key;
    this.values[i] = value;
  }

  pop(): number {
    const top = this.values[0]!;
    const key = this.keys.pop()!;
    const value = this.values.pop()!;
    const n = this.values.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && this.keys[child + 1]! < this.keys[child]!) child += 1;
        if (this.keys[child]! >= key) break;
        this.keys[i] = this.keys[child]!;
        this.values[i] = this.values[child]!;
        i = child;
      }
      this.keys[i] = key;
      this.values[i] = value;
    }
    return top;
  }
}

/**
 * Whether a straight walk from `a` to `b` stays on the floor, sampled as resolveTarget samples it, and
 * keeps WAY_SIDE_PX clear of the edge on either side between its ends.
 */
function clearOfEdge(a: Vec2, b: Vec2, on: (p: Vec2) => boolean): boolean {
  const len = distance(a, b);
  if (len === 0) return true;
  const n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const steps = Math.ceil(len / WALK_SAMPLE_PX);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!on(p)) return false;
    const side = Math.min(WAY_SIDE_PX, (i * len) / steps / 2, ((steps - i) * len) / steps / 2);
    if (side > 0 && !(on({ x: p.x + n.x * side, y: p.y + n.y * side }) && on({ x: p.x - n.x * side, y: p.y - n.y * side }))) return false;
  }
  return true;
}
