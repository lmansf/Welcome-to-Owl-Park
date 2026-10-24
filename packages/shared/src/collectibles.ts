/**
 * Collectibles: the catalogue, colourways, the `wear` a look may carry and the duplicate payout.
 * Pure and deterministic, so the room server, the local (zero-backend) mode and the tests all
 * run exactly the same rules. Collectibles are earned from quests and bought with feathers in
 * the shop (quests.ts, shop.ts); they no longer appear at hiding spots.
 *
 * Every name here is public-safe: these strings are shown to visitors.
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';
export type ItemKind = 'wear' | 'pet' | 'fx' | 'emote';
export type WearSlot = 'head' | 'face' | 'neck';
/** Where an owned variant is worn. Emotes are played, not worn. */
export type EquipSlot = WearSlot | 'pet' | 'fx';

export interface ItemDef {
  id: string;
  kind: ItemKind;
  /** Wearables only. */
  slot?: WearSlot;
  name: string;
  rarity: Rarity;
  /** Art key for wearables and pets: `item-<id>` (see apps/park/src/game/items.ts). */
  art?: string;
}

export interface Colourway {
  n: number;
  name: string;
  /** Wearables and pets: hue rotation in degrees applied to the item's art (0 is the original). */
  hue?: number;
  /** Effects: the tint colour. */
  tint?: string;
}

export interface Variant {
  /** `<itemId>~<n>`, or just `<itemId>` for emotes. */
  id: string;
  item: ItemDef;
  colour: Colourway | null;
  rarity: Rarity;
}

// ---------- defaults the owner may change (named constants) ----------

/** A collectible that comes again (a quest reward the collector already owns) pays feathers instead. */
export const DUPLICATE_FEATHERS: Record<Rarity, number> = { common: 5, uncommon: 10, rare: 25, epic: 60 };
/** The server accepts a quest-item pickup when the owl stands this close to it (room pixels). */
export const PICKUP_RADIUS = 56;
/** The client asks for a pickup a little closer than the server's radius (latency headroom). */
export const PICKUP_CLIENT_RADIUS = 40;
/** Every new collector starts with these. */
export const STARTER_PACK = ['hoot', 'flap', 'sparkle~0'] as const;

/** A present from the park: every collector holds it, and the page says so once. */
export interface Present {
  variant: string;
  /** What the page says the first time it sees the present in a collection (visitor-facing). */
  note: string;
}

/**
 * Presents from the park, for every collector old and new: one made before a present was added gets
 * it the next time its collection is read. The shop never sells them.
 */
export const PRESENTS: readonly Present[] = [
  // Halloween 2026 (the owner's gift, 2026-10-21): the Bat pet in its original colours.
  { variant: 'bat~0', note: 'Happy Halloween! Every owl gets a Bat pet, a present from the park. It is waiting in your collection.' },
];
export const DEFAULT_TIME_ZONE = 'UTC';

export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic'];
export const RARITY_NAMES: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic' };
/** Display colours for rarity (toasts, card borders). */
export const RARITY_COLOURS: Record<Rarity, string> = { common: '#F6F1E3', uncommon: '#7BC950', rare: '#4FA3FF', epic: '#C8A2FF' };

// ---------- colourways ----------

const WEAR_COLOUR_NAMES = ['Original', 'Dawn', 'Noon', 'Dusk', 'Midnight', 'Starlight', 'Moonrise', 'Aurora', 'Comet', 'Eclipse'];
const PET_COLOUR_NAMES = ['Original', 'Dawn', 'Noon', 'Dusk', 'Midnight', 'Starlight', 'Aurora', 'Eclipse'];

/** Wearables: ten colourways, hue rotations 0, 36, ... 324 degrees. */
export const WEAR_COLOURWAYS: readonly Colourway[] = WEAR_COLOUR_NAMES.map((name, n) => ({ n, name, hue: n * 36 }));
/** Pets: eight colourways, hue rotations 0, 45, ... 315 degrees. */
export const PET_COLOURWAYS: readonly Colourway[] = PET_COLOUR_NAMES.map((name, n) => ({ n, name, hue: n * 45 }));
/** Effects: sixteen tint colours. */
export const FX_COLOURWAYS: readonly Colourway[] = (
  [
    ['Gold', '#C9A227'],
    ['Cream', '#F6F1E3'],
    ['Ember', '#FF7A1A'],
    ['Rose', '#FF2AA1'],
    ['Cyan', '#00E5FF'],
    ['Violet', '#6E3AFF'],
    ['Moss', '#7BC950'],
    ['Frost', '#BFE9FF'],
    ['Ruby', '#E0115F'],
    ['Sun', '#FFD36A'],
    ['Sky', '#4FA3FF'],
    ['Lilac', '#C8A2FF'],
    ['Mint', '#6EF2C2'],
    ['Coral', '#FF8C69'],
    ['Silver', '#C7CEDA'],
    ['White', '#FFFFFF'],
  ] as const
).map(([name, tint], n) => ({ n, name, tint }));

export function colourwaysFor(kind: ItemKind): readonly Colourway[] {
  switch (kind) {
    case 'wear':
      return WEAR_COLOURWAYS;
    case 'pet':
      return PET_COLOURWAYS;
    case 'fx':
      return FX_COLOURWAYS;
    case 'emote':
      return [];
  }
}

// ---------- the catalogue ----------

const C: Rarity = 'common';
const U: Rarity = 'uncommon';
const R: Rarity = 'rare';
const E: Rarity = 'epic';

const wear = (slot: WearSlot, list: Array<[string, string, Rarity]>): ItemDef[] => list.map(([id, name, rarity]) => ({ id, kind: 'wear', slot, name, rarity, art: `item-${id}` }));

export const CATALOGUE: readonly ItemDef[] = [
  ...wear('head', [
    ['witch-hat', 'Witch Hat', U],
    ['top-hat', 'Top Hat', U],
    ['wizard-hat', 'Wizard Hat', R],
    ['beanie', 'Beanie', C],
    ['crown', 'Crown', E],
    ['flower-crown', 'Flower Crown', U],
    ['leaf-crown', 'Leaf Crown', C],
    ['propeller-cap', 'Propeller Cap', U],
    ['chef-hat', "Chef's Hat", C],
    ['party-hat', 'Party Hat', C],
    ['beret', 'Beret', C],
    ['cowboy-hat', 'Cowboy Hat', U],
    ['tricorn', 'Tricorn', R],
    ['horned-helmet', 'Horned Helmet', R],
    ['halo', 'Halo', E],
    ['mushroom-cap', 'Mushroom Cap', U],
    ['acorn-cap', 'Acorn Cap', C],
    ['ribbon-bow', 'Ribbon Bow', C],
    ['bobble-hat', 'Bobble Hat', C],
    ['pith-helmet', "Explorer's Helmet", U],
    ['jester-hat', 'Jester Hat', R],
    ['laurel-wreath', 'Laurel Wreath', R],
    ['sailor-cap', 'Sailor Cap', C],
    ['mortarboard', 'Mortarboard', U],
    ['bucket-hat', 'Bucket Hat', C],
    ['tiara', 'Tiara', R],
    ['pumpkin-hat', 'Pumpkin Hat', U],
    ['snowflake-crown', 'Snowflake Crown', R],
    ['candle-crown', 'Candle Crown', E],
    ['moon-circlet', 'Moon Circlet', E],
    // Drop 1 (Owlloween and first frost)
    ['bat-headband', 'Bat Headband', U],
    ['candy-corn-cap', 'Candy Corn Cap', C],
    ['earmuffs', 'Earmuffs', C],
    ['holly-crown', 'Holly Crown', U],
    ['mummy-wrap', 'Mummy Wrap', C],
  ]),
  ...wear('face', [
    ['round-glasses', 'Round Glasses', C],
    ['star-shades', 'Star Shades', U],
    ['heart-glasses', 'Heart Glasses', U],
    ['monocle', 'Monocle', R],
    ['aviator-goggles', 'Aviator Goggles', U],
    ['masquerade-mask', 'Masquerade Mask', R],
    ['cat-eye-glasses', 'Cat-Eye Glasses', C],
    ['brass-goggles', 'Brass Goggles', R],
    ['pixel-shades', 'Pixel Shades', E],
    ['half-moon-specs', 'Half-Moon Specs', C],
    ['jack-o-lantern-shades', "Jack-o'-Lantern Shades", R],
  ]),
  ...wear('neck', [
    ['knit-scarf', 'Knit Scarf', C],
    ['bow-tie', 'Bow Tie', C],
    ['bandana', 'Bandana', C],
    ['moon-pendant', 'Moon Pendant', R],
    ['flower-lei', 'Flower Lei', U],
    ['bell-collar', 'Bell Collar', U],
    ['cape', 'Cape', R],
    ['ruffle-collar', 'Ruffle Collar', U],
    ['pearl-necklace', 'Pearl Necklace', R],
    ['medal-ribbon', 'Medal Ribbon', E],
    ['candy-necklace', 'Candy Necklace', C],
    ['vampire-collar', 'Vampire Collar', R],
  ]),
  ...(
    [
      ['mouse', 'Mouse', C],
      ['snake', 'Snake', U],
      ['grasshopper', 'Grasshopper', C],
      ['ladybug', 'Ladybug', C],
      ['beetle', 'Beetle', C],
      ['snail', 'Snail', C],
      ['moth', 'Moth', U],
      ['firefly', 'Firefly', U],
      ['frog', 'Frog', U],
      ['bat', 'Bat', R],
      ['hedgehog', 'Hedgehog', R],
      ['caterpillar', 'Caterpillar', C],
      ['cricket', 'Cricket', C],
      ['butterfly', 'Butterfly', U],
      ['spider', 'Spider', U],
      ['dragonfly', 'Dragonfly', R],
      ['salamander', 'Salamander', R],
      ['mole', 'Mole', R],
      ['tiny-dragon', 'Tiny Dragon', E],
      ['star-beetle', 'Star Beetle', E],
      ['ghost', 'Little Ghost', E],
      ['pumpkin-sprite', 'Pumpkin Sprite', U],
      ['snow-bunny', 'Snow Bunny', U],
      ['black-kitten', 'Black Kitten', R],
    ] as Array<[string, string, Rarity]>
  ).map(([id, name, rarity]): ItemDef => ({ id, kind: 'pet', name, rarity, art: `item-${id}` })),
  ...(
    [
      ['aura', 'Aura', C],
      ['sparkle', 'Sparkle', C],
      ['eye-flames', 'Eye Flames', R],
      ['ember-trail', 'Ember Trail', U],
      ['frost-breath', 'Frost Breath', U],
      ['snowfall', 'Snowfall', U],
      ['fireflies', 'Fireflies', U],
      ['hearts', 'Hearts', C],
      ['music-notes', 'Music Notes', C],
      ['star-halo', 'Star Halo', R],
      ['moon-halo', 'Moon Halo', R],
      ['leaf-swirl', 'Leaf Swirl', C],
      ['petal-swirl', 'Petal Swirl', C],
      ['bubbles', 'Bubbles', C],
      ['smoke-wisps', 'Smoke Wisps', U],
      ['rainbow-trail', 'Rainbow Trail', R],
      ['lightning', 'Lightning', E],
      ['neon-outline', 'Neon Outline', R],
      ['shadow-aura', 'Shadow Aura', U],
      ['sunbeam', 'Sunbeam', R],
      ['confetti', 'Confetti', U],
      ['comet-tail', 'Comet Tail', E],
      ['rune-ring', 'Rune Ring', E],
      ['glitch', 'Glitch', E],
    ] as Array<[string, string, Rarity]>
  ).map(([id, name, rarity]): ItemDef => ({ id, kind: 'fx', name, rarity })),
  ...(
    [
      ['hoot', 'Hoot', C],
      ['flap', 'Wing Flap', C],
      ['spin', 'Spin', U],
      ['hop', 'Hop', C],
      ['tilt', 'Head Tilt', C],
      ['bow', 'Bow', U],
      ['wave', 'Wave', C],
      ['dance', 'Dance', U],
      ['sleep', 'Sleep', U],
      ['heart', 'Heart', C],
      ['surprise', 'Surprise', U],
      ['laugh', 'Laugh', C],
      ['shiver', 'Shiver', U],
      ['puff', 'Puff Up', C],
      ['wink', 'Wink', U],
      ['nod', 'Nod', C],
      ['headshake', 'Head Shake', C],
      ['twirl', 'Twirl', E],
      ['flip', 'Backflip', E],
      ['stomp', 'Stomp', U],
      ['preen', 'Preen', R],
      ['stretch', 'Stretch', U],
      ['sneeze', 'Sneeze', R],
      ['peek', 'Peek-a-boo', R],
    ] as Array<[string, string, Rarity]>
  ).map(([id, name, rarity]): ItemDef => ({ id, kind: 'emote', name, rarity })),
];

export const ITEMS: Readonly<Record<string, ItemDef>> = Object.freeze(Object.fromEntries(CATALOGUE.map((i) => [i.id, i])));

export const EMOTE_IDS: readonly string[] = CATALOGUE.filter((i) => i.kind === 'emote').map((i) => i.id);

/**
 * The Jump button's hop (OP-082): a move every owl has, not a collectible, so it is in neither the
 * catalogue nor the emote wheel, and no quest counts it. It travels as an emote frame with this id
 * (`jump`, since `hop` is a collectible emote's), and changes only how the owl looks for a moment:
 * never where it stands.
 */
export const JUMP_EMOTE = 'jump';
/** A page sends at most one hop this often. */
export const JUMP_EVERY_MS = 600;

/** The variant id for an item and colourway number. Emotes have no colourways. */
export function variantId(itemId: string, n = 0): string {
  const item = ITEMS[itemId];
  return item && item.kind === 'emote' ? itemId : `${itemId}~${n}`;
}

const VARIANT_RE = /^([a-z][a-z0-9-]{0,31})(?:~(\d{1,2}))?$/;

/** Parse a variant id; null for anything that is not in the catalogue. */
export function parseVariant(id: unknown): Variant | null {
  if (typeof id !== 'string' || id.length > 40) return null;
  const m = VARIANT_RE.exec(id);
  if (!m) return null;
  const item = Object.hasOwn(ITEMS, m[1]!) ? ITEMS[m[1]!] : undefined;
  if (!item) return null;
  if (item.kind === 'emote') return m[2] === undefined ? { id, item, colour: null, rarity: item.rarity } : null;
  if (m[2] === undefined) return null;
  const n = Number(m[2]);
  if (String(n) !== m[2]) return null; // no leading zeros: one spelling per variant
  const colour = colourwaysFor(item.kind)[n];
  if (!colour) return null;
  return { id, item, colour, rarity: item.rarity };
}

export function isVariantId(id: unknown): id is string {
  return parseVariant(id) !== null;
}

/** Where a variant is worn, or null for emotes. */
export function equipSlotOf(v: Variant): EquipSlot | null {
  switch (v.item.kind) {
    case 'wear':
      return v.item.slot ?? null;
    case 'pet':
      return 'pet';
    case 'fx':
      return 'fx';
    case 'emote':
      return null;
  }
}

/** A display name such as "Witch Hat · Dusk" (the original colourway has no suffix). */
export function variantName(id: string): string {
  const v = parseVariant(id);
  if (!v) return id;
  if (!v.colour || (v.item.kind !== 'fx' && v.colour.n === 0)) return v.item.name;
  return `${v.item.name} · ${v.colour.name}`;
}

let allCache: string[] | null = null;
/** Every collectible variant in catalogue order (1068 at launch, 1180 with drop 1). */
export function allVariants(): readonly string[] {
  if (!allCache) {
    allCache = [];
    for (const item of CATALOGUE) {
      if (item.kind === 'emote') allCache.push(item.id);
      else for (const c of colourwaysFor(item.kind)) allCache.push(`${item.id}~${c.n}`);
    }
  }
  return allCache;
}

let byRarityCache: Record<Rarity, string[]> | null = null;
/** Every variant by rarity, in catalogue order. */
export function variantsByRarity(): Readonly<Record<Rarity, readonly string[]>> {
  if (!byRarityCache) {
    byRarityCache = { common: [], uncommon: [], rare: [], epic: [] };
    for (const id of allVariants()) byRarityCache[parseVariant(id)!.rarity].push(id);
  }
  return byRarityCache;
}

// ---------- wear on a look ----------

/** What an owl wears: one owned variant per slot. Sent on the wire as part of the look. */
export interface Wear {
  head?: string;
  face?: string;
  neck?: string;
  pet?: string;
  fx?: string;
}

export const WEAR_SLOTS: readonly EquipSlot[] = ['head', 'face', 'neck', 'pet', 'fx'];

function slotFits(slot: string, id: unknown): boolean {
  const v = parseVariant(id);
  return !!v && equipSlotOf(v) === slot;
}

/** Strict check: a plain object with known slots only, each holding a catalogue variant for that slot. */
export function isWear(v: unknown): v is Wear {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  for (const [k, id] of Object.entries(v as Record<string, unknown>)) {
    if (!(WEAR_SLOTS as readonly string[]).includes(k) || !slotFits(k, id)) return false;
  }
  return true;
}

/** Keep the valid slots of untrusted input; undefined when nothing valid remains. */
export function sanitizeWear(v: unknown): Wear | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const out: Wear = {};
  for (const slot of WEAR_SLOTS) if (slotFits(slot, o[slot])) out[slot] = o[slot] as string;
  return Object.keys(out).length ? out : undefined;
}

/** Only what the collector owns; undefined when nothing remains. */
export function filterOwnedWear(wear: Wear | undefined, owned: ReadonlySet<string>): Wear | undefined {
  if (!wear) return undefined;
  const out: Wear = {};
  for (const slot of WEAR_SLOTS) {
    const id = wear[slot];
    if (id !== undefined && owned.has(id)) out[slot] = id;
  }
  return Object.keys(out).length ? out : undefined;
}

/** A look with `variant` worn in its slot, or that slot taken off (null); no `wear` once nothing is on. */
export function putOn<L extends { wear?: Wear }>(look: L, slot: EquipSlot, variant: string | null): L {
  const wear: Wear = { ...(look.wear ?? {}) };
  if (variant === null) delete wear[slot];
  else wear[slot] = variant;
  const { wear: _old, ...rest } = look;
  return (Object.keys(wear).length ? { ...rest, wear } : rest) as L;
}

/** The variants a wear uses (for loading their art or checking ownership). */
export function wearVariants(wear: Wear | undefined): string[] {
  if (!wear) return [];
  const out: string[] = [];
  for (const slot of WEAR_SLOTS) {
    const id = wear[slot];
    if (id !== undefined) out.push(id);
  }
  return out;
}

// ---------- time zones ----------

const TZ_SHAPE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    if (formatters.size > 256) formatters.clear();
    formatters.set(tz, f);
  }
  return f;
}

/** An IANA time zone this runtime knows (e.g. "America/New_York", "UTC"). */
export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !TZ_SHAPE.test(tz)) return false;
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

/** The visitor's zone if valid, else UTC. */
export function normalizeTimeZone(tz: unknown): string {
  return isTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

// ---------- the feather economy ----------

export function duplicatePayout(variant: string): number {
  const v = parseVariant(variant);
  return v ? DUPLICATE_FEATHERS[v.rarity] : 0;
}
