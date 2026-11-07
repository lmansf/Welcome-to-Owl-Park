/**
 * A skin trial (`?skin=<name>`, kept for the tab until `?skin=0`): a realm artist's skin sheet, cut
 * into the kit's slots by tools/kit/skin_sheet.py and published as `trial-<name>-kit-<realm>-<slot>`,
 * drawn in place of those slots, so a sheet can be tried in a course before anyone imports it.
 * Without the flag nothing changes: the trial's files are only asked for by a page that names it.
 *
 * Only the look changes, as with size boxes: each slot keeps its key, size, collision and place, and
 * a stand-in in the slot (`kit-<realm>-<slot>--<piece>`) takes the trial's art as it takes a
 * delivered slot's. One piece the slots don't have is drawn too: the skin sheet's updraft bits
 * (cell C6), cut into square frames, rise in the realm's updrafts in place of the drawn leaf
 * (`kit-<realm>-updraft-bits`).
 */
import { KIT_ART, kitSlotBase } from '@owl-park/shared';
import { rasterNames } from './artNames';

const STORE = 'owl-park-skin';
const NAME = /^[a-z0-9]{1,24}$/;

/** The trial this tab draws, or null: `?skin=<name>` turns one on and `?skin=0` off, and either is kept for the tab. */
export function skinTrialWanted(asked: string | null, store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = globalThis.sessionStorage): string | null {
  const pick = (v: string | null | undefined) => (v && v !== '0' && NAME.test(v) ? v : null);
  try {
    if (asked === '0') store?.removeItem(STORE);
    else if (pick(asked)) store?.setItem(STORE, asked!);
    return asked === '0' ? null : (pick(asked) ?? pick(store?.getItem(STORE)));
  } catch {
    // Storage refused (a private window): the address alone says.
    return pick(asked);
  }
}

/** The key of a realm's updraft bits, from its updraft column's art (`kit-<realm>-updraft`). */
export function updraftBitsKey(updraftArt: string): string {
  return `${kitSlotBase(updraftArt)}-bits`;
}

/**
 * The files a key draws from on trial `skin`: `trial-<skin>-<slot>` when the key is a realm slot (or
 * a stand-in in one, or the updraft bits) and the trial has a file for it; null otherwise.
 */
export function trialFilesOf(key: string, skin: string | null, published: ReadonlyMap<string, string>): string | null {
  if (!skin) return null;
  const base = kitSlotBase(key);
  if (!KIT_ART[key]?.slot && !base.endsWith('-updraft-bits')) return null;
  const files = `trial-${skin}-${base}`;
  return rasterNames(files, 1, published).length > 0 ? files : null;
}
