import { describe, expect, it } from 'vitest';
import { CABINETS } from '@owl-park/shared';
import { cabinetFace } from './cabinets';

describe("the arcade's cabinets", () => {
  it('carry their game’s name while it is live, and read Hatching Soon when switched off', () => {
    expect(CABINETS.map((c) => cabinetFace(c).text)).toEqual(['Hoot & Hop', 'Moon Flap', 'Nest Knockdown']);
    expect(cabinetFace({ ...CABINETS[1]!, live: false })).toEqual({ off: true, text: 'Hatching\nSoon' });
  });
});
