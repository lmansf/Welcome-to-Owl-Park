import { describe, expect, it } from 'vitest';
import type { QuestBoard } from '@owl-park/shared';
import { QuestState } from './quests';

describe('the quest board while the park is not answering (OP-280)', () => {
  it('is marked offline, tells its listeners once, and a board clears it', () => {
    const state = new QuestState();
    const told: Array<QuestBoard | null> = [];
    state.onChange((b) => told.push(b));
    expect(state.offline).toBe(false);
    state.setOffline(true);
    state.setOffline(true);
    expect(state.offline).toBe(true);
    expect(told).toHaveLength(1);
    state.set(null);
    expect(state.offline).toBe(true); // no board yet: still not answering
    const board = { active: [], offers: {}, storyDone: [], feathers: 0, nextDay: 0, nextWeek: 0, nextMonth: 0 } as unknown as QuestBoard;
    state.set(board);
    expect(state.offline).toBe(false);
    expect(state.board).toBe(board);
  });
});
