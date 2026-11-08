/**
 * Routes through a room seen from the side, as a kid plays it: from every surface, the tries a kid needs
 * to reach a goal, and the hops it takes there.
 *
 * Each action (kid.ts) ends on some surface, in a fall, or nowhere. A try that ends where it began, in a
 * fall or nowhere is tried again from there (a fall's trip back to a bench is the course's business,
 * not the hop's). So a surface's expected tries to a goal is the best action's
 * (cost + the tries from where it lands) / (the share that gets somewhere). A jump costs a try; walking
 * off an edge costs a try only when it fails.
 *
 * A hop's rate is the share of its tries that land somewhere nearer the goal (fewer tries from there):
 * a tread higher than the one aimed for counts, a fall or a ledge further back does not. A walk off an
 * edge counts the ledge it lands on when that is as near.
 */
import type { Action, Landing } from './kid';

export interface Goal {
  id: string;
  /** The surfaces standing on which the goal is reached. */
  on: Set<string>;
}

export interface Hop {
  from: string;
  to: string;
  x: number;
  mode: Action['mode'];
  /** The share of tries that make progress. */
  rate: number;
  /** The share of tries that end in a fall. */
  fall: number;
}

export interface Route {
  goal: string;
  start: string;
  /** Expected tries (jumps) from start; Infinity when the goal cannot be reached. */
  tries: number;
  hops: Hop[];
}

/** A jump costs a try; walking off an edge costs only the times it fails (a walk that always lands is free). */
const COST = (a: Action, go: number) => (a.mode === 'walk' ? 1 - go : 1);

/** Expected tries to the goal from every surface, and the best action at each. */
export function solve(surfaces: readonly string[], actions: ReadonlyMap<string, readonly Action[]>, goal: Goal): { v: Map<string, number>; best: Map<string, Action> } {
  const v = new Map<string, number>(surfaces.map((s) => [s, goal.on.has(s) ? 0 : Infinity]));
  const best = new Map<string, Action>();
  for (let iter = 0; iter < 400; iter++) {
    let changed = false;
    for (const s of surfaces) {
      if (goal.on.has(s)) continue;
      let bestV = v.get(s)!;
      let bestA: Action | undefined;
      for (const a of actions.get(s) ?? []) {
        let go = 0;
        let sum = 0;
        for (const [k, p] of a.out) {
          if (k === 'fall' || k === 'miss' || k === s) continue;
          const vk = v.get(k);
          if (vk === undefined || vk === Infinity) continue;
          go += p;
          sum += p * vk;
        }
        if (go < 1e-9) continue;
        const val = (COST(a, go) + sum) / go;
        if (val < bestV - 1e-9) {
          bestV = val;
          bestA = a;
        }
      }
      if (bestA) {
        v.set(s, bestV);
        best.set(s, bestA);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { v, best };
}

/** The share of an action's tries that land nearer the goal than where it starts. */
export function progress(a: Action, v: ReadonlyMap<string, number>): { rate: number; next: Landing | null } {
  const here = v.get(a.from) ?? Infinity;
  let rate = 0;
  let next: Landing | null = null;
  let nextP = 0;
  for (const [k, p] of a.out) {
    if (k === 'fall' || k === 'miss') continue;
    const vk = v.get(k) ?? Infinity;
    // A walk off an edge that always lands costs no try, so the ledge it lands on is as near the goal as where it began.
    if (k !== a.from && vk < Infinity && (vk < here - 1e-9 || (a.mode === 'walk' && vk <= here + 1e-9))) {
      rate += p;
      if (p > nextP) {
        nextP = p;
        next = k;
      }
    }
  }
  return { rate, next };
}

/** The route a kid takes from `start` to the goal: each hop on the way, and the tries in all. */
export function routeFrom(start: string, solved: ReturnType<typeof solve>, goal: Goal): Route {
  const tries = solved.v.get(start) ?? Infinity;
  const hops: Hop[] = [];
  let at = start;
  const seen = new Set<string>();
  while (!goal.on.has(at) && tries !== Infinity && !seen.has(at)) {
    seen.add(at);
    const a = solved.best.get(at);
    if (!a) break;
    const { rate, next } = progress(a, solved.v);
    hops.push({ from: at, to: a.to, x: Math.round(a.x), mode: a.mode, rate, fall: a.out.get('fall') ?? 0 });
    if (!next) break;
    at = next;
  }
  return { goal: goal.id, start, tries, hops };
}
