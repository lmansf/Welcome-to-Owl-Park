/**
 * What a game of feather tag earns (OP-434). Logan's word, Nov 20: "everyone that joined in gets rewards
 * depending on the tier of points. High tier gives preset pets and customization unlocks, middle gives
 * jackpot feathers or furniture unlocks, low gives feathers."
 *
 * The round's score (party/tag.ts tagScore: passes times the different owls who held the feather) sets one
 * tier for the whole game, and every owl in it at the end earns that tier:
 *  - high (TAG_TIER_MIN.high and up): a preset pet the owl doesn't have (TAG_PRIZE_PETS), else a look
 *    unlock it doesn't have (TAG_PRIZE_LOOKS);
 *  - middle: a furniture piece for its nest it doesn't have;
 *  - low: TAG_LOW_FEATHERS feathers.
 * An owl wins a pet, look or furniture prize at most TAG_PRIZES_PER_DAY a park day. Past that, or with
 * nothing left to give, a high or middle game pays the jackpot (TAG_JACKPOT_FEATHERS) instead.
 *
 * Feathers, the jackpot's included, go under the activities' shared cap (PLAY_FEATHERS_PER_DAY), with
 * the lanterns', the quiz's and the arcade's, so the shop's economy doesn't move. A free guest (OP-428)
 * keeps the pets, looks and furniture it wins (Logan, Nov 18: "Guests can earn and display the items"),
 * and earns no feathers, as everywhere else in the park.
 *
 * The tier cut-offs, the feather amounts and the prize lists are the ticket's defaults, each one line here.
 */
import { ITEMS, variantId } from './collectibles';
import type { CollectionBook } from './book';
import type { NestBook } from './nestbook';

export type TagTier = 'low' | 'middle' | 'high';
export const TAG_TIERS: readonly TagTier[] = ['low', 'middle', 'high'];

/**
 * The lowest score for each tier. Low is any pass at all. Two owls passing it back and forth for the whole
 * round make about 15 passes times 2, low; four owls who all hold it make about 12 times 4, middle; eight
 * or more who all hold it reach high.
 */
export const TAG_TIER_MIN: Readonly<Record<TagTier, number>> = { low: 1, middle: 40, high: 120 };

/** The tier a score reaches, null for none (no pass at all). */
export function tagTier(score: number): TagTier | null {
  if (score >= TAG_TIER_MIN.high) return 'high';
  if (score >= TAG_TIER_MIN.middle) return 'middle';
  if (score >= TAG_TIER_MIN.low) return 'low';
  return null;
}

/** The low tier's feathers. */
export const TAG_LOW_FEATHERS = 5;
/** The jackpot: a middle or high game's feathers when there is no prize to give. */
export const TAG_JACKPOT_FEATHERS = 15;
/** Pet, look and furniture prizes an owl can win a park day, all tiers together. */
export const TAG_PRIZES_PER_DAY = 1;

/** The preset pets a high game gives, each in its original colours: the rare ones the shop sells least. */
export const TAG_PRIZE_PETS: readonly string[] = ['hedgehog', 'bat', 'dragonfly', 'salamander', 'mole', 'black-kitten'].map((id) =>
  variantId(id),
);
/** The look unlocks a high game gives once an owl has every pet above: rare wearables, original colours. */
export const TAG_PRIZE_LOOKS: readonly string[] = ['monocle', 'masquerade-mask', 'brass-goggles', 'cape', 'moon-pendant', 'tiara'].map(
  (id) => variantId(id),
);

export type TagPrize =
  | { kind: 'item'; variant: string; name: string }
  | { kind: 'furniture'; item: string }
  | { kind: 'feathers'; feathers: number; jackpot: boolean }
  | { kind: 'none' };

export interface TagPrizeResult {
  tier: TagTier;
  prize: TagPrize;
  /** The owl's feathers after the prize. */
  total: number;
  /** A feather prize the shared cap cut (all of it or some): the page says so. */
  capped?: true;
}

function pick<T>(list: readonly T[], random: () => number): T | undefined {
  return list.length ? list[Math.min(list.length - 1, Math.floor(random() * list.length))] : undefined;
}

/**
 * Pay one owl its tier from a game of feather tag. `guest`: a free guest's (items only). Pure but for the
 * two books it writes to, so the room server's collections object and the tests run the same rules.
 */
export function payTagPrize(
  book: CollectionBook,
  nests: NestBook,
  cid: string,
  tier: TagTier,
  guest: boolean,
  now: number,
  random: () => number,
): TagPrizeResult {
  const feathers = (n: number, jackpot: boolean): TagPrizeResult => {
    if (guest) return { tier, prize: { kind: 'none' }, total: book.feathers(cid, now) };
    const { added, feathers: total } = book.earnPlay(cid, n, now);
    return { tier, prize: { kind: 'feathers', feathers: added, jackpot }, total, ...(added < n ? { capped: true as const } : {}) };
  };
  if (tier === 'low') return feathers(TAG_LOW_FEATHERS, false);
  if (tier === 'high') {
    const have = new Set(book.owned(cid, undefined, now));
    const missing = (list: readonly string[]) => list.filter((v) => !have.has(v));
    const variant = pick(missing(TAG_PRIZE_PETS), random) ?? pick(missing(TAG_PRIZE_LOOKS), random);
    if (variant && book.takeDaily(cid, 'tag-prize', TAG_PRIZES_PER_DAY, now)) {
      book.grant(cid, variant, 'granted', now);
      const name = ITEMS[variant.split('~')[0]!]?.name ?? variant;
      return { tier, prize: { kind: 'item', variant, name }, total: book.feathers(cid, now) };
    }
    return feathers(TAG_JACKPOT_FEATHERS, true);
  }
  if (nests.missingPiece(cid, now) && book.takeDaily(cid, 'tag-prize', TAG_PRIZES_PER_DAY, now)) {
    const item = nests.prizePiece(cid, now);
    if (item) return { tier, prize: { kind: 'furniture', item }, total: book.feathers(cid, now) };
  }
  return feathers(TAG_JACKPOT_FEATHERS, true);
}

/** Whether a prize frame from the room server looks like one. */
export function isTagPrize(v: unknown): v is TagPrize {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => typeof x === 'string' && x.length > 0 && x.length <= 64;
  switch (o['kind']) {
    case 'item':
      return str(o['variant']) && str(o['name']);
    case 'furniture':
      return str(o['item']);
    case 'feathers':
      return (
        typeof o['feathers'] === 'number' && Number.isInteger(o['feathers']) && o['feathers'] >= 0 && typeof o['jackpot'] === 'boolean'
      );
    case 'none':
      return true;
    default:
      return false;
  }
}
