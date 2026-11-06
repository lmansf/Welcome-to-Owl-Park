/**
 * The realm kit's slots in the rooms (OP-275): a realm's rooms name its art by the slot it fills,
 * `kit-<realm>-<slot>` (tools/kit/realm-kit.csv), so the realm's artist's delivery drops in by name.
 * Until a slot is delivered each of today's pieces in it is drawn under a stand-in key,
 * `kit-<realm>-<slot>--<piece>`, with its own art and box (KIT_ART's standIn, kitFilesOf), so the
 * realm keeps its look; once the slot's art is published, every stand-in in it takes that art.
 * tools/kit/slots.json says which piece stands in for which slot, and tools/kit/catalog.mjs writes
 * the stand-ins into the catalogue.
 */
import { withRow } from './kit';
import { KIT_CATALOG, type KitRealm } from './kitCatalog';
import type { KitRun } from './room';

/** For each realm, each piece of today's kit its rooms draw in a slot, and the stand-in key they draw it under. */
export const KIT_SLOT_RENAMES: Readonly<Record<KitRealm, Readonly<Record<string, string>>>> = (() => {
  const out: Record<string, Record<string, string>> = { glass: {}, ink: {}, clearing: {}, neon: {} };
  for (const [key, e] of Object.entries(KIT_CATALOG)) {
    const at = key.indexOf('--');
    if (!e.slot || at < 0) continue;
    const realm = /^kit-([a-z]+)-/.exec(key)![1]!;
    (out[realm] ??= {})[`kit-${key.slice(at + 2)}`] = key;
  }
  return out as Record<KitRealm, Record<string, string>>;
})();

const isRun = (v: object): v is KitRun & Record<string, unknown> => 'row' in v && typeof (v as { row?: unknown }).row === 'string' && 'x0' in v && 'x1' in v;

/**
 * A realm's room or course with its art named by the realm's slots: every kit key in it that stands
 * in for a slot of `realm` swapped for its stand-in key, and every recut row spelled out into its caps
 * and middles first (withRow), as those stand in for the perch's end and middle. Anything else is
 * left as it is (the kit tests check that a realm's rooms name nothing but its slots).
 */
export function inRealmKit<T>(realm: KitRealm, value: T): T {
  const renames = KIT_SLOT_RENAMES[realm];
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return renames[v] ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      let o = v as Record<string, unknown>;
      if (isRun(o)) {
        const { row: _row, ...spelled } = withRow(o as KitRun);
        o = spelled as Record<string, unknown>;
      }
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]));
    }
    return v;
  };
  return walk(value) as T;
}
