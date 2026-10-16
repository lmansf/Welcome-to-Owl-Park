import { distance, lerpVec } from './geometry';
import type { Vec2, Walk } from './protocol';

/** Owl walking speed in room pixels per second (rooms are 1600 px wide). */
export const WALK_SPEED = 260;

export function walkDurationMs(from: Vec2, to: Vec2, speed = WALK_SPEED): number {
  return (distance(from, to) / speed) * 1000;
}

/**
 * Where an owl is at time `now` for a walk that began at `walk.startedAt`.
 * Used to place remote owls that were already mid-walk when we joined, and to
 * drive local animation deterministically from wall-clock time.
 */
export function positionAlongWalk(walk: Walk, now: number, speed = WALK_SPEED): { pos: Vec2; done: boolean } {
  const total = walkDurationMs(walk.from, walk.to, speed);
  if (total <= 0) return { pos: { ...walk.to }, done: true };
  const elapsed = now - walk.startedAt;
  if (elapsed >= total) return { pos: { ...walk.to }, done: true };
  if (elapsed <= 0) return { pos: { ...walk.from }, done: false };
  return { pos: lerpVec(walk.from, walk.to, elapsed / total), done: false };
}

/** Which way the owl faces while walking: -1 left, 1 right, 0 straight. */
export function facing(walk: Walk): -1 | 0 | 1 {
  const dx = walk.to.x - walk.from.x;
  if (Math.abs(dx) < 1) return 0;
  return dx < 0 ? -1 : 1;
}
