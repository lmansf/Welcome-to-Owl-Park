import { distanceToRect, type DoorDef, type Vec2 } from '@owl-park/shared';

/**
 * How near a doorway with words of its own (DoorDef.prompt) an owl stands for them to come first on the
 * action button and in E's prompt over the owl (room px from the doorway's floor): at the door, not
 * from across the room.
 */
export const DOOR_PROMPT_PX = 110;

/**
 * The doorway whose words the owl at `owl` is offered (the Nov 25 QA walk: at a nest's door the button
 * said Decorate, and the course gates in the clearing and the ink garden offered nothing): the nearest
 * with a prompt within DOOR_PROMPT_PX, leaving out any `skip` says (one that leads nowhere for this owl,
 * or the doorway it just came in by), or none.
 */
export function doorPromptAt(doors: readonly DoorDef[], owl: Vec2, skip: (door: DoorDef) => boolean = () => false): DoorDef | null {
  let best: DoorDef | null = null;
  let bestAway = Number.POSITIVE_INFINITY;
  for (const door of doors) {
    if (!door.prompt || skip(door)) continue;
    const away = distanceToRect(owl, door.rect);
    if (away <= DOOR_PROMPT_PX && away < bestAway) {
      best = door;
      bestAway = away;
    }
  }
  return best;
}
