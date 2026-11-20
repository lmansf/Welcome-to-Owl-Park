import { CATALOGUE, type ItemDef } from '@owl-park/shared';

/**
 * The catalogue's items of this kind that the owl builder lists. (The Hollow Moth, from the sealed
 * hollow, OP-310, was held back while the hollow was behind `?friends=1`; both are on for every
 * visitor since Nov 20.)
 */
export function builderItems(kind: ItemDef['kind']): ItemDef[] {
  return CATALOGUE.filter((i) => i.kind === kind);
}
