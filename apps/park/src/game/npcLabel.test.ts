import { describe, expect, it } from 'vitest';
import { NPCS } from '@owl-park/shared';
import { FEATHER_DRAWN, featherDepth } from './featherTrail';
import { NPC_LABEL, npcLabelDepth } from './npcLabel';

describe("a resident owl's name over the feather trail (OP-454)", () => {
  it('is drawn over every feather whose drawing reaches it, wherever the feather lies', () => {
    const y = 800;
    const label = { top: y + NPC_LABEL.below, bottom: y + NPC_LABEL.below + NPC_LABEL.tall };
    let covering = 0;
    for (let fy = y - 200; fy <= y + 300; fy++) {
      const feather = { top: fy - FEATHER_DRAWN.up, bottom: fy + FEATHER_DRAWN.down };
      if (feather.bottom < label.top || feather.top > label.bottom) continue;
      covering++;
      expect(npcLabelDepth(y), `a feather at y ${fy}`).toBeGreaterThan(featherDepth({ x: 0, y: fy }));
    }
    // Feathers lying just under the owl's feet do reach the name: the ones the cleanup walk saw.
    expect(covering).toBeGreaterThan(40);
  });

  it('is lifted for every resident owl alike', () => {
    expect(NPCS.length).toBeGreaterThan(0);
    for (const n of NPCS) expect(npcLabelDepth(n.pos.y) - n.pos.y).toBe(npcLabelDepth(0));
  });
});
