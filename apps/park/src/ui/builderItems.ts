import { CATALOGUE, type ItemDef } from '@owl-park/shared';
import { flagOn } from '../flags';

/**
 * Items the owl builder lists only with a preview flag on: while their way to earn them is still behind
 * that flag, a visitor would otherwise see an item no one can earn yet. The Hollow Moth comes from the
 * sealed hollow (OP-310), which only `?friends=1` shows.
 */
const FLAGGED_ITEMS: Readonly<Record<string, 'friends'>> = { 'hollow-moth': 'friends' };

/** The catalogue's items of this kind that the owl builder lists for this page. */
export function builderItems(kind: ItemDef['kind'], search?: string): ItemDef[] {
  return CATALOGUE.filter((i) => {
    if (i.kind !== kind) return false;
    const flag = FLAGGED_ITEMS[i.id];
    return flag === undefined || flagOn(flag, search);
  });
}
