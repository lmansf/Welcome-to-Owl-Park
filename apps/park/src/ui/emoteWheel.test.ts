import { EMOTE_IDS } from '@owl-park/shared';
import { describe, expect, it } from 'vitest';
import { LOOK_ITEM, WHEEL_SLOTS, emoteCountLine, wheelEmotes, wheelPage, wheelSpot } from './emoteWheel';

describe('the emote wheel', () => {
  it('puts the first slot at the top and goes round clockwise, evenly', () => {
    expect(wheelSpot(0, 100)).toEqual({ x: 0, y: -100 });
    expect(wheelSpot(2, 100)).toEqual({ x: 100, y: 0 });
    expect(wheelSpot(4, 100)).toEqual({ x: 0, y: 100 });
    expect(wheelSpot(6, 100)).toEqual({ x: -100, y: 0 });
    for (let i = 0; i < WHEEL_SLOTS; i++) {
      const a = wheelSpot(i, 120);
      const b = wheelSpot((i + 1) % WHEEL_SLOTS, 120);
      expect(Math.hypot(a.x, a.y)).toBeCloseTo(120, 1);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2 * 120 * Math.sin(Math.PI / WHEEL_SLOTS), 1);
    }
  });

  it('shows eight emotes a page and keeps the page in range', () => {
    const ids = Array.from({ length: 19 }, (_, i) => `e${i}`);
    expect(wheelPage(ids, 0)).toEqual({ items: ids.slice(0, 8), page: 0, pages: 3 });
    expect(wheelPage(ids, 2)).toEqual({ items: ids.slice(16), page: 2, pages: 3 });
    expect(wheelPage(ids, 9).page).toBe(2);
    expect(wheelPage(ids, -1).page).toBe(0);
    expect(wheelPage([], 0)).toEqual({ items: [], page: 0, pages: 1 });
    expect(wheelPage(ids.slice(0, 8), 1)).toEqual({ items: ids.slice(0, 8), page: 0, pages: 1 });
  });

  it('puts the look around first, for every owl (OP-289)', () => {
    const state = { owns: (id: string) => id === 'hoot' || id === 'flap' } as never;
    expect(wheelEmotes(state).map((i) => i.id)).toEqual(['look', 'hoot', 'flap']);
    expect(wheelEmotes(state)[0]).toBe(LOOK_ITEM);
    expect(LOOK_ITEM).toMatchObject({ kind: 'emote', name: 'Look around' });
    // An owl that owns no emote yet still has it.
    expect(wheelEmotes({ owns: () => false } as never).map((i) => i.id)).toEqual(['look']);
  });

  it('counts the emotes the wheel shows, the look around with them (OP-470)', () => {
    const inv = { owned: [] };
    // Three on the wheel (the look around and two owned): it says three, of every emote there is with the look around.
    const three = { inv, owns: (id: string) => id === 'hoot' || id === 'flap' } as never;
    expect(wheelEmotes(three)).toHaveLength(3);
    expect(emoteCountLine(three)).toBe(`3 of ${EMOTE_IDS.length + 1} emotes. Earn more on quests, or find them in the feather shop.`);
    // A new owl: the look around alone.
    expect(emoteCountLine({ inv, owns: () => false } as never)).toMatch(/^1 of /);
    // Every emote: nothing to say. Before the collection comes: a wait.
    expect(emoteCountLine({ inv, owns: () => true } as never)).toBe('');
    expect(emoteCountLine({ inv: null, owns: () => false } as never)).toBe('Loading your emotes…');
  });
});
