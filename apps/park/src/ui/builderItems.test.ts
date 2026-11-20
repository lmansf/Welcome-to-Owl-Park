import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@owl-park/shared';
import { builderItems } from './builderItems';

describe('builderItems', () => {
  it('lists the Hollow Moth among the pets on a plain address, now the sealed hollow is open to everyone', () => {
    expect(builderItems('pet').map((i) => i.id)).toContain('hollow-moth');
  });

  it('lists every item of a kind as the catalogue has it', () => {
    for (const kind of ['wear', 'pet', 'fx'] as const) {
      const all = CATALOGUE.filter((i) => i.kind === kind).map((i) => i.id);
      expect(builderItems(kind).map((i) => i.id)).toEqual(all);
    }
  });
});
