import { describe, expect, it } from 'vitest';
import { TAG_BUTTON_GAP, tagButtonTop } from './tagButton';

describe("feather tag's button in the top-right corner (OP-466)", () => {
  it('keeps its own place while no activity card shows there', () => {
    expect(tagButtonTop(null)).toBeNull();
    expect(tagButtonTop({ top: 62, height: 0 })).toBeNull();
  });

  it("stands just under the stage quiz's card, never over it", () => {
    const card = { top: 62, height: 268 };
    const top = tagButtonTop(card)!;
    expect(top).toBe(62 + 268 + TAG_BUTTON_GAP);
    expect(top).toBeGreaterThan(card.top + card.height);
  });
});
