import { describe, expect, it } from 'vitest';
import { edgeArt, edgeDraws } from '@owl-park/shared';
import { HOMES_PLAZA, MARKET_PLAZA } from '@owl-park/shared/rooms';
import { roomFor } from '../rooms';
import { FRONT_FADE, edgeShown, frontFadeBands, waitingFront } from './edgeView';

const none = () => false;
const all = () => true;
const drawn = (id: string, delivered: (key: string) => boolean) => edgeDraws(roomFor(id)!.edges ?? []).filter((d) => edgeShown(d, delivered));

describe("a room's edge pieces while their art is not delivered (the Nov 25 cleanup walk)", () => {
  it.each(['lobby', 'arcade', 'homes', 'market', 'grove', 'hub', 'ink'])('%s: no plaza ring disc and no strip along the front (OP-453, OP-456)', (id) => {
    const room = roomFor(id)!;
    const pieces = edgeDraws(room.edges ?? []);
    // The room has both kinds today, as placeholders.
    expect(pieces.some((d) => d.kind === 'ring')).toBe(true);
    expect(pieces.some((d) => d.kind === 'bump' && edgeArt(d.key).side === 'front')).toBe(true);
    const shown = drawn(id, none);
    expect(shown.filter((d) => d.kind === 'ring')).toEqual([]);
    expect(shown.filter((d) => d.kind === 'bump' && edgeArt(d.key).side === 'front')).toEqual([]);
  });

  it("the neon street's front, whose placeholder read as mushrooms, is not drawn (OP-482)", () => {
    expect(drawn('market', none).some((d) => d.key.startsWith('edge-market-clutter') || d.key === 'edge-market-corner-front')).toBe(false);
    expect(waitingFront(roomFor('market')!, none)).toBe(MARKET_PLAZA.front);
  });

  it("keeps the Great Hollow's own pool of light and the roots at its walls' foot", () => {
    expect(edgeShown({ key: 'edge-hall-plaza-ring', kind: 'ring' }, none)).toBe(true);
    expect(edgeShown({ key: 'edge-hollow-roots-a', kind: 'bump' }, none)).toBe(true);
    expect(edgeShown({ key: 'edge-hollow-pillar', kind: 'wall' }, none)).toBe(true);
  });

  it('draws every piece once its own art is published, and then no fade', () => {
    const room = roomFor('homes')!;
    expect(drawn('homes', all)).toHaveLength(edgeDraws(room.edges ?? []).length);
    expect(waitingFront(room, all)).toBeNull();
  });

  it("fades the room's foot out from above its front line, darker toward the foot", () => {
    const room = roomFor('homes')!;
    const front = waitingFront(room, none)!;
    expect(front).toBe(HOMES_PLAZA.front);
    const bands = frontFadeBands(room.size, front);
    expect(bands).toHaveLength(FRONT_FADE.steps.length);
    expect(bands[0]!.y).toBe(front - FRONT_FADE.above);
    for (const b of bands) expect(b.y + b.h).toBe(room.size.h);
    for (let i = 1; i < bands.length; i++) expect(bands[i]!.y).toBeGreaterThan(bands[i - 1]!.y);
    // Laid one over another, never as dark as a wall: the floor still shows through at the foot.
    expect(bands.reduce((a, b) => a + b.alpha, 0)).toBeLessThan(0.9);
  });

  it('a room with no front pieces gets no fade', () => {
    expect(waitingFront({ edges: [] }, none)).toBeNull();
  });
});
