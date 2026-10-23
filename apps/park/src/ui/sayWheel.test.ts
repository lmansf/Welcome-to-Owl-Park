import { describe, expect, it } from 'vitest';
import { PHRASE_GROUPS } from '@owl-park/shared';
import { turnGroup } from './sayWheel';

describe('the Say wheel', () => {
  it('turns round its six groups either way, and comes back round', () => {
    expect(turnGroup('hello', 1)).toBe('cheers');
    expect(turnGroup('hello', -1)).toBe('help');
    expect(turnGroup('help', 1)).toBe('hello');
    let g = PHRASE_GROUPS[0]!.id;
    for (let i = 0; i < PHRASE_GROUPS.length; i++) g = turnGroup(g, 1);
    expect(g).toBe(PHRASE_GROUPS[0]!.id);
    expect(turnGroup('feelings', -13)).toBe(turnGroup('feelings', -1));
  });
});
