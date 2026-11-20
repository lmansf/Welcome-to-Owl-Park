/**
 * Kept apart from activities.ts so the Great Hollow's room data (rooms/hollowHall.ts) can stand the
 * posts without loading the activities, which load the arcade and, through it, the rooms themselves.
 */
import type { Vec2 } from './protocol';

/**
 * The Great Hollow's lantern posts (Dec 1 plan D5): when the Party Grove was folded into the hollow
 * (Nov 19, the owner's "Fold into the hub"), its lanterns came too, as a row of lamp posts on the open
 * floor past the end of the grove's roots, toward the neon Commons: four to light together from the
 * floor in front of them. Each post's foot (room px), for its art (`kit-post-lantern`, 120 x 300), which
 * hangs its paper lantern from an arm to the left: the lantern glows HALL_LANTERN_AT from the foot,
 * measured from the art.
 */
export const HALL_LANTERN_POSTS: readonly Vec2[] = [
  { x: 3840, y: 1110 },
  { x: 3960, y: 1110 },
  { x: 4080, y: 1110 },
  { x: 4200, y: 1110 },
];
export const HALL_LANTERN_ART = 'kit-post-lantern';
export const HALL_LANTERN_AT: Vec2 = { x: -19, y: -67 };
