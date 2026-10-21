import { PRESENTS, RARITY_COLOURS, parseVariant, type Present } from '@owl-park/shared';

/** The presents this device has already told its visitor about. */
const SEEN_KEY = 'owl-park:presents-seen';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function seenOn(storage: Store | null): string[] {
  try {
    const v = JSON.parse(storage?.getItem(SEEN_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Tell the visitor about each present from the park in their collection, once per device (a page that
 * cannot keep the note, in a private window, says it again next visit). Returns what was announced.
 */
export function announcePresents(owned: readonly string[], toast: (message: string, ms: number, accent: string) => void, storage: Store | null): Present[] {
  const seen = seenOn(storage);
  const fresh = PRESENTS.filter((p) => owned.includes(p.variant) && !seen.includes(p.variant));
  for (const p of fresh) {
    const v = parseVariant(p.variant);
    toast(p.note, 8000, v ? RARITY_COLOURS[v.rarity] : '#FFD36A');
  }
  if (fresh.length) {
    try {
      storage?.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh.map((p) => p.variant)]));
    } catch {
      /* private mode */
    }
  }
  return fresh;
}
