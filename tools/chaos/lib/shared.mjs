/**
 * The park's own rules for the harness (OP-132), from packages/shared as the tree has them: the
 * protocol's version, the rooms, and the walk the room server makes of a tap. A scripted visitor
 * then speaks the room server's version and asks only for walks the room makes in full, so a move
 * the room never echoes is the room's doing, never a tap into a wall. Node strips the types (22.18
 * and later); lib/ts-hooks.mjs finds the package's imports.
 */
import { register } from 'node:module';

register(new URL('./ts-hooks.mjs', import.meta.url));

// Each module by itself, not the package's index: stripping types cannot run every module there (a
// class's parameter properties, for one), and the harness needs only these.
const SHARED = new URL('../../../packages/shared/', import.meta.url);
const from = (path) => import(new URL(path, SHARED).href);

export const { EDGE_PROTOCOL_VERSION } = await from('src/edge.ts');
export const { WALK_SPEED } = await from('src/walk.ts');
export const { distance, distanceToRect, isWalkable, snapToWalkable } = await from('src/geometry.ts');
export const { resolveTarget } = await from('src/resolveTarget.ts');
export const { ROOMS } = await from('rooms/index.ts');
export const { STARTER_PACK } = await from('src/collectibles.ts');
