import { FEATHER_DRAWN } from './featherTrail';

/**
 * Where a resident owl's name is drawn, under its feet (Npc.ts), and how deep. Drawn at its feet's depth,
 * the feathers of the trail laid just in front of the owl covered it: Maple's, Sumi's and Nova's names
 * were hidden under the big quills (the Nov 25 cleanup walk, OP-454). Its depth is lifted past the
 * deepest feather that can lie over it, so a name always reads over the trail.
 */
export const NPC_LABEL = { below: 16, tall: 24 } as const;

/** How far past its feet's depth an NPC's name is drawn: past every feather whose drawing reaches it. */
export const NPC_LABEL_LIFT = NPC_LABEL.below + NPC_LABEL.tall + FEATHER_DRAWN.up + 2;

/** The depth an NPC standing at `y` has its name drawn at. */
export function npcLabelDepth(y: number): number {
  return y + NPC_LABEL_LIFT;
}
