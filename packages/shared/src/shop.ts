/**
 * The feather shop (canon C31): collectibles for feathers, the same for every visitor. A weekly
 * rotation of eight (new each Monday at park midnight), a featured section (curated sets on their
 * dates, a few a day; otherwise the week's rarest), three items that change daily, and a daily free
 * gift. Everything is derived from the park clock, so the server and every browser agree without
 * storing anything (only who took today's gift is kept). Feathers are earned in the park and never
 * sold: no money is involved here.
 */
import { PRESENTS, RARITIES, STARTER_PACK, allVariants, parseVariant, type Rarity } from './collectibles';
import { nextParkDayAt, nextParkWeekAt, parkDay, parkWeek, rotationRandom } from './parktime';

// ---------- defaults the owner may change ----------

export const SHOP_PRICES: Readonly<Record<Rarity, number>> = { common: 40, uncommon: 90, rare: 220, epic: 500 };
/** How many of each rarity the weekly rotation holds. */
export const WEEKLY_MIX: Readonly<Record<Rarity, number>> = { common: 3, uncommon: 3, rare: 1, epic: 1 };
/** Three items change every day, at the usual prices; each one's rarity by these odds (percent). */
export const DAILY_ITEMS = 3;
export const DAILY_ITEM_ODDS: Readonly<Record<Rarity, number>> = { common: 40, uncommon: 35, rare: 20, epic: 5 };
/** The daily free gift: one collectible a day, mostly common or uncommon with an occasional rare. */
export const GIFT_ODDS: Readonly<Record<Rarity, number>> = { common: 60, uncommon: 32, rare: 8, epic: 0 };
/** A featured set shows this many of its items each day, turning through the set. */
export const FEATURED_PER_DAY = 4;

export interface FeaturedSet {
  id: string;
  /** Shown as the section's heading. */
  title: string;
  /** Park days, inclusive (YYYY-MM-DD). */
  from: string;
  to: string;
  items: readonly string[];
}

/** Curated sets, by date. The first whose dates include today is featured. */
export const FEATURED_SETS: readonly FeaturedSet[] = [
  {
    id: 'owlloween-2026',
    title: 'Owlloween',
    from: '2026-10-19',
    to: '2026-10-31',
    items: ['bat-headband~0', 'candy-corn-cap~0', 'mummy-wrap~0', 'jack-o-lantern-shades~0', 'candy-necklace~0', 'vampire-collar~0', 'pumpkin-sprite~0', 'black-kitten~0', 'ghost~0'],
  },
  {
    id: 'first-frost-2026',
    title: 'First frost',
    from: '2026-11-01',
    to: '2026-12-31',
    items: ['earmuffs~0', 'holly-crown~0', 'snow-bunny~0', 'snowflake-crown~0', 'frost-breath~0', 'snowfall~0'],
  },
];

export type ShopSection = 'featured' | 'weekly' | 'daily' | 'gift';

export interface ShopOffer {
  variant: string;
  section: ShopSection;
  /** What it costs today, in feathers (0 for the gift). */
  price: number;
  /** The usual price (what the gift would cost in the shop). */
  full: number;
  rarity: Rarity;
}

export interface ShopRotation {
  day: string;
  week: string;
  /** When the daily card and the featured items change, and when the week turns (ms). */
  nextDay: number;
  nextWeek: number;
  /** When the featured shelf changes: daily through a curated set, weekly otherwise (ms). */
  nextFeatured: number;
  featuredTitle: string;
  featured: ShopOffer[];
  weekly: ShopOffer[];
  /** Today's three. */
  daily: ShopOffer[];
  /** Today's free gift (one per collector per park day). */
  gift: ShopOffer | null;
}

/** Everyone holds these already: the starter pack and the park's presents. */
const EVERYONES = new Set<string>([...STARTER_PACK, ...PRESENTS.map((p) => p.variant)]);

let poolCache: Record<Rarity, string[]> | null = null;
/** Every variant the shop may sell, by rarity (never one that everyone holds). */
function pool(): Record<Rarity, string[]> {
  if (!poolCache) {
    poolCache = { common: [], uncommon: [], rare: [], epic: [] };
    for (const v of allVariants()) if (!EVERYONES.has(v)) poolCache[parseVariant(v)!.rarity].push(v);
  }
  return poolCache;
}

const itemOf = (variant: string) => parseVariant(variant)?.item.id ?? variant;

function offer(variant: string, section: ShopSection): ShopOffer {
  const rarity = parseVariant(variant)!.rarity;
  const full = SHOP_PRICES[rarity];
  return { variant, section, price: section === 'gift' ? 0 : full, full, rarity };
}

/** A rarity by percent odds. */
function rollRarity(odds: Readonly<Record<Rarity, number>>, rnd: () => number): Rarity {
  let total = 0;
  for (const r of RARITIES) total += odds[r];
  let roll = rnd() * total;
  for (const r of RARITIES) {
    roll -= odds[r];
    if (roll < 0 && odds[r] > 0) return r;
  }
  return 'common';
}

/** Pick `n` variants of a rarity whose items are not in `usedItems` (adds the picks to it). */
function draw(rarity: Rarity, n: number, rnd: () => number, usedItems: Set<string>): string[] {
  const out: string[] = [];
  const list = pool()[rarity];
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const v = list[Math.floor(rnd() * list.length)];
    if (!v || usedItems.has(itemOf(v))) continue;
    usedItems.add(itemOf(v));
    out.push(v);
  }
  return out;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function activeFeaturedSet(day: string): FeaturedSet | null {
  return FEATURED_SETS.find((s) => s.from <= day && day <= s.to) ?? null;
}

/** The shop at a moment. */
export function shopRotation(at: number): ShopRotation {
  const day = parkDay(at);
  const week = parkWeek(at);
  const used = new Set<string>();

  const weekRnd = rotationRandom(`owl-park-shop|week|${week}`);
  const weekly: ShopOffer[] = [];
  for (const r of RARITIES) for (const v of draw(r, WEEKLY_MIX[r], weekRnd, used)) weekly.push(offer(v, 'weekly'));

  let featuredTitle = 'Featured';
  let featured: ShopOffer[];
  const set = activeFeaturedSet(day);
  if (set && set.items.length) {
    featuredTitle = set.title;
    const start = (daysBetween(set.from, day) * FEATURED_PER_DAY) % set.items.length;
    const count = Math.min(FEATURED_PER_DAY, set.items.length);
    featured = Array.from({ length: count }, (_, i) => set.items[(start + i) % set.items.length]!)
      .filter((v) => parseVariant(v))
      .map((v) => offer(v, 'featured'));
  } else {
    featured = [...draw('rare', 1, weekRnd, used), ...draw('epic', 1, weekRnd, used)].map((v) => offer(v, 'featured'));
  }
  for (const f of featured) used.add(itemOf(f.variant));

  const dayRnd = rotationRandom(`owl-park-shop|day|${day}`);
  const daily: ShopOffer[] = [];
  for (let i = 0; i < DAILY_ITEMS; i++) for (const v of draw(rollRarity(DAILY_ITEM_ODDS, dayRnd), 1, dayRnd, used)) daily.push(offer(v, 'daily'));
  const giftPick = draw(rollRarity(GIFT_ODDS, dayRnd), 1, dayRnd, used)[0];

  const nextDay = nextParkDayAt(at);
  const nextWeek = nextParkWeekAt(at);
  return { day, week, nextDay, nextWeek, nextFeatured: set ? nextDay : nextWeek, featuredTitle, featured, weekly, daily, gift: giftPick ? offer(giftPick, 'gift') : null };
}

/** The cheapest offer for a variant in this rotation, or null when the shop does not have it. */
export function offerFor(rot: ShopRotation, variant: string): ShopOffer | null {
  // The gift is taken (CollectionBook.claimGift), not bought.
  const all = [...rot.featured, ...rot.weekly, ...rot.daily].filter((o) => o.variant === variant);
  if (!all.length) return null;
  return all.reduce((a, b) => (b.price < a.price ? b : a));
}

/** What the shop panel shows: the rotation, which of its items this collector owns, the balance, and whether today's gift is taken. */
export interface ShopView {
  rotation: ShopRotation;
  owned: string[];
  feathers: number;
  giftTaken: boolean;
}

/** Taking today's gift: new to the collection, or a duplicate paid in feathers. */
export type GiftResult = { ok: true; variant: string; dup: boolean; feathers: number; total: number } | { ok: false; reason: 'taken' | 'none'; total: number };

export type BuyResult = { ok: true; variant: string; price: number; feathers: number } | { ok: false; reason: 'unknown' | 'not-offered' | 'owned' | 'feathers'; feathers: number };
