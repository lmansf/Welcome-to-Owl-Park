import { describe, expect, it } from 'vitest';
import { BROWNOUT_PACE, ROOFTOP_PACE, SIGN_WARN_MS, litPerches, litSigns, neonSign, signEnding, signLit, signPerches } from './circuit';
import { groundAt } from './perches';

const G = 770;
const a = neonSign('s1', 700, 880, 230, 'a');
const b = neonSign('s2', 1000, 1180, 380, 'b');

describe('neon signs on circuits', () => {
  it('light circuit a first and circuit b half a turn behind, both for a spell at each change', () => {
    expect(a).toMatchObject({ onMs: ROOFTOP_PACE.onMs, offMs: ROOFTOP_PACE.cycleMs - ROOFTOP_PACE.onMs, phase: 0 });
    expect(b.phase).toBe(0.5);
    // a: lit 0 to 2400 of each 4000; b: lit 2000 to 4400, so 2000 to 2400 and 0 to 400 both are.
    expect([0, 1000, 2399, 2400, 3999].map((t) => signLit(a, t))).toEqual([true, true, true, false, false]);
    expect([0, 399, 400, 1999, 2000, 3999].map((t) => signLit(b, t))).toEqual([true, true, false, false, true, true]);
    expect(signLit(a, 2200) && signLit(b, 2200)).toBe(true);
    expect(signLit(a, 4000 * 7 + 100)).toBe(true);
  });

  it('flicker for their last moments before they go dark', () => {
    expect(signEnding(a, ROOFTOP_PACE.onMs - SIGN_WARN_MS - 1)).toBe(false);
    expect(signEnding(a, ROOFTOP_PACE.onMs - SIGN_WARN_MS)).toBe(true);
    expect(signEnding(a, ROOFTOP_PACE.onMs - 1)).toBe(true);
    expect(signEnding(a, ROOFTOP_PACE.onMs)).toBe(false);
  });

  it('take a faster turn in the power cut', () => {
    const s = neonSign('s4', 0, 160, 220, 'a', BROWNOUT_PACE);
    expect(signLit(s, BROWNOUT_PACE.onMs - 1)).toBe(true);
    expect(signLit(s, BROWNOUT_PACE.onMs)).toBe(false);
    expect(signLit(s, BROWNOUT_PACE.cycleMs)).toBe(true);
  });

  it('are stood on only while lit, and the other perches of the room always', () => {
    const ledge = { id: 'b1', top: 420, area: [{ x: 1300, y: G - 4 }, { x: 1500, y: G - 4 }, { x: 1500, y: G + 4 }, { x: 1300, y: G + 4 }] };
    const perches = [ledge, ...signPerches([a, b], G)];
    expect(perches.map((p) => p.id)).toEqual(['b1', 's1', 's2']);
    const onA = { x: 790, y: G };
    expect(groundAt(litPerches(perches, [a, b], 1000), onA, 230)).toBe(230);
    expect(groundAt(litPerches(perches, [a, b], 3000), onA, 230)).toBe(0);
    expect(litPerches(perches, [a, b], 3000).map((p) => p.id)).toEqual(['b1', 's2']);
    expect([...litSigns([a, b], 1000)]).toEqual(['s1']);
    expect(litPerches(perches, undefined, 3000)).toHaveLength(3);
  });
});
