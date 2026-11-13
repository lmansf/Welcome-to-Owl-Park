import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { Scenes: { Events: { POST_UPDATE: 'postupdate', SHUTDOWN: 'shutdown' } } } }));

import { promptPlace, promptWords } from './reachPrompt';

describe('the prompt over the owl (OP-344)', () => {
  it('names the first action where the owl stands, with the key that does it on a computer', () => {
    expect(promptWords({ id: 'npc:bramble', label: 'Talk to Bramble' }, false)).toBe('E: Talk to Bramble');
    expect(promptWords({ id: 'use:pile-1', label: 'Flop in' }, false)).toBe('E: Flop in');
    expect(promptWords({ id: 'cabinet-1', label: 'Play' }, false)).toBe('E: Play');
    // On a phone the pad's own button does it: the words alone.
    expect(promptWords({ id: 'npc:bramble', label: 'Talk to Bramble' }, true)).toBe('Talk to Bramble');
  });

  it('says nothing with no action, at a doorway seen from the side (its own arrow says up), or for Decorate, offered everywhere in a nest', () => {
    expect(promptWords(undefined, false)).toBeNull();
    expect(promptWords({ id: 'door:hut', label: 'Go in' }, false)).toBeNull();
    expect(promptWords({ id: 'decorate', label: 'Decorate' }, false)).toBeNull();
    expect(promptWords({ id: 'door:hut', label: 'Go in' }, true)).toBeNull();
  });

  it("lies on the floor just in front of the owl's feet, and under a doorway's sign where one lies there", () => {
    const feet = { x: 1000, y: 700 };
    expect(promptPlace(feet, null, 1)).toEqual({ x: 1000, y: 710 });
    // A sign on the floor right under the feet (it slides there from under an owl): the prompt goes under it.
    expect(promptPlace(feet, { left: 900, right: 1100, top: 712, bottom: 740 }, 1)).toEqual({ x: 1000, y: 746 });
    // A sign off to one side, or well below, or above the feet, is not in its way.
    expect(promptPlace(feet, { left: 1200, right: 1400, top: 712, bottom: 740 }, 1)).toEqual({ x: 1000, y: 710 });
    expect(promptPlace(feet, { left: 900, right: 1100, top: 800, bottom: 828 }, 1)).toEqual({ x: 1000, y: 710 });
    expect(promptPlace(feet, { left: 900, right: 1100, top: 640, bottom: 668 }, 1)).toEqual({ x: 1000, y: 710 });
    // Zoomed out (two room px to a screen px), the gaps are the same on screen.
    expect(promptPlace(feet, null, 2)).toEqual({ x: 1000, y: 720 });
  });
});
