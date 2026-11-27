import { NEST_WORDS } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { ROOM_DOWN, WANDERING_ALONE } from '../game/roomDown';
import { ACCOUNT_WORDS } from './account';
import { OFFLINE_LINES, toastToReplace } from './toastStack';

describe('one tip at a time for the same news (OP-458)', () => {
  it('lets a second could-not-connect line take the place of the first instead of stacking over it', () => {
    // Offline: the room's line as it opens, then a press that needs the park.
    expect(toastToReplace([WANDERING_ALONE], ROOM_DOWN)).toBe(0);
    expect(toastToReplace([ROOM_DOWN], NEST_WORDS.notAnswering)).toBe(0);
    // A tip of another kind in between stays where it is.
    expect(toastToReplace(['+1 feather', WANDERING_ALONE], ROOM_DOWN)).toBe(1);
  });

  it('shows the same words once: the next room’s line, or a second press, takes the place of the tip already saying it', () => {
    expect(toastToReplace([WANDERING_ALONE], WANDERING_ALONE)).toBe(0);
    expect(toastToReplace(['A little closer...', '+1 feather'], 'A little closer...')).toBe(0);
  });

  it('leaves other tips to stand together, as they did', () => {
    expect(toastToReplace([], ROOM_DOWN)).toBe(-1);
    expect(toastToReplace([WANDERING_ALONE], '+1 feather')).toBe(-1);
    expect(toastToReplace(['+1 feather'], 'You found the key to The root door.')).toBe(-1);
  });

  it('knows every could-not-connect line the park shows as a tip, word for word', () => {
    expect([...OFFLINE_LINES]).toEqual([ROOM_DOWN, WANDERING_ALONE, NEST_WORDS.notAnswering, ACCOUNT_WORDS.refused.offline]);
  });
});
