import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@owl-park/shared';
import { builderItems } from './builderItems';

describe('builderItems', () => {
  it('leaves the Hollow Moth out of the pets until the friends preview is on', () => {
    expect(builderItems('pet', '').map((i) => i.id)).not.toContain('hollow-moth');
    expect(builderItems('pet', '?friends=1').map((i) => i.id)).toContain('hollow-moth');
  });

  it('lists every other item of a kind as the catalogue has it', () => {
    for (const kind of ['wear', 'pet', 'fx'] as const) {
      const all = CATALOGUE.filter((i) => i.kind === kind && i.id !== 'hollow-moth').map((i) => i.id);
      expect(builderItems(kind, '').map((i) => i.id)).toEqual(all);
    }
  });
});
