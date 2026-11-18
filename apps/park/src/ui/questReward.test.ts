import { describe, expect, it } from 'vitest';
import { rewardText } from './questReward';

describe('a quest’s reward, as the quests screen and the dialogue say it', () => {
  it('feathers and the collectible, for a ticket holder', () => {
    expect(rewardText({ feathers: 50, item: 'leaf-crown~0' })).toBe('50 feathers and Leaf Crown');
    expect(rewardText({ feathers: 40, item: 'pick' })).toBe('40 feathers and a collectible');
    expect(rewardText({ feathers: 30, item: null })).toBe('30 feathers');
  });
  it('the collectible only, for a free guest (OP-428: no feathers)', () => {
    expect(rewardText({ feathers: 0, item: 'leaf-crown~0' })).toBe('Leaf Crown');
  });
});
