import { variantName, type QuestReward } from '@owl-park/shared';

/** A quest's reward in words, for the quests screen and the dialogue. */
export function rewardText(r: QuestReward): string {
  const thing = r.item === 'pick' ? 'a collectible' : r.item ? variantName(r.item) : '';
  // A free guest's quest pays its collectible only (OP-428: the room server's guest board says 0 feathers).
  if (r.feathers <= 0 && thing) return thing.charAt(0).toUpperCase() + thing.slice(1);
  return `${r.feathers} feathers${thing ? ` and ${thing}` : ''}`;
}
